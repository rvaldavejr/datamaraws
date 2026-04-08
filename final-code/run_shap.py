#!/usr/bin/env python3
"""
Phase 5 SHAP Computation Script (Google Cloud VM)
Computes SHAP feature attributions for all clusters using KernelExplainer.

Revisions:
  - SHAP wrapper rebuilt via cloned layers (avoids shared graph state)
  - joblib parallelism uses threading backend (Keras models are not picklable)
  - Checkpointing uses np.savez for robustness
  - nsamples raised to 500 for stability in high-dim feature space
  - All subprocess calls use check=True
"""
from __future__ import annotations
import os
import json
import pickle
import subprocess
import multiprocessing
from datetime import datetime

import numpy as np
import pandas as pd
import tensorflow as tf
import shap
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from tensorflow.keras.models import load_model, Model
from joblib import Parallel, delayed


# ── PATHS ──────────────────────────────────────────────
GCS_DATA   = 'gs://tala-sentinel2-data/data/merged'
GCS_MODELS = 'gs://tala-sentinel2-data/models/final'
OUTPUT_DIR = os.path.expanduser('~/shap_outputs')
GCS_OUTPUT = 'gs://tala-sentinel2-data/shap_outputs'
USER_HOME = os.path.expanduser('~')

os.makedirs(OUTPUT_DIR,              exist_ok=True)
os.makedirs(f'{OUTPUT_DIR}/reports', exist_ok=True)
os.makedirs(f'{OUTPUT_DIR}/plots',   exist_ok=True)


def gcs_copy(src, dst):
    print(f"Downloading {src.split('/')[-1]}...")
    tf.io.gfile.copy(src, dst, overwrite=True)


# ── DOWNLOAD ARTIFACTS ─────────────────────────────────
print("Downloading artifacts from GCS...")
for fname in ['X_dynamic.npy', 'X_static.npy',
              'y_wealth.npy', 'cluster_ids.npy',
              'static_feature_names.txt']:
    gcs_copy(f'{GCS_DATA}/{fname}', f'{USER_HOME}/{fname}')

for fname in ['final_hybrid_poverty_model.keras',
              'final_scaler.pkl', 'final_pca.pkl']:
    gcs_copy(f'{GCS_MODELS}/{fname}', f'{USER_HOME}/{fname}')

print("All artifacts downloaded.")


# ── LOAD DATA ──────────────────────────────────────────
print("\nLoading data...")
X_dynamic   = np.load(f'{USER_HOME}/X_dynamic.npy')
X_static    = np.load(f'{USER_HOME}/X_static.npy')
y           = np.load(f'{USER_HOME}/y_wealth.npy')
cluster_ids = np.load(f'{USER_HOME}/cluster_ids.npy')

with open(f'{USER_HOME}/static_feature_names.txt') as f:
    static_feature_names = [line.strip() for line in f]

with open(f'{USER_HOME}/final_scaler.pkl', 'rb') as f:
    scaler = pickle.load(f)

with open(f'{USER_HOME}/final_pca.pkl', 'rb') as f:
    pca = pickle.load(f)

print(f"X_dynamic   : {X_dynamic.shape}")
print(f"X_static    : {X_static.shape}")
print(f"y           : {y.shape}")
print(f"Clusters    : {len(cluster_ids)}")
print(f"Static feats: {len(static_feature_names)}")


# ── APPLY TRANSFORMS ───────────────────────────────────
print("\nApplying PCA and StandardScaler...")
N_COMPONENTS = X_dynamic.shape[2]
X_dynamic_pca = X_dynamic
X_static_scaled = scaler.transform(X_static)
print(f"PCA components: {N_COMPONENTS}")


# ── LOAD MODEL ─────────────────────────────────────────

print("\nLoading model...")
model = load_model('gs://tala-sentinel2-data/models/final_model_saved')

preds = model.predict(
    [X_dynamic_pca, X_static_scaled], verbose=0
).flatten()
print(f"Prediction range: [{preds.min():.4f}, {preds.max():.4f}]")


