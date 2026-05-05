import pandas as pd
import numpy as np

# ── PATHS ─────────────────────────────────────────────────────────────────
SHAP_CSV    = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/shap_values_all_clusters.csv'
MASTER_CSV  = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/master_cluster_summary.csv'
PRED_PTS    = '/Users/ruben/Desktop/Thesis/2025Data/baguio/input/prediction_points.csv'
WEALTH_CSV  = '/Users/ruben/Desktop/Thesis/2025Data/baguio/input/dhs_wealth.csv'
OUTPUT_CSV  = '/Users/ruben/Desktop/Thesis/2025Data/shap_outputs_expanded/master_cluster_summary.csv'

# ── LOAD ──────────────────────────────────────────────────────────────────
df_master  = pd.read_csv(MASTER_CSV)
df_pts     = pd.read_csv(PRED_PTS)
df_wealth  = pd.read_csv(WEALTH_CSV)

# ClusterID in master is actually PointID
df_master  = df_master.rename(columns={'ClusterID': 'PointID'})
df_pts['PointID']    = df_pts['PointID'].astype(int)
df_master['PointID'] = df_master['PointID'].astype(int)
df_wealth['DHSCLUST']= df_wealth['DHSCLUST'].astype(int)

# Rename wealth column if needed
wi_col = [c for c in df_wealth.columns if c != 'DHSCLUST'][0]
df_wealth = df_wealth.rename(columns={wi_col: 'DHS_Wealth_Index'})

# ── JOIN source + DHSCLUST onto master ────────────────────────────────────
df_master = df_master.merge(
    df_pts[['PointID', 'source', 'DHSCLUST']],
    on='PointID', how='left'
)

# ── MAP real DHS wealth to DHS-origin points ──────────────────────────────
# Grid points get NaN first, then fill to 0
df_master['DHSCLUST'] = df_master['DHSCLUST'].fillna(-1).astype(int)

wealth_map = df_wealth.set_index('DHSCLUST')['DHS_Wealth_Index'].to_dict()

df_master['Actual_Wealth'] = df_master.apply(
    lambda r: wealth_map.get(int(r['DHSCLUST']), np.nan)
    if r['source'] == 'DHS' else np.nan,
    axis=1
)

# ── Abs_Error: only meaningful for DHS points with a real label ───────────
df_master['Abs_Error'] = np.where(
    df_master['source'] == 'DHS',
    (df_master['Predicted_Wealth'] - df_master['Actual_Wealth']).abs(),
    np.nan
)

# ── Clean up and reorder columns ──────────────────────────────────────────
df_master = df_master.rename(columns={'PointID': 'PointID'})

col_order = [
    'PointID', 'source', 'Predicted_Wealth',
    'Actual_Wealth', 'Abs_Error',
    'Top_Driver', 'Top_Driver_SHAP',
    'LSTM_Contribution', 'Static_Contribution',
    'LSTM_Pct', 'Static_Pct'
]
# Keep any extra columns not listed above
extra = [c for c in df_master.columns if c not in col_order
         and c not in ('DHSCLUST',)]
df_master = df_master[col_order + extra]

# ── Save ──────────────────────────────────────────────────────────────────
df_master.to_csv(OUTPUT_CSV, index=False)

# ── Report ────────────────────────────────────────────────────────────────
print(f"Points in master summary  : {len(df_master)}")
print(f"  DHS-origin              : {(df_master['source']=='DHS').sum()}")
print(f"  Grid-generated          : {(df_master['source']=='grid').sum()}")

dhs = df_master[df_master['source'] == 'DHS'].dropna(subset=['Actual_Wealth'])
print(f"\nDHS points with real wealth label: {len(dhs)}")
print(f"  Abs_Error mean : {dhs['Abs_Error'].mean():.4f}")
print(f"  Abs_Error std  : {dhs['Abs_Error'].std():.4f}")
print(f"  Abs_Error min  : {dhs['Abs_Error'].min():.4f}")
print(f"  Abs_Error max  : {dhs['Abs_Error'].max():.4f}")

grid = df_master[df_master['source'] == 'grid']
print(f"\nGrid points (no ground truth): {len(grid)}")
print(f"  Actual_Wealth NaN: {grid['Actual_Wealth'].isna().sum()}")
print(f"  Abs_Error NaN    : {grid['Abs_Error'].isna().sum()}")

print(f"\nSaved to: {OUTPUT_CSV}")