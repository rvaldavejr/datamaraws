"""
prepare_webapp_data.py
Run this on M4 after LSTM inference is complete.
Merges prediction_points.csv, static_osm_features_2025_prediction_points.csv,
shap_values_all_clusters.csv, and poverty_predictions_2025.csv into
static JSON files consumed by the Next.js web app.

Usage:
    python prepare_webapp_data.py

Output (copy entire /output folder to Next.js public/data/):
    output/points.json          - all 1112 prediction points with wealth index + OSM
    output/provinces.json       - aggregated stats per province
    output/municipalities.json  - aggregated stats per municipality
    output/shap_global.json     - global SHAP feature ranking
    output/shap_by_area.json    - per-province SHAP feature importance
"""

import pandas as pd
import numpy as np
import json
import os

# ── PATHS ──────────────────────────────────────────────────────────────
POINTS_CSV      = '/Users/ruben/Desktop/Thesis/2025Data/prediction_points.csv'
OSM_CSV         = '/Users/ruben/Desktop/Thesis/2025Data/static_osm_features_2025_prediction_points.csv'
SHAP_CSV        = '/Users/ruben/Desktop/Thesis/2025Data/shap_outputs/shap_values_all_clusters.csv'


OUTPUT_DIR = './webapp_data'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── LOAD ───────────────────────────────────────────────────────────────
print("Loading CSVs...")
df_pts   = pd.read_csv(POINTS_CSV)
df_osm   = pd.read_csv(OSM_CSV)
df_shap  = pd.read_csv(SHAP_CSV)

# Predictions come from shap_values_all_clusters.csv
# The Predicted_Wealth column contains the model's wealth index estimate
# per training cluster. ClusterID maps to DHSCLUST in prediction_points.csv
# for the 242 DHS-sourced prediction points.

df_preds = df_shap[['ClusterID', 'Predicted_Wealth']].copy()
df_preds = df_preds.rename(columns={
    'ClusterID'      : 'PointID',
    'Predicted_Wealth': 'Predicted_WI'
})
df_preds['PointID'] = df_preds['PointID'].astype(int)
print(f"Predictions loaded from SHAP file: {len(df_preds)} rows")
print(f"WI range: [{df_preds['Predicted_WI'].min():.4f}, "
      f"{df_preds['Predicted_WI'].max():.4f}]")

# Normalize keys
df_pts['PointID']   = df_pts['PointID'].astype(int)
df_osm['PointID']   = df_osm['PointID'].astype(int)
df_preds['PointID'] = df_preds['PointID'].astype(int)

# ── MERGE POINTS DATA ─────────────────────────────────────────────────
print("Merging datasets...")
df = df_pts.merge(df_preds[['PointID','Predicted_WI']],
                  on='PointID', how='left')
df = df.merge(df_osm, on='PointID', how='left')
#df['Predicted_WI'] = df['Predicted_WI'].fillna(0.0)
# Remove the 128 empty grid points before calculating any averages!
df = df.dropna(subset=['Predicted_WI'])

print(f"Merged rows: {len(df)}")

# Wealth class label
def wealth_class(wi):
    if wi >= 0.5 : return 'high'
    if wi >= -0.5: return 'mid'
    return 'low'

df['wealth_class'] = df['Predicted_WI'].apply(wealth_class)

# ── STATIC OSM FEATURE NAMES ───────────────────────────────────────────
OSM_FEATURES = [
    'Total_Road_Length', 'Main_Roads_Length',
    'Secondary_Roads_Length', 'Local_Roads_Length',
    'Tracks_Length', 'Total_Bldg_Count',
    'Bldg_residential_Count', 'Bldg_commercial_Count',
    'Bldg_industrial_Count', 'Bldg_school_Count',
    'Bldg_hospital_Count', 'Total_Bldg_Area',
    'Total_POI_Count', 'POI_bank_Count',
    'POI_hotel_Count', 'POI_fast_food_Count',
    'POI_convenience_Count', 'POI_school_Count',
    'POI_hospital_Count', 'VIIRS_Median'
]

