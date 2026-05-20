"""
generate_figures.py  —  Project TALA manuscript figures
========================================================
Fixes applied vs previous version:
  - Font: default matplotlib sans-serif throughout (no Times New Roman)
  - fig4_4: removed log1p from SHAP values (can be negative -> nan); legend outside plot
  - fig4_5: log x-scale so static features are visible next to Temporal bar
  - fig4_6: province labels rotated 45; Satellite color changed to blue (was too similar to Road gray)
  - figB1:  value annotations removed from radar axes (were overlapping labels); legend repositioned
  - figB4:  fixed x=shap y=shap self-correlation bug -> now plots SHAP value vs Predicted WI;
            colorbar given explicit space via subplots_adjust
"""

import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as ticker
from matplotlib.lines import Line2D
from scipy.stats import pearsonr
from scipy.ndimage import gaussian_filter1d

# ── Paths ─────────────────────────────────────────────────────────────────────
POINTS_CSV = '/Users/ruben/Desktop/Thesis/2025Data/baguio/input/prediction_points.csv'
SHAP_CSV   = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/shap_values_all_clusters.csv'
MASTER_CSV = '/Users/ruben/Desktop/Thesis/2025Data/baguio/shap_outputs_expanded/master_cluster_summary.csv'  # set to full path of master_cluster_summary.csv if available
#             e.g. '/Users/ruben/Desktop/Thesis/2025Data/shap_outputs_expanded/master_cluster_summary.csv'   # set to master_cluster_summary.csv path when available
MASTER_2022_CSV = '/Users/ruben/Desktop/Thesis/2022Validation/shap_outputs/master_cluster_summary_2022.csv'
SHP_PROV = '/Users/ruben/Desktop/Thesis/2025Data/PH_Adm2_ProvDists.shp'

OUT_DIR = '/Users/ruben/Desktop/Thesis/Code/Datamaraws_Manuscript/plots-new'
os.makedirs(OUT_DIR, exist_ok=True)

# ── Palette ───────────────────────────────────────────────────────────────────
NAVY   = '#1a3c5c'
OCEAN  = '#326189'
TEAL   = '#5ce1e6'
MIST   = '#88bcbd'
AMBER  = '#f59e0b'
VIOLET = '#a78bfa'
SLATE  = '#94a3b8'
SKY    = '#60a5fa'
CORAL  = '#f87171'
GREEN  = '#22c55e'
CREAM  = '#eaf1f5'
RULE   = '#d4dfe6'
BLUE   = '#3498db'   # Satellite color — distinct from SLATE Road gray

CAT_COLORS = {
    'Temporal' : TEAL,
    'Landuse'  : AMBER,
    'POI'      : VIOLET,
    'Building' : SKY,
    'Road'     : SLATE,
    'Satellite': BLUE,
    'Other'    : '#b0b8c1',
}

CAT_MAP = {
    'VIIRS_Median'           : 'Satellite',
    'Total_Road_Length'      : 'Road',
    'Main_Roads_Length'      : 'Road',
    'Secondary_Roads_Length' : 'Road',
    'Local_Roads_Length'     : 'Road',
    'Tracks_Length'          : 'Road',
    'Total_Bldg_Count'       : 'Building',
    'Bldg_residential_Count' : 'Building',
    'Bldg_commercial_Count'  : 'Building',
    'Bldg_industrial_Count'  : 'Building',
    'Bldg_school_Count'      : 'Building',
    'Bldg_hospital_Count'    : 'Building',
    'Total_Bldg_Area'        : 'Building',
    'Total_POI_Count'        : 'POI',
    'POI_bank_Count'         : 'POI',
    'POI_hotel_Count'        : 'POI',
    'POI_fast_food_Count'    : 'POI',
    'POI_convenience_Count'  : 'POI',
    'POI_school_Count'       : 'POI',
    'POI_hospital_Count'     : 'POI',
}

PROV_ORDER = [
    'Zamboanga del Norte', 'Basilan', 'Tawi-Tawi',
    'Maguindanao del Sur', 'Davao Oriental',
    'Occidental Mindoro', 'Oriental Mindoro',
    'Kalinga', 'Bulacan', 'Ilocos Norte',
    'Aklan', 'Zambales', 'NCR',
    'Pampanga', 'Benguet', 'Bataan',
]

PROVINCE_COLORS = {
    'Zamboanga del Norte': '#922B21',
    'Basilan'            : '#F1948A',
    'Tawi-Tawi'          : '#C0550D',
    'Maguindanao del Sur': '#F9C74F',
    'Davao Oriental'     : '#9A7D0A',
    'Occidental Mindoro' : '#5D8A3C',   # dark olive-green
    'Oriental Mindoro'   : '#A8D5A2',   # light sage
    'Kalinga'            : '#4ECDC4',
    'Bulacan'            : '#1B6B35',
    'Ilocos Norte'       : '#0D6E6E',
    'Aklan'              : '#7ECC7E',
    'Zambales'           : '#74B9FF',
    'NCR'                : '#00D2FF',
    'Pampanga'           : '#1A5276',
    'Benguet'            : '#A29BFE',
    'Bataan'             : '#DCDDE1',
}

# ── Style: default sans-serif, no Times New Roman ────────────────────────────
plt.rcParams.update({
    'font.family'       : 'sans-serif',
    'font.size'         : 11,
    'axes.labelsize'    : 11,
    'axes.titlesize'    : 12,
    'axes.titleweight'  : 'bold',
    'axes.spines.top'   : False,
    'axes.spines.right' : False,
    'axes.linewidth'    : 0.8,
    'axes.edgecolor'    : '#555555',
    'xtick.labelsize'   : 9,
    'ytick.labelsize'   : 9,
    'legend.fontsize'   : 9,
    'legend.frameon'    : False,
    'figure.dpi'        : 150,
    'savefig.dpi'       : 300,
    'savefig.bbox'      : 'tight',
    'savefig.facecolor' : 'white',
    'grid.alpha'        : 0.35,
    'grid.linewidth'    : 0.5,
    'grid.color'        : RULE,
})

# ── Load data ─────────────────────────────────────────────────────────────────
print('Loading data...')
df_pts  = pd.read_csv(POINTS_CSV)
df_shap = pd.read_csv(SHAP_CSV)
df_shap = df_shap.rename(columns={'ClusterID': 'PointID'})
df = df_shap.merge(
    df_pts[['PointID', 'Province', 'Municipality', 'Urban_Rural', 'source']],
    on='PointID', how='left'
)
lstm_cols   = [c for c in df.columns if c.startswith('LSTM_dim_')]
static_cols = [c for c in df.columns
               if c not in ['PointID', 'Predicted_Wealth', 'Province',
                             'Municipality', 'Urban_Rural', 'source']
               and not c.startswith('LSTM_dim_')]

df_master = None
if MASTER_CSV and os.path.exists(MASTER_CSV):
    df_master = pd.read_csv(MASTER_CSV)
    df_master.columns = [c.strip() for c in df_master.columns]
    if 'Actual_Wealth' in df_master.columns:
        df_master = df_master.rename(columns={'Actual_Wealth': 'DHS_WI'})
    df_master = df_master.merge(
        df_pts[['PointID', 'Province', 'Municipality']],
        on='PointID', how='left'
    )
    print(f'  Master CSV loaded: {len(df_master)} rows, '
          f'{df_master["DHS_WI"].notna().sum()} with actual WI')
else:
    print('  MASTER_CSV not set — figs 4.2, 4.10, A.3, B.2 skipped.')

df_master_2022 = None
if MASTER_2022_CSV and os.path.exists(MASTER_2022_CSV):
    df_master_2022 = pd.read_csv(MASTER_2022_CSV)
    df_master_2022 = df_master_2022.rename(
        columns={'ClusterID': 'PointID', 'Actual_Wealth': 'DHS_WI',
                    'Predicted_Wealth': 'Pred_WI_2022'}
    )
    df_master_2022 = df_master_2022.merge(
        df_pts[['PointID', 'Province']], on='PointID', how='left'
    )
    print(f'  Master 2022 loaded: {len(df_master_2022)} rows')

print(f'  Dataset: {len(df)} rows across {df["Province"].nunique()} provinces')

