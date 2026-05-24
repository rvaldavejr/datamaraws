"""
tala_statistics.py  —  Project TALA comprehensive metrics
──────────────────────────────────────────────────────────
Sections:
  1.  Sample summary
  2.  Descriptive statistics — three prediction series
  3.  Normality tests
  4.  Accuracy — 2022 imagery vs ground truth
  5.  Accuracy — 2025 imagery vs ground truth
  6.  Temporal comparison — 2022 vs 2025 predicted
  7.  Side-by-side accuracy summary
  8.  SHAP branch attribution comparison
  9.  Error distribution and quartile analysis
  10. Urban vs Rural breakdown
  11. Province-level accuracy breakdown
  12. Grid-generated points — descriptive statistics
  13. Grid — spatial coverage
  14. Grid — wealth distribution and class breakdown
  15. Grid — PSA poverty rate correlation
  16. Grid — SHAP and top driver analysis
  17. Grid — province-level summary
  18. Grid vs DHS predicted WI comparison
  19. Key findings summary

Outputs:
  tala_statistics.txt          — full human-readable report
  tala_statistics_province.csv — province accuracy table
  tala_statistics_grid.csv     — province grid summary table
"""

import os
import numpy as np
import pandas as pd
from scipy.stats import (pearsonr, spearmanr, kendalltau, shapiro,
                         ks_2samp, mannwhitneyu, ttest_rel, wilcoxon)
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# ── PATHS ──────────────────────────────────────────────────────────────────────
MASTER_2022_CSV = '/Users/ruben/Desktop/Thesis/2022Validation/shap_outputs/master_cluster_summary_2022.csv'
MASTER_2025_CSV = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/master_cluster_summary.csv'
POINTS_CSV      = '/Users/ruben/Desktop/Thesis/2025Data/baguio/input/prediction_points.csv'
SHAP_CSV        = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/shap_values_all_clusters.csv'

OUT_TXT         = '/Users/ruben/Desktop/Thesis/Code/Datamaraws_Manuscript/tala_statistics.txt'
OUT_CSV_PROV    = '/Users/ruben/Desktop/Thesis/Code/Datamaraws_Manuscript/tala_statistics_province.csv'
OUT_CSV_GRID    = '/Users/ruben/Desktop/Thesis/Code/Datamaraws_Manuscript/tala_statistics_grid.csv'

# ── LOAD ───────────────────────────────────────────────────────────────────────
pts  = pd.read_csv(POINTS_CSV)
m22  = pd.read_csv(MASTER_2022_CSV).rename(columns={'ClusterID': 'PointID'})
m25  = pd.read_csv(MASTER_2025_CSV)
shap = pd.read_csv(SHAP_CSV).rename(columns={'ClusterID': 'PointID'})

# Merge province / metadata
m22      = m22.merge(pts[['PointID','Province','Municipality','Urban_Rural',
                           'PSA_Poverty_Rate']], on='PointID', how='left')
m25_dhs  = m25[m25['source']=='DHS'].copy().merge(
    pts[['PointID','Province','Municipality','Urban_Rural','PSA_Poverty_Rate']],
    on='PointID', how='left')
m25_grid = m25[m25['source']=='grid'].copy().merge(
    pts[['PointID','Province','Municipality','Urban_Rural','PSA_Poverty_Rate']],
    on='PointID', how='left')

# SHAP feature column groups
lstm_cols   = [c for c in shap.columns if c.startswith('LSTM_dim_')]
static_cols = [c for c in shap.columns
               if c not in lstm_cols + ['PointID', 'Predicted_Wealth']]

# Three-series matched dataset (inner join on PointID, drop any nulls)
both = m22[['PointID','Predicted_Wealth','Actual_Wealth','Province',
            'Urban_Rural','LSTM_Pct','Static_Pct','Top_Driver']].rename(
    columns={'Predicted_Wealth':'Pred_22','Actual_Wealth':'Actual',
             'LSTM_Pct':'LSTM_Pct_22','Static_Pct':'Static_Pct_22',
             'Top_Driver':'Top_Driver_22'}
).merge(
    m25_dhs[['PointID','Predicted_Wealth','LSTM_Pct','Static_Pct','Top_Driver']].rename(
        columns={'Predicted_Wealth':'Pred_25','LSTM_Pct':'LSTM_Pct_25',
                 'Static_Pct':'Static_Pct_25','Top_Driver':'Top_Driver_25'}),
    on='PointID', how='inner'
).dropna(subset=['Actual','Pred_22','Pred_25'])

actual  = both['Actual'].values
pred_22 = both['Pred_22'].values
pred_25 = both['Pred_25'].values
n       = len(both)

lines = []

def h(title):
    lines.append('\n' + '=' * 72)
    lines.append(title.upper())
    lines.append('=' * 72)

def s(label, value):
    lines.append(f'  {label:<48} {value}')

