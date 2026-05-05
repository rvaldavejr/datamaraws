"""
prepare_webapp_data.py  (revised — expanded feature set)

Changes from original:
  - OSM_FEATURES loaded from static_feature_names.txt (52 features)
    instead of the hardcoded 20-feature list
  - master_cluster_summary.csv integrated as a new input:
      · source column (DHS / grid) carried onto every point
      · Actual_Wealth (verified real DHS WI) used for dhs_mean_wi in
        province and municipality aggregations shown in the side panel
      · dhs_wi included per point in points.json (null for grid points)
  - SHAP_CSV and OSM_CSV paths updated to expanded output directories
  - SHAP category function extended to cover Landuse and new POI types
  - shap_by_area top-N raised from 10 to 15, category field added

Usage:
    python prepare_webapp_data.py

Output (copy entire webapp_data/ to Next.js public/data/):
    webapp_data/points.json          all 1112 prediction points
    webapp_data/provinces.json       aggregated stats per province
    webapp_data/municipalities.json  aggregated stats per municipality
    webapp_data/shap_global.json     global SHAP feature ranking
    webapp_data/shap_by_area.json    per-province SHAP feature importance
"""

import pandas as pd
import numpy as np
import json
import os

# ── PATHS ──────────────────────────────────────────────────────────────
POINTS_CSV  = '/Users/ruben/Desktop/Thesis/2025Data/baguio/input/prediction_points.csv'
OSM_CSV     = '/Users/ruben/Desktop/Thesis/2025Data/baguio/input/static_osm_features_2025_prediction_points_expanded.csv'
SHAP_CSV    = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/shap_values_all_clusters.csv'
MASTER_CSV  = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/master_cluster_summary.csv'
FEAT_NAMES  = '/Users/ruben/Desktop/Thesis/2025Data/baguio/input/static_feature_names.txt'


OUTPUT_DIR = './webapp_data/expanded_provinces'
os.makedirs(OUTPUT_DIR, exist_ok=True)

mean_static_features = ['Mean_Bldg_Area', 'Total_Bldg_Proportion', 'Bldg_Density_per_km2', 'Bldg_residential_MeanArea', 'Bldg_residential_Proportion', 'Bldg_commercial_MeanArea', 'Bldg_commercial_Proportion', 'Bldg_industrial_MeanArea', 'Bldg_industrial_Proportion', 'Bldg_school_MeanArea', 'Bldg_school_Proportion', 'Bldg_hospital_MeanArea', 'Bldg_hospital_Proportion', 'VIIRS_Median']

# ── LOAD ───────────────────────────────────────────────────────────────
print("Loading CSVs...")
df_pts   = pd.read_csv(POINTS_CSV)
df_osm   = pd.read_csv(OSM_CSV)
df_shap  = pd.read_csv(SHAP_CSV)
df_master = pd.read_csv(MASTER_CSV)

# ── STATIC FEATURE NAMES FROM FILE ─────────────────────────────────────
# Replaces the hardcoded 20-feature OSM_FEATURES list.
# Reads the 52-feature list saved by phase4-2-merge-datasets.ipynb.
print("Loading static feature names from file...")
with open(FEAT_NAMES) as f:
    OSM_FEATURES = [line.strip() for line in f if line.strip()]
print(f"  {len(OSM_FEATURES)} features loaded")

#df_master = df_master.rename(columns={'ClusterID': 'PointID'})

# Normalise key types
for df_obj, col in [(df_pts, 'PointID'), (df_osm, 'PointID'),
                    (df_master, 'PointID')]:
    df_obj[col] = df_obj[col].astype(int)
    df_pts = df_pts.drop(columns=['source'], errors='ignore')

# ClusterID in SHAP file maps to PointID
df_shap = df_shap.rename(columns={'ClusterID': 'PointID'})
df_shap['PointID'] = df_shap['PointID'].astype(int)