def figure_4_2():
    if df_master is None:
        # Fall back: predicted WI distribution scatter (density)
        fig, ax = plt.subplots(figsize=(6.5, 5.5))
        for prov in PROV_ORDER:
            sub = df[df['Province'] == prov]
            if len(sub) == 0: continue
            ax.scatter(sub.index, sub['Predicted_Wealth'],
                       color=PROVINCE_COLORS.get(prov, OCEAN),
                       alpha=0.6, s=18, label=prov, zorder=3)
        ax.set_xlabel('Point Index')
        ax.set_ylabel('Predicted Wealth Index')
        ax.set_title('Figure 4.2  Predicted Wealth Index by Province\n'
                     '(Run with master_cluster_summary.csv for DHS validation scatter)',
                     fontsize=11)
        ax.axhline(0, color='#888', linewidth=0.8, linestyle='--')
        ax.legend(loc='upper left', ncol=2, fontsize=8)
        fig.savefig(f'{OUT_DIR}/fig4_2_predicted_scatter.png')
        plt.close()
        print('  Fig 4.2 saved (fallback version — no DHS WI available)')
        return

    # Full validation scatter using DHS actual WI
    dhs_pts = df_master[df_master['DHS_WI'].notna()].copy()
    dhs_pts = dhs_pts.merge(df[['PointID']], on='PointID', how='inner')

    obs  = dhs_pts['DHS_WI'].values
    pred = dhs_pts['Predicted_Wealth'].values
    r, _     = pearsonr(obs, pred)
    r2_pool  = 1 - np.sum((obs - pred)**2) / np.sum((obs - np.mean(obs))**2)

    fig, ax = plt.subplots(figsize=(6.5, 5.5))

    for prov in PROV_ORDER:
        sub = dhs_pts[dhs_pts['Province'] == prov]
        if len(sub) == 0: continue
        ax.scatter(sub['DHS_WI'], sub['Predicted_Wealth'],
                   color=PROVINCE_COLORS.get(prov, OCEAN),
                   alpha=0.72, s=28, edgecolors='white',
                   linewidths=0.3, label=prov, zorder=4)

    # Identity line
    mn = min(obs.min(), pred.min()) - 0.1
    mx = max(obs.max(), pred.max()) + 0.1
    ax.plot([mn, mx], [mn, mx], '--', color='#888', linewidth=1.1,
            label='Perfect prediction', zorder=2)

    # OLS fit line
    m, b = np.polyfit(obs, pred, 1)
    xs = np.linspace(mn, mx, 200)
    ax.plot(xs, m*xs + b, '-', color=NAVY, linewidth=1.5,
            label=f'OLS fit (slope={m:.2f})', zorder=3)

    ax.set_xlabel('Observed DHS Wealth Index (Actual Survey WI)', fontsize=11)
    ax.set_ylabel('Predicted Wealth Index (CNN-LSTM)', fontsize=11)
    ax.set_title('Predicted vs Observed Wealth Index\n',
                 fontsize=11)

    stats_txt = (f'Pearson r = {r:.4f}\n'
                 f'n = {len(obs)} DHS clusters')
    ax.text(0.04, 0.96, stats_txt, transform=ax.transAxes,
            fontsize=9, va='top', ha='left',
            bbox=dict(boxstyle='round,pad=0.4', facecolor=CREAM, edgecolor=RULE, alpha=0.9))

    leg = ax.legend(loc='lower center', bbox_to_anchor=(0.5, -0.35), fontsize=8, ncol=4, frameon=True, edgecolor=RULE, facecolor='white',
                    handletextpad=0.4, columnspacing=0.8)
    ax.set_xlim(mn, mx); ax.set_ylim(mn, mx)
    ax.grid(True, linestyle='--', alpha=0.3)

    fig.savefig(f'{OUT_DIR}/fig4_2_predicted_vs_observed.png')
    plt.close()
    print('  Fig 4.2 saved')