def accuracy_block(y_true, y_pred, label):
    lines.append(f'\n  [ {label} ]')
    mae  = mean_absolute_error(y_true, y_pred)
    mse  = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    r2p  = 1 - np.sum((y_true-y_pred)**2)/np.sum((y_true-np.mean(y_true))**2)
    r,  rp  = pearsonr(y_pred, y_true)
    rs, rsp = spearmanr(y_pred, y_true)
    kt, ktp = kendalltau(y_pred, y_true)
    bias = np.mean(y_pred - y_true)
    mape = np.mean(np.abs((y_pred-y_true)/(np.abs(y_true)+1e-8)))*100
    maxe = np.max(np.abs(y_pred-y_true))
    s('MAE',                                       f'{mae:.4f}')
    s('MSE',                                       f'{mse:.4f}')
    s('RMSE',                                      f'{rmse:.4f}')
    s('RMSE / WI range (normalised)',               f'{rmse/(np.max(y_true)-np.min(y_true))*100:.2f}%')
    s('Pooled R²',                                  f'{r2p:.4f}')
    s('Pearson r',                                  f'{r:.4f}  (p={rp:.2e})')
    s('Spearman ρ',                                 f'{rs:.4f}  (p={rsp:.2e})')
    s("Kendall's τ",                                f'{kt:.4f}  (p={ktp:.2e})')
    s('Bias (mean pred − actual)',                  f'{bias:+.4f}')
    s('MAPE',                                       f'{mape:.2f}%')
    s('Max absolute error',                         f'{maxe:.4f}')
    s('% within ±0.25 WI',                         f'{(np.abs(y_pred-y_true)<=0.25).mean()*100:.1f}%')
    s('% within ±0.50 WI',                         f'{(np.abs(y_pred-y_true)<=0.50).mean()*100:.1f}%')
    s('% within ±1.00 WI',                         f'{(np.abs(y_pred-y_true)<=1.00).mean()*100:.1f}%')


# ══════════════════════════════════════════════════════════════════════════════
# 1. SAMPLE SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
h('1. SAMPLE SUMMARY')
s('DHS matched clusters (all three series)',    f'{n}')
s('Urban DHS clusters',                        f'{(both["Urban_Rural"]=="U").sum()}')
s('Rural DHS clusters',                        f'{(both["Urban_Rural"]=="R").sum()}')
s('Provinces represented (DHS)',               f'{both["Province"].nunique()}')
s('Grid-generated clusters (2025 inference)',  f'{len(m25_grid)}')
s('Grid provinces',                            f'{m25_grid["Province"].nunique()}')
s('Grid municipalities',                       f'{m25_grid["Municipality"].nunique()}')
s('Total 2025 inference clusters',             f'{len(m25)}')


# ══════════════════════════════════════════════════════════════════════════════
# 2. DESCRIPTIVE STATISTICS — THREE SERIES (DHS clusters only)
# ══════════════════════════════════════════════════════════════════════════════
h('2. DESCRIPTIVE STATISTICS — THREE SERIES (DHS clusters, n=317)')
lines.append(f'\n  {"Statistic":<32} {"2022 Actual":>14} {"2022 Pred":>12} {"2025 Pred":>12}')
lines.append('  ' + '-' * 72)

def desc_row(label, fn):
    lines.append(f'  {label:<32} {fn(actual):>14.4f} {fn(pred_22):>12.4f} {fn(pred_25):>12.4f}')

desc_row('Count',             lambda x: len(x))
desc_row('Mean',              np.mean)
desc_row('Median',            np.median)
desc_row('Std deviation',     np.std)
desc_row('Variance',          np.var)
desc_row('Min',               np.min)
desc_row('Max',               np.max)
desc_row('Range',             lambda x: np.max(x)-np.min(x))
desc_row('Q25',               lambda x: np.percentile(x,25))
desc_row('Q75',               lambda x: np.percentile(x,75))
desc_row('IQR',               lambda x: np.percentile(x,75)-np.percentile(x,25))
desc_row('Skewness',          lambda x: pd.Series(x).skew())
desc_row('Kurtosis (excess)', lambda x: pd.Series(x).kurtosis())
desc_row('% below -0.50',     lambda x: (x<-0.5).mean()*100)
desc_row('% -0.50 to +0.50', lambda x: ((x>=-0.5)&(x<=0.5)).mean()*100)
desc_row('% above +0.50',     lambda x: (x>0.5).mean()*100)
desc_row('% negative',        lambda x: (x<0).mean()*100)