# ── EXTRACT PREDICTIONS + SOURCE + DHS WEALTH FROM MASTER SUMMARY ──────
# master_cluster_summary.csv (corrected version) contains:
#   PointID, source (DHS/grid), Predicted_Wealth,
#   Actual_Wealth (verified DHS WI for DHS points, NaN for grid)
df_preds = df_master[['PointID', 'source',
                       'Predicted_Wealth', 'Actual_Wealth']].copy()
df_preds = df_preds.rename(columns={
    'Predicted_Wealth': 'Predicted_WI',
    'Actual_Wealth'   : 'DHS_WI',
})
print(f"Predictions loaded from master summary: {len(df_preds)} rows")
print(f"  DHS-origin (real label) : {(df_preds['source']=='DHS').sum()}")
print(f"  Grid-generated (no WI)  : {(df_preds['source']=='grid').sum()}")
print(f"  WI range: [{df_preds['Predicted_WI'].min():.4f}, "
      f"{df_preds['Predicted_WI'].max():.4f}]")

# ── MERGE POINTS DATA ─────────────────────────────────────────────────
print("Merging datasets...")
df = df_pts.merge(df_preds, on='PointID', how='left')
df = df.merge(df_osm, on='PointID', how='left')
# Drop the 128 edge-clipped points with no prediction
df = df.dropna(subset=['Predicted_WI'])
print(f"Merged rows (with predictions): {len(df)}")

# Wealth class label
def wealth_class(wi):
    if wi >= 0.5 : return 'high'
    if wi >= -0.5: return 'mid'
    return 'low'

df['wealth_class'] = df['Predicted_WI'].apply(wealth_class)




# ── 1. POINTS JSON ────────────────────────────────────────────────────
print("Building points.json...")
points_out = []
for _, row in df.iterrows():
    osm = {f: round(float(row[f]), 4)
           if f in df.columns and pd.notna(row[f]) else 0
           for f in OSM_FEATURES}
    points_out.append({
        'id'          : int(row['PointID']),
        'lat'         : round(float(row['Latitude']),  6),
        'lon'         : round(float(row['Longitude']), 6),
        'province'    : str(row['Province']),
        'municipality': str(row['Municipality']),
        'region'      : str(row['Region']),
        'urban_rural' : str(row['Urban_Rural']),
        # source: 'DHS' for survey-origin points, 'grid' for generated
        'source'      : str(row['source']),
        'wi'          : round(float(row['Predicted_WI']), 4),
        'wi_class'    : row['wealth_class'],
        # dhs_wi: verified DHS wealth index for DHS points, null for grid
        'dhs_wi'      : round(float(row['DHS_WI']), 4)
                         if pd.notna(row.get('DHS_WI')) else None,
        'poverty_rate': float(row['PSA_Poverty_Rate'])
                         if pd.notna(row.get('PSA_Poverty_Rate')) else None,
        'osm'         : osm
    })

with open(f'{OUTPUT_DIR}/points.json', 'w') as f:
    json.dump(points_out, f, separators=(',', ':'))
print(f"  Saved {len(points_out)} points")

# ── 2. PROVINCE AGGREGATION ───────────────────────────────────────────
print("Building provinces.json...")

def dhs_mean_wi(grp: pd.DataFrame):
    """Mean verified DHS wealth index across DHS-origin points in grp.
    Returns None if no DHS points with a real label are present."""
    vals = grp.loc[
        (grp['source'] == 'DHS') & grp['DHS_WI'].notna(), 'DHS_WI']
    return round(float(vals.mean()), 4) if len(vals) > 0 else None