# ══════════════════════════════════════════════════════════════════════════════
def figure_4_4():
    """
    2x4 panel: each feature's SHAP value (x) vs Predicted WI (y).
    FIX: No log1p — SHAP values can be negative, causing nan.
    FIX: Province legend placed below figure, not overlapping last panel.
    """
    features = [
    ('LU_Agricultural_m2',      'Agricultural Landuse SHAP'),
    ('Total_POI_Count',         'Total POI Count SHAP'),
    ('LU_Forest_m2',            'Forest Landuse SHAP'),
    ('Bldg_school_MeanArea',    'School Bldg Mean Area SHAP'),
    ('Bldg_school_Count',       'School Building Count SHAP'),
    ('LU_Commercial_m2',        'Commercial Landuse SHAP'),
    ('Bldg_residential_MeanArea','Residential Bldg Mean Area SHAP'),
    ('LU_Industrial_m2',        'Industrial Landuse SHAP'),
    ]
    features = [(col, lbl) for col, lbl in features if col in df.columns]

    fig, axes = plt.subplots(2, 4, figsize=(15, 7.5))
    axes = axes.flatten()

    for i, (col, xlabel) in enumerate(features):
        ax   = axes[i]
        x    = df[col].values            # SHAP value — no log1p
        y    = df['Predicted_Wealth'].values
        prov = df['Province'].values

        for pv in PROV_ORDER:
            mask = prov == pv
            if mask.sum() == 0: continue
            ax.scatter(x[mask], y[mask],
                       color=PROVINCE_COLORS.get(pv, OCEAN),
                       alpha=0.38, s=10, linewidths=0, zorder=3)

        valid = np.isfinite(x) & np.isfinite(y)
        if valid.sum() > 20:
            xs_s  = x[valid][np.argsort(x[valid])]
            ys_s  = y[valid][np.argsort(x[valid])]
            ys_sm = gaussian_filter1d(ys_s, sigma=max(5, len(xs_s) // 20))
            ax.plot(xs_s, ys_sm, '-', color='black', linewidth=1.8, zorder=5)

        ax.axhline(0, color='#bbb', linewidth=0.7, linestyle='--', zorder=1)
        ax.axvline(0, color='#bbb', linewidth=0.7, linestyle='--', zorder=1)

        if valid.sum() > 5:
            r_val, _ = pearsonr(x[valid], y[valid])
            ax.set_title(f'r = {r_val:.2f}', fontsize=10, color='#333', pad=4)

        ax.set_xlabel(xlabel, fontsize=8.5, labelpad=3)
        ax.set_ylabel('Predicted WI', fontsize=8.5, labelpad=3)
        ax.tick_params(labelsize=8)
        ax.grid(True, linestyle='--', alpha=0.20)

    handles = [mpatches.Patch(color=PROVINCE_COLORS.get(p, OCEAN), label=p)
               for p in PROV_ORDER if p in df['Province'].values]
    fig.legend(handles=handles, loc='lower center', ncol=6,
               fontsize=8, title='Province', title_fontsize=9,
               bbox_to_anchor=(0.5, -0.04),
               frameon=True, edgecolor=RULE, facecolor='white')

    fig.suptitle(
        'SHAP Feature Contribution vs Predicted Wealth Index',
        fontsize=11, y=1.01
    )
    fig.tight_layout(rect=[0, 0.06, 1, 1])
    fig.savefig(f'{OUT_DIR}/fig4_4_osm_correlations.png', bbox_inches='tight')
    plt.close()
    print('  Fig 4.4 saved')


def figure_4_5():
    """
    Horizontal bar chart, top 20 features by mean |SHAP|.
    FIX: log x-scale so static features (0.003-0.015) are visible
         next to the dominant Temporal bar (0.758).
    """
    lstm_total = df[lstm_cols].abs().sum(axis=1).mean()
    importance = {col: df[col].abs().mean() for col in static_cols}
    importance['Temporal (LSTM, 64 dims)'] = lstm_total

    imp_df = pd.Series(importance).sort_values(ascending=True).tail(20)

    def get_color(feat):
        if 'LSTM' in feat:                    return CAT_COLORS['Temporal']
        if feat in CAT_MAP:                   return CAT_COLORS.get(CAT_MAP[feat], SLATE)
        if feat.startswith('LU_'):            return CAT_COLORS['Landuse']
        if feat.startswith('Bldg_'):          return CAT_COLORS['Building']
        if feat.startswith('POI_'):           return CAT_COLORS['POI']
        if 'Road' in feat or 'Track' in feat: return CAT_COLORS['Road']
        if 'VIIRS' in feat:                   return CAT_COLORS['Satellite']
        return SLATE

    colors = [get_color(f) for f in imp_df.index]
    labels = [f.replace('_', ' ').replace(' m2', ' (m²)') for f in imp_df.index]

    fig, ax = plt.subplots(figsize=(9, 8))
    ax.barh(labels, imp_df.values, color=colors,
            edgecolor='white', linewidth=0.4, height=0.72)

    for lbl, val in zip(labels, imp_df.values):
        ax.text(val * 1.15, labels.index(lbl),
                f'{val:.4f}', va='center', fontsize=7.5, color='#333')

    ax.set_xscale('log')
    ax.set_xlabel('Mean |SHAP Value|  (log scale)', fontsize=11)
    ax.set_title(
        'Global SHAP Feature Importance',
        fontsize=11
    )
    ax.grid(axis='x', linestyle='--', alpha=0.35, which='both')
    ax.tick_params(axis='y', labelsize=9)

    legend_handles = [mpatches.Patch(color=v, label=k)
                      for k, v in CAT_COLORS.items() if k != 'Other']
    ax.legend(handles=legend_handles, title='Feature Category',
              loc='lower right', fontsize=9, title_fontsize=10,
              frameon=True, edgecolor=RULE, facecolor='white')

    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/fig4_5_shap_importance.png')
    plt.close()
    print('  Fig 4.5 saved')


def figure_4_6():
    """
    Donut + stacked bar.
    FIX: province x-labels rotated 45 (no more broken multi-line labels).
    FIX: Satellite color = BLUE (was MIST, indistinguishable from Road SLATE).
    FIX: 'Other' category merged into Road.
    """
    cat_totals = {'Temporal': df[lstm_cols].abs().sum(axis=1).copy()}
    for col in static_cols:
        cat = CAT_MAP.get(col)
        if cat is None:
            if col.startswith('LU_'):             cat = 'Landuse'
            elif col.startswith('Bldg_'):         cat = 'Building'
            elif col.startswith('POI_'):          cat = 'POI'
            elif 'Road' in col or 'Track' in col: cat = 'Road'
            elif 'VIIRS' in col:                  cat = 'Satellite'
            else:                                 cat = 'Other'
        if cat not in cat_totals:
            cat_totals[cat] = pd.Series(np.zeros(len(df)), index=df.index)
        cat_totals[cat] = cat_totals[cat] + df[col].abs()

    # Merge 'Other' into 'Road'
    if 'Other' in cat_totals:
        cat_totals['Road'] = cat_totals.get('Road', pd.Series(0)) + cat_totals.pop('Other')

    # Grand total per point (sum across all categories for each row)
    total_per_point = sum(cat_totals.values())

    # Mean-of-ratios: for each point compute category_i / total, then average
    # This matches run_shap.py: df_master['LSTM_Pct'].mean()
    cat_pcts = {
        k: (v / total_per_point * 100).mean()
        for k, v in cat_totals.items()
    }


    ordered = ['Temporal'] + sorted(
        [c for c in cat_pcts if c != 'Temporal'],
        key=lambda c: cat_pcts[c], reverse=True
    )
    sizes  = [cat_pcts[c]           for c in ordered]
    colors = [CAT_COLORS.get(c, SLATE) for c in ordered]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6.5))
    fig.subplots_adjust(wspace=0.35, bottom=0.18)

    # Donut
    wedges, _, autotexts = ax1.pie(
        sizes, labels=None, colors=colors, explode=[0.03]*len(ordered),
        autopct='%1.1f%%', pctdistance=0.78,
        startangle=90, counterclock=False,
        wedgeprops=dict(width=0.52, edgecolor='white', linewidth=1.5)
    )
    for at, c in zip(autotexts, colors):
        at.set_fontsize(9)
        at.set_fontweight('bold')
        r, g, b = int(c[1:3],16), int(c[3:5],16), int(c[5:7],16)
        at.set_color('#222')

    ax1.text(0, 0, 'SHAP\nContribution', ha='center', va='center',
             fontsize=10, fontweight='bold', color=NAVY)
    ax1.legend(wedges, [f'{c}  {cat_pcts[c]:.1f}%' for c in ordered],
               loc='lower center', bbox_to_anchor=(0.5, -0.14),
               ncol=2, fontsize=9, frameon=False)
    ax1.set_title('(a) Study-wide SHAP Category Split', fontsize=11)

    # Stacked bar
    prov_cat = {}
    for prov in PROV_ORDER:
        mask = df['Province'] == prov
        if mask.sum() == 0: continue
        prov_cat[prov] = {
            c: float(cat_totals[c][mask].mean()) for c in ordered
        }

    prov_labels = [p for p in PROV_ORDER if p in prov_cat]
    bottoms     = np.zeros(len(prov_labels))

    for cat in ordered:
        vals = np.array([prov_cat[p].get(cat, 0) for p in prov_labels])
        ax2.bar(range(len(prov_labels)), vals, bottom=bottoms,
                color=CAT_COLORS.get(cat, SLATE), label=cat,
                edgecolor='white', linewidth=0.4)
        bottoms += vals

    ax2.set_xticks(range(len(prov_labels)))
    ax2.set_xticklabels(prov_labels, rotation=45, ha='right',
                        rotation_mode='anchor', fontsize=9)
    ax2.set_ylabel('Mean Total |SHAP|', fontsize=11)
    ax2.set_title('(b) Mean SHAP Contribution by Province\nper feature category',
                  fontsize=11)
    ax2.legend(loc='upper center', bbox_to_anchor=(0.5, -0.24), ncol=4, fontsize=9, title='Category',
               title_fontsize=9, frameon=True, edgecolor=RULE, facecolor='white')
    ax2.grid(axis='y', linestyle='--', alpha=0.3)
    ax2.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.3f'))

    fig.suptitle('SHAP Feature Attribution by Category',
                 fontsize=12, fontweight='bold', y=1.01)
    fig.savefig(f'{OUT_DIR}/fig4_6_shap_category.png', bbox_inches='tight')
    plt.close()
    print('  Fig 4.6 saved')


def figure_4_9():
    prov_data        = [df.loc[df['Province']==p,'Predicted_Wealth'].dropna().values
                        for p in PROV_ORDER if p in df['Province'].values]
    prov_labels_used = [p for p in PROV_ORDER if p in df['Province'].values]
    colors_used      = [PROVINCE_COLORS.get(p, OCEAN) for p in prov_labels_used]

    fig, ax = plt.subplots(figsize=(10, 7))
    bp = ax.boxplot(
        prov_data, vert=False, patch_artist=True, notch=False, showfliers=True,
        flierprops=dict(marker='o', markersize=3, markerfacecolor='#ccc',
                        alpha=0.5, linewidth=0),
        medianprops=dict(color='white', linewidth=2),
        whiskerprops=dict(linewidth=1.0), capprops=dict(linewidth=1.2),
        boxprops=dict(linewidth=0.8)
    )
    for patch, color in zip(bp['boxes'], colors_used):
        patch.set_facecolor(color); patch.set_alpha(0.85)

    for i, (data, prov) in enumerate(zip(prov_data, prov_labels_used), start=1):
        med = np.median(data)
        n   = len(data)
        q3  = np.percentile(data, 75)
        # n label above Q3 (avoids whisker overlap)
        ax.text(q3, i + 0.42, f'n={n}', ha='left', va='bottom',
                fontsize=7.5, color='#555')
        # median value inside box with contrast
        c  = PROVINCE_COLORS.get(prov, OCEAN)
        r, g, b = int(c[1:3],16), int(c[3:5],16), int(c[5:7],16)
        tc = 'white' if 0.299*r+0.587*g+0.114*b < 140 else '#222'
        ax.text(med, i, f'{med:+.3f}', ha='center', va='center',
                fontsize=7, color=tc, fontweight='bold')

    ax.axvline(0, color='#888', linestyle='--', linewidth=0.9, zorder=1)
    ax.text(0, -.12, 'WI = 0', ha='center',
            fontsize=8, color='#666', style='italic')

    xlim = ax.get_xlim()
    ax.axvspan(xlim[0], -0.5, alpha=0.05, color=CORAL, zorder=0)
    ax.axvspan(-0.5, 0.5, alpha=0.05, color=AMBER, zorder=0)
    ax.axvspan(0.5, ax.get_xlim()[1], alpha=0.05, color=TEAL, zorder=0)

    ax.set_yticks(range(1, len(prov_labels_used)+1))
    ax.set_yticklabels(prov_labels_used, fontsize=10)
    ax.set_xlabel('Predicted Wealth Index', fontsize=11)
    ax.set_title(
        'Distribution of Predicted Wealth Index by Province'
        , fontsize=11
    )
    ax.grid(axis='x', linestyle='--', alpha=0.3)
    ax.legend(handles=[
        mpatches.Patch(color=CORAL, alpha=0.5, label='Low wealth (WI < −0.50)'),
        mpatches.Patch(color=AMBER, alpha=0.5, label='Below avg (−0.50 ≤ WI < +0.50)'),
        mpatches.Patch(color=TEAL,  alpha=0.5, label='High wealth (WI ≥ +0.50)'),
    ], loc='upper center', bbox_to_anchor=(0.5, -0.1), ncol=3, fontsize=9, frameon=True, edgecolor=RULE, facecolor='white')
    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/fig4_9_boxplot_by_province.png')
    plt.close()
    print('  Fig 4.9 saved')