# ══════════════════════════════════════════════════════════════════════════════
# 3. NORMALITY TESTS
# ══════════════════════════════════════════════════════════════════════════════
h('3. NORMALITY TESTS — SHAPIRO-WILK')
lines.append(f'\n  {"Series":<25} {"W":>10} {"p-value":>14} {"Normal (α=0.05)?":>18}')
lines.append('  ' + '-' * 70)
for lbl, arr in [('2022 Actual', actual), ('2022 Predicted', pred_22),
                 ('2025 Predicted', pred_25),
                 ('Grid 2025 Pred', m25_grid['Predicted_Wealth'].values[:5000])]:
    w, p = shapiro(arr[:5000])
    lines.append(f'  {lbl:<25} {w:>10.4f} {p:>14.4e} {"Yes" if p>0.05 else "No":>18}')


# ══════════════════════════════════════════════════════════════════════════════
# 4 & 5. ACCURACY
# ══════════════════════════════════════════════════════════════════════════════
h('4. PREDICTION ACCURACY — 2022 IMAGERY vs 2022 GROUND TRUTH')
accuracy_block(actual, pred_22, '2022 Predicted vs 2022 Ground Truth')

h('5. PREDICTION ACCURACY — 2025 IMAGERY vs 2022 GROUND TRUTH')
accuracy_block(actual, pred_25, '2025 Predicted vs 2022 Ground Truth')


# ══════════════════════════════════════════════════════════════════════════════
# 6. TEMPORAL COMPARISON
# ══════════════════════════════════════════════════════════════════════════════
h('6. TEMPORAL COMPARISON — 2022 vs 2025 PREDICTED (DHS clusters)')
diff = pred_22 - pred_25
lines.append('')
s('Mean difference (2022−2025)',             f'{diff.mean():+.4f}')
s('Std of difference',                       f'{diff.std():.4f}')
s('Median difference',                       f'{np.median(diff):+.4f}')
s('Max positive (2022 > 2025)',              f'{diff.max():+.4f}')
s('Max negative (2022 < 2025)',              f'{diff.min():+.4f}')
s('% clusters where 2022 pred > 2025 pred', f'{(diff>0).mean()*100:.1f}%')
s('% clusters where 2022 pred < 2025 pred', f'{(diff<0).mean()*100:.1f}%')
lines.append('')
t_stat, t_p = ttest_rel(pred_22, pred_25)
w_stat, w_p = wilcoxon(pred_22, pred_25)
s('Paired t-test', f't={t_stat:.4f},  p={t_p:.4e}')
s('Wilcoxon signed-rank test', f'W={w_stat:.1f},  p={w_p:.4e}')
lines.append('')
ks22, p22 = ks_2samp(actual, pred_22)
ks25, p25 = ks_2samp(actual, pred_25)
s('KS: actual vs 2022 pred', f'D={ks22:.4f},  p={p22:.4e}')
s('KS: actual vs 2025 pred', f'D={ks25:.4f},  p={p25:.4e}')


# ══════════════════════════════════════════════════════════════════════════════
# 7. SIDE-BY-SIDE ACCURACY SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
h('7. SIDE-BY-SIDE ACCURACY SUMMARY')
lines.append(f'\n  {"Metric":<35} {"2022 Imagery":>14} {"2025 Imagery":>14} {"Δ (2022−2025)":>15}')
lines.append('  ' + '-' * 80)

metrics = [
    ('MAE',              lambda a,p: mean_absolute_error(a,p)),
    ('MSE',              lambda a,p: mean_squared_error(a,p)),
    ('RMSE',             lambda a,p: np.sqrt(mean_squared_error(a,p))),
    ('Pooled R²',        lambda a,p: 1-np.sum((a-p)**2)/np.sum((a-np.mean(a))**2)),
    ('Pearson r',        lambda a,p: pearsonr(p,a)[0]),
    ('Spearman ρ',       lambda a,p: spearmanr(p,a)[0]),
    ("Kendall's τ",      lambda a,p: kendalltau(p,a)[0]),
    ('Bias',             lambda a,p: np.mean(p-a)),
    ('Max Abs Error',    lambda a,p: np.max(np.abs(p-a))),
    ('% within ±0.25',  lambda a,p: (np.abs(p-a)<=0.25).mean()*100),
    ('% within ±0.50',  lambda a,p: (np.abs(p-a)<=0.50).mean()*100),
    ('% within ±1.00',  lambda a,p: (np.abs(p-a)<=1.00).mean()*100),
]
for lbl, fn in metrics:
    v22 = fn(actual, pred_22)
    v25 = fn(actual, pred_25)
    d   = v22 - v25
    lines.append(f'  {lbl:<35} {v22:>14.4f} {v25:>14.4f} {d:>+15.4f}')


# ══════════════════════════════════════════════════════════════════════════════
# 8. SHAP BRANCH ATTRIBUTION
# ══════════════════════════════════════════════════════════════════════════════
h('8. SHAP BRANCH ATTRIBUTION — 2022 vs 2025 INFERENCE (DHS clusters)')
lines.append(f'\n  {"Metric":<42} {"2022 Imagery":>14} {"2025 Imagery":>14}')
lines.append('  ' + '-' * 72)
lines.append(f'  {"Mean LSTM%  (per cluster)":<42} '
             f'{both["LSTM_Pct_22"].mean():>14.2f} '
             f'{both["LSTM_Pct_25"].mean():>14.2f}')