provinces_out = {}
for prov, grp in df.groupby('Province'):
    wi_vals = grp['Predicted_WI'].values
    osm_agg = {}
    for f in OSM_FEATURES:
        if f in grp.columns:
            if f in mean_static_features:
                osm_agg[f] = round(float(grp[f].mean()), 3)
            else:
                osm_agg[f] = round(float(grp[f].sum()), 3)

    provinces_out[prov] = {
        'name'            : prov,
        'n_points'        : int(len(grp)),
        'n_dhs_points'    : int((grp['source'] == 'DHS').sum()),
        'n_municipalities': int(grp['Municipality'].nunique()),
        # Predicted wealth (all points — model output)
        'mean_wi'         : round(float(np.mean(wi_vals)), 4),
        'median_wi'       : round(float(np.median(wi_vals)), 4),
        'min_wi'          : round(float(np.min(wi_vals)), 4),
        'max_wi'          : round(float(np.max(wi_vals)), 4),
        'std_wi'          : round(float(np.std(wi_vals)), 4),
        'pct_low'         : round(float((wi_vals < -0.5).mean() * 100), 1),
        'pct_mid'         : round(float(((wi_vals >= -0.5) &
                                         (wi_vals < 0.5)).mean() * 100), 1),
        'pct_high'        : round(float((wi_vals >= 0.5).mean() * 100), 1),
        # Verified DHS wealth (side panel — from real survey labels only)
        'dhs_mean_wi'     : dhs_mean_wi(grp),
        'poverty_rate'    : float(grp['PSA_Poverty_Rate'].iloc[0])
                             if 'PSA_Poverty_Rate' in grp.columns else None,
        'region'          : str(grp['Region'].iloc[0]),
        'osm_agg'        : osm_agg,
        'municipalities'  : sorted(grp['Municipality'].unique().tolist()),
    }

with open(f'{OUTPUT_DIR}/provinces.json', 'w') as f:
    json.dump(provinces_out, f, separators=(',', ':'))
print(f"  Saved {len(provinces_out)} provinces")

# ── 3. MUNICIPALITY AGGREGATION ───────────────────────────────────────
print("Building municipalities.json...")
munis_out = {}
for (prov, muni), grp in df.groupby(['Province', 'Municipality']):
    wi_vals = grp['Predicted_WI'].values
    osm_agg = {}
    for f in OSM_FEATURES:
        if f in grp.columns:
            if f in mean_static_features:
                osm_agg[f] = round(float(grp[f].mean()), 3)
            else:
                osm_agg[f] = round(float(grp[f].sum()), 3)

    key = f"{prov}|{muni}"
    munis_out[key] = {
        'municipality' : muni,
        'province'     : prov,
        'region'       : str(grp['Region'].iloc[0]),
        'n_points'     : int(len(grp)),
        'n_dhs_points' : int((grp['source'] == 'DHS').sum()),
        # Predicted wealth (all points — model output)
        'mean_wi'      : round(float(np.mean(wi_vals)), 4),
        'median_wi'    : round(float(np.median(wi_vals)), 4),
        'std_wi'       : round(float(np.std(wi_vals)), 4),
        'min_wi'       : round(float(np.min(wi_vals)), 4),
        'max_wi'       : round(float(np.max(wi_vals)), 4),
        'pct_low'      : round(float((wi_vals < -0.5).mean() * 100), 1),
        'pct_high'     : round(float((wi_vals >= 0.5).mean() * 100), 1),
        # Verified DHS wealth (side panel — from real survey labels only)
        'dhs_mean_wi'  : dhs_mean_wi(grp),
        'osm_agg'     : osm_agg,
        'point_ids'    : grp['PointID'].tolist(),
    }

with open(f'{OUTPUT_DIR}/municipalities.json', 'w') as f:
    json.dump(munis_out, f, separators=(',', ':'))
print(f"  Saved {len(munis_out)} municipalities")

# ── 4. SHAP GLOBAL RANKING ────────────────────────────────────────────
print("Building shap_global.json...")

SHAP_EXCLUDE = {'PointID', 'Predicted_Wealth', 'Actual_Wealth',
                'Province', 'Region', 'source',
                'Top_Driver', 'Top_Driver_SHAP',
                'LSTM_Contribution', 'Static_Contribution',
                'LSTM_Pct', 'Static_Pct', 'Abs_Error'}
shap_feature_cols = [c for c in df_shap.columns if c not in SHAP_EXCLUDE]