def figure_B1():
    """
    CV radar chart.
    FIX: removed floating value annotations that overlapped axis labels.
         Mean values now shown in parentheses within the axis label itself.
    FIX: legend repositioned so it stays inside the figure.
    FIX: dropped redundant 4th 'Overall mean' axis.
    """
    fold_results = {
        'Fold 1': {'R2': 0.5302, 'r': 0.7329, 'RMSE': 0.4662},
        'Fold 2': {'R2': 0.5251, 'r': 0.7250, 'RMSE': 0.4477},
        'Fold 3': {'R2': 0.5631, 'r': 0.7511, 'RMSE': 0.4720},
        'Fold 4': {'R2': 0.5035, 'r': 0.7131, 'RMSE': 0.4919},
        'Fold 5': {'R2': 0.4999, 'r': 0.7136, 'RMSE': 0.4866},
    }
    mean_r2   = np.mean([v['R2']   for v in fold_results.values()])
    mean_r    = np.mean([v['r']    for v in fold_results.values()])
    mean_rmse = np.mean([v['RMSE'] for v in fold_results.values()])

    all_r2   = [v['R2']   for v in fold_results.values()]
    all_r    = [v['r']    for v in fold_results.values()]
    all_rmse = [v['RMSE'] for v in fold_results.values()]

    def norm(val, lo, hi, inv=False):
        n = (val - lo) / (hi - lo + 1e-9)
        return 1.0 - n if inv else n

    # Axis labels include actual mean metric value — no floating annotations needed
    cats = [
        f'R\u00b2\n(mean {mean_r2:.4f})',
        f'Pearson r\n(mean {mean_r:.4f})',
        f'Consistency\n(RMSE mean {mean_rmse:.4f})',
    ]
    N      = len(cats)
    angles = np.linspace(0, 2*np.pi, N, endpoint=False).tolist()
    angles += angles[:1]

    fold_colors = [OCEAN, TEAL, AMBER, VIOLET, CORAL]

    fig, ax = plt.subplots(figsize=(7.5, 7), subplot_kw=dict(polar=True))

    for (fold, res), color in zip(fold_results.items(), fold_colors):
        vals = [norm(res['R2'],   min(all_r2),   max(all_r2)),
                norm(res['r'],    min(all_r),    max(all_r)),
                norm(res['RMSE'], min(all_rmse), max(all_rmse), inv=True)]
        vals += vals[:1]
        ax.plot(angles, vals, '-o', color=color, linewidth=1.8,
                markersize=5, label=fold, alpha=0.85)
        ax.fill(angles, vals, color=color, alpha=0.07)

    # Mean polygon
    vm = [norm(mean_r2,   min(all_r2),   max(all_r2)),
          norm(mean_r,    min(all_r),    max(all_r)),
          norm(mean_rmse, min(all_rmse), max(all_rmse), inv=True)]
    vm += vm[:1]
    ax.plot(angles, vm, '--', color=NAVY, linewidth=2.4, zorder=6,
            label=f'Mean  R\u00b2={mean_r2:.4f}, r={mean_r:.4f}')

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(cats, fontsize=10)
    ax.set_yticklabels([])
    ax.set_ylim(0, 1)
    ax.grid(color=RULE, linewidth=0.7)
    ax.set_facecolor('#fafcfd')

    ax.legend(loc='lower center', ncol=4, bbox_to_anchor=(0.5, -0.14),
              fontsize=9, frameon=True, edgecolor=RULE, facecolor='white')

    ax.set_title(
        'Cross-Validation Fold Performance Radar',
        fontsize=11, fontweight='bold', pad=20
    )
    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/figB1_cv_radar.png', bbox_inches='tight')
    plt.close()
    print('  Fig B.1 saved')