lines.append(f'  {"Mean Static% (per cluster)":<42} '
             f'{both["Static_Pct_22"].mean():>14.2f} '
             f'{both["Static_Pct_25"].mean():>14.2f}')
lines.append('')
for run, col in [('2022', 'Top_Driver_22'), ('2025', 'Top_Driver_25')]:
    lines.append(f'  Top 5 modal drivers — {run} inference:')
    for feat, cnt in both[col].value_counts().head(5).items():
        lines.append(f'    {feat:<44} {cnt:>4}  ({cnt/n*100:.1f}%)')
    lines.append('')


# ══════════════════════════════════════════════════════════════════════════════
# 9. ERROR DISTRIBUTION
# ══════════════════════════════════════════════════════════════════════════════
h('9. ERROR DISTRIBUTION AND QUARTILE ANALYSIS')
for lbl, y_pred in [('2022 Predicted', pred_22), ('2025 Predicted', pred_25)]:
    err = y_pred - actual
    lines.append(f'\n  [ Residuals: {lbl} − Ground Truth ]')
    s('  Mean residual (bias)',   f'{err.mean():+.4f}')
    s('  Std of residuals',       f'{err.std():.4f}')
    s('  Median residual',        f'{np.median(err):+.4f}')
    s('  Min / Max residual',     f'{err.min():+.4f}  /  {err.max():+.4f}')
    s('  % over-predictions',     f'{(err>0).mean()*100:.1f}%')
    s('  % under-predictions',    f'{(err<0).mean()*100:.1f}%')
    lines.append(f'\n  {"Quartile":<20} {"WI range":>18} {"MAE":>8} {"Bias":>9} {"n":>5}')
    qs = np.percentile(actual, [0,25,50,75,100])
    labels = ['lowest (Q1)','low (Q2)','high (Q3)','highest (Q4)']
    for i in range(4):
        mask = ((actual>=qs[i])&(actual<qs[i+1])) if i<3 else \
               ((actual>=qs[i])&(actual<=qs[i+1]))
        if mask.sum()==0: continue
        q_mae  = np.abs((y_pred-actual)[mask]).mean()
        q_bias = (y_pred-actual)[mask].mean()
        lines.append(f'  {labels[i]:<20} [{qs[i]:+.2f}, {qs[i+1]:+.2f}]'
                     f'  {q_mae:>8.4f}  {q_bias:>+9.4f}  {mask.sum():>5}')


# ══════════════════════════════════════════════════════════════════════════════
# 10. URBAN vs RURAL BREAKDOWN
# ══════════════════════════════════════════════════════════════════════════════
h('10. URBAN vs RURAL BREAKDOWN (DHS clusters)')
lines.append(f'\n  {"Metric":<32} {"Urban_22":>10} {"Rural_22":>10} {"Urban_25":>10} {"Rural_25":>10}')
lines.append('  ' + '-' * 74)
for lbl, fn in [
    ('n',          lambda a,p: len(a)),
    ('Mean actual WI', lambda a,p: a.mean()),
    ('MAE',        lambda a,p: mean_absolute_error(a,p)),
    ('RMSE',       lambda a,p: np.sqrt(mean_squared_error(a,p))),
    ('Pearson r',  lambda a,p: pearsonr(p,a)[0] if len(a)>=3 else np.nan),
    ('Bias',       lambda a,p: np.mean(p-a)),
]:
    u = both['Urban_Rural']=='U'
    r = both['Urban_Rural']=='R'
    row_vals = []
    for mask in [u, r]:
        for pred in [pred_22, pred_25]:
            sub_a = actual[mask]; sub_p = pred[mask]
            row_vals.append(fn(sub_a, sub_p) if len(sub_a)>=2 else np.nan)
    lines.append(f'  {lbl:<32} {row_vals[0]:>10.4f} {row_vals[1]:>10.4f}'
                 f' {row_vals[2]:>10.4f} {row_vals[3]:>10.4f}')


# ══════════════════════════════════════════════════════════════════════════════
# 11. PROVINCE-LEVEL ACCURACY BREAKDOWN
# ══════════════════════════════════════════════════════════════════════════════
h('11. PROVINCE-LEVEL ACCURACY BREAKDOWN (DHS clusters)')
lines.append(f'\n  {"Province":<24} {"n":>4}'
             f'  {"Act.Mean":>9} {"P22.Mean":>9} {"P25.Mean":>9}'
             f'  {"MAE_22":>7} {"MAE_25":>7}'
             f'  {"r_22":>6} {"r_25":>6}'
             f'  {"Bias_22":>8} {"Bias_25":>8}')
lines.append('  ' + '-' * 108)