# ── BUILD SHAP WRAPPER ─────────────────────────────────
print("\nBuilding SHAP wrapper...")

# 1. Identify LSTM layer and extract its output
lstm_layer = [l for l in model.layers if 'lstm' in l.name.lower()][0]
lstm_units = lstm_layer.output_shape[-1]

print(f"LSTM layer: {lstm_layer.name}, units: {lstm_units}")

lstm_extractor = Model(
    inputs  = model.get_layer('Dynamic_Input').input,
    outputs = model.get_layer(lstm_layer.name).output
)
lstm_states = lstm_extractor.predict(X_dynamic_pca, verbose=0)

# 2. Concatenate LSTM states with RAW static features -> flat SHAP input
X_shap = np.concatenate([lstm_states, X_static_scaled], axis=1)
print(f"X_shap shape: {X_shap.shape} ({lstm_units} LSTM + {X_static_scaled.shape[1]} Static)")

# 3. Segregate layers into branches for safe cloning
static_layers = []
dyn_dropout_layer = None
post_concat_layers = []
found_concat = False

for layer in model.layers:
    if layer.name in ['Dynamic_Input', 'Static_Input', lstm_layer.name]:
        continue
        
    if 'concatenate' in layer.name.lower():
        found_concat = True
        continue
        
    if not found_concat:
        # Before concat: separate dynamic dropout from static branch layers
        if 'dropout' in layer.name.lower() and layer.input_shape[-1] == lstm_units:
            dyn_dropout_layer = layer
        else:
            static_layers.append(layer)
    else:
        # After concat
        post_concat_layers.append(layer)

# 4. Rebuild wrapper by cloning ALL layers (avoids Threading/Graph crashes)
shap_inp = tf.keras.Input(shape=(X_shap.shape[1],), name='SHAP_Input')

# Split the input back into LSTM and Static components
lstm_in = tf.keras.layers.Lambda(lambda x: x[:, :lstm_units])(shap_inp)
static_in = tf.keras.layers.Lambda(lambda x: x[:, lstm_units:])(shap_inp)

# Route LSTM side
x_dyn = lstm_in
if dyn_dropout_layer is not None:
    cloned_dyn_drop = dyn_dropout_layer.__class__.from_config(dyn_dropout_layer.get_config())
    x_dyn = cloned_dyn_drop(x_dyn)
    cloned_dyn_drop.set_weights(dyn_dropout_layer.get_weights())

# Route Static side (This fixes the shape crash!)
x_stat = static_in
for orig_layer in static_layers:
    cloned = orig_layer.__class__.from_config(orig_layer.get_config())
    x_stat = cloned(x_stat)
    cloned.set_weights(orig_layer.get_weights())

# Concatenate and route through fusion
x_w = tf.keras.layers.Concatenate()([x_dyn, x_stat])

for orig_layer in post_concat_layers:
    cloned = orig_layer.__class__.from_config(orig_layer.get_config())
    x_w = cloned(x_w)
    cloned.set_weights(orig_layer.get_weights())

shap_model = tf.keras.Model(inputs=shap_inp, outputs=x_w)

# 5. Define the prediction function for SHAP
def model_predict(X):
    # SHAP passes a flat 2D numpy array, which our wrapper handles perfectly
    return shap_model.predict(X, batch_size=256, verbose=0)


# ── FEATURE NAMES ──────────────────────────────────────
lstm_feature_names = [f'LSTM_dim_{i}' for i in range(lstm_units)]
all_feature_names  = lstm_feature_names + static_feature_names
print(f"Total SHAP features: {len(all_feature_names)} "
      f"({lstm_units} LSTM + {len(static_feature_names)} static)")


# ── SHAP COMPUTATION ──────────────────────────────────
N_BACKGROUND = 200
N_SAMPLES    = 500  # raised from 200 for stability
CHUNK_SIZE   = 50
SEED         = 42
CHECKPOINT   = f'{OUTPUT_DIR}/shap_checkpoint.npz'

