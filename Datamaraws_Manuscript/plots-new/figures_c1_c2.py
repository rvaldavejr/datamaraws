"""
New figures to append to generate_figures.py
─────────────────────────────────────────────
figure_C1 : DHS cluster distribution map
figure_C2 : Grouped bar chart — mean WI per province, three series

ADD to the paths block at the top of generate_figures.py:
    MASTER_2022_CSV = '/Users/ruben/Desktop/Thesis/2025Data/expanded_provinces/output_2022_dhs/master_cluster_summary_2022.csv'

ADD to the data-loading block (after df_master is loaded):
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

ADD to __main__ call list:
    figure_C1(); print()
    figure_C2(); print()
"""

import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D


# ══════════════════════════════════════════════════════════════════════════════
# FIG C.1 — DHS CLUSTER DISTRIBUTION MAP
# ══════════════════════════════════════════════════════════════════════════════

def figure_C1():
    """
    Scatter map of 317 DHS-origin clusters, colored by province,
    circles = urban, triangles = rural (from DHS GPS record).
    """
    dhs = df_pts[df_pts['source'] == 'DHS'].copy()
    if len(dhs) == 0:
        print('  Fig C.1 skipped — no DHS rows in prediction_points.csv')
        return

    fig, ax = plt.subplots(figsize=(6.5, 10))
    ax.set_facecolor('#eaf4fb')
    fig.patch.set_facecolor('white')

    # ── Plot each province ────────────────────────────────────────────────────
    for prov in PROV_ORDER:
        sub   = dhs[dhs['Province'] == prov]
        if len(sub) == 0:
            continue
        color = PROVINCE_COLORS.get(prov, OCEAN)
        urban = sub[sub['Urban_Rural'] == 'U']
        rural = sub[sub['Urban_Rural'] == 'R']

        if len(urban) > 0:
            ax.scatter(
                urban['Longitude'], urban['Latitude'],
                color=color, marker='o', s=55,
                edgecolors='white', linewidths=0.4,
                alpha=0.92, zorder=4
            )
        if len(rural) > 0:
            ax.scatter(
                rural['Longitude'], rural['Latitude'],
                color=color, marker='^', s=60,
                edgecolors='white', linewidths=0.4,
                alpha=0.92, zorder=4
            )

    # ── Island group labels ───────────────────────────────────────────────────
    for lon, lat, label in [
        (121.0, 17.2, 'LUZON'),
        (124.0, 11.5, 'VISAYAS'),
        (125.2,  7.5, 'MINDANAO'),
    ]:
        ax.text(lon, lat, label,
                fontsize=9, color='#7a9eb5', ha='center', va='center',
                fontweight='bold', alpha=0.50, style='italic', zorder=2)

    # ── Axes ──────────────────────────────────────────────────────────────────
    ax.set_xlim(117.5, 127.8)
    ax.set_ylim(4.0, 20.5)
    ax.set_xlabel('Longitude (°E)', fontsize=10)
    ax.set_ylabel('Latitude (°N)',  fontsize=10)
    ax.grid(True, linestyle='--', alpha=0.35, color=RULE, zorder=1)
    ax.tick_params(labelsize=8)

    n_u = (dhs['Urban_Rural'] == 'U').sum()
    n_r = (dhs['Urban_Rural'] == 'R').sum()
    ax.set_title(
        f'Figure C.1  Spatial Distribution of DHS Survey Clusters\n'
        f'n = {len(dhs)}  ·  16 localities  ·  '
        f'{n_u} urban (○)  ·  {n_r} rural (△)',
        fontsize=11, pad=10
    )

    # ── Legend: marker shape (U/R) ────────────────────────────────────────────
    shape_handles = [
        Line2D([0], [0], marker='o', color='w', markerfacecolor='#555',
               markeredgecolor='white', markersize=7, label='Urban cluster'),
        Line2D([0], [0], marker='^', color='w', markerfacecolor='#555',
               markeredgecolor='white', markersize=7, label='Rural cluster'),
    ]

    # ── Legend: province colors ───────────────────────────────────────────────
    prov_handles = [
        mpatches.Patch(
            facecolor=PROVINCE_COLORS.get(p, OCEAN),
            edgecolor='white', linewidth=0.3,
            label=f'{p} (n={len(dhs[dhs["Province"]==p])})'
        )
        for p in PROV_ORDER if len(dhs[dhs['Province'] == p]) > 0
    ]

    # Two-section legend
    leg1 = ax.legend(
        handles=shape_handles,
        loc='lower left', fontsize=8,
        title='Cluster type', title_fontsize=8,
        frameon=True, edgecolor=RULE, facecolor='white',
        bbox_to_anchor=(0.01, 0.01)
    )
    ax.add_artist(leg1)
    ax.legend(
        handles=prov_handles,
        loc='lower right', fontsize=7,
        title='Province', title_fontsize=8,
        frameon=True, edgecolor=RULE, facecolor='white',
        ncol=1, bbox_to_anchor=(0.99, 0.01)
    )

    fig.savefig(f'{OUT_DIR}/figC1_dhs_distribution_map.png',
                bbox_inches='tight', dpi=300)
    plt.close()
    print('  Fig C.1 saved')


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
    for i, (p, n) in enumerate(zip(provs, n_dhs)):
        ax.text(
            x[i], ax.get_ylim()[0],
            f'n={n}',
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
        'Figure C.2  Mean Predicted vs Actual Wealth Index per Province\n'
        'DHS-origin clusters only  ·  Ordered poorest to wealthiest  ·  '
        'n labels = DHS clusters per province',
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