def figure_B4():
    """
    SHAP dependence plots.
    FIX: x = SHAP value, y = Predicted WI  (was x=y=shap -> r=1.000 always).
    FIX: colorbar in explicit reserved space, not overlapping panels.
    FIX: No log1p on SHAP values.
    """
    top_feats = [
    ('LU_Agricultural_m2',   'Agricultural Landuse SHAP'),
    ('Total_POI_Count',      'Total POI Count SHAP'),
    ('LU_Forest_m2',         'Forest Landuse SHAP'),
    ('Bldg_school_MeanArea', 'School Bldg Mean Area SHAP'),
    ('Bldg_school_Count',    'School Building Count SHAP'),
    ('LU_Commercial_m2',     'Commercial Landuse SHAP'),
    ]
    top_feats = [(col, lbl) for col, lbl in top_feats if col in df.columns]
    if not top_feats:
        print('  Fig B.4 skipped — columns not found.')
        return

    pred_wi    = df['Predicted_Wealth'].values
    viirs_shap = df['VIIRS_Median'].values if 'VIIRS_Median' in df.columns else None
    viirs_norm = None
    if viirs_shap is not None:
        vlo, vhi  = np.percentile(viirs_shap, [2, 98])
        viirs_norm = np.clip((viirs_shap - vlo)/(vhi - vlo + 1e-9), 0, 1)

    cmap = plt.cm.viridis

    fig, axes = plt.subplots(2, 3, figsize=(13, 8))
    fig.subplots_adjust(right=0.88, hspace=0.44, wspace=0.36)
    axes = axes.flatten()

    for i, (col, xlabel) in enumerate(top_feats[:6]):
        ax   = axes[i]
        shap = df[col].values         # SHAP contribution for this feature
        y    = pred_wi                # overall predicted WI (different variable!)
        valid = np.isfinite(shap) & np.isfinite(y)

        if viirs_norm is not None:
            ax.scatter(shap[valid], y[valid], c=viirs_norm[valid], cmap=cmap,
                       alpha=0.55, s=14, linewidths=0, zorder=3, vmin=0, vmax=1)
        else:
            ax.scatter(shap[valid], y[valid], color=OCEAN,
                       alpha=0.55, s=14, linewidths=0, zorder=3)

        ax.axvline(0, color='#bbb', linewidth=0.7, linestyle='--')
        ax.axhline(0, color='#bbb', linewidth=0.7, linestyle='--')

        xs_s  = shap[valid][np.argsort(shap[valid])]
        ys_s  = y[valid][np.argsort(shap[valid])]
        ys_sm = gaussian_filter1d(ys_s, sigma=max(3, len(xs_s)//20))
        ax.plot(xs_s, ys_sm, '-', color='black', linewidth=1.8, zorder=5)

        r_val, _ = pearsonr(shap[valid], y[valid])
        ax.set_title(f'r = {r_val:.2f}', fontsize=10, color='#333', pad=4)
        ax.set_xlabel(xlabel, fontsize=8.5)
        ax.set_ylabel('Predicted WI', fontsize=8.5)
        ax.tick_params(labelsize=8)
        ax.grid(True, linestyle='--', alpha=0.22)

    if viirs_norm is not None:
        cbar_ax = fig.add_axes([0.90, 0.15, 0.018, 0.70])
        sm = plt.cm.ScalarMappable(
            cmap=cmap,
            norm=plt.Normalize(np.percentile(viirs_shap, 2),
                               np.percentile(viirs_shap, 98))
        )
        sm.set_array([])
        cbar = fig.colorbar(sm, cax=cbar_ax)
        cbar.set_label('VIIRS Median SHAP value', fontsize=9, labelpad=8)
        cbar.ax.tick_params(labelsize=8)

    fig.suptitle(
        'SHAP Dependence Plots — Top 6 Static Features',
        fontsize=11, fontweight='bold'
    )
    fig.savefig(f'{OUT_DIR}/figB4_shap_dependence.png', bbox_inches='tight')
    plt.close()
    print('  Fig B.4 saved')


#if __name__ == '__main__':
    #print('\nGenerating figures...')
    #figure_4_2(); print()
    # figure_4_4(); print()
    # figure_4_5(); print()
    # figure_4_6(); print()
    # figure_4_9(); print()
    # figure_B1();  print()
    # figure_B4();  print()
    # print(f'\nAll saved to {os.path.abspath(OUT_DIR)}/')
    # for fname in sorted(os.listdir(OUT_DIR)):
    #     if fname.endswith('.png'):
    #         kb = os.path.getsize(f'{OUT_DIR}/{fname}') // 1024
    #         print(f'  {fname:<42} {kb} KB')


# ══════════════════════════════════════════════════════════════════════════════
# FIG A.1 — HYPERPARAMETER SENSITIVITY  (hardcoded from notebook trial log)
# ══════════════════════════════════════════════════════════════════════════════

def figure_A1():
    """
    8-panel scatter: each hyperparameter (x) vs validation MSE (y).
    Color = val MSE via plasma_r (lower loss = brighter/warmer).
    Gold star = best random search trial.  White diamond = final selected config.
    """
    trials = [
        # lstm_units, dropout_dyn, dense_static, dropout_stat,
        # fusion_units, dropout_fusion, l2_reg, lr, val_loss
        (96,  0.4, 16, 0.3, 64, 0.2, 1e-5,  1e-3,  0.2514),
        (32,  0.4, 16, 0.4, 16, 0.4, 1e-4,  1e-3,  0.2905),
        (32,  0.3, 16, 0.4, 32, 0.3, 1e-3,  1e-3,  0.3125),
        (96,  0.5, 16, 0.4, 64, 0.4, 1e-3,  1e-4,  0.6078),
        (64,  0.3, 16, 0.2, 64, 0.3, 1e-4,  1e-3,  0.2846),
        (32,  0.5, 64, 0.2, 64, 0.2, 1e-3,  1e-4,  0.5227),
        (32,  0.5, 32, 0.3, 32, 0.4, 1e-5,  5e-4,  0.2836),
        (32,  0.4, 32, 0.4, 16, 0.3, 1e-5,  1e-3,  0.2667),
        (96,  0.5, 16, 0.4, 32, 0.3, 1e-4,  1e-3,  0.2518),
        (32,  0.4, 16, 0.3, 32, 0.2, 1e-5,  1e-4,  0.2946),
        (96,  0.4, 32, 0.4, 32, 0.2, 1e-3,  1e-4,  0.5728),
        (96,  0.5, 16, 0.4, 64, 0.4, 1e-5,  5e-4,  0.2390),  # best search
        (96,  0.3, 16, 0.3, 16, 0.3, 1e-4,  1e-3,  0.2634),
        (32,  0.3, 64, 0.4, 64, 0.3, 1e-5,  5e-4,  0.2736),
        (96,  0.3, 32, 0.4, 64, 0.2, 1e-4,  5e-4,  0.2922),
        (64,  0.4, 64, 0.2, 64, 0.2, 1e-5,  1e-3,  0.2730),  # final selected
        (32,  0.3, 32, 0.2, 16, 0.3, 1e-3,  1e-4,  0.5324),
        (32,  0.3, 32, 0.2, 16, 0.2, 1e-5,  5e-4,  0.2575),
        (32,  0.4, 16, 0.2, 32, 0.3, 1e-5,  1e-4,  0.2848),
        (32,  0.5, 32, 0.3, 16, 0.3, 1e-5,  1e-3,  0.2576),
        (64,  0.3, 32, 0.3, 32, 0.4, 1e-5,  1e-3,  0.2621),
        (96,  0.4, 64, 0.2, 32, 0.3, 1e-5,  5e-4,  0.2588),
        (32,  0.5, 64, 0.3, 64, 0.2, 1e-5,  1e-3,  0.2697),
        (64,  0.5, 16, 0.4, 16, 0.4, 1e-4,  1e-3,  0.2812),
        (96,  0.4, 16, 0.2, 64, 0.3, 1e-5,  1e-3,  0.2541),
        (32,  0.3, 64, 0.2, 32, 0.2, 1e-5,  5e-4,  0.2783),
        (64,  0.4, 32, 0.3, 64, 0.4, 1e-4,  1e-3,  0.2893),
        (96,  0.5, 32, 0.2, 32, 0.2, 1e-5,  1e-3,  0.2612),
        (64,  0.3, 64, 0.4, 32, 0.3, 1e-4,  5e-4,  0.2754),
        (96,  0.3, 16, 0.3, 16, 0.3, 1e-5,  1e-3,  0.2655),
    ]

    cols = ['lstm_units','dropout_dyn','dense_static','dropout_stat',
            'fusion_units','dropout_fusion','l2_reg','lr','val_loss']
    df_hp = pd.DataFrame(trials, columns=cols)
    df_hp['trial'] = range(1, len(df_hp)+1)

    best_idx  = int(df_hp['val_loss'].idxmin())   # trial 12 (0-based 11)
    final_idx = 15                                 # trial 16 (0-based 15)

    params = ['lstm_units','dropout_dyn','dense_static','dropout_stat',
              'fusion_units','dropout_fusion','l2_reg','lr']
    param_labels = {
        'lstm_units'   : 'LSTM Units',
        'dropout_dyn'  : 'LSTM Dropout',
        'dense_static' : 'Static Dense Units',
        'dropout_stat' : 'Static Dropout',
        'fusion_units' : 'Fusion Units',
        'dropout_fusion': 'Fusion Dropout',
        'l2_reg'       : 'L2 Regularization',
        'lr'           : 'Learning Rate',
    }

    metric = df_hp['val_loss'].values
    # plasma_r: lower loss (better) → warm/bright color
    cmap = plt.cm.plasma_r
    norm_c = plt.Normalize(metric.min(), metric.max())

    fig, axes = plt.subplots(2, 4, figsize=(16, 8))
    axes = axes.flatten()

    for i, col in enumerate(params):
        ax  = axes[i]
        x   = df_hp[col].values

        # log scale for L2 and lr
        if col in ('l2_reg', 'lr'):
            x_plot = np.log10(x)
            xlab   = f'log\u2081\u2080({param_labels[col]})'
        else:
            x_plot = x
            xlab   = param_labels[col]

        ax.scatter(x_plot, metric, c=metric, cmap=cmap, norm=norm_c,
                   s=52, alpha=0.80, edgecolors='white',
                   linewidths=0.5, zorder=3)

        # Best random search — gold star
        ax.scatter(x_plot[best_idx], metric[best_idx],
                   marker='*', s=280, color='gold',
                   edgecolors='#555', linewidths=0.6, zorder=6)

        # Final selected config — white diamond with NAVY edge
        ax.scatter(x_plot[final_idx], metric[final_idx],
                   marker='D', s=90, facecolor='white',
                   edgecolors=NAVY, linewidths=1.5, zorder=5)

        # Annotate selected value in subplot title (plain text, no color)
        selected_val = df_hp[col].iloc[final_idx]
        val_str = f'{selected_val:.0e}' if col in ('l2_reg','lr') else str(selected_val)
        ax.set_title(f'{param_labels[col]} = {val_str}', fontsize=10, pad=5)

        ax.set_xlabel(xlab, fontsize=9, labelpad=3)
        ax.set_ylabel('Val MSE Loss', fontsize=9, labelpad=3)
        ax.tick_params(labelsize=8)
        ax.grid(True, linestyle='--', alpha=0.28)
        ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.3f'))

    # Shared colorbar — right of last subplot row
    fig.subplots_adjust(right=0.88, hspace=0.52, wspace=0.38)
    cbar_ax = fig.add_axes([0.90, 0.12, 0.016, 0.76])
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=norm_c)
    sm.set_array([])
    cbar = fig.colorbar(sm, cax=cbar_ax)
    cbar.set_label('Validation MSE Loss', fontsize=9, labelpad=8)
    cbar.ax.tick_params(labelsize=8)
    cbar.ax.invert_yaxis()   # lower loss at top of bar

    # Shared legend at bottom
    from matplotlib.lines import Line2D
    legend_elems = [
        Line2D([0],[0], marker='*', color='w', markerfacecolor='gold',
               markeredgecolor='#555', markersize=13,
               label=f'Best search trial  (val MSE = {metric[best_idx]:.4f})'),
        Line2D([0],[0], marker='D', color='w', markerfacecolor='white',
               markeredgecolor=NAVY, markersize=9,
               label=f'Final selected config  (val MSE = {metric[final_idx]:.4f})'),
    ]
    fig.legend(handles=legend_elems, loc='lower center', ncol=2,
               fontsize=10, bbox_to_anchor=(0.44, -0.01),
               frameon=True, edgecolor=RULE, facecolor='white')

    best_cfg = df_hp.iloc[final_idx]
    fig.suptitle(
        f'Hyperparameter Search \u00b7 30 Random Trials \u00b7 '
        f'Best Val MSE = {metric[best_idx]:.4f}\n'
        f'Selected: LSTM={int(best_cfg.lstm_units)}, drop={best_cfg.dropout_dyn}, '
        f'Static={int(best_cfg.dense_static)}, drop={best_cfg.dropout_stat}, '
        f'Fusion={int(best_cfg.fusion_units)}, drop={best_cfg.dropout_fusion}, '
        f'L2={best_cfg.l2_reg:.0e}, lr={best_cfg.lr:.0e}',
        fontsize=11, fontweight='bold', y=1.01
    )
    fig.savefig(f'{OUT_DIR}/figA1_hyperparameter_tuning.png', bbox_inches='tight')
    plt.close()
    print('  Fig A.1 saved')


# ══════════════════════════════════════════════════════════════════════════════
# FIG A.2 — TRAINING HISTORY  (hardcoded from notebook epoch log)
# ══════════════════════════════════════════════════════════════════════════════

def figure_A2():
    """
    Two panels: (a) MSE loss curves, (b) MAE curves + LR schedule.
    OCEAN = training lines, NAVY = validation lines (consistent with palette).
    """
   

    
    
    
    train_loss = [
    1.4970,0.6861,0.6133,0.5251,0.4499,0.3903,0.4044,0.3382,
    0.3014,0.2933,0.2826,0.2660,0.2474,0.2429,0.2599,0.2062,
    0.2235,0.1931,0.2134,0.1974,0.1866,0.1811,0.1852,0.1753,
    0.1825,0.1714,0.1697,0.1629,0.1493,0.1546,0.1448,0.1439,
    0.1444,0.1337,0.1424,0.1436,0.1341,0.1320,0.1312,0.1201,0.1335,
]
    val_loss = [
        0.6136,0.4870,0.4336,0.4183,0.3980,0.4633,0.3821,0.4030,
        0.3938,0.4194,0.4059,0.3848,0.3884,0.3966,0.3723,0.3509,
        0.4135,0.3652,0.3469,0.3968,0.3072,0.3857,0.3529,0.4035,
        0.3749,0.4301,0.3929,0.3890,0.3350,0.3329,0.3271,0.3612,
        0.3375,0.3166,0.3327,0.3313,0.3274,0.3378,0.3500,0.3488,0.3462,
    ]
    train_mae = [
        0.9245,0.6359,0.5955,0.5505,0.5209,0.4855,0.4852,0.4550,
        0.4178,0.4162,0.4008,0.4006,0.3853,0.3791,0.3880,0.3497,
        0.3583,0.3339,0.3537,0.3385,0.3315,0.3314,0.3284,0.3190,
        0.3268,0.3161,0.3112,0.3030,0.2929,0.2964,0.2918,0.2842,
        0.2847,0.2741,0.2816,0.2841,0.2773,0.2743,0.2685,0.2568,0.2721,
    ]
    val_mae = [
        0.5802,0.5192,0.5062,0.4817,0.4622,0.4948,0.4499,0.4623,
        0.4553,0.4758,0.4715,0.4488,0.4579,0.4715,0.4411,0.4370,
        0.4794,0.4529,0.4432,0.4709,0.4112,0.4678,0.4449,0.4715,
        0.4537,0.4915,0.4599,0.4614,0.4282,0.4313,0.4245,0.4528,
        0.4334,0.4198,0.4318,0.4300,0.4296,0.4378,0.4451,0.4459,0.4423,
    ]
    lr_vals    = [1e-3]*29 + [5e-4]*8 + [2.5e-4]*4
    epochs     = list(range(1, len(train_loss)+1))

    best_epoch = 21   # val_loss minimum: 0.3072
    lr_drop1   = 29   # ReduceLROnPlateau fires end of epoch 29 → 1e-3→5e-4
    lr_drop2   = 37   # ReduceLROnPlateau fires end of epoch 37 → 5e-4→2.5e-4
    es_epoch   = 41   # EarlyStopping patience=20, fires end of epoch 41

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.5))
    fig.subplots_adjust(wspace=0.32)

    # ── (a) MSE loss ─────────────────────────────────────────────────────────
    ax1.plot(epochs, train_loss, '-', color=MIST, linewidth=1.8,
             alpha=0.9, label='Training MSE', zorder=3)
    ax1.plot(epochs, val_loss,   '-', color=NAVY, linewidth=2.2,
             label='Validation MSE', zorder=4)

    # generalization gap shading
    ax1.fill_between(epochs, train_loss, val_loss,
                     where=[v > t for t,v in zip(train_loss, val_loss)],
                     alpha=0.08, color=CORAL, label='Generalization gap', zorder=2)

    # best epoch
    ax1.axvline(best_epoch, color=TEAL, linestyle='--', linewidth=1.4, zorder=5)
    ax1.scatter([best_epoch], [val_loss[best_epoch-1]],
                color='gold', s=120, edgecolors='#444',
                linewidths=0.8, zorder=6, marker='*',
                label=f'Best epoch {best_epoch}  (val MSE={val_loss[best_epoch-1]:.4f})')

    # LR reduction markers
    for ep, lbl in [(lr_drop1, 'LR\n1e-3\u21925e-4'), (lr_drop2, 'LR\n5e-4\u21922.5e-4')]:
        ax1.axvline(ep, color=AMBER, linestyle=':', linewidth=1.2, zorder=4)
        ax1.text(ep+0.3, 0.58, lbl, fontsize=7, color=AMBER, va='top')

    ax1.axvline(es_epoch, color=CORAL, linestyle='-.', linewidth=1.1, zorder=4)
    ax1.text(es_epoch-0.4, 0.17, 'Early\nstop', fontsize=7.5,
             color=CORAL, va='bottom', ha='right')

    ax1.set_xlabel('Epoch', fontsize=11)
    ax1.set_ylabel('MSE Loss', fontsize=11)
    ax1.set_title('(a) Training & Validation MSE Loss', fontsize=11)
    ax1.set_xlim(0.5, es_epoch+1.5)
    ax1.set_ylim(0, max(train_loss[0], val_loss[0]) * 1.05)
    ax1.legend(fontsize=8.5, loc='upper right',
               frameon=True, edgecolor=RULE, facecolor='white')
    ax1.grid(True, linestyle='--', alpha=0.28)
    ax1.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.3f'))

    # ── (b) MAE + LR schedule ─────────────────────────────────────────────────
    ax2.plot(epochs, train_mae, '-', color=MIST, linewidth=1.8,
             alpha=0.9, label='Training MAE', zorder=3)
    ax2.plot(epochs, val_mae,   '-', color=NAVY, linewidth=2.2,
             label='Validation MAE', zorder=4)

    ax2.axvline(best_epoch, color=TEAL, linestyle='--', linewidth=1.4, zorder=5)
    ax2.scatter([best_epoch], [val_mae[best_epoch-1]],
                color='gold', s=120, edgecolors='#444',
                linewidths=0.8, zorder=6, marker='*',
                label=f'Best epoch {best_epoch}  (val MAE={val_mae[best_epoch-1]:.4f})')

    for ep in (lr_drop1, lr_drop2):
        ax2.axvline(ep, color=AMBER, linestyle=':', linewidth=1.2, zorder=4)
    ax2.axvline(es_epoch, color=CORAL, linestyle='-.', linewidth=1.1, zorder=4)

    # LR on secondary axis
    ax2b = ax2.twinx()
    ax2b.step(epochs, lr_vals, where='post',
              color=AMBER, linewidth=1.4, linestyle=':', alpha=0.75,
              label='Learning rate')
    ax2b.set_yscale('log')
    ax2b.set_ylim(5e-5, 2e-3)
    ax2b.set_ylabel('Learning Rate', fontsize=9, color=AMBER, labelpad=6)
    ax2b.tick_params(axis='y', labelcolor=AMBER, labelsize=8)
    ax2b.spines['right'].set_edgecolor(AMBER)

    ax2.set_xlabel('Epoch', fontsize=11)
    ax2.set_ylabel('MAE Loss', fontsize=11)
    ax2.set_title('(b) Training & Validation MAE  +  Learning Rate', fontsize=11)
    ax2.set_xlim(0.5, es_epoch+1.5)
    ax2.legend(fontsize=8.5, loc='upper right',
               frameon=True, edgecolor=RULE, facecolor='white')
    ax2.grid(True, linestyle='--', alpha=0.28)
    ax2.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.3f'))

    # Summary strip below figure
    summary = (
        'Config: LSTM=64, drop=0.4 \u00b7 Static=64, drop=0.2 \u00b7 '
        'Fusion=64, drop=0.2 \u00b7 L2=1e-5 \u00b7 lr=1e-3\u219225e-4\n'
        f'Best epoch: {best_epoch} \u00b7 '
        f'Best val MSE: {val_loss[best_epoch-1]:.4f} \u00b7 '
        f'Best val MAE: {val_mae[best_epoch-1]:.4f} \u00b7 '
        'EarlyStopping patience=15 \u00b7 ReduceLROnPlateau factor=0.5, patience=7'
    )
    fig.text(0.5, 0.1, summary, ha='center', va='top', fontsize=8.5,
             color='#555', style='italic',
             bbox=dict(boxstyle='round,pad=0.45', facecolor=CREAM,
                       edgecolor=RULE, alpha=0.9))

    fig.suptitle(
        'CNN-LSTM Training History \u00b7 Final Model (Best Hyperparameters)',
        fontsize=11, fontweight='bold'
    )
    fig.tight_layout(rect=[0, 0.10, 1, 0.93])
    fig.savefig(f'{OUT_DIR}/figA2_loss_curves.png', bbox_inches='tight')
    plt.close()
    print('  Fig A.2 saved')
    
    # ══════════════════════════════════════════════════════════════════════════════
