"""
generate_figures.py
===================
Generates the six highest-priority manuscript figures for Project TALA.

Inputs required
---------------
  Required (included in project):
    prediction_points.csv       — 1,240 prediction points (source, province, municipality)
    shap_values_all_clusters.csv — 1,112 points (Predicted_Wealth + SHAP values + OSM features)

  Optional (on your local machine):
    master_cluster_summary.csv  — 1,112 points with Actual_Wealth (real DHS WI for DHS points)
    Set MASTER_CSV path below, or pass None to skip Figures 4.2 and 4.10.

Output
------
  ./figures/  — one PNG per figure at 300 dpi

Usage
-----
  pip install matplotlib seaborn scipy pandas numpy
  python generate_figures.py
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

# ── Configure paths ──────────────────────────────────────────────────────────
POINTS_CSV = '/Users/ruben/Desktop/Thesis/2025Data/prediction_points.csv'
SHAP_CSV   = '/Users/ruben/Desktop/Thesis/2025Data/shap_outputs_expanded/shap_values_all_clusters.csv'
MASTER_CSV = '/Users/ruben/Desktop/Thesis/2025Data/shap_outputs_expanded/master_cluster_summary.csv'  # set to full path of master_cluster_summary.csv if available
#             e.g. '/Users/ruben/Desktop/Thesis/2025Data/shap_outputs_expanded/master_cluster_summary.csv'

OUT_DIR = './'
os.makedirs(OUT_DIR, exist_ok=True)

# ── Brand palette ─────────────────────────────────────────────────────────────
NAVY    = '#1a3c5c'
OCEAN   = '#326189'
TEAL    = '#5ce1e6'
MIST    = '#88bcbd'
AMBER   = '#f59e0b'
VIOLET  = '#a78bfa'
SLATE   = '#94a3b8'
SKY     = '#60a5fa'
CORAL   = '#f87171'
GREEN   = '#22c55e'
CREAM   = '#eaf1f5'
RULE    = '#d4dfe6'

# Category → colour
CAT_COLORS = {
    'Temporal' : TEAL,
    'Landuse'  : AMBER,
    'POI'      : VIOLET,
    'Building' : SKY,
    'Road'     : SLATE,
    'Satellite': MIST,
}

# Feature → category
CAT_MAP = {
    'VIIRS_Median'             : 'Satellite',
    'Total_Road_Length'        : 'Road',
    'Main_Roads_Length'        : 'Road',
    'Secondary_Roads_Length'   : 'Road',
    'Local_Roads_Length'       : 'Road',
    'Tracks_Length'            : 'Road',
    'Total_Bldg_Count'         : 'Building',
    'Bldg_residential_Count'   : 'Building',
    'Bldg_commercial_Count'    : 'Building',
    'Bldg_industrial_Count'    : 'Building',
    'Bldg_school_Count'        : 'Building',
    'Bldg_hospital_Count'      : 'Building',
    'Total_Bldg_Area'          : 'Building',
    'Total_POI_Count'          : 'POI',
    'POI_bank_Count'           : 'POI',
    'POI_hotel_Count'          : 'POI',
    'POI_fast_food_Count'      : 'POI',
    'POI_convenience_Count'    : 'POI',
    'POI_school_Count'         : 'POI',
    'POI_hospital_Count'       : 'POI',
}

# Province display order (poorest → wealthiest by PSA)
PROV_ORDER = [
    'Zamboanga del Norte', 'Basilan', 'Tawi-Tawi',
    'Maguindanao del Sur', 'Davao Oriental',
    'Aklan', 'Kalinga', 'Benguet', 'Pampanga',
    'Ilocos Norte', 'NCR',
]

PROVINCE_COLORS = {
    'Zamboanga del Norte': '#c0392b',
    'Basilan'            : '#e74c3c',
    'Tawi-Tawi'          : '#e67e22',
    'Maguindanao del Sur': '#f39c12',
    'Davao Oriental'     : '#d4ac0d',
    'Aklan'              : '#7dcea0',
    'Kalinga'            : '#52be80',
    'Benguet'            : '#27ae60',
    'Pampanga'           : '#1abc9c',
    'Ilocos Norte'       : '#3498db',
    'NCR'                : '#5ce1e6',
}

# ── Matplotlib style ──────────────────────────────────────────────────────────
plt.rcParams.update({
    'font.family'      : 'serif',
    'font.serif'       : ['Times New Roman', 'DejaVu Serif'],
    'font.size'        : 11,
    'axes.labelsize'   : 11,
    'axes.titlesize'   : 12,
    'axes.titleweight' : 'bold',
    'axes.spines.top'  : False,
    'axes.spines.right': False,
    'axes.linewidth'   : 0.8,
    'axes.edgecolor'   : '#555555',
    'xtick.labelsize'  : 9,
    'ytick.labelsize'  : 9,
    'legend.fontsize'  : 9,
    'legend.frameon'   : False,
    'figure.dpi'       : 150,
    'savefig.dpi'      : 300,
    'savefig.bbox'     : 'tight',
    'savefig.facecolor': 'white',
    'grid.alpha'       : 0.35,
    'grid.linewidth'   : 0.5,
    'grid.color'       : RULE,
})

# ── Load data ─────────────────────────────────────────────────────────────────
print('Loading data...')
df_pts  = pd.read_csv(POINTS_CSV)
df_shap = pd.read_csv(SHAP_CSV)

# Rename ClusterID → PointID for join
df_shap = df_shap.rename(columns={'ClusterID': 'PointID'})

# Merge points metadata into shap frame
df = df_shap.merge(
    df_pts[['PointID', 'Province', 'Municipality', 'Urban_Rural', 'source']],
    on='PointID', how='left'
)

# Identify LSTM columns and static feature columns
lstm_cols   = [c for c in df.columns if c.startswith('LSTM_dim_')]
static_cols = [c for c in df.columns
               if c not in ['PointID', 'Predicted_Wealth', 'Province',
                             'Municipality', 'Urban_Rural', 'source']
               and not c.startswith('LSTM_dim_')]

# Load master summary for DHS actual WI if available
df_master = None
if MASTER_CSV and os.path.exists(MASTER_CSV):
    df_master = pd.read_csv(MASTER_CSV)
    # Normalize column names
    df_master.columns = [c.strip() for c in df_master.columns]
    if 'Actual_Wealth' in df_master.columns:
        df_master = df_master.rename(columns={'Actual_Wealth': 'DHS_WI'})
    df_master = df_master.merge(
        df_pts[['PointID', 'Province', 'Municipality', 'source']],
        on='PointID', how='left'
    )
    print(f'  Master CSV loaded: {len(df_master)} rows, '
          f'{df_master["DHS_WI"].notna().sum()} DHS-origin with actual WI')
else:
    print('  master_cluster_summary.csv not found — '
          'Figures 4.2 and 4.10 will use predicted WI only.')

print(f'  Merged dataset: {len(df)} rows across '
      f'{df["Province"].nunique()} provinces')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE 4.2 — Predicted vs Observed WI Scatter
# ═════════════════════════════════════════════════════════════════════════════

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
    dhs_pts = dhs_pts.merge(df[['PointID','Predicted_Wealth']], on='PointID', how='inner')

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
    ax.set_title('Figure 4.2  Predicted vs Observed Wealth Index\n'
                 f'DHS-origin clusters (n={len(obs)})  ·  '
                 f'Pooled R² = {r2_pool:.4f}  ·  r = {r:.4f}',
                 fontsize=11)

    stats_txt = (f'Pooled R² = {r2_pool:.4f}\nPearson r = {r:.4f}\n'
                 f'n = {len(obs)} DHS clusters')
    ax.text(0.04, 0.96, stats_txt, transform=ax.transAxes,
            fontsize=9, va='top', ha='left',
            bbox=dict(boxstyle='round,pad=0.4', facecolor=CREAM, edgecolor=RULE, alpha=0.9))

    leg = ax.legend(loc='lower right', fontsize=8, ncol=2,
                    handletextpad=0.4, columnspacing=0.8)
    ax.set_xlim(mn, mx); ax.set_ylim(mn, mx)
    ax.grid(True, linestyle='--', alpha=0.3)

    fig.savefig(f'{OUT_DIR}/fig4_2_predicted_vs_observed.png')
    plt.close()
    print('  Fig 4.2 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE 4.4 — OSM Feature Correlations with Predicted WI
# ═════════════════════════════════════════════════════════════════════════════

def figure_4_4():
    """
    2×4 panel of scatter plots: each OSM feature (x-axis) vs Predicted WI (y-axis).
    Colored by province, with a LOESS-style smooth curve.
    Mirrors Figure 2 from Tingzon et al. in style.
    """
    features = [
        ('LU_Agricultural_m2',   'Agricultural Landuse (m²)'),
        ('Total_POI_Count',      'Total POI Count'),
        ('LU_Forest_m2',         'Forest Landuse (m²)'),
        ('Total_Road_Length',    'Total Road Length (km)'),
        ('Bldg_school_Count',    'School Building Count'),
        ('VIIRS_Median',         'VIIRS Median (nW/cm²/sr)'),
        ('POI_restaurant_Count', 'Restaurant Count'),
        ('POI_hospital_Count',   'Hospital Count'),
    ]

    # Filter to columns that actually exist in the dataframe
    features = [(col, lbl) for col, lbl in features if col in df.columns]

    ncols, nrows = 4, 2
    fig, axes = plt.subplots(nrows, ncols, figsize=(14, 7))
    axes = axes.flatten()

    for i, (col, xlabel) in enumerate(features):
        ax = axes[i]
        x_raw = df[col].values
        y = df['Predicted_Wealth'].values
        prov = df['Province'].values

        # log1p transform for skewed features
        if col in ('LU_Agricultural_m2', 'LU_Forest_m2', 'Total_POI_Count',
                   'POI_restaurant_Count', 'Total_Road_Length'):
            x = np.log1p(x_raw)
            xlab = f'log(1 + {xlabel})'
        else:
            x = x_raw
            xlab = xlabel

        # Scatter by province
        for pv in PROV_ORDER:
            mask = prov == pv
            if mask.sum() == 0: continue
            ax.scatter(x[mask], y[mask],
                       color=PROVINCE_COLORS.get(pv, OCEAN),
                       alpha=0.45, s=12, linewidths=0, zorder=3)

        # LOESS-style: sort and smooth with gaussian filter
        idx_sort = np.argsort(x)
        xs, ys = x[idx_sort], y[idx_sort]
        if len(xs) > 10:
            sigma = max(5, len(xs) // 20)
            ys_smooth = gaussian_filter1d(ys, sigma=sigma)
            ax.plot(xs, ys_smooth, '-', color='black', linewidth=1.6, zorder=5)

        # Pearson r on raw values
        valid = ~np.isnan(x_raw) & ~np.isnan(y)
        if valid.sum() > 5:
            r, _ = pearsonr(x_raw[valid], y[valid])
            rho = np.corrcoef(x[valid], y[valid])[0, 1]
            ax.set_title(f'ρ = {rho:.2f},  r = {r:.2f}', fontsize=9,
                         color='#444', pad=3)

        ax.set_xlabel(xlab, fontsize=8, labelpad=2)
        ax.set_ylabel('Predicted WI', fontsize=8, labelpad=2)
        ax.tick_params(labelsize=7)
        ax.grid(True, linestyle='--', alpha=0.25)

    # Province legend on last subplot
    if len(features) < len(axes):
        for j in range(len(features), len(axes)):
            axes[j].set_visible(False)

    handles = [mpatches.Patch(color=PROVINCE_COLORS.get(p, OCEAN), label=p)
               for p in PROV_ORDER if p in df['Province'].values]
    fig.legend(handles=handles, loc='lower right', ncol=2, fontsize=8,
               title='Province', title_fontsize=9,
               bbox_to_anchor=(0.98, 0.02), frameon=True,
               edgecolor=RULE, facecolor='white')

    fig.suptitle(
        'Figure 4.4  Relationship Between OSM Features and Predicted Wealth Index\n'
        'Black line indicates a locally weighted smooth curve  ·  '
        'n = 1,112 prediction points',
        fontsize=11, y=1.02
    )
    fig.tight_layout(rect=[0, 0.04, 1, 1])
    fig.savefig(f'{OUT_DIR}/fig4_4_osm_correlations.png', bbox_inches='tight')
    plt.close()
    print('  Fig 4.4 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE 4.5 — Global SHAP Feature Importance Bar Chart
# ═════════════════════════════════════════════════════════════════════════════

def figure_4_5():
    """
    Horizontal bar chart of top N features by mean |SHAP value|.
    LSTM dimensions are aggregated into a single 'Temporal (LSTM)' bar.
    """
    # Compute mean absolute SHAP per feature
    all_shap_cols = lstm_cols + static_cols
    mean_abs = {col: df[col].abs().mean() for col in all_shap_cols}

    # Aggregate all LSTM dims into one entry
    lstm_total = df[lstm_cols].abs().sum(axis=1).mean()

    importance = {col: val for col, val in mean_abs.items()
                  if col not in lstm_cols}
    importance['Temporal (LSTM, 64 dims)'] = lstm_total

    # Sort descending
    imp_df = (pd.Series(importance)
              .sort_values(ascending=True)
              .tail(20))          # top 20

    # Assign colours
    def get_color(feat):
        if 'LSTM' in feat: return CAT_COLORS['Temporal']
        for key in CAT_MAP:
            if key == feat: return CAT_COLORS.get(CAT_MAP[key], SLATE)
        if feat.startswith('LU_'):       return CAT_COLORS['Landuse']
        if feat.startswith('Bldg_'):     return CAT_COLORS['Building']
        if feat.startswith('POI_'):      return CAT_COLORS['POI']
        if 'Road' in feat or 'Track' in feat: return CAT_COLORS['Road']
        if 'VIIRS' in feat:             return CAT_COLORS['Satellite']
        return SLATE

    colors = [get_color(f) for f in imp_df.index]

    # Clean feature labels
    labels = [f.replace('_', ' ').replace(' m2', ' (m²)') for f in imp_df.index]

    fig, ax = plt.subplots(figsize=(8, 8))
    bars = ax.barh(labels, imp_df.values, color=colors,
                   edgecolor='white', linewidth=0.4, height=0.72)

    # Value labels
    for bar, val in zip(bars, imp_df.values):
        ax.text(val + imp_df.values.max()*0.01, bar.get_y() + bar.get_height()/2,
                f'{val:.4f}', va='center', fontsize=7.5, color='#333')

    ax.set_xlabel('Mean |SHAP Value|', fontsize=11)
    ax.set_title('Figure 4.5  Global SHAP Feature Importance\n'
                 'Top 20 features · n = 1,112 inference points · '
                 'Kernel SHAP · 200 background · 500 coalitions',
                 fontsize=11)
    ax.set_xlim(0, imp_df.values.max() * 1.15)
    ax.grid(axis='x', linestyle='--', alpha=0.35)
    ax.tick_params(axis='y', labelsize=9)

    # Category legend
    legend_handles = [mpatches.Patch(color=v, label=k)
                      for k, v in CAT_COLORS.items()]
    ax.legend(handles=legend_handles, title='Feature Category',
              loc='lower right', fontsize=9, title_fontsize=10)

    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/fig4_5_shap_importance.png')
    plt.close()
    print('  Fig 4.5 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE 4.6 — SHAP Category Split (Donut + Grouped Bar)
# ═════════════════════════════════════════════════════════════════════════════

def figure_4_6():
    """
    Left: donut chart of SHAP contribution by category.
    Right: stacked bar chart per province showing SHAP composition.
    """
    # Compute per-point category SHAP totals
    cat_totals = {}
    cat_totals['Temporal'] = df[lstm_cols].abs().sum(axis=1)

    for col in static_cols:
        cat = CAT_MAP.get(col)
        if cat is None:
            if col.startswith('LU_'):       cat = 'Landuse'
            elif col.startswith('Bldg_'):   cat = 'Building'
            elif col.startswith('POI_'):    cat = 'POI'
            elif 'Road' in col or 'Track' in col: cat = 'Road'
            elif 'VIIRS' in col:            cat = 'Satellite'
            else:                           cat = 'Other'
        if cat not in cat_totals:
            cat_totals[cat] = pd.Series(np.zeros(len(df)))
        cat_totals[cat] = cat_totals[cat] + df[col].abs()

    cat_means = {k: v.mean() for k, v in cat_totals.items()}
    total = sum(cat_means.values())
    cat_pcts = {k: v/total*100 for k, v in cat_means.items()}

    # Order: Temporal first, then static by descending contribution
    ordered_cats = ['Temporal'] + sorted(
        [c for c in cat_pcts if c != 'Temporal'],
        key=lambda c: cat_pcts[c], reverse=True
    )
    sizes   = [cat_pcts[c] for c in ordered_cats]
    colors  = [CAT_COLORS.get(c, SLATE) for c in ordered_cats]
    explode = [0.03] * len(ordered_cats)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 6))

    # Donut
    wedges, texts, autotexts = ax1.pie(
        sizes, labels=None, colors=colors, explode=explode,
        autopct='%1.1f%%', pctdistance=0.78,
        startangle=90, counterclock=False,
        wedgeprops=dict(width=0.52, edgecolor='white', linewidth=1.5)
    )
    for at in autotexts:
        at.set_fontsize(9)
        at.set_fontweight('bold')
        at.set_color('white')

    # Centre text
    ax1.text(0, 0, 'SHAP\nContribution', ha='center', va='center',
             fontsize=10, fontweight='bold', color=NAVY)

    ax1.legend(wedges, [f'{c}  {cat_pcts[c]:.1f}%' for c in ordered_cats],
               loc='lower center', bbox_to_anchor=(0.5, -0.10),
               ncol=2, fontsize=9, frameon=False)
    ax1.set_title('(a) Study-wide SHAP Category Split\nn = 1,112 points', fontsize=11)

    # Per-province stacked bar
    prov_cat = {}
    for prov in PROV_ORDER:
        mask = df['Province'] == prov
        if mask.sum() == 0: continue
        prov_cat[prov] = {c: cat_totals[c][mask].mean() for c in ordered_cats}

    prov_labels = [p for p in PROV_ORDER if p in prov_cat]
    bottoms = np.zeros(len(prov_labels))
    for cat in ordered_cats:
        vals = np.array([prov_cat[p].get(cat, 0) for p in prov_labels])
        ax2.bar(range(len(prov_labels)), vals, bottom=bottoms,
                color=CAT_COLORS.get(cat, SLATE), label=cat,
                edgecolor='white', linewidth=0.4)
        bottoms += vals

    ax2.set_xticks(range(len(prov_labels)))
    ax2.set_xticklabels([p.replace(' del ', '\ndel ').replace(' Norte', '\nNorte')
                         .replace(' Sur', '\nSur').replace(' Oriental', '\nOriental')
                         for p in prov_labels],
                        fontsize=8, rotation=0, ha='center')
    ax2.set_ylabel('Mean Total |SHAP|', fontsize=11)
    ax2.set_title('(b) Mean SHAP Contribution by Province\nper feature category', fontsize=11)
    ax2.legend(loc='upper right', fontsize=9, ncol=1,
               title='Category', title_fontsize=9)
    ax2.grid(axis='y', linestyle='--', alpha=0.3)
    ax2.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.3f'))

    fig.suptitle('Figure 4.6  SHAP Feature Attribution by Category',
                 fontsize=12, fontweight='bold', y=1.01)
    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/fig4_6_shap_category.png', bbox_inches='tight')
    plt.close()
    print('  Fig 4.6 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE 4.9 — Predicted WI by Province (Box Plot)
# ═════════════════════════════════════════════════════════════════════════════

def figure_4_9():
    """
    Horizontal box plot sorted poorest → wealthiest by median predicted WI.
    Annotated with n per province and median value.
    """
    prov_data = [df.loc[df['Province'] == p, 'Predicted_Wealth'].dropna().values
                 for p in PROV_ORDER if p in df['Province'].values]
    prov_labels_used = [p for p in PROV_ORDER if p in df['Province'].values]
    colors_used = [PROVINCE_COLORS.get(p, OCEAN) for p in prov_labels_used]

    fig, ax = plt.subplots(figsize=(10, 7))

    bp = ax.boxplot(prov_data, vert=False, patch_artist=True,
                    notch=False, showfliers=True,
                    flierprops=dict(marker='o', markersize=3,
                                    markerfacecolor='#ccc', alpha=0.5,
                                    linewidth=0),
                    medianprops=dict(color='white', linewidth=2),
                    whiskerprops=dict(linewidth=1.0),
                    capprops=dict(linewidth=1.2),
                    boxprops=dict(linewidth=0.8))

    for patch, color in zip(bp['boxes'], colors_used):
        patch.set_facecolor(color)
        patch.set_alpha(0.85)

    # Annotations: n and median per box
    for i, (data, prov) in enumerate(zip(prov_data, prov_labels_used), start=1):
        med = np.median(data)
        n   = len(data)
        ax.text(med, i + 0.38, f'n={n}', ha='center', va='bottom',
                fontsize=7.5, color='#444')
        ax.text(0.02, i, f'{med:+.3f}', ha='left', va='center',
                transform=ax.get_yaxis_transform(),
                fontsize=7.5, color='white', fontweight='bold')

    # Vertical zero line
    ax.axvline(0, color='#888', linestyle='--', linewidth=0.9, zorder=1)
    ax.text(0, len(prov_labels_used) + 0.6, 'WI = 0', ha='center',
            fontsize=8, color='#666', style='italic')

    # Wealth class shading
    ax.axvspan(-2.5, -0.5, alpha=0.05, color=CORAL, zorder=0)
    ax.axvspan(-0.5,  0.5, alpha=0.05, color=AMBER, zorder=0)
    ax.axvspan( 0.5,  0.5, alpha=0.05, color=TEAL,  zorder=0)

    ax.set_yticks(range(1, len(prov_labels_used)+1))
    ax.set_yticklabels(prov_labels_used, fontsize=10)
    ax.set_xlabel('Predicted Wealth Index', fontsize=11)
    ax.set_title(
        'Figure 4.9  Distribution of Predicted Wealth Index by Province\n'
        'Sorted poorest to wealthiest by PSA 2023 poverty incidence  ·  '
        'n = 1,112 inference points',
        fontsize=11
    )
    ax.grid(axis='x', linestyle='--', alpha=0.3)

    # Legend: wealth classes
    class_patches = [
        mpatches.Patch(color=CORAL, alpha=0.35, label='Low wealth (WI < −0.50)'),
        mpatches.Patch(color=AMBER, alpha=0.35, label='Below avg (−0.50 ≤ WI < +0.50)'),
        mpatches.Patch(color=TEAL,  alpha=0.35, label='High wealth (WI ≥ +0.50)'),
    ]
    ax.legend(handles=class_patches, loc='lower right', fontsize=9)

    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/fig4_9_boxplot_by_province.png')
    plt.close()
    print('  Fig 4.9 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE 4.10 — DHS Survey WI vs Predicted WI by Province
# ═════════════════════════════════════════════════════════════════════════════

def figure_4_10():
    """
    Grouped bar chart: mean DHS actual WI (teal) vs mean predicted WI (navy)
    per province. Annotates MAE per province.
    """
    if df_master is None:
        print('  Fig 4.10 skipped — master_cluster_summary.csv not available.')
        return

    # Mean predicted WI per province (all 1,112 points)
    pred_means = (df.groupby('Province')['Predicted_Wealth']
                  .mean().reindex(PROV_ORDER))

    # Mean DHS WI per province (DHS-origin points only)
    dhs_pts = df_master[df_master['DHS_WI'].notna()].copy()
    dhs_pts = dhs_pts.merge(df[['PointID', 'Province']], on='PointID', how='left')
    dhs_means = (dhs_pts.groupby('Province')['DHS_WI']
                 .mean().reindex(PROV_ORDER))
    dhs_ns    = (dhs_pts.groupby('Province')['DHS_WI']
                 .count().reindex(PROV_ORDER).fillna(0).astype(int))

    # MAE per province (only where both exist)
    mae_per = {}
    for p in PROV_ORDER:
        if pd.notna(dhs_means.get(p)) and pd.notna(pred_means.get(p)):
            mae_per[p] = abs(dhs_means[p] - pred_means[p])

    valid_provs = [p for p in PROV_ORDER
                   if pd.notna(dhs_means.get(p)) and pd.notna(pred_means.get(p))]

    x = np.arange(len(valid_provs))
    w = 0.36

    fig, ax = plt.subplots(figsize=(12, 6))

    bars_dhs  = ax.bar(x - w/2,
                       [dhs_means[p] for p in valid_provs],
                       width=w, color=TEAL, alpha=0.85,
                       label='DHS Survey Mean WI (actual)',
                       edgecolor='white', linewidth=0.5, zorder=3)
    bars_pred = ax.bar(x + w/2,
                       [pred_means[p] for p in valid_provs],
                       width=w, color=NAVY, alpha=0.85,
                       label='Predicted Mean WI (CNN-LSTM)',
                       edgecolor='white', linewidth=0.5, zorder=3)

    # MAE annotations between bar pairs
    for i, prov in enumerate(valid_provs):
        mae = mae_per.get(prov)
        n   = dhs_ns.get(prov, 0)
        if mae is not None:
            y_top = max(dhs_means[prov], pred_means[prov]) + 0.03
            ax.annotate(f'MAE\n{mae:.3f}',
                        xy=(i, y_top), ha='center', va='bottom',
                        fontsize=7, color='#555')
        ax.text(i, min(dhs_means[prov], pred_means[prov]) - 0.06,
                f'n={n}', ha='center', va='top',
                fontsize=7, color='#777')

    ax.axhline(0, color='#888', linestyle='--', linewidth=0.9)
    ax.set_xticks(x)
    ax.set_xticklabels([p.replace(' del ', '\ndel ')
                          .replace(' Norte', '\nNorte')
                          .replace(' Sur', '\nSur')
                          .replace(' Oriental', '\nOriental')
                        for p in valid_provs],
                       fontsize=9)
    ax.set_ylabel('Wealth Index', fontsize=11)
    ax.set_title(
        'Figure 4.10  DHS Survey Mean WI vs Predicted Mean WI by Province\n'
        'MAE = mean absolute error between survey and model  ·  '
        'n = DHS-origin clusters per province',
        fontsize=11
    )
    ax.legend(loc='upper left', fontsize=10)
    ax.grid(axis='y', linestyle='--', alpha=0.3)
    ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%+.2f'))

    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/fig4_10_dhs_vs_predicted.png')
    plt.close()
    print('  Fig 4.10 saved')


# ═════════════════════════════════════════════════════════════════════════════
# Run all figures
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print('\nGenerating figures...')
    figure_4_2();  print()
    figure_4_4();  print()
    figure_4_5();  print()
    figure_4_6();  print()
    figure_4_9();  print()
    figure_4_10(); print()
    print(f'\nAll figures saved to {os.path.abspath(OUT_DIR)}/')
    print('Figures generated:')
    for f in sorted(os.listdir(OUT_DIR)):
        size = os.path.getsize(f'{OUT_DIR}/{f}') // 1024
        print(f'  {f}  ({size} KB)')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE A.1 — Hyperparameter Sensitivity Panel
# ═════════════════════════════════════════════════════════════════════════════
# Requires: a CSV with one row per hyperparameter trial.
# Expected columns: lstm_units, dropout_dyn, dense_static_units, dropout_stat,
#                   fusion_units, dropout_fusion, l2_reg, lr, val_r2, val_rmse
# Set HPARAM_CSV path below, or leave None to skip.

HPARAM_CSV = None
# e.g. '/Users/ruben/Desktop/Thesis/TrainingData/final-data/output/hparam_results.csv'

def figure_A1():
    if HPARAM_CSV is None or not os.path.exists(HPARAM_CSV):
        print('  Fig A.1 skipped — set HPARAM_CSV path in the script.')
        return

    hp = pd.read_csv(HPARAM_CSV)
    # Detect metric column
    metric_col = next((c for c in ['val_r2','val_R2','r2','fitness'] if c in hp.columns), None)
    if metric_col is None:
        print('  Fig A.1 skipped — could not find val_r2 column in HPARAM_CSV.')
        return

    param_cols = [c for c in hp.columns if c != metric_col]
    ncols = 4
    nrows = int(np.ceil(len(param_cols) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(14, 3.5 * nrows))
    axes = np.array(axes).flatten()

    metric = hp[metric_col].values
    best_idx = np.argmax(metric)
    norm = plt.Normalize(metric.min(), metric.max())
    cmap = plt.cm.viridis

    for i, col in enumerate(param_cols):
        ax = axes[i]
        sc = ax.scatter(hp[col], metric, c=metric, cmap=cmap, norm=norm,
                        s=45, alpha=0.8, edgecolors='white', linewidths=0.4, zorder=3)
        # Mark best
        ax.scatter(hp[col].iloc[best_idx], metric[best_idx],
                   marker='*', s=200, color='gold', edgecolors='#333',
                   linewidths=0.5, zorder=5)
        ax.set_xlabel(col.replace('_', ' '), fontsize=9)
        ax.set_ylabel('Val R²', fontsize=9)
        ax.set_title(f'{col} = {hp[col].iloc[best_idx]:.4g}', fontsize=9)
        ax.grid(True, linestyle='--', alpha=0.3)
        ax.tick_params(labelsize=7)

    # Hide unused subplots
    for j in range(len(param_cols), len(axes)):
        axes[j].set_visible(False)

    # Shared colorbar
    cbar_ax = fig.add_axes([0.92, 0.15, 0.015, 0.7])
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=norm)
    sm.set_array([])
    fig.colorbar(sm, cax=cbar_ax, label='Validation R²')

    best_r2 = metric[best_idx]
    fig.suptitle(f'Figure A.1  Hyperparameter Sensitivity — Best Val R² = {best_r2:.4f}\n'
                 '★ = best configuration', fontsize=12, fontweight='bold')
    fig.tight_layout(rect=[0, 0, 0.91, 0.95])
    fig.savefig(f'{OUT_DIR}/figA1_hyperparameter_tuning.png', bbox_inches='tight')
    plt.close()
    print('  Fig A.1 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE A.2 — Training & Validation Loss Curves
# ═════════════════════════════════════════════════════════════════════════════
# Requires: a CSV with training history per fold.
# Expected columns: fold, epoch, train_loss, val_loss
# OR a single fold: epoch, train_loss, val_loss
# Set HISTORY_CSV path below, or leave None to skip.

HISTORY_CSV = None
# e.g. '/Users/ruben/Desktop/Thesis/TrainingData/final-data/output/training_history.csv'

def figure_A2():
    if HISTORY_CSV is None or not os.path.exists(HISTORY_CSV):
        print('  Fig A.2 skipped — set HISTORY_CSV path in the script.')
        return

    hist = pd.read_csv(HISTORY_CSV)
    has_folds = 'fold' in hist.columns

    if has_folds:
        folds = sorted(hist['fold'].unique())
        ncols = min(len(folds), 5)
        fig, axes = plt.subplots(1, ncols, figsize=(3.2 * ncols, 4),
                                 sharey=True)
        if ncols == 1: axes = [axes]

        palette = [OCEAN, TEAL, AMBER, VIOLET, CORAL]
        for i, (fold, ax) in enumerate(zip(folds, axes)):
            sub = hist[hist['fold'] == fold].sort_values('epoch')
            color = palette[i % len(palette)]
            ax.plot(sub['epoch'], sub['train_loss'], '-',
                    color=color, alpha=0.6, linewidth=1.4, label='Train MSE')
            ax.plot(sub['epoch'], sub['val_loss'], '-',
                    color=NAVY, linewidth=1.8, label='Val MSE')

            # Early stopping marker
            best_ep = sub.loc[sub['val_loss'].idxmin(), 'epoch']
            best_val = sub['val_loss'].min()
            ax.axvline(best_ep, color='#888', linestyle=':', linewidth=0.9)
            ax.scatter([best_ep], [best_val], color='gold', s=60,
                       edgecolors='#333', linewidths=0.5, zorder=5)

            ax.set_xlabel('Epoch', fontsize=9)
            ax.set_title(f'Fold {fold}\nBest val MSE = {best_val:.4f}\n@ epoch {best_ep}',
                         fontsize=9)
            ax.grid(True, linestyle='--', alpha=0.3)
            ax.tick_params(labelsize=8)
            if i == 0:
                ax.set_ylabel('MSE Loss', fontsize=10)
                ax.legend(fontsize=8)
    else:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.5))
        hist = hist.sort_values('epoch')
        ax1.plot(hist['epoch'], hist['train_loss'], '-',
                 color=OCEAN, linewidth=1.6, label='Training MSE', alpha=0.7)
        ax1.plot(hist['epoch'], hist['val_loss'], '-',
                 color=NAVY, linewidth=2.0, label='Validation MSE')
        best_ep  = hist.loc[hist['val_loss'].idxmin(), 'epoch']
        best_val = hist['val_loss'].min()
        ax1.axvline(best_ep, color='#888', linestyle=':', linewidth=0.9,
                    label=f'Early stop (ep {best_ep})')
        ax1.scatter([best_ep], [best_val], color='gold', s=80,
                    edgecolors='#333', linewidths=0.5, zorder=5)
        ax1.set_xlabel('Epoch', fontsize=11)
        ax1.set_ylabel('MSE Loss', fontsize=11)
        ax1.set_title('(a) Training & Validation Loss Curve', fontsize=11)
        ax1.legend(fontsize=9)
        ax1.grid(True, linestyle='--', alpha=0.3)

        # Log scale version
        ax2.semilogy(hist['epoch'], hist['train_loss'], '-',
                     color=OCEAN, linewidth=1.6, alpha=0.7, label='Training MSE')
        ax2.semilogy(hist['epoch'], hist['val_loss'], '-',
                     color=NAVY, linewidth=2.0, label='Validation MSE')
        ax2.axvline(best_ep, color='#888', linestyle=':', linewidth=0.9)
        ax2.set_xlabel('Epoch', fontsize=11)
        ax2.set_ylabel('MSE Loss (log scale)', fontsize=11)
        ax2.set_title('(b) Loss Curve — Log Scale', fontsize=11)
        ax2.legend(fontsize=9)
        ax2.grid(True, linestyle='--', alpha=0.3)

    fig.suptitle('Figure A.2  CNN-LSTM Training and Validation Loss Curves\n'
                 '★ = epoch with minimum validation MSE (early stopping point)',
                 fontsize=11, fontweight='bold')
    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/figA2_loss_curves.png', bbox_inches='tight')
    plt.close()
    print('  Fig A.2 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE A.3 — Residual Analysis Panel  (requires master_cluster_summary.csv)
# ═════════════════════════════════════════════════════════════════════════════

def figure_A3():
    if df_master is None:
        print('  Fig A.3 skipped — master_cluster_summary.csv not available.')
        return

    dhs_pts = df_master[df_master['DHS_WI'].notna()].copy()
    dhs_pts = dhs_pts.merge(
        df[['PointID', 'Predicted_Wealth', 'Province', 'VIIRS_Median']],
        on='PointID', how='inner'
    )

    residuals = dhs_pts['Predicted_Wealth'].values - dhs_pts['DHS_WI'].values
    abs_err   = np.abs(residuals)
    pred_wi   = dhs_pts['Predicted_Wealth'].values
    actual_wi = dhs_pts['DHS_WI'].values
    viirs     = dhs_pts['VIIRS_Median'].values if 'VIIRS_Median' in dhs_pts.columns else None

    fig, axes = plt.subplots(2, 2, figsize=(11, 9))
    (ax1, ax2), (ax3, ax4) = axes

    # ── (a) Residual histogram ───────────────────────────────────────────
    ax1.hist(residuals, bins=25, color=OCEAN, edgecolor='white',
             linewidth=0.5, alpha=0.85)
    ax1.axvline(0, color=NAVY, linewidth=1.5, linestyle='--')
    ax1.axvline(residuals.mean(), color=CORAL, linewidth=1.2,
                linestyle='-', label=f'Mean = {residuals.mean():.4f}')
    ax1.set_xlabel('Residual (Predicted − Actual WI)', fontsize=10)
    ax1.set_ylabel('Count', fontsize=10)
    ax1.set_title('(a) Residual Distribution', fontsize=11)
    ax1.legend(fontsize=9)

    # Annotate SD and MAE
    txt = (f'Mean = {residuals.mean():.4f}\n'
           f'SD = {residuals.std():.4f}\n'
           f'MAE = {abs_err.mean():.4f}')
    ax1.text(0.97, 0.95, txt, transform=ax1.transAxes,
             va='top', ha='right', fontsize=9,
             bbox=dict(boxstyle='round,pad=0.4', facecolor=CREAM, edgecolor=RULE))
    ax1.grid(True, linestyle='--', alpha=0.3)

    # ── (b) Residual vs predicted WI ────────────────────────────────────
    for prov in PROV_ORDER:
        mask = dhs_pts['Province'].values == prov
        if mask.sum() == 0: continue
        ax2.scatter(pred_wi[mask], residuals[mask],
                    color=PROVINCE_COLORS.get(prov, OCEAN),
                    alpha=0.65, s=22, edgecolors='white',
                    linewidths=0.3, label=prov, zorder=3)
    ax2.axhline(0, color='#888', linestyle='--', linewidth=1.0)
    # LOESS-style smooth
    idx_s = np.argsort(pred_wi)
    smooth_res = gaussian_filter1d(residuals[idx_s], sigma=max(3, len(idx_s)//20))
    ax2.plot(pred_wi[idx_s], smooth_res, '-', color=NAVY,
             linewidth=1.8, label='Smooth trend', zorder=5)
    ax2.set_xlabel('Predicted Wealth Index', fontsize=10)
    ax2.set_ylabel('Residual (Predicted − Actual)', fontsize=10)
    ax2.set_title('(b) Residuals vs Predicted WI', fontsize=11)
    ax2.legend(fontsize=7, ncol=2)
    ax2.grid(True, linestyle='--', alpha=0.3)

    # ── (c) Q-Q plot ─────────────────────────────────────────────────────
    from scipy import stats
    (osm_q, theor_q), (slope, intercept, r) = stats.probplot(residuals, fit=True)
    ax3.scatter(theor_q, osm_q, color=OCEAN, s=18, alpha=0.7,
                edgecolors='white', linewidths=0.3, zorder=3)
    q_min, q_max = theor_q.min(), theor_q.max()
    ax3.plot([q_min, q_max], [slope*q_min+intercept, slope*q_max+intercept],
             '-', color=NAVY, linewidth=1.8, label=f'Reference line (r={r:.3f})')
    ax3.set_xlabel('Theoretical Quantiles (Normal)', fontsize=10)
    ax3.set_ylabel('Sample Quantiles (Residuals)', fontsize=10)
    ax3.set_title('(c) Q-Q Plot of Residuals', fontsize=11)
    ax3.legend(fontsize=9)
    ax3.grid(True, linestyle='--', alpha=0.3)

    # ── (d) Absolute error vs VIIRS or actual WI ─────────────────────────
    x_d   = viirs if viirs is not None else actual_wi
    x_lab = 'VIIRS Median (nW/cm²/sr)' if viirs is not None else 'Actual DHS WI'
    ax4.scatter(x_d, abs_err, color=TEAL, alpha=0.55, s=18,
                edgecolors='white', linewidths=0.3, zorder=3)
    # Smooth
    idx_s4 = np.argsort(x_d)
    smooth_ae = gaussian_filter1d(abs_err[idx_s4], sigma=max(3, len(idx_s4)//20))
    ax4.plot(x_d[idx_s4], smooth_ae, '-', color=NAVY, linewidth=1.8,
             label='Smooth trend', zorder=5)
    ax4.set_xlabel(x_lab, fontsize=10)
    ax4.set_ylabel('Absolute Error |Predicted − Actual|', fontsize=10)
    ax4.set_title('(d) Absolute Error vs ' + ('VIIRS Luminosity' if viirs is not None
                  else 'Actual WI'), fontsize=11)
    ax4.legend(fontsize=9)
    ax4.grid(True, linestyle='--', alpha=0.3)

    fig.suptitle(
        f'Figure A.3  Residual Analysis — DHS-origin Clusters (n={len(dhs_pts)})\n'
        f'Residual = Predicted WI − Actual DHS WI  ·  '
        f'Overall MAE = {abs_err.mean():.4f}  ·  RMSE = {np.sqrt((residuals**2).mean()):.4f}',
        fontsize=11, fontweight='bold'
    )
    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/figA3_residual_analysis.png', bbox_inches='tight')
    plt.close()
    print('  Fig A.3 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE B.1 — Cross-Validation Fold Radar
# ═════════════════════════════════════════════════════════════════════════════

def figure_B1():
    """
    Radar chart with one polygon per CV fold.
    Axes: R², Pearson r, 1−RMSE (normalized), 1−MAE (normalized).
    Uses the known final model CV results.
    """
    # Final model 5-fold results
    fold_results = {
        'Fold 1': {'R²': 0.5019, 'r': 0.7105, 'RMSE': 0.4811},
        'Fold 2': {'R²': 0.5411, 'r': 0.7363, 'RMSE': 0.4651},
        'Fold 3': {'R²': 0.5512, 'r': 0.7441, 'RMSE': 0.4688},
        'Fold 4': {'R²': 0.5103, 'r': 0.7162, 'RMSE': 0.4801},
        'Fold 5': {'R²': 0.5177, 'r': 0.7292, 'RMSE': 0.4702},
    }
    mean_res = {
        'R²'  : np.mean([v['R²']   for v in fold_results.values()]),
        'r'   : np.mean([v['r']    for v in fold_results.values()]),
        'RMSE': np.mean([v['RMSE'] for v in fold_results.values()]),
    }

    # Normalize each metric to [0,1] range for radar
    # R²: 0 worst → 1 best; r: 0 worst → 1 best; RMSE: inverted (lower = better)
    all_r2   = [v['R²'] for v in fold_results.values()]
    all_r    = [v['r']  for v in fold_results.values()]
    all_rmse = [v['RMSE'] for v in fold_results.values()]

    r2_min, r2_max     = min(all_r2),   max(all_r2)
    r_min,  r_max      = min(all_r),    max(all_r)
    rmse_min,rmse_max  = min(all_rmse), max(all_rmse)

    def norm_metric(val, lo, hi, invert=False):
        n = (val - lo) / (hi - lo + 1e-9)
        return 1 - n if invert else n

    # Axes: R², r, 1-RMSE, mean performance
    categories = ['R²', 'Pearson r', 'Consistency\n(1−norm RMSE)', 'Overall\n(mean)']
    N = len(categories)
    angles = np.linspace(0, 2*np.pi, N, endpoint=False).tolist()
    angles += angles[:1]

    fold_colors = [OCEAN, TEAL, AMBER, VIOLET, CORAL]

    fig, ax = plt.subplots(figsize=(7, 7),
                           subplot_kw=dict(polar=True))

    for (fold, res), color in zip(fold_results.items(), fold_colors):
        n_r2   = norm_metric(res['R²'],  r2_min,   r2_max)
        n_r    = norm_metric(res['r'],   r_min,    r_max)
        n_rmse = norm_metric(res['RMSE'],rmse_min, rmse_max, invert=True)
        n_mean = np.mean([n_r2, n_r, n_rmse])
        vals   = [n_r2, n_r, n_rmse, n_mean] + [n_r2]  # close loop

        ax.plot(angles, vals, '-o', color=color, linewidth=1.8,
                markersize=5, label=fold, alpha=0.85)
        ax.fill(angles, vals, color=color, alpha=0.08)

    # Mean polygon
    n_r2_m   = norm_metric(mean_res['R²'],   r2_min,   r2_max)
    n_r_m    = norm_metric(mean_res['r'],    r_min,    r_max)
    n_rmse_m = norm_metric(mean_res['RMSE'], rmse_min, rmse_max, invert=True)
    n_mean_m = np.mean([n_r2_m, n_r_m, n_rmse_m])
    vals_m   = [n_r2_m, n_r_m, n_rmse_m, n_mean_m] + [n_r2_m]
    ax.plot(angles, vals_m, '--', color=NAVY, linewidth=2.5,
            label=f'Mean (R²={mean_res["R²"]:.4f}, r={mean_res["r"]:.4f})',
            alpha=0.9, zorder=6)

    # Axis labels with actual values
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, fontsize=10)
    ax.set_yticklabels([])
    ax.set_ylim(0, 1)
    ax.grid(color=RULE, linewidth=0.7)
    ax.set_facecolor('#fafcfd')

    # Annotate actual metric values per axis
    for angle, cat, val in zip(angles[:-1],
                                ['R²', 'r', 'RMSE', ''],
                                [mean_res['R²'], mean_res['r'], mean_res['RMSE'], 0]):
        if cat:
            ax.annotate(f'{val:.4f}', xy=(angle, 0.5),
                        xytext=(angle, 1.08),
                        fontsize=9, ha='center', va='center', color=NAVY,
                        fontweight='bold',
                        textcoords='data')

    ax.set_title('Figure B.1  Cross-Validation Fold Performance Radar\n'
                 'Normalized metrics — each axis: higher = better\n'
                 'RMSE axis is inverted (1 − norm) so higher = lower error',
                 fontsize=10, fontweight='bold', pad=28)
    ax.legend(loc='lower left', bbox_to_anchor=(1.05, 0), fontsize=9,
              frameon=True, edgecolor=RULE)

    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/figB1_cv_radar.png', bbox_inches='tight')
    plt.close()
    print('  Fig B.1 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE B.4 — SHAP Dependence Panel (top 6 static features)
# ═════════════════════════════════════════════════════════════════════════════

def figure_B4():
    """
    2×3 panel of SHAP dependence plots.
    x-axis = raw feature value
    y-axis = SHAP value for that feature
    color  = VIIRS_Median (proxy for economic activity level)
    """
    top_feats = [
        ('Total_Road_Length',    'Total Road Length (km)'),
        ('Total_POI_Count',      'Total POI Count'),
        ('VIIRS_Median',         'VIIRS Median (nW/cm²/sr)'),
        ('Bldg_school_Count',    'School Building Count'),
        ('POI_bank_Count',       'Bank Count'),
        ('POI_hospital_Count',   'Hospital Count'),
    ]
    # Filter to available columns
    top_feats = [(col, lbl) for col, lbl in top_feats if col in df.columns]
    if not top_feats:
        print('  Fig B.4 skipped — no matching static feature columns found.')
        return

    # Use VIIRS as interaction variable for color
    viirs_raw = df['VIIRS_Median'].values if 'VIIRS_Median' in df.columns else None
    viirs_norm = None
    if viirs_raw is not None:
        v_min, v_max = np.percentile(viirs_raw, [2, 98])
        viirs_norm = np.clip((viirs_raw - v_min) / (v_max - v_min + 1e-9), 0, 1)

    nrows, ncols = 2, 3
    fig, axes = plt.subplots(nrows, ncols, figsize=(13, 8))
    axes = axes.flatten()
    cmap = plt.cm.viridis

    for i, (col, xlabel) in enumerate(top_feats[:6]):
        ax   = axes[i]
        x    = df[col].values
        shap = df[col].values  # The SHAP CSV stores SHAP values in the feature columns

        # log1p for skewed features
        if col in ('Total_Road_Length', 'Total_POI_Count', 'Total_Bldg_Area',
                   'POI_restaurant_Count'):
            x_plot = np.log1p(x)
            xlab   = f'log(1 + {xlabel})'
        else:
            x_plot = x
            xlab   = xlabel

        if viirs_norm is not None:
            sc = ax.scatter(x_plot, shap, c=viirs_norm, cmap=cmap,
                            alpha=0.55, s=14, linewidths=0, zorder=3)
        else:
            ax.scatter(x_plot, shap, color=OCEAN,
                       alpha=0.55, s=14, linewidths=0, zorder=3)

        # Zero SHAP reference
        ax.axhline(0, color='#888', linestyle='--', linewidth=0.8)

        # Smooth trend
        idx_s = np.argsort(x_plot)
        smooth = gaussian_filter1d(shap[idx_s], sigma=max(3, len(idx_s)//20))
        ax.plot(x_plot[idx_s], smooth, '-', color='black', linewidth=1.8, zorder=5)

        # Pearson r between feature and SHAP value
        r_val, _ = pearsonr(x, shap)
        ax.set_title(f'r = {r_val:.3f}', fontsize=9, color='#444', pad=3)
        ax.set_xlabel(xlab, fontsize=8)
        ax.set_ylabel('SHAP Value', fontsize=8)
        ax.tick_params(labelsize=7)
        ax.grid(True, linestyle='--', alpha=0.25)

    # Colorbar for VIIRS interaction
    if viirs_norm is not None:
        sm = plt.cm.ScalarMappable(cmap=cmap,
                                   norm=plt.Normalize(
                                       np.percentile(viirs_raw, 2),
                                       np.percentile(viirs_raw, 98)))
        sm.set_array([])
        cbar = fig.colorbar(sm, ax=axes, orientation='vertical',
                            fraction=0.02, pad=0.02, shrink=0.7)
        cbar.set_label('VIIRS Median (nW/cm²/sr)', fontsize=9)

    fig.suptitle(
        'Figure B.4  SHAP Dependence Plots — Top 6 Static Features\n'
        'x-axis = feature value  ·  y-axis = SHAP contribution to predicted WI\n'
        'Color = VIIRS radiance (interaction variable)  ·  '
        'Black line = locally weighted smooth  ·  n = 1,112 points',
        fontsize=10, fontweight='bold', y=1.01
    )
    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/figB4_shap_dependence.png', bbox_inches='tight')
    plt.close()
    print('  Fig B.4 saved')


# ═════════════════════════════════════════════════════════════════════════════
# FIGURE B.2 — Province-Level MAE Bar Chart  (requires master_cluster_summary.csv)
# ═════════════════════════════════════════════════════════════════════════════

def figure_B2():
    if df_master is None:
        print('  Fig B.2 skipped — master_cluster_summary.csv not available.')
        return

    dhs = df_master[df_master['DHS_WI'].notna()].copy()
    dhs = dhs.merge(df[['PointID','Predicted_Wealth','Province']], on='PointID', how='inner')

    prov_stats = []
    for prov in PROV_ORDER:
        sub = dhs[dhs['Province'] == prov]
        if len(sub) == 0: continue
        mae  = (sub['Predicted_Wealth'] - sub['DHS_WI']).abs().mean()
        rmse = np.sqrt(((sub['Predicted_Wealth'] - sub['DHS_WI'])**2).mean())
        bias = (sub['Predicted_Wealth'] - sub['DHS_WI']).mean()
        prov_stats.append({'Province': prov, 'MAE': mae, 'RMSE': rmse,
                           'Bias': bias, 'n': len(sub)})
    prov_df = pd.DataFrame(prov_stats).sort_values('MAE', ascending=True)

    fig, ax = plt.subplots(figsize=(9, 6))
    y_pos = np.arange(len(prov_df))
    w = 0.35

    bars_mae  = ax.barh(y_pos - w/2, prov_df['MAE'],  height=w,
                        color=[PROVINCE_COLORS.get(p, OCEAN) for p in prov_df['Province']],
                        alpha=0.85, label='MAE', edgecolor='white', linewidth=0.4)
    bars_rmse = ax.barh(y_pos + w/2, prov_df['RMSE'], height=w,
                        color=[PROVINCE_COLORS.get(p, OCEAN) for p in prov_df['Province']],
                        alpha=0.45, label='RMSE', edgecolor='white', linewidth=0.4,
                        hatch='//')

    # Bias annotation
    for i, (_, row) in enumerate(prov_df.iterrows()):
        sign = '+' if row['Bias'] >= 0 else ''
        ax.text(max(row['MAE'], row['RMSE']) + 0.005, i,
                f"bias {sign}{row['Bias']:.3f}  n={row['n']}",
                va='center', fontsize=8, color='#555')

    ax.set_yticks(y_pos)
    ax.set_yticklabels(prov_df['Province'], fontsize=10)
    ax.set_xlabel('Error (Wealth Index units)', fontsize=11)
    ax.set_title(
        'Figure B.2  Province-Level Prediction Error\n'
        'DHS-origin clusters only  ·  bias = mean(Predicted − Actual)',
        fontsize=11
    )
    ax.legend(fontsize=10)
    ax.grid(axis='x', linestyle='--', alpha=0.3)
    overall_mae = (dhs['Predicted_Wealth'] - dhs['DHS_WI']).abs().mean()
    ax.axvline(overall_mae, color=NAVY, linestyle=':', linewidth=1.2,
               label=f'Overall MAE = {overall_mae:.4f}')

    fig.tight_layout()
    fig.savefig(f'{OUT_DIR}/figB2_province_mae.png', bbox_inches='tight')
    plt.close()
    print('  Fig B.2 saved')


# ── Run new figures ────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('\nGenerating additional performance figures...')
    figure_A1(); print()
    figure_A2(); print()
    figure_A3(); print()
    figure_B1(); print()
    figure_B2(); print()
    figure_B4(); print()
    print(f'\nAll figures saved to {os.path.abspath(OUT_DIR)}/')