prov_rows = []
for prov in sorted(both['Province'].dropna().unique()):
    mask  = both['Province']==prov
    a_p   = actual[mask]; p22_p = pred_22[mask]; p25_p = pred_25[mask]
    nn    = mask.sum()
    if nn < 2: continue
    mae22 = mean_absolute_error(a_p,p22_p)
    mae25 = mean_absolute_error(a_p,p25_p)
    r22   = pearsonr(p22_p,a_p)[0] if nn>=3 else np.nan
    r25   = pearsonr(p25_p,a_p)[0] if nn>=3 else np.nan
    b22   = np.mean(p22_p-a_p); b25 = np.mean(p25_p-a_p)
    lines.append(
        f'  {prov:<24} {nn:>4}'
        f'  {a_p.mean():>9.3f} {p22_p.mean():>9.3f} {p25_p.mean():>9.3f}'
        f'  {mae22:>7.3f} {mae25:>7.3f}'
        f'  {r22:>6.3f} {r25:>6.3f}'
        f'  {b22:>+8.3f} {b25:>+8.3f}'
    )
    prov_rows.append({
        'Province'       : prov, 'n': nn,
        'Actual_Mean'    : round(a_p.mean(),4),
        'Pred22_Mean'    : round(p22_p.mean(),4),
        'Pred25_Mean'    : round(p25_p.mean(),4),
        'Actual_Std'     : round(a_p.std(),4),
        'Pred22_Std'     : round(p22_p.std(),4),
        'Pred25_Std'     : round(p25_p.std(),4),
        'MAE_2022'       : round(mae22,4),
        'MAE_2025'       : round(mae25,4),
        'RMSE_2022'      : round(np.sqrt(mean_squared_error(a_p,p22_p)),4),
        'RMSE_2025'      : round(np.sqrt(mean_squared_error(a_p,p25_p)),4),
        'r_2022'         : round(r22,4),
        'r_2025'         : round(r25,4),
        'Bias_2022'      : round(b22,4),
        'Bias_2025'      : round(b25,4),
        'Lower_MAE'      : '2022' if mae22<mae25 else '2025',
        'MAE_delta'      : round(mae25-mae22,4),
    })


# ══════════════════════════════════════════════════════════════════════════════
# 12. GRID — DESCRIPTIVE STATISTICS
# ══════════════════════════════════════════════════════════════════════════════
h('12. GRID-GENERATED POINTS — DESCRIPTIVE STATISTICS (2025 inference)')
g_wi = m25_grid['Predicted_Wealth'].values
d_wi = m25_dhs['Predicted_Wealth'].values

lines.append(f'\n  {"Statistic":<32} {"Grid (n=1653)":>16} {"DHS pred (n=317)":>18}')
lines.append('  ' + '-' * 68)
for lbl, fn in [
    ('Count',              lambda x: len(x)),
    ('Mean',               np.mean),
    ('Median',             np.median),
    ('Std deviation',      np.std),
    ('Variance',           np.var),
    ('Min',                np.min),
    ('Max',                np.max),
    ('Range',              lambda x: np.max(x)-np.min(x)),
    ('Q25',                lambda x: np.percentile(x,25)),
    ('Q75',                lambda x: np.percentile(x,75)),
    ('IQR',                lambda x: np.percentile(x,75)-np.percentile(x,25)),
    ('Skewness',           lambda x: pd.Series(x).skew()),
    ('Kurtosis (excess)',  lambda x: pd.Series(x).kurtosis()),
    ('% below -0.50',      lambda x: (x<-0.5).mean()*100),
    ('% -0.50 to +0.50',  lambda x: ((x>=-0.5)&(x<=0.5)).mean()*100),
    ('% above +0.50',      lambda x: (x>0.5).mean()*100),
    ('% negative',         lambda x: (x<0).mean()*100),
]:
    lines.append(f'  {lbl:<32} {fn(g_wi):>16.4f} {fn(d_wi):>18.4f}')


# ══════════════════════════════════════════════════════════════════════════════
# 13. GRID — SPATIAL COVERAGE
# ══════════════════════════════════════════════════════════════════════════════
h('13. GRID — SPATIAL COVERAGE PER PROVINCE')
lines.append(f'\n  {"Province":<24} {"Grid pts":>9} {"DHS pts":>9} {"Municipalities":>15} {"Pct of total":>13}')
lines.append('  ' + '-' * 72)
grid_prov_ct = m25_grid.groupby('Province').size()
dhs_prov_ct  = m25_dhs.groupby('Province').size()
mun_ct       = m25_grid.groupby('Province')['Municipality'].nunique()
for prov in sorted(m25_grid['Province'].dropna().unique()):
    g_n = grid_prov_ct.get(prov, 0)
    d_n = dhs_prov_ct.get(prov, 0)
    mn  = mun_ct.get(prov, 0)
    pct = g_n / len(m25_grid) * 100
    lines.append(f'  {prov:<24} {g_n:>9} {d_n:>9} {mn:>15} {pct:>12.1f}%')
