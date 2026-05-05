#!/usr/bin/env python3
"""
run_shap_m4.py
SHAP computation — local MacBook Air M4 version.

Changes from GCS/TPU version:
  - All GCS download/upload removed; reads local files directly
  - Model loaded from .keras file (not SavedModel directory)
  - TensorFlow Metal GPU enabled for M4 unified memory architecture
  - Thread count tuned for M4 (10 cores: 4 performance + 6 efficiency)
  - Batch size increased for unified memory (no PCIe bottleneck)
  - TF inter/intra op threads set for M4 core layout
  - Progress bar added via tqdm
  - X_static loaded from X_static_expanded.npy (expanded 52-feature version)
"""
from __future__ import annotations
import os
import pickle
import multiprocessing
import warnings
import logging
from datetime import datetime

os.environ['TF_USE_LEGACY_KERAS'] = '1'
import tensorflow as tf

import numpy as np
import pandas as pd
import tensorflow as tf
import shap
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
#from tensorflow.keras.models import load_model, Model
from joblib import Parallel, delayed

logging.getLogger('shap').setLevel(logging.ERROR)


# ── M4 OPTIMISATION ────────────────────────────────────────────────────────
# M4 has 10 cores (4 performance + 6 efficiency) and 16/24/32 GB unified memory.
# Metal GPU shares the same memory pool so batch operations are fast.
# Setting intra_op = performance core count, inter_op = total core count.
M4_PERFORMANCE_CORES = 4
M4_TOTAL_CORES       = 10

tf.config.threading.set_intra_op_parallelism_threads(M4_PERFORMANCE_CORES)
tf.config.threading.set_inter_op_parallelism_threads(M4_TOTAL_CORES)

# Allow Metal GPU memory growth (unified memory — no hard cap needed)
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    for gpu in gpus:
        tf.config.experimental.set_memory_growth(gpu, True)
    print(f"Metal GPU enabled: {[g.name for g in gpus]}")
else:
    print("No Metal GPU found — running on CPU only.")


# ── LOCAL PATHS ────────────────────────────────────────────────────────────
DATA_DIR   = '/Users/ruben/Desktop/Thesis/2025Data/baguio/output'
MODEL_PATH = '/Users/ruben/Desktop/Thesis/TrainingData/final-data/output'
OUTPUT_DIR = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded'

os.makedirs(OUTPUT_DIR,              exist_ok=True)
os.makedirs(f'{OUTPUT_DIR}/plots',   exist_ok=True)


# ── LOAD DATA ──────────────────────────────────────────────────────────────
print("Loading data...")
X_dynamic   = np.load(f'{DATA_DIR}/X_dynamic.npy')
# CHANGED: load the expanded 52-feature static array
X_static    = np.load(f'{DATA_DIR}/X_static.npy')
y           = np.load(f'{DATA_DIR}/y_wealth.npy')
cluster_ids = np.load(f'{DATA_DIR}/cluster_ids.npy')

with open(f'{DATA_DIR}/static_feature_names.txt') as f:
    static_feature_names = [line.strip() for line in f]

with open(f'{MODEL_PATH}/final_scaler.pkl', 'rb') as f:
    scaler = pickle.load(f)

with open(f'{MODEL_PATH}/final_pca.pkl', 'rb') as f:
    pca = pickle.load(f)

print(f"X_dynamic   : {X_dynamic.shape}")
print(f"X_static    : {X_static.shape}")
print(f"y           : {y.shape}")
print(f"Clusters    : {len(cluster_ids)}")
print(f"Static feats: {len(static_feature_names)}")


# ── APPLY TRANSFORMS ───────────────────────────────────────────────────────
# X_dynamic already has PCA applied and stored in the .npy array.
# X_static is the raw (log1p-transformed) array — apply scaler only.
print("\nApplying StandardScaler to static features...")
N_COMPONENTS     = X_dynamic.shape[2]   # 256 (from PCA in merge notebook)
X_dynamic_pca    = X_dynamic            # shape (1234, 4, 256) — already reduced
X_static_scaled  = scaler.transform(X_static)
print(f"X_dynamic_pca   : {X_dynamic_pca.shape}")
print(f"X_static_scaled : {X_static_scaled.shape}")