# ── 1. POINTS JSON ────────────────────────────────────────────────────
print("Building points.json...")
points_out = []
for _, row in df.iterrows():
    osm = {f: round(float(row[f]), 4) if f in df.columns else 0
           for f in OSM_FEATURES}
    points_out.append({
        'id'          : int(row['PointID']),
        'lat'         : round(float(row['Latitude']),  6),
        'lon'         : round(float(row['Longitude']), 6),
        'province'    : str(row['Province']),
        'municipality': str(row['Municipality']),
        'region'      : str(row['Region']),
        'urban_rural' : str(row['Urban_Rural']),
        'source'      : str(row['source']),
        'wi'          : round(float(row['Predicted_WI']), 4),
        'wi_class'    : row['wealth_class'],
        'poverty_rate': float(row['PSA_Poverty_Rate'])
                         if pd.notna(row.get('PSA_Poverty_Rate')) else None,
        'osm'         : osm
    })

with open(f'{OUTPUT_DIR}/points.json', 'w') as f:
    json.dump(points_out, f, separators=(',', ':'))
print(f"  Saved {len(points_out)} points")

# ── 2. PROVINCE AGGREGATION ───────────────────────────────────────────
print("Building provinces.json...")
SHAP_STATIC_COLS = [c for c in df_shap.columns
                    if c in OSM_FEATURES + ['LSTM_Temporal',
                                            'Predicted_Wealth',
                                            'Actual_Wealth',
                                            'ClusterID']]

provinces_out = {}
for prov, grp in df.groupby('Province'):
    prov_pts = grp[grp['Predicted_WI'] != 0.0] \
               if len(grp[grp['Predicted_WI'] != 0.0]) > 0 else grp

    wi_vals  = prov_pts['Predicted_WI'].values
    osm_agg  = {}
    for f in OSM_FEATURES:
        if f in prov_pts.columns:
            osm_agg[f] = round(float(prov_pts[f].mean()), 3)

    provinces_out[prov] = {
        'name'         : prov,
        'n_points'     : int(len(grp)),
        'n_municipalities': int(grp['Municipality'].nunique()),
        'mean_wi'      : round(float(np.mean(wi_vals)), 4),
        'median_wi'    : round(float(np.median(wi_vals)), 4),
        'min_wi'       : round(float(np.min(wi_vals)), 4),
        'max_wi'       : round(float(np.max(wi_vals)), 4),
        'std_wi'       : round(float(np.std(wi_vals)), 4),
        'pct_low'      : round(float((wi_vals < -0.5).mean() * 100), 1),
        'pct_mid'      : round(float(((wi_vals >= -0.5) & (wi_vals < 0.5)).mean() * 100), 1),
        'pct_high'     : round(float((wi_vals >= 0.5).mean() * 100), 1),
        'poverty_rate' : float(grp['PSA_Poverty_Rate'].iloc[0])
                          if 'PSA_Poverty_Rate' in grp.columns else None,
        'region'       : str(grp['Region'].iloc[0]),
        'osm_mean'     : osm_agg,
        'municipalities': sorted(grp['Municipality'].unique().tolist())
    }

with open(f'{OUTPUT_DIR}/provinces.json', 'w') as f:
    json.dump(provinces_out, f, separators=(',', ':'))
print(f"  Saved {len(provinces_out)} provinces")

# ── 3. MUNICIPALITY AGGREGATION ───────────────────────────────────────
print("Building municipalities.json...")
munis_out = {}
for (prov, muni), grp in df.groupby(['Province', 'Municipality']):
    wi_vals = grp['Predicted_WI'].values
    osm_agg = {f: round(float(grp[f].mean()), 3)
               for f in OSM_FEATURES if f in grp.columns}

    key = f"{prov}|{muni}"
    munis_out[key] = {
        'municipality' : muni,
        'province'     : prov,
        'region'       : str(grp['Region'].iloc[0]),
        'n_points'     : int(len(grp)),
        'mean_wi'      : round(float(np.mean(wi_vals)), 4),
        'median_wi'    : round(float(np.median(wi_vals)), 4),
        'min_wi'       : round(float(np.min(wi_vals)), 4),
        'max_wi'       : round(float(np.max(wi_vals)), 4),
        'pct_low'      : round(float((wi_vals < -0.5).mean() * 100), 1),
        'pct_high'     : round(float((wi_vals >= 0.5).mean() * 100), 1),
        'osm_mean'     : osm_agg,
        'point_ids'    : grp['PointID'].tolist()
    }

with open(f'{OUTPUT_DIR}/municipalities.json', 'w') as f:
    json.dump(munis_out, f, separators=(',', ':'))