lines.append(f'\n  {"TOTAL":<24} {len(m25_grid):>9} {len(m25_dhs):>9}'
             f' {m25_grid["Municipality"].nunique():>15}')


# ══════════════════════════════════════════════════════════════════════════════
# 14. GRID — WEALTH DISTRIBUTION AND CLASS BREAKDOWN
# ══════════════════════════════════════════════════════════════════════════════
h('14. GRID — WEALTH DISTRIBUTION AND CLASS BREAKDOWN')
lines.append('')
s('Total grid clusters',                f'{len(g_wi)}')
s('Mean predicted WI',                  f'{g_wi.mean():.4f}')
s('Median predicted WI',                f'{np.median(g_wi):.4f}')
s('Std predicted WI',                   f'{g_wi.std():.4f}')
s('Global maximum (cluster, province)', f'{g_wi.max():.4f}')
s('Global minimum (cluster)',           f'{g_wi.min():.4f}')
lines.append('')

# Wealth class breakdown
for lbl, mask in [
    ('Low wealth (WI < -0.50)',      g_wi < -0.50),
    ('Mid wealth (-0.50 to +0.50)', (g_wi>=-0.50)&(g_wi<=0.50)),
    ('High wealth (WI > +0.50)',     g_wi > 0.50),
]:
    s(f'  {lbl}', f'{mask.sum():>5}  ({mask.mean()*100:.1f}%)')
lines.append('')

# Province with highest / lowest mean
grid_mean_prov = m25_grid.groupby('Province')['Predicted_Wealth'].mean()
s('Wealthiest province (mean grid WI)',f'{grid_mean_prov.idxmax()}  ({grid_mean_prov.max():.4f})')
s('Poorest province (mean grid WI)',   f'{grid_mean_prov.idxmin()}  ({grid_mean_prov.min():.4f})')
s('Province with widest WI range',
  m25_grid.groupby('Province').apply(
      lambda g: g['Predicted_Wealth'].max()-g['Predicted_Wealth'].min()
  ).idxmax())

# Distribution shift: all 1970 vs grid-only vs DHS-only
u_mw, p_mw = mannwhitneyu(g_wi, d_wi, alternative='two-sided')
ks_d,  ks_p = ks_2samp(g_wi, d_wi)
lines.append('')
s('Mann-Whitney U (grid vs DHS pred)', f'U={u_mw:.1f},  p={p_mw:.4e}')
s('KS test (grid vs DHS pred)',        f'D={ks_d:.4f},  p={ks_p:.4e}')
s('Interpretation',
  'Significant → grid and DHS WI distributions differ systematically')


# ══════════════════════════════════════════════════════════════════════════════
# 15. GRID — PSA POVERTY RATE CORRELATION
# ══════════════════════════════════════════════════════════════════════════════
h('15. GRID — PREDICTED WI vs PSA 2023 POVERTY RATE CORRELATION')
corr_df = m25_grid.dropna(subset=['Predicted_Wealth','PSA_Poverty_Rate'])
pov     = corr_df['PSA_Poverty_Rate'].values
wi      = corr_df['Predicted_Wealth'].values
r_pov,  p_pov  = pearsonr(wi, pov)
rs_pov, ps_pov = spearmanr(wi, pov)
lines.append('')
s('n clusters with PSA poverty rate',  f'{len(corr_df)}')
s('Pearson r (WI vs poverty rate)',     f'{r_pov:.4f}  (p={p_pov:.2e})')
s('Spearman ρ (WI vs poverty rate)',    f'{rs_pov:.4f}  (p={ps_pov:.2e})')
s('Direction',
  'Negative → higher predicted WI associated with lower poverty rate')
lines.append('')

# Province-level poverty correlation (1 point per province)
pov_prov = m25_grid.groupby('Province').agg(
    mean_wi=('Predicted_Wealth','mean'),
    pov_rate=('PSA_Poverty_Rate','first')
).dropna()
r_pp, p_pp = pearsonr(pov_prov['mean_wi'], pov_prov['pov_rate'])
rs_pp, ps_pp = spearmanr(pov_prov['mean_wi'], pov_prov['pov_rate'])
s('Province-level Pearson r (mean WI vs poverty)', f'{r_pp:.4f}  (p={p_pp:.4f})')
s('Province-level Spearman ρ',                      f'{rs_pp:.4f}  (p={ps_pp:.4f})')
s('n provinces',                                    f'{len(pov_prov)}')


# ══════════════════════════════════════════════════════════════════════════════
# 16. GRID — SHAP AND TOP DRIVER ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
h('16. GRID — SHAP BRANCH ATTRIBUTION AND TOP DRIVERS')