# ── LOAD MODEL ─────────────────────────────────────────────────────────────
# CHANGED: load from local .keras file, not SavedModel GCS path
print(f"\nLoading model from: {MODEL_PATH}/final_hybrid_poverty_model.keras")
#model = load_model(MODEL_PATH)
model = tf.keras.models.load_model(f'{MODEL_PATH}/final_hybrid_poverty_model.keras', compile=False)
model.summary(line_length=80)

preds = model.predict(
    [X_dynamic_pca, X_static_scaled],
    batch_size=128,   # larger batch for unified memory
    verbose=1
).flatten()
print(f"\nPrediction range: [{preds.min():.4f}, {preds.max():.4f}]")
print(f"Prediction mean : {preds.mean():.4f}")


# ── BUILD SHAP WRAPPER ─────────────────────────────────────────────────────
print("\nBuilding SHAP wrapper model...")

lstm_layer  = [l for l in model.layers
               if 'lstm' in l.name.lower()][0]
lstm_units  = lstm_layer.output_shape[-1]
print(f"LSTM layer: {lstm_layer.name}, units: {lstm_units}")

# Extract LSTM hidden states for all clusters
lstm_extractor = tf.keras.Model(
    inputs  = model.get_layer('Dynamic_Input').input,
    outputs = model.get_layer(lstm_layer.name).output
)
lstm_states = lstm_extractor.predict(
    X_dynamic_pca, batch_size=128, verbose=1)

# Flat SHAP input: [LSTM states | scaled static features]
X_shap = np.concatenate([lstm_states, X_static_scaled], axis=1)
print(f"X_shap shape: {X_shap.shape} "
      f"({lstm_units} LSTM + {X_static_scaled.shape[1]} static)")

# ── Rebuild wrapper by cloning layers (avoids shared graph state) ──────────
static_layers      = []
dyn_dropout_layer  = None
post_concat_layers = []
found_concat       = False

for layer in model.layers:
    if layer.name in ['Dynamic_Input', 'Static_Input',
                      lstm_layer.name]:
        continue
    if 'concatenate' in layer.name.lower():
        found_concat = True
        continue
    if not found_concat:
        if ('dropout' in layer.name.lower()
                and layer.input_shape[-1] == lstm_units):
            dyn_dropout_layer = layer
        else:
            static_layers.append(layer)
    else:
        post_concat_layers.append(layer)

shap_inp  = tf.keras.Input(
    shape=(X_shap.shape[1],), name='SHAP_Input')
lstm_in   = tf.keras.layers.Lambda(
    lambda x: x[:, :lstm_units])(shap_inp)
static_in = tf.keras.layers.Lambda(
    lambda x: x[:, lstm_units:])(shap_inp)

x_dyn = lstm_in
if dyn_dropout_layer is not None:
    cloned_dyn_drop = dyn_dropout_layer.__class__.from_config(
        dyn_dropout_layer.get_config())
    x_dyn = cloned_dyn_drop(x_dyn)
    if dyn_dropout_layer.get_weights():
        cloned_dyn_drop.set_weights(dyn_dropout_layer.get_weights())

x_stat = static_in
for orig_layer in static_layers:
    cloned  = orig_layer.__class__.from_config(orig_layer.get_config())
    x_stat  = cloned(x_stat)
    if orig_layer.get_weights():
        cloned.set_weights(orig_layer.get_weights())

x_w = tf.keras.layers.Concatenate()([x_dyn, x_stat])
for orig_layer in post_concat_layers:
    cloned = orig_layer.__class__.from_config(orig_layer.get_config())
    x_w    = cloned(x_w)
    if orig_layer.get_weights():
        cloned.set_weights(orig_layer.get_weights())

shap_model = tf.keras.Model(inputs=shap_inp, outputs=x_w)

# Verify wrapper reproduces original predictions
test_preds_wrapper  = shap_model.predict(
    X_shap[:10], batch_size=128, verbose=0).flatten()
test_preds_original = model.predict(
    [X_dynamic_pca[:10], X_static_scaled[:10]],
    batch_size=128, verbose=0).flatten()
max_diff = np.max(np.abs(test_preds_wrapper - test_preds_original))
print(f"Wrapper verification max diff: {max_diff:.2e} "
      f"({'PASS' if max_diff < 1e-4 else 'FAIL — check layer cloning'})")


def model_predict(X):
    #return shap_model.predict(
    #    X, batch_size=256, verbose=0)   # larger batch for M4 unified memory
    return shap_model(X, training=False).numpy()