print(f"  Saved {len(munis_out)} municipalities")

# ── 4. SHAP GLOBAL RANKING ────────────────────────────────────────────
print("Building shap_global.json...")
shap_feature_cols = [c for c in df_shap.columns
                     if c not in ('ClusterID', 'Predicted_Wealth',
                                  'Actual_Wealth', 'Province',
                                  'Region', 'Top_Driver',
                                  'Top_Driver_SHAP',
                                  'LSTM_Contribution', 'Abs_Error')]
if shap_feature_cols:
    mean_abs = df_shap[shap_feature_cols].abs().mean()
    global_ranking = [
        {
            'rank'   : int(i + 1),
            'feature': str(feat),
            'mean_abs_shap': round(float(val), 6),
            'category': (
                'Satellite'      if 'VIIRS' in feat else
                'Temporal'       if 'LSTM'  in feat else
                'Road'           if 'Road'  in feat or 'Track' in feat else
                'Building'       if 'Bldg'  in feat else
                'Infrastructure' if 'POI'   in feat else 'Other'
            )
        }
        for i, (feat, val) in enumerate(
            mean_abs.sort_values(ascending=False).items()
        )
    ]
    with open(f'{OUTPUT_DIR}/shap_global.json', 'w') as f:
        json.dump(global_ranking, f, separators=(',', ':'))
    print(f"  Saved {len(global_ranking)} features")
else:
    print("  WARNING: No SHAP feature columns found. Check column names.")
    with open(f'{OUTPUT_DIR}/shap_global.json', 'w') as f:
        json.dump([], f)

# ── 5. SHAP BY PROVINCE ───────────────────────────────────────────────
print("Building shap_by_area.json...")
# --- ADD THIS FIX ---
if 'Province' not in df_shap.columns:
    # Map ClusterID to Province using the points dataframe
    prov_mapping = df_pts[['PointID', 'Province']].rename(columns={'PointID': 'ClusterID'})
    df_shap = df_shap.merge(prov_mapping, on='ClusterID', how='left')
# --------------------
shap_by_prov = {}

# SHAP file is from training clusters; match by Province if column exists
if 'Province' in df_shap.columns and shap_feature_cols:
    for prov, grp in df_shap.groupby('Province'):
        mean_abs = grp[shap_feature_cols].abs().mean()
        shap_by_prov[prov] = [
            {
                'feature'      : str(feat),
                'mean_abs_shap': round(float(val), 6)
            }
            for feat, val in mean_abs.sort_values(
                ascending=False).head(10).items()
        ]
else:
    # Fall back: use global SHAP for all provinces
    if shap_feature_cols:
        mean_abs = df_shap[shap_feature_cols].abs().mean()
        global_top10 = [
            {'feature': str(feat), 'mean_abs_shap': round(float(val), 6)}
            for feat, val in mean_abs.sort_values(
                ascending=False).head(10).items()
        ]
        for prov in df['Province'].unique():
            shap_by_prov[prov] = global_top10

with open(f'{OUTPUT_DIR}/shap_by_area.json', 'w') as f:
    json.dump(shap_by_prov, f, separators=(',', ':'))
print(f"  Saved SHAP for {len(shap_by_prov)} provinces")

# ── SUMMARY ───────────────────────────────────────────────────────────
print(f"\n{'='*50}")
print("DATA PREPARATION COMPLETE")
print(f"{'='*50}")
print(f"Output folder : {OUTPUT_DIR}/")
print(f"  points.json         ({os.path.getsize(f'{OUTPUT_DIR}/points.json')/1e3:.0f} KB)")
print(f"  provinces.json      ({os.path.getsize(f'{OUTPUT_DIR}/provinces.json')/1e3:.0f} KB)")
print(f"  municipalities.json ({os.path.getsize(f'{OUTPUT_DIR}/municipalities.json')/1e3:.0f} KB)")
print(f"  shap_global.json    ({os.path.getsize(f'{OUTPUT_DIR}/shap_global.json')/1e3:.0f} KB)")
print(f"  shap_by_area.json   ({os.path.getsize(f'{OUTPUT_DIR}/shap_by_area.json')/1e3:.0f} KB)")
print(f"\nCopy entire {OUTPUT_DIR}/ to your Next.js public/data/ folder.")