# FIG C.2 — MEAN WI PER PROVINCE: 2022 PREDICTED vs ACTUAL vs 2025 PREDICTED
# ══════════════════════════════════════════════════════════════════════════════

def figure_C2():
    """
    Grouped bar chart: for each of the 16 study provinces, three bars showing
    mean predicted WI from 2022 imagery, mean actual DHS WI (2022), and mean
    predicted WI from 2025 imagery. Only DHS-origin clusters are included.
    Provinces ordered poorest to wealthiest by PROV_ORDER.
    """
    if df_master_2022 is None or df_master is None:
        print('  Fig C.2 skipped — MASTER_2022_CSV or MASTER_CSV not loaded')
        return

    # ── Build per-province means ───────────────────────────────────────────────
    pred22 = (
        df_master_2022.groupby('Province')['Pred_WI_2022'].mean()
    )
    act22 = (
        df_master_2022.groupby('Province')['DHS_WI'].mean()
    )
    dhs25 = df_master[df_master['source'] == 'DHS'].copy()
    pred25 = (
        dhs25.groupby('Province')['Predicted_Wealth'].mean()
    )

    # Keep only provinces in PROV_ORDER with data
    provs = [p for p in PROV_ORDER
             if p in pred22.index and p in act22.index and p in pred25.index]

    p22  = [pred22[p] for p in provs]
    a22  = [act22[p]  for p in provs]
    p25  = [pred25[p] for p in provs]
    n_dhs = [len(df_master_2022[df_master_2022['Province'] == p])
             for p in provs]

    # ── Layout ─────────────────────────────────────────────────────────────────
    n      = len(provs)
    x      = np.arange(n)
    width  = 0.25
    fig, ax = plt.subplots(figsize=(14, 6))

    # ── Background wealth zones ────────────────────────────────────────────────
    ax.axhspan(-3.0, -0.5, alpha=0.04, color=CORAL,  zorder=0)
    ax.axhspan(-0.5,  0.5, alpha=0.04, color=AMBER,  zorder=0)
    ax.axhspan( 0.5,  2.5, alpha=0.04, color=TEAL,   zorder=0)
    ax.axhline(0, color='#888', linewidth=0.8, linestyle='--', zorder=2)

    # ── Bars ───────────────────────────────────────────────────────────────────
    bars1 = ax.bar(
        x - width, p22, width,
        color=OCEAN,  alpha=0.82,
        hatch='////', edgecolor='white', linewidth=0.4,
        label='2022 Predicted', zorder=3
    )
    bars2 = ax.bar(
        x,          a22, width,
        color=NAVY,   alpha=0.92,
        hatch='',     edgecolor='white', linewidth=0.4,
        label='2022 Actual (DHS)', zorder=3
    )
    bars3 = ax.bar(
        x + width,  p25, width,
        color=AMBER,  alpha=0.82,
        hatch='....',  edgecolor='white', linewidth=0.4,
        label='2025 Predicted', zorder=3
    )

    # ── Value annotations (actual WI only — most policy-relevant) ──────────────
    for bar, val in zip(bars2, a22):
        ypos = val + 0.04 if val >= 0 else val - 0.10
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            ypos, f'{val:.2f}',
            ha='center', va='bottom' if val >= 0 else 'top',
            fontsize=6.5, color=NAVY, fontweight='bold', zorder=5
        )

    # ── n= annotation below each province group ────────────────────────────────
    for i, (p, n_pts) in enumerate(zip(provs, n_dhs)):
        ax.text(
            x[i], -2.8,
            f'n={n_pts}',
            ha='center', va='bottom',
            fontsize=6, color='#888', zorder=5
        )

    # ── Axes ───────────────────────────────────────────────────────────────────
    prov_labels = [p.replace(' del ', '\ndel ').replace(' del\n', '\ndel ')
                   for p in provs]
    ax.set_xticks(x)
    ax.set_xticklabels(prov_labels, rotation=40, ha='right',
                        fontsize=8.5, va='top')
    ax.set_ylabel('Mean Wealth Index', fontsize=10)
    ax.set_xlim(-0.6, n - 0.4)
    ax.set_ylim(
        min(min(p22), min(a22), min(p25)) - 0.25,
        max(max(p22), max(a22), max(p25)) + 0.35
    )
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f'{v:.1f}'))
    ax.grid(True, axis='y', linestyle='--', alpha=0.30, zorder=1)

    # Wealth zone labels on right axis
    ax_r = ax.twinx()
    ax_r.set_ylim(ax.get_ylim())
    ax_r.set_yticks([])
    for yc, lbl, col in [
        (-1.0, 'Low wealth\n(WI < −0.50)',    CORAL),
        ( 0.0, 'Mid wealth\n(−0.50 to +0.50)', AMBER),
        ( 0.7, 'High wealth\n(WI > +0.50)',    TEAL),
    ]:
        if ax.get_ylim()[0] < yc < ax.get_ylim()[1]:
            ax_r.text(1.01, yc, lbl, transform=ax_r.get_yaxis_transform(),
                      fontsize=7, color=col, va='center', ha='left', alpha=0.75)
    ax_r.spines['right'].set_visible(False)

    ax.set_title(
        'Mean Predicted vs Actual Wealth Index per Province\n',
        fontsize=11, pad=10
    )

    # ── Legend ─────────────────────────────────────────────────────────────────
    legend_handles = [
        mpatches.Patch(facecolor=OCEAN, hatch='////', edgecolor='white',
                       alpha=0.82, label='2022 Predicted  (2022 imagery)'),
        mpatches.Patch(facecolor=NAVY, hatch='',     edgecolor='white',
                       alpha=0.92, label='2022 Actual DHS  (survey ground truth)'),
        mpatches.Patch(facecolor=AMBER, hatch='....', edgecolor='white',
                       alpha=0.82, label='2025 Predicted  (2025 imagery)'),
    ]
    ax.legend(
        handles=legend_handles,
        loc='upper left', fontsize=9,
        frameon=True, edgecolor=RULE, facecolor='white',
        ncol=3, bbox_to_anchor=(0.0, 1.0)
    )

    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/figC2_province_wi_comparison.png',
                bbox_inches='tight', dpi=300)
    plt.close()
    print('  Fig C.2 saved')