np.random.seed(SEED)
bg_idx       = np.random.choice(len(X_shap), N_BACKGROUND, replace=False)
X_background = X_shap[bg_idx]

#explainer = shap.KernelExplainer(model_predict, X_background)

N_JOBS = min(multiprocessing.cpu_count() - 2, 32)
N_JOBS = max(N_JOBS, 1)

print(f"\n{'='*50}")
print(f"SHAP Configuration")
print(f"{'='*50}")
print(f"Background samples : {N_BACKGROUND}")
print(f"nsamples per point : {N_SAMPLES}")
print(f"Parallel workers   : {N_JOBS} (threading backend)")
print(f"Chunk size         : {CHUNK_SIZE}")
print(f"Total clusters     : {len(X_shap)}")
print(f"{'='*50}")

# Resume from checkpoint if available
if os.path.exists(CHECKPOINT):
    ckpt         = np.load(CHECKPOINT)
    shap_results = ckpt['values']
    start_idx    = int(ckpt['next_idx'])
    print(f"Resuming from checkpoint at index {start_idx}")
else:
    shap_results = np.zeros((len(X_shap), len(all_feature_names)))
    start_idx    = 0

print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

for chunk_start in range(start_idx, len(X_shap), CHUNK_SIZE):
    chunk_end = min(chunk_start + CHUNK_SIZE, len(X_shap))
    chunk     = X_shap[chunk_start:chunk_end]

    import warnings

    def compute_one(i):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore") # Suppresses the "background size > 100" terminal spam
                
            # Create an isolated explainer inside the thread to avoid race conditions!
            local_explainer = shap.KernelExplainer(model_predict, X_background)
            
        return local_explainer.shap_values(
            chunk[i:i+1], nsamples=N_SAMPLES, l1_reg='aic'
        )[0]

    # Threading backend: safe for Keras models (no pickling)
    chunk_shap = Parallel(n_jobs=N_JOBS, backend='threading')(
        delayed(compute_one)(i) for i in range(len(chunk))
    )
    #shap_results[chunk_start:chunk_end] = np.array(chunk_shap)
    # Safely squash the extra dimension SHAP adds (e.g., from (50, 1, 116) to (50, 116))
    shap_results[chunk_start:chunk_end] = np.array(chunk_shap).reshape(len(chunk), -1)

    # Checkpoint with np.savez (robust, no pickle)
    np.savez(
        CHECKPOINT,
        values=shap_results,
        next_idx=np.array(chunk_end)
    )

    elapsed = datetime.now().strftime('%H:%M:%S')
    pct     = chunk_end / len(X_shap) * 100
    print(f"  [{elapsed}] {chunk_end}/{len(X_shap)} "
          f"({pct:.0f}%) done")

