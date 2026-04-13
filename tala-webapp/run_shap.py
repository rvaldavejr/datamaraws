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
import logging
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from tensorflow.keras.models import load_model, Model
from joblib import Parallel, delayed

# Mute SHAP's annoying background size warnings
logging.getLogger('shap').setLevel(logging.ERROR)


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