grid_shap = shap[shap['PointID'].isin(m25_grid['PointID'])].copy()
dhs_shap  = shap[shap['PointID'].isin(m25_dhs['PointID'])].copy()

def branch_pct(df_s):
    lstm_sum   = df_s[lstm_cols].abs().sum(axis=1)
    static_sum = df_s[static_cols].abs().sum(axis=1)
    total      = lstm_sum + static_sum
    return (lstm_sum/total*100).mean(), (static_sum/total*100).mean()

gl, gs = branch_pct(grid_shap)
dl, ds = branch_pct(dhs_shap)

lines.append(f'\n  {"Metric":<42} {"Grid":>10} {"DHS":>10}')
lines.append('  ' + '-' * 64)
lines.append(f'  {"Mean LSTM%  (per cluster)":<42} {gl:>10.2f} {dl:>10.2f}')
lines.append(f'  {"Mean Static% (per cluster)":<42} {gs:>10.2f} {ds:>10.2f}')
lines.append('')

grid_drivers = m25_grid['Top_Driver'].value_counts()
lines.append('  Top 10 modal drivers — Grid clusters:')
for feat, cnt in grid_drivers.head(10).items():
    pct = cnt/len(m25_grid)*100
    lines.append(f'    {feat:<44} {cnt:>5}  ({pct:.1f}%)')

# LSTM% per province for grid
grid_shap2 = grid_shap.merge(m25_grid[['PointID','Province']], on='PointID', how='left')
grid_shap2['lstm_pct'] = (
    grid_shap2[lstm_cols].abs().sum(axis=1) /
    (grid_shap2[lstm_cols].abs().sum(axis=1) +
     grid_shap2[static_cols].abs().sum(axis=1)) * 100
)
prov_lstm_g = grid_shap2.groupby('Province')['lstm_pct'].mean().sort_values(ascending=False)
lines.append('\n  Grid LSTM% by province (most temporal → least temporal):')
lines.append(f'  {"Province":<25} {"LSTM%":>8} {"Static%":>10}')
lines.append('  ' + '-' * 45)
for prov, val in prov_lstm_g.items():
    lines.append(f'  {prov:<25} {val:>8.1f} {100-val:>10.1f}')


# ══════════════════════════════════════════════════════════════════════════════
# 17. GRID — PROVINCE-LEVEL SUMMARY TABLE
# ══════════════════════════════════════════════════════════════════════════════
h('17. GRID — PROVINCE-LEVEL SUMMARY TABLE')
lines.append(f'\n  {"Province":<24} {"n":>5} {"Mean WI":>9} {"Median":>8}'
             f' {"Std":>7} {"Min":>8} {"Max":>8} {"Range":>7}'
             f' {"Pov%":>6} {"LSTM%":>7}')
lines.append('  ' + '-' * 100)

grid_rows = []
for prov in sorted(m25_grid['Province'].dropna().unique()):
    sub = m25_grid[m25_grid['Province']==prov]['Predicted_Wealth']
    nn  = len(sub)
    pov = m25_grid[m25_grid['Province']==prov]['PSA_Poverty_Rate'].dropna()
    pov_r = pov.iloc[0] if len(pov)>0 else np.nan
    lstm_p = prov_lstm_g.get(prov, np.nan)
    lines.append(
        f'  {prov:<24} {nn:>5} {sub.mean():>9.4f} {sub.median():>8.4f}'
        f' {sub.std():>7.4f} {sub.min():>8.4f} {sub.max():>8.4f}'
        f' {sub.max()-sub.min():>7.4f} {pov_r:>6.1f} {lstm_p:>7.1f}'
    )
    grid_rows.append({
        'Province'   : prov, 'n': nn,
        'Mean_WI'    : round(sub.mean(),4),
        'Median_WI'  : round(sub.median(),4),
        'Std_WI'     : round(sub.std(),4),
        'Min_WI'     : round(sub.min(),4),
        'Max_WI'     : round(sub.max(),4),
        'Range_WI'   : round(sub.max()-sub.min(),4),
        'PSA_Pov_Pct': round(pov_r,1) if not np.isnan(pov_r) else np.nan,
        'LSTM_Pct'   : round(lstm_p,1) if not np.isnan(lstm_p) else np.nan,
    })


# ══════════════════════════════════════════════════════════════════════════════
# 18. GRID vs DHS PREDICTED WI COMPARISON
# ══════════════════════════════════════════════════════════════════════════════
h('18. GRID vs DHS PREDICTED WI — PROVINCE-LEVEL COMPARISON')
grid_prov_mean = m25_grid.groupby('Province')['Predicted_Wealth'].mean()
dhs_prov_mean  = m25_dhs.groupby('Province')['Predicted_Wealth'].mean()

lines.append(f'\n  {"Province":<24} {"Grid Mean":>10} {"DHS Mean":>10}'
             f' {"Diff (G-D)":>12} {"Grid higher?":>13}')