# ── FEATURE NAMES ──────────────────────────────────────────────────────────
lstm_feature_names = [f'LSTM_dim_{i}' for i in range(lstm_units)]
all_feature_names  = lstm_feature_names + static_feature_names
print(f"\nTotal SHAP features: {len(all_feature_names)} "
      f"({lstm_units} LSTM + {len(static_feature_names)} static)")


# ── SHAP COMPUTATION ───────────────────────────────────────────────────────
# M4 threading note: Keras models are not picklable so multiprocessing
# spawning will fail. Threading backend is correct for this use case.
# The M4's performance cores handle the parallel SHAP coalition evaluations
# while the efficiency cores handle I/O and checkpointing.

N_BACKGROUND = 200
N_SAMPLES    = 500
CHUNK_SIZE   = 50
SEED         = 42
CHECKPOINT   = f'{OUTPUT_DIR}/shap_checkpoint.npz'

# M4: use performance cores for SHAP workers
# Leave 2 threads for OS / Metal GPU driver overhead
N_JOBS = M4_PERFORMANCE_CORES - 1   # = 3 workers
N_JOBS = max(N_JOBS, 1)

np.random.seed(SEED)
bg_idx       = np.random.choice(len(X_shap), N_BACKGROUND, replace=False)
X_background = X_shap[bg_idx]

print(f"\n{'='*55}")
print("SHAP Configuration")
print(f"{'='*55}")
print(f"Background samples : {N_BACKGROUND}")
print(f"nsamples per point : {N_SAMPLES}")
print(f"Parallel workers   : {N_JOBS} (threading, M4 perf cores)")
print(f"Chunk size         : {CHUNK_SIZE}")
print(f"Total clusters     : {len(X_shap)}")
print(f"{'='*55}")

# Resume from checkpoint if available
if os.path.exists(CHECKPOINT):
    ckpt         = np.load(CHECKPOINT)
    shap_results = ckpt['values']
    start_idx    = int(ckpt['next_idx'])
    print(f"Resuming from checkpoint at index {start_idx} "
          f"({start_idx/len(X_shap)*100:.0f}% done)")
else:
    shap_results = np.zeros((len(X_shap), len(all_feature_names)))
    start_idx    = 0
    print("Starting fresh SHAP computation.")