def shap_category(feat: str) -> str:
    if 'VIIRS'  in feat: return 'Satellite'
    if 'LSTM'   in feat: return 'Temporal'
    if 'Road'   in feat or 'Track' in feat: return 'Road'
    if 'Bldg'   in feat or feat in ('Mean_Bldg_Area',
                                     'Total_Bldg_Proportion',
                                     'Bldg_Density_per_km2'): return 'Building'
    if feat.startswith('LU_'):  return 'Landuse'
    if feat.startswith('POI_') or feat == 'Total_POI_Count': return 'POI'
    return 'Other'

if shap_feature_cols:
    mean_abs = df_shap[shap_feature_cols].abs().mean()
    global_ranking = [
        {
            'rank'         : int(i + 1),
            'feature'      : str(feat),
            'mean_abs_shap': round(float(val), 6),
            'category'     : shap_category(feat),
        }
        for i, (feat, val) in enumerate(
            mean_abs.sort_values(ascending=False).items()
        )
    ]
    with open(f'{OUTPUT_DIR}/shap_global.json', 'w') as f:
        json.dump(global_ranking, f, separators=(',', ':'))
    print(f"  Saved {len(global_ranking)} features")
    print("  Top 10:")
    for item in global_ranking[:10]:
        print(f"    {item['rank']:2d}. [{item['category']:9s}] "
              f"{item['feature']}: {item['mean_abs_shap']:.5f}")
else:
    print("  WARNING: No SHAP feature columns found.")
    with open(f'{OUTPUT_DIR}/shap_global.json', 'w') as f:
        json.dump([], f)

# ── 5. SHAP BY PROVINCE ───────────────────────────────────────────────
print("Building shap_by_area.json...")

# SHAP file uses PointID — join Province from prediction points
if 'Province' not in df_shap.columns:
    prov_map  = df_pts[['PointID', 'Province']].copy()
    df_shap   = df_shap.merge(prov_map, on='PointID', how='left')

shap_by_prov = {}
if 'Province' in df_shap.columns and shap_feature_cols:
    for prov, grp in df_shap.groupby('Province'):
        mean_abs = grp[shap_feature_cols].abs().mean()
        shap_by_prov[prov] = [
            {
                'feature'      : str(feat),
                'mean_abs_shap': round(float(val), 6),
                'category'     : shap_category(feat),
            }
            for feat, val in mean_abs.sort_values(
                ascending=False).head(15).items()
        ]
else:
    print("  WARNING: Province join failed — using global SHAP fallback.")
    global_top15 = [
        {
            'feature'      : item['feature'],
            'mean_abs_shap': item['mean_abs_shap'],
            'category'     : item['category'],
        }
        for item in global_ranking[:15]
    ]
    for prov in df['Province'].unique():
        shap_by_prov[prov] = global_top15

with open(f'{OUTPUT_DIR}/shap_by_area.json', 'w') as f:
    json.dump(shap_by_prov, f, separators=(',', ':'))
print(f"  Saved SHAP for {len(shap_by_prov)} provinces")

# ── 6. NATIONAL DESCRIPTIVE STATISTICS ───────────────────────────────
# Computed directly from all individual prediction points in df.
# These are the authoritative study-wide figures used by the web app
# sidebar and report — no province-level variance decomposition needed.
print("Building national_stats.json...")

wi_all   = df['Predicted_WI'].values
wi_dhs   = df.loc[df['source'] == 'DHS', 'DHS_WI'].dropna().values
wi_pred_dhs = df.loc[df['source'] == 'DHS', 'Predicted_WI'].values

# ── WI histogram (0.25-unit bins from −2.75 to +1.75) ─────────────────
bins      = [-2.75, -2.5, -2.25, -2.0, -1.75, -1.5, -1.25, -1.0,
             -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75]