lines.append('  ' + '-' * 72)
for prov in sorted(set(grid_prov_mean.index) & set(dhs_prov_mean.index)):
    gm = grid_prov_mean[prov]; dm = dhs_prov_mean[prov]
    diff = gm - dm
    lines.append(f'  {prov:<24} {gm:>10.4f} {dm:>10.4f}'
                 f' {diff:>+12.4f} {"Yes" if diff>0 else "No":>13}')

# Overall
lines.append('')
s('Overall mean — Grid predicted WI',     f'{g_wi.mean():.4f}')
s('Overall mean — DHS predicted WI',      f'{d_wi.mean():.4f}')
s('Difference (grid − DHS predicted)',    f'{g_wi.mean()-d_wi.mean():+.4f}')
s('DHS predicted WI is higher because',
  'DHS clusters concentrated in urban / wealthier areas (NCR, peri-urban)')


# ══════════════════════════════════════════════════════════════════════════════
# 19. KEY FINDINGS SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
h('19. KEY FINDINGS SUMMARY')
r22_all   = pearsonr(pred_22, actual)[0]
r25_all   = pearsonr(pred_25, actual)[0]
rs22_all  = spearmanr(pred_22, actual)[0]
rs25_all  = spearmanr(pred_25, actual)[0]
mae22_all = mean_absolute_error(actual, pred_22)
mae25_all = mean_absolute_error(actual, pred_25)
r2p22 = 1 - np.sum((actual-pred_22)**2)/np.sum((actual-np.mean(actual))**2)
r2p25 = 1 - np.sum((actual-pred_25)**2)/np.sum((actual-np.mean(actual))**2)
prov_df    = pd.DataFrame(prov_rows)
n_improved = (prov_df['Lower_MAE']=='2022').sum()

lines.append('')
s('─── DHS OUT-OF-SAMPLE ACCURACY ─────────────────', '')
s('2022 imagery Pearson r',            f'{r22_all:.4f}')
s('2025 imagery Pearson r',            f'{r25_all:.4f}')
s('2022 imagery Spearman ρ',           f'{rs22_all:.4f}')
s('2025 imagery Spearman ρ',           f'{rs25_all:.4f}')
s('ρ improvement under 2022 imagery',  f'{rs22_all-rs25_all:+.4f}')
s('r improvement under 2022 imagery',  f'{r22_all-r25_all:+.4f}')
s('2022 imagery MAE',                  f'{mae22_all:.4f}')
s('2025 imagery MAE',                  f'{mae25_all:.4f}')
s('MAE change under 2022 imagery',     f'{mae22_all-mae25_all:+.4f}')
s('Pooled R² — 2022 imagery',          f'{r2p22:.4f}')
s('Pooled R² — 2025 imagery',          f'{r2p25:.4f}')
s('Provinces where 2022 MAE < 2025',   f'{n_improved} / {len(prov_df)}')
lines.append('')
s('─── SHAP ────────────────────────────────────────', '')
s('Grid LSTM% (2025 inference)',        f'{gl:.2f}%')
s('DHS LSTM% (2025 inference)',         f'{dl:.2f}%')
s('Grid LSTM% (2022 inference)',        f'{both["LSTM_Pct_22"].mean():.2f}%')
s('DHS LSTM% (2022 inference)',         f'{both["LSTM_Pct_22"].mean():.2f}%')
lines.append('')
s('─── GRID INFERENCE ─────────────────────────────', '')
s('Total grid clusters',               f'{len(m25_grid)}')
s('Grid mean predicted WI',            f'{g_wi.mean():.4f}')
s('Grid WI vs PSA poverty r',          f'{r_pov:.4f}  (p={p_pov:.2e})')
s('Grid WI vs PSA poverty ρ',          f'{rs_pov:.4f}  (p={ps_pov:.2e})')
s('Province-level PSA correlation r',  f'{r_pp:.4f}')
s('% grid clusters below -0.50',       f'{(g_wi<-0.5).mean()*100:.1f}%')
s('% grid clusters above +0.50',       f'{(g_wi>0.5).mean()*100:.1f}%')


# ── WRITE OUTPUTS ──────────────────────────────────────────────────────────────
report = '\n'.join(lines)
print(report)

os.makedirs(os.path.dirname(OUT_TXT), exist_ok=True)
with open(OUT_TXT, 'w') as f:
    f.write('TALA COMPREHENSIVE STATISTICS REPORT\n')
    f.write('=' * 72 + '\n')
    f.write(report)
print(f'\n→ Report saved : {OUT_TXT}')

pd.DataFrame(prov_rows).to_csv(OUT_CSV_PROV, index=False)
print(f'→ Province CSV : {OUT_CSV_PROV}')

pd.DataFrame(grid_rows).to_csv(OUT_CSV_GRID, index=False)
print(f'→ Grid CSV     : {OUT_CSV_GRID}')