print(f"\nStarted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
t_start = datetime.now()

for chunk_start in range(start_idx, len(X_shap), CHUNK_SIZE):
    chunk_end = min(chunk_start + CHUNK_SIZE, len(X_shap))
    chunk     = X_shap[chunk_start:chunk_end]

    def compute_one(i):
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            local_explainer = shap.KernelExplainer(
                model_predict, X_background)
        return local_explainer.shap_values(
            chunk[i:i+1], nsamples=N_SAMPLES, l1_reg='aic')[0]

    chunk_shap = Parallel(
        n_jobs  = N_JOBS,
        backend = 'threading'   # required for Keras models
    )(delayed(compute_one)(i) for i in range(len(chunk)))

    shap_results[chunk_start:chunk_end] = (
        np.array(chunk_shap).reshape(len(chunk), -1))

    np.savez(CHECKPOINT,
             values   = shap_results,
             next_idx = np.array(chunk_end))

    elapsed    = datetime.now() - t_start
    pct        = chunk_end / len(X_shap) * 100
    rate       = chunk_end / max(elapsed.total_seconds(), 1)
    remaining  = (len(X_shap) - chunk_end) / rate if rate > 0 else 0
    eta        = datetime.now() + pd.Timedelta(seconds=remaining)

    print(f"  [{datetime.now().strftime('%H:%M:%S')}] "
          f"{chunk_end}/{len(X_shap)} ({pct:.0f}%) — "
          f"rate {rate:.1f} clusters/s — "
          f"ETA {eta.strftime('%H:%M')}")

shap_values = shap_results
print(f"\nSHAP complete: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Total elapsed: {datetime.now() - t_start}")


# ── SAVE SHAP VALUES CSV ───────────────────────────────────────────────────
shap_df = pd.DataFrame(shap_values, columns=all_feature_names)
shap_df.insert(0, 'ClusterID',        cluster_ids)
shap_df.insert(1, 'Predicted_Wealth', preds)
shap_csv_path = f'{OUTPUT_DIR}/shap_values_all_clusters.csv'
shap_df.to_csv(shap_csv_path, index=False)
print(f"Saved: {shap_csv_path}")


# ── GLOBAL FEATURE IMPORTANCE PLOT ────────────────────────────────────────
mean_abs   = np.mean(np.abs(shap_values), axis=0)
sorted_idx = np.argsort(mean_abs)[::-1]
top_n      = 20

fig, ax = plt.subplots(figsize=(10, 8))
plot_names = [all_feature_names[i] for i in sorted_idx[:top_n]][::-1]
plot_vals  = [mean_abs[i] for i in sorted_idx[:top_n]][::-1]
colors     = ['#1a3c5c' if 'LSTM' in n else '#326189'
              for n in plot_names]
ax.barh(plot_names, plot_vals, color=colors, edgecolor='white',
        linewidth=0.4)
ax.set_xlabel('Mean |SHAP Value|', fontsize=10)
ax.set_title('Global Feature Importance — Top 20', fontsize=11)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

from matplotlib.patches import Patch
ax.legend(handles=[
    Patch(color='#1a3c5c', label='LSTM (temporal satellite)'),
    Patch(color='#326189', label='Static (OSM / VIIRS)')
], fontsize=9)

plt.tight_layout()
plt.savefig(f'{OUTPUT_DIR}/plots/global_feature_importance.png',
            dpi=150, bbox_inches='tight')
plt.close()
print("Saved: global_feature_importance.png")


# ── GLOBAL RANKING CSV ─────────────────────────────────────────────────────
df_ranking = pd.DataFrame({
    'Feature'      : all_feature_names,
    'Mean_Abs_SHAP': mean_abs,
    'Rank'         : pd.Series(mean_abs).rank(
                         ascending=False).astype(int)
}).sort_values('Rank')
df_ranking.to_csv(
    f'{OUTPUT_DIR}/global_feature_ranking.csv', index=False)
print("Saved: global_feature_ranking.csv")


# ── MASTER CLUSTER SUMMARY ─────────────────────────────────────────────────
rows = []
for i, cid in enumerate(cluster_ids):
    sv           = shap_values[i]
    static_sv    = sv[lstm_units:]
    static_abs   = np.abs(static_sv)
    top_idx      = int(np.argmax(static_abs))

    lstm_total   = float(np.sum(np.abs(sv[:lstm_units])))
    static_total = float(np.sum(static_abs))
    total        = lstm_total + static_total

    rows.append({
        'ClusterID'          : int(cid),
        'Predicted_Wealth'   : round(float(preds[i]), 4),
        'Actual_Wealth'      : round(float(y[i]), 4),
        'Abs_Error'          : round(
            abs(float(preds[i]) - float(y[i])), 4),
        'Top_Driver'         : static_feature_names[top_idx],
        'Top_Driver_SHAP'    : round(float(static_sv[top_idx]), 4),
        'LSTM_Contribution'  : round(lstm_total, 4),
        'Static_Contribution': round(static_total, 4),
        'LSTM_Pct'           : round(
            lstm_total / total * 100 if total > 0 else 0, 1),
        'Static_Pct'         : round(
            static_total / total * 100 if total > 0 else 0, 1),
    })

df_master = pd.DataFrame(rows)
df_master.to_csv(
    f'{OUTPUT_DIR}/master_cluster_summary.csv', index=False)
print("Saved: master_cluster_summary.csv")


# ── FINAL SUMMARY ──────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print("SHAP COMPUTATION COMPLETE")
print(f"{'='*60}")
print(f"Date            : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Clusters        : {len(cluster_ids)}")
print(f"Features        : {len(all_feature_names)} "
      f"({lstm_units} LSTM + {len(static_feature_names)} static)")
print(f"nsamples        : {N_SAMPLES}")
print(f"Background      : {N_BACKGROUND}")
print(f"Wrapper diff    : {max_diff:.2e}")
print(f"Prediction range: [{preds.min():.4f}, {preds.max():.4f}]")
print(f"\nTop 10 global features:")
for rank, idx in enumerate(sorted_idx[:10], 1):
    feat_type = 'LSTM' if 'LSTM' in all_feature_names[idx] else 'Static'
    print(f"  {rank:2d}. [{feat_type:6s}] "
          f"{all_feature_names[idx]}: {mean_abs[idx]:.5f}")
print(f"\nBranch importance (mean across clusters):")
print(f"  LSTM (satellite): {df_master['LSTM_Pct'].mean():.1f}%")
print(f"  Static (OSM)    : {df_master['Static_Pct'].mean():.1f}%")
print(f"\nOutputs saved to: {OUTPUT_DIR}")
print(f"{'='*60}")