hist_counts = []
hist_labels = []
for i in range(len(bins) - 1):
    lo, hi = bins[i], bins[i + 1]
    count  = int(((wi_all >= lo) & (wi_all < hi)).sum())
    hist_counts.append(count)
    hist_labels.append(f'{lo:.2f}')

# ── Province ranking (poorest → wealthiest) ───────────────────────────
prov_ranking = sorted(
    [
        {
            'name'       : prov,
            'mean_wi'    : round(float(np.mean(g['Predicted_WI'].values)), 4),
            'median_wi'  : round(float(np.median(g['Predicted_WI'].values)), 4),
            'std_wi'     : round(float(np.std(g['Predicted_WI'].values)), 4),
            'n_points'   : int(len(g)),
            'n_dhs'      : int((g['source'] == 'DHS').sum()),
            'pct_low'    : round(float((g['Predicted_WI'] < -0.5).mean() * 100), 1),
            'pct_high'   : round(float((g['Predicted_WI'] >= 0.5).mean() * 100), 1),
            'dhs_mean_wi': round(float(
                g.loc[(g['source']=='DHS') & g['DHS_WI'].notna(), 'DHS_WI'].mean()
            ), 4) if (g['source']=='DHS').any() and g['DHS_WI'].notna().any() else None,
        }
        for prov, g in df.groupby('Province')
    ],
    key=lambda x: x['mean_wi']
)

# ── Municipality ranking (bottom 20 + top 20) ────────────────────────
muni_list = sorted(
    [
        {
            'municipality': muni,
            'province'    : prov,
            'n_points'    : int(len(g)),
            'mean_wi'     : round(float(np.mean(g['Predicted_WI'].values)), 4),
            'pct_low'     : round(float((g['Predicted_WI'] < -0.5).mean() * 100), 1),
            'pct_high'    : round(float((g['Predicted_WI'] >= 0.5).mean() * 100), 1),
            'dhs_mean_wi' : round(float(
                g.loc[(g['source']=='DHS') & g['DHS_WI'].notna(), 'DHS_WI'].mean()
            ), 4) if (g['source']=='DHS').any() and g['DHS_WI'].notna().any() else None,
        }
        for (prov, muni), g in df.groupby(['Province', 'Municipality'])
    ],
    key=lambda x: x['mean_wi']
)

national_stats = {
    # ── Coverage ────────────────────────────────────────────────────────
    'n_points'          : int(len(df)),
    'n_dhs_points'      : int((df['source'] == 'DHS').sum()),
    'n_grid_points'     : int((df['source'] == 'grid').sum()),
    'n_provinces'       : int(df['Province'].nunique()),
    'n_municipalities'  : int(df[['Province','Municipality']].drop_duplicates().shape[0]),

    # ── Predicted WI — all points ────────────────────────────────────────
    'mean_wi'           : round(float(np.mean(wi_all)), 4),
    'median_wi'         : round(float(np.median(wi_all)), 4),
    'std_wi'            : round(float(np.std(wi_all)), 4),
    'min_wi'            : round(float(np.min(wi_all)), 4),
    'max_wi'            : round(float(np.max(wi_all)), 4),
    'pct_low'           : round(float((wi_all < -0.5).mean() * 100), 1),
    'pct_mid'           : round(float(((wi_all >= -0.5) & (wi_all < 0.5)).mean() * 100), 1),
    'pct_high'          : round(float((wi_all >= 0.5).mean() * 100), 1),
    'p25_wi'            : round(float(np.percentile(wi_all, 25)), 4),
    'p75_wi'            : round(float(np.percentile(wi_all, 75)), 4),

    # ── DHS survey WI — DHS-origin points only ───────────────────────────
    'dhs_n_points'      : int(len(wi_dhs)),
    'dhs_mean_wi'       : round(float(np.mean(wi_dhs)), 4) if len(wi_dhs) > 0 else None,
    'dhs_median_wi'     : round(float(np.median(wi_dhs)), 4) if len(wi_dhs) > 0 else None,
    'dhs_std_wi'        : round(float(np.std(wi_dhs)), 4) if len(wi_dhs) > 0 else None,
    'dhs_min_wi'        : round(float(np.min(wi_dhs)), 4) if len(wi_dhs) > 0 else None,
    'dhs_max_wi'        : round(float(np.max(wi_dhs)), 4) if len(wi_dhs) > 0 else None,

    # ── Predicted WI for DHS-origin points (model validation) ───────────
    'dhs_pred_mean_wi'  : round(float(np.mean(wi_pred_dhs)), 4) if len(wi_pred_dhs) > 0 else None,
    'dhs_pred_std_wi'   : round(float(np.std(wi_pred_dhs)), 4) if len(wi_pred_dhs) > 0 else None,
    # Mean absolute error on DHS-origin points
    'dhs_mae'           : round(float(
        np.mean(np.abs(wi_pred_dhs - wi_dhs))
    ), 4) if len(wi_dhs) > 0 and len(wi_pred_dhs) == len(wi_dhs) else None,

    # ── WI histogram (0.25-unit bins) ────────────────────────────────────
    'histogram'         : {
        'labels' : hist_labels,
        'counts' : hist_counts,
        'bin_width': 0.25,
    },

    # ── Rankings ─────────────────────────────────────────────────────────
    'province_ranking'     : prov_ranking,          # all 11, poorest → wealthiest
    'municipality_bottom20': muni_list[:20],         # 20 lowest-wealth municipalities
    'municipality_top20'   : muni_list[-20:][::-1],  # 20 highest-wealth municipalities
}