shap_values = shap_results
print(f"\nSHAP complete: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


# ── SAVE SHAP VALUES CSV ──────────────────────────────
shap_df = pd.DataFrame(shap_values, columns=all_feature_names)
shap_df.insert(0, 'ClusterID',        cluster_ids)
shap_df.insert(1, 'Predicted_Wealth', wrap_preds)
shap_df.insert(2, 'Actual_Wealth',    y)
shap_df.to_csv(
    f'{OUTPUT_DIR}/shap_values_all_clusters.csv', index=False
)
print("Saved: shap_values_all_clusters.csv")


# ── GLOBAL FEATURE IMPORTANCE ──────────────────────────
mean_abs   = np.mean(np.abs(shap_values), axis=0)
sorted_idx = np.argsort(mean_abs)[::-1]
top_n      = 15

fig, ax = plt.subplots(figsize=(10, 6))
plot_names = [all_feature_names[i] for i in sorted_idx[:top_n]][::-1]
plot_vals  = [mean_abs[i] for i in sorted_idx[:top_n]][::-1]
ax.barh(plot_names, plot_vals, color='steelblue')
ax.set_xlabel('Mean |SHAP Value|')
ax.set_title('Global Feature Importance (Top 15)')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
plt.tight_layout()
plt.savefig(
    f'{OUTPUT_DIR}/plots/global_feature_importance.png', dpi=150
)
plt.close()
print("Saved: global_feature_importance.png")


# ── GLOBAL RANKING CSV ─────────────────────────────────
df_ranking = pd.DataFrame({
    'Feature':       all_feature_names,
    'Mean_Abs_SHAP': mean_abs,
    'Rank':          pd.Series(mean_abs).rank(
                         ascending=False).astype(int)
}).sort_values('Rank')
df_ranking.to_csv(
    f'{OUTPUT_DIR}/global_feature_ranking.csv', index=False
)
print("Saved: global_feature_ranking.csv")


# ── MASTER CLUSTER SUMMARY ─────────────────────────────
rows = []
for i, cid in enumerate(cluster_ids):
    sv         = shap_values[i]
    static_sv  = sv[lstm_units:]
    static_abs = np.abs(static_sv)
    top_idx    = int(np.argmax(static_abs))

    lstm_total  = float(np.sum(np.abs(sv[:lstm_units])))
    static_total = float(np.sum(static_abs))
    total       = lstm_total + static_total

    rows.append({
        'ClusterID':          int(cid),
        'Predicted_Wealth':   round(float(wrap_preds[i]), 4),
        'Actual_Wealth':      round(float(y[i]), 4),
        'Abs_Error':          round(
            abs(float(wrap_preds[i]) - float(y[i])), 4),
        'Top_Driver':         static_feature_names[top_idx],
        'Top_Driver_SHAP':    round(float(static_sv[top_idx]), 4),
        'LSTM_Contribution':  round(lstm_total, 4),
        'Static_Contribution': round(static_total, 4),
        'LSTM_Pct':           round(
            lstm_total / total * 100 if total > 0 else 0, 1),
        'Static_Pct':         round(
            static_total / total * 100 if total > 0 else 0, 1),
    })

df_master = pd.DataFrame(rows)
df_master.to_csv(
    f'{OUTPUT_DIR}/master_cluster_summary.csv', index=False
)
print("Saved: master_cluster_summary.csv")


# ── UPLOAD OUTPUTS TO GCS ──────────────────────────────
print("\nUploading outputs to GCS...")
print("\nUploading outputs to GCS natively via TensorFlow...")
for root, dirs, files in os.walk(OUTPUT_DIR):
    for file in files:
        local_path = os.path.join(root, file)
        # Recreate the folder structure for GCS
        rel_path = os.path.relpath(local_path, OUTPUT_DIR)
        gcs_dest_path = f"{GCS_OUTPUT}/{rel_path}".replace('\\', '/')
        
        tf.io.gfile.copy(local_path, gcs_dest_path, overwrite=True)
print(f"Uploaded to: {GCS_OUTPUT}")


# ── FINAL SUMMARY ─────────────────────────────────────
print(f"\n{'='*60}")
print("SHAP COMPUTATION COMPLETE")
print(f"{'='*60}")
print(f"Date           : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Clusters       : {len(cluster_ids)}")
print(f"Features       : {len(all_feature_names)} "
      f"({lstm_units} LSTM + {len(static_feature_names)} static)")
print(f"nsamples       : {N_SAMPLES}")
print(f"Background     : {N_BACKGROUND}")
print(f"Prediction range: [{preds.min():.4f}, {preds.max():.4f}]")
print(f"Wrapper diff   : {max_diff:.8f}")
print(f"\nTop 5 global features:")
for rank, idx in enumerate(sorted_idx[:5], 1):
    print(f"  {rank}. {all_feature_names[idx]}: "
          f"{mean_abs[idx]:.4f}")
print(f"\nBranch importance (mean across clusters):")
print(f"  LSTM (satellite): {df_master['LSTM_Pct'].mean():.1f}%")
print(f"  Static (OSM):     {df_master['Static_Pct'].mean():.1f}%")
print(f"\nOutputs: {GCS_OUTPUT}")
print(f"{'='*60}")