#if __name__ == '__main__':
   #print('\nGenerating A-series figures...')
    #figure_A1(); print()
    #figure_A2(); print()
    #print(f'\nDone. Saved to {os.path.abspath(OUT_DIR)}/')
    
    #figure_C2(); print()
    #figure_wealth_map(); print()
    
def figure_wealth_map():
    """
    Spatial map of cluster-level predicted wealth index across the 16 study
    localities.  Points are coloured by Predicted_Wealth using a custom
    red->orange->blue->teal colormap matching the web application.
 
    Requires geopandas and PH_Adm2_ProvDists.shp (set SHP_PROV above).
    Two output variants are saved:
      fig_wealth_map.png        -- full Philippines overview
      fig_wealth_map_panel.png  -- per-province sub-panel grid
    """
    import geopandas as gpd
    from matplotlib.colors import LinearSegmentedColormap
    from matplotlib.lines import Line2D as _L2D
 
    # ── Load and merge point data ─────────────────────────────────────────
    df_pts = pd.read_csv(POINTS_CSV)
    df_m   = pd.read_csv(MASTER_CSV)
    if 'ClusterID' in df_m.columns and 'PointID' not in df_m.columns:
        df_m = df_m.rename(columns={'ClusterID': 'PointID'})
 
    df_map = df_pts[['PointID', 'Latitude', 'Longitude', 'Province', 'source']].merge(
        df_m[['PointID', 'Predicted_Wealth']], on='PointID', how='inner'
    )
    print(f'  Wealth map: {len(df_map)} pts, {df_map["Province"].nunique()} provinces')
 
    # ── Load province shapefile ────────────────────────────────────────────
    gdf_all = gpd.read_file(SHP_PROV).to_crs('EPSG:4326')
    gdf_all['adm2_psgc_int'] = pd.to_numeric(
        gdf_all['adm2_psgc'].astype(str).str.replace(r'\.0$', '', regex=True),
        errors='coerce'
    )
 
    # PSGC integer codes for the 16 study localities
    STUDY_PSGC = {
        102800000 : 'Ilocos Norte',
        305400000 : 'Pampanga',
        1401100000: 'Benguet',
        1401000000: 'Benguet',       # Baguio HUC grouped under Benguet
        1403200000: 'Kalinga',
        600400000 : 'Aklan',
        907200000 : 'Zamboanga del Norte',
        1900700000: 'Basilan',
        1907000000: 'Tawi-Tawi',
        1908800000: 'Maguindanao del Sur',
        1102500000: 'Davao Oriental',
        300800000 : 'Bataan',
        307100000 : 'Zambales',
        1705100000: 'Occidental Mindoro',
        1705200000: 'Oriental Mindoro',
        301400000 : 'Bulacan',
    }
 
    gdf_study = gdf_all[
        gdf_all['adm2_psgc_int'].isin(STUDY_PSGC.keys()) |
        (gdf_all['geo_level'] == 'Dist')
    ].copy()
 
    # Philippines national outline for ocean/context background
    gdf_ph = gdf_all.dissolve()
 
    # ── Custom colormap: red -> orange -> blue -> teal ─────────────────────
    # Stops mapped to 0-1 range covering WI_MIN=-2.5 to WI_MAX=1.0
    CMAP = LinearSegmentedColormap.from_list('tala_wi', [
        (0.00, '#c0392b'),
        (0.37, '#e67e22'),
        (0.55, '#326189'),
        (0.72, '#88bcbd'),
        (1.00, '#5ce1e6'),
    ])
    WI_MIN, WI_MAX = -2.5, 1.0
 
    # ═══════════════════════════════════════════════════════════════════════
    # FIGURE 1 — Full Philippines overview
    # ═══════════════════════════════════════════════════════════════════════
    fig, ax = plt.subplots(figsize=(8, 11), facecolor='white')
    ax.set_facecolor('#dce8f0')   # light ocean
 
    gdf_ph.plot(ax=ax, color='#f2f2f2', edgecolor='#aaaaaa',
                linewidth=0.3, zorder=1)
    gdf_study.plot(ax=ax, color='#e4ecf2', edgecolor='#888888',
                   linewidth=0.6, zorder=2)
 
    df_grid = df_map[df_map['source'] != 'DHS']
    df_dhs  = df_map[df_map['source'] == 'DHS']
 
    sc = ax.scatter(
        df_grid['Longitude'], df_grid['Latitude'],
        c=df_grid['Predicted_Wealth'], cmap=CMAP, vmin=WI_MIN, vmax=WI_MAX,
        s=10, alpha=0.80, linewidths=0, zorder=3,
    )
    ax.scatter(
        df_dhs['Longitude'], df_dhs['Latitude'],
        c=df_dhs['Predicted_Wealth'], cmap=CMAP, vmin=WI_MIN, vmax=WI_MAX,
        s=10, alpha=0.95, linewidths=0, zorder=3,
    )
 
    cbar = fig.colorbar(sc, ax=ax, orientation='vertical',
                        fraction=0.022, pad=0.02, aspect=28)
    cbar.set_label('Predicted Wealth Index', fontsize=10)
    cbar.ax.tick_params(labelsize=8.5)
    cbar.set_ticks([-2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0])
    cbar.ax.text(1.18, 0.01, 'Poor',    transform=cbar.ax.transAxes,
                 fontsize=7.5, va='bottom', color='#c0392b', fontweight='bold')
    cbar.ax.text(1.18, 0.99, 'Wealthy', transform=cbar.ax.transAxes,
                 fontsize=7.5, va='top',    color='#1a7a8a', fontweight='bold')
 
   
 
    ax.set_xlim(116.8, 127.2)
    ax.set_ylim(4.2,   21.0)
    ax.set_xlabel('Longitude (E)', fontsize=10)
    ax.set_ylabel('Latitude (N)',  fontsize=10)
    ax.tick_params(labelsize=8.5)
    ax.set_aspect('equal')
    ax.grid(True, linestyle='--', alpha=0.20, linewidth=0.45, color='#666')
    ax.annotate('', xy=(0.965, 0.135), xytext=(0.965, 0.095),
                xycoords='axes fraction',
                arrowprops=dict(arrowstyle='->', color='#333', lw=1.6))
    ax.text(0.965, 0.142, 'N', transform=ax.transAxes,
            ha='center', fontsize=9, fontweight='bold', color='#333')
 
    ax.set_title(
        'Spatial Distribution of Predicted Wealth Index in the Philippines (2025)',
        
        fontsize=11, pad=10,
    )
    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/fig_wealth_map.png', dpi=300, bbox_inches='tight')
    plt.close()
    print('  fig_wealth_map.png saved')
 
    # ═══════════════════════════════════════════════════════════════════════
    # FIGURE 2 — Per-province panel grid
    # ═══════════════════════════════════════════════════════════════════════
    provs = [p for p in PROV_ORDER if p in df_map['Province'].values]
    ncols = 4
    nrows = (len(provs) + ncols - 1) // ncols
    fig2, axes = plt.subplots(nrows, ncols,
                              figsize=(4.5 * ncols, 4 * nrows),
                              facecolor='white')
    axes = axes.flatten()
 
    for i, prov in enumerate(provs):
        ax = axes[i]
        ax.set_facecolor('#dce8f0')
 
        # Province boundary polygons for this locality
        if prov == 'NCR':
            gdf_p = gdf_study[gdf_study['geo_level'] == 'Dist']
        else:
            psgc_set = {k for k, v in STUDY_PSGC.items() if v == prov}
            gdf_p = gdf_study[gdf_study['adm2_psgc_int'].isin(psgc_set)]
 
        if len(gdf_p) == 0:
            ax.set_visible(False)
            continue
 
        gdf_p.plot(ax=ax, color='#e4ecf2', edgecolor='#777777',
                   linewidth=0.7, zorder=1)
 
        sub      = df_map[df_map['Province'] == prov]
        sub_grid = sub[sub['source'] != 'DHS']
        sub_dhs  = sub[sub['source'] == 'DHS']
 
        ax.scatter(sub_grid['Longitude'], sub_grid['Latitude'],
                   c=sub_grid['Predicted_Wealth'],
                   cmap=CMAP, vmin=WI_MIN, vmax=WI_MAX,
                   s=10, alpha=0.82, linewidths=0)
        ax.scatter(sub_dhs['Longitude'],  sub_dhs['Latitude'],
                   c=sub_dhs['Predicted_Wealth'],
                   cmap=CMAP, vmin=WI_MIN, vmax=WI_MAX,
                   s=10, alpha=0.95, linewidths=0
        )
 
        mn_wi = sub['Predicted_Wealth'].mean()
        ax.set_title(
            f'{prov}  (n={len(sub)},  mean WI={mn_wi:+.3f})',
            fontsize=9, pad=4,
           
        )
        ax.set_aspect('equal')
        ax.tick_params(labelsize=7)
        ax.grid(True, linestyle='--', alpha=0.20, linewidth=0.4)
        ax.set_xlabel('Lon', fontsize=7.5)
        ax.set_ylabel('Lat', fontsize=7.5)
 
    for j in range(i + 1, len(axes)):
        axes[j].set_visible(False)
 
    # Shared horizontal colorbar at the bottom
    cax = fig2.add_axes([0.25, 0.02, 0.50, 0.013])
    sm  = plt.cm.ScalarMappable(cmap=CMAP,
                                 norm=plt.Normalize(vmin=WI_MIN, vmax=WI_MAX))
    sm.set_array([])
    cb2 = fig2.colorbar(sm, cax=cax, orientation='horizontal')
    cb2.set_label('Predicted Wealth Index', fontsize=10)
    cb2.set_ticks([-2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0])
    cb2.ax.tick_params(labelsize=8.5)
    cb2.ax.text(-0.01, 0.5, 'Poor',    transform=cb2.ax.transAxes,
                fontsize=8, va='center', ha='right', color='#c0392b',
                fontweight='bold')
    cb2.ax.text(1.01,  0.5, 'Wealthy', transform=cb2.ax.transAxes,
                fontsize=8, va='center', ha='left',  color='#1a7a8a',
                fontweight='bold')
 
    fig2.suptitle(
        'Predicted Wealth Index by Study Locality',
        fontsize=12, fontweight='bold', y=1.005,
    )
    fig2.tight_layout(rect=[0, 0.05, 1, 1])
    fig2.savefig(f'{OUT_DIR}/fig_wealth_map_panel.png',
                 dpi=300, bbox_inches='tight')
    plt.close()
    print('  fig_wealth_map_panel.png saved')
    
if __name__ == '__main__':
    figure_wealth_map(); print()