nat_path = f'{OUTPUT_DIR}/national_stats.json'
with open(nat_path, 'w') as f:
    json.dump(national_stats, f, separators=(',', ':'))
print(f"  Saved national_stats.json")
print(f"  Study-wide mean WI   : {national_stats['mean_wi']}")
print(f"  Study-wide std WI    : {national_stats['std_wi']}")
print(f"  Study-wide median WI : {national_stats['median_wi']}")
print(f"  WI range             : [{national_stats['min_wi']}, {national_stats['max_wi']}]")
print(f"  DHS MAE              : {national_stats['dhs_mae']}")

# ── SUMMARY ───────────────────────────────────────────────────────────
print(f"\n{'='*55}")
print("DATA PREPARATION COMPLETE")
print(f"{'='*55}")
print(f"Output folder : {OUTPUT_DIR}/")
for fname in ['points.json', 'provinces.json', 'municipalities.json',
              'shap_global.json', 'shap_by_area.json', 'national_stats.json']:
    fpath = f'{OUTPUT_DIR}/{fname}'
    size  = os.path.getsize(fpath) / 1e3
    print(f"  {fname:<26} ({size:.0f} KB)")

provs_with_dhs = sum(1 for v in provinces_out.values()
                     if v.get('dhs_mean_wi') is not None)
munis_with_dhs = sum(1 for v in munis_out.values()
                     if v.get('dhs_mean_wi') is not None)
print(f"\nValidation:")
print(f"  Total prediction points   : {len(df)}")
print(f"    DHS-origin (real WI)    : {(df['source']=='DHS').sum()}")
print(f"    Grid-generated          : {(df['source']=='grid').sum()}")
print(f"  Provinces                 : {len(provinces_out)}")
print(f"    With DHS mean WI        : {provs_with_dhs}/{len(provinces_out)}")
print(f"  Municipalities            : {len(munis_out)}")
print(f"    With DHS mean WI        : {munis_with_dhs}/{len(munis_out)}")
print(f"  OSM features loaded       : {len(OSM_FEATURES)}")
print(f"\nNational stats (from {national_stats['n_points']} points):")
print(f"  Mean WI    : {national_stats['mean_wi']}")
print(f"  Std WI     : {national_stats['std_wi']}")
print(f"  Median WI  : {national_stats['median_wi']}")
print(f"  DHS MAE    : {national_stats['dhs_mae']}")
print(f"\nCopy {OUTPUT_DIR}/ to your Next.js public/data/ folder.")