"""
figC3_dhs_national_map.py  —  Project TALA manuscript figure
─────────────────────────────────────────────────────────────
Plots all 1,247 DHS training clusters (2022 Philippines DHS-VIII)
over a dual-layer PSA boundary map (municipality + province lines),
colored by Urban / Rural stratum from PHGE81FL.dbf.

Run locally. Requires the full shapefile sets in the same folders:
  PHGE81FL.shp + .shx + .dbf + .prj
  PH_Adm2_ProvDists.shp  + companions
  PH_Adm3_Municipalities.shp + companions
"""

import os
import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D

# ── PATHS — edit as needed ─────────────────────────────────────────────────────
DHS_SHP  = '/Users/ruben/Desktop/Thesis/TrainingData/PH_DHS_GPS/PHGE81FL/PHGE81FL.shp'
PROV_SHP = '/Users/ruben/Desktop/Thesis/2025Data/PH_Adm2_ProvDists.shp'
MUN_SHP  = '/Users/ruben/Desktop/Thesis/2025Data/PH_Adm3_MuniCities.shp'
OUT_PATH = '/Users/ruben/Desktop/Thesis/Code/Datamaraws_Manuscript/plots-new/figC3_dhs_national_map.png'

# ── PALETTE (consistent with generate_figures.py) ─────────────────────────────
RULE         = '#d4dfe6'
CREAM        = '#eaf1f5'
URBAN_COLOR  = '#c0392b'   # red  — urban clusters
RURAL_COLOR  = '#2471a3'   # blue — rural clusters
OCEAN_BG     = '#d6eaf8'   # sea background
LAND_FACE    = '#eef2f5'   # province fill
PROV_EDGE    = '#8fa8b8'   # province boundary line
MUN_EDGE     = '#b5c8d4'   # municipality boundary line (fainter)

plt.rcParams.update({
    'font.family'       : 'sans-serif',
    'font.size'         : 11,
    'axes.spines.top'   : False,
    'axes.spines.right' : False,
    'axes.spines.left'  : True,
    'axes.spines.bottom': True,
    'axes.linewidth'    : 0.6,
    'axes.edgecolor'    : '#aaa',
    'figure.dpi'        : 150,
    'savefig.dpi'       : 300,
    'savefig.facecolor' : 'white',
})

# ── LOAD DHS SHAPEFILE ─────────────────────────────────────────────────────────
print('Loading DHS GPS shapefile...')
dhs_gdf = gpd.read_file(DHS_SHP)
if dhs_gdf.crs and dhs_gdf.crs.to_epsg() != 4326:
    dhs_gdf = dhs_gdf.to_crs('EPSG:4326')
print(f'  Clusters : {len(dhs_gdf)}')
print(f'  Columns  : {dhs_gdf.columns.tolist()}')

# Locate the Urban/Rural column (standard DHS name is URBAN_RURA)
ur_col = next(
    (c for c in ['URBAN_RURA', 'URBAN_RURAL', 'URBAN_RUR', 'URBRUR']
     if c in dhs_gdf.columns),
    None
)
if ur_col:
    dhs_gdf['ur'] = dhs_gdf[ur_col].astype(str).str.strip().str.upper()
    print(f'  U/R col  : {ur_col}')
    print(f'  Split    : {dhs_gdf["ur"].value_counts().to_dict()}')
else:
    print('  WARNING: No Urban/Rural column found in .dbf.')
    print('           Ensure PHGE81FL.dbf is in the same folder as .shp.')
    dhs_gdf['ur'] = 'U'

urban = dhs_gdf[dhs_gdf['ur'] == 'U']
rural = dhs_gdf[dhs_gdf['ur'] == 'R']

# ── LOAD PSA SHAPEFILES ────────────────────────────────────────────────────────
print('\nLoading PSA municipality boundaries...')
mun = gpd.read_file(MUN_SHP)
if mun.crs and mun.crs.to_epsg() != 4326:
    mun = mun.to_crs('EPSG:4326')
print(f'  Municipalities: {len(mun)} polygons')

print('Loading PSA province boundaries...')
prov = gpd.read_file(PROV_SHP)
if prov.crs and prov.crs.to_epsg() != 4326:
    prov = prov.to_crs('EPSG:4326')
print(f'  Provinces     : {len(prov)} polygons')

# ── FIGURE ────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(8.5, 13))
ax.set_facecolor(OCEAN_BG)
fig.patch.set_facecolor('white')

# Layer 1: Municipality polygons (fills land, draws faint interior lines)
mun.plot(
    ax=ax,
    facecolor=LAND_FACE,
    edgecolor=MUN_EDGE,
    linewidth=0.20,
    zorder=1
)

# Layer 2: Province boundaries on top (stronger lines)
prov.boundary.plot(
    ax=ax,
    edgecolor=PROV_EDGE,
    linewidth=0.65,
    zorder=2
)

# Layer 3: Rural clusters — blue triangles (beneath urban)
if len(rural) > 0:
    ax.scatter(
        rural.geometry.x, rural.geometry.y,
        marker='^',
        color=RURAL_COLOR,
        s=16,
        edgecolors='white',
        linewidths=0.3,
        alpha=0.78,
        zorder=4,
        label=f'Rural  (n={len(rural):,})'
    )

# Layer 4: Urban clusters — red circles (on top)
if len(urban) > 0:
    ax.scatter(
        urban.geometry.x, urban.geometry.y,
        marker='o',
        color=URBAN_COLOR,
        s=18,
        edgecolors='white',
        linewidths=0.3,
        alpha=0.85,
        zorder=5,
        label=f'Urban  (n={len(urban):,})'
    )

# ── Island group labels ────────────────────────────────────────────────────────
for lon, lat, label in [
    (121.3, 17.2, 'LUZON'),
    (124.3, 11.2, 'VISAYAS'),
    (125.2,  7.5, 'MINDANAO'),
]:
    ax.text(
        lon, lat, label,
        fontsize=9.5, color='#5d8aa8',
        ha='center', va='center',
        fontweight='bold', style='italic',
        alpha=0.55, zorder=3
    )

# ── Axes bounds, grid, labels ─────────────────────────────────────────────────
bounds = prov.total_bounds   # [minx, miny, maxx, maxy]
pad_x  = (bounds[2] - bounds[0]) * 0.025
pad_y  = (bounds[3] - bounds[1]) * 0.025
ax.set_xlim(bounds[0] - pad_x, bounds[2] + pad_x)
ax.set_ylim(bounds[1] - pad_y, bounds[3] + pad_y)
ax.set_xlabel('Longitude (°E)', fontsize=10, labelpad=6)
ax.set_ylabel('Latitude (°N)',  fontsize=10, labelpad=6)
ax.tick_params(labelsize=8.5)
ax.grid(True, linestyle='--', alpha=0.18, color='white', zorder=0)

# ── Title ─────────────────────────────────────────────────────────────────────
ax.set_title(
    f'Spatial Distribution of 2022 DHS Training Clusters\n',
    fontsize=11, fontweight='bold', pad=14
)

# ── Legend ────────────────────────────────────────────────────────────────────
ax.legend(
    handles=[
        Line2D([0], [0], marker='o', color='w',
               markerfacecolor=URBAN_COLOR, markeredgecolor='white',
               markersize=7.5, label=f'Urban cluster  (n={len(urban):,})'),
        Line2D([0], [0], marker='^', color='w',
               markerfacecolor=RURAL_COLOR, markeredgecolor='white',
               markersize=7.5, label=f'Rural cluster  (n={len(rural):,})'),
        mpatches.Patch(facecolor=LAND_FACE, edgecolor=PROV_EDGE,
                       linewidth=0.8,
                       label='Province boundary'),
    ],
    loc='lower left', fontsize=9,
    frameon=True, edgecolor=RULE, facecolor='white',
    framealpha=0.95, borderpad=0.7,
    handlelength=1.5, handletextpad=0.6
)

# ── Displacement note ─────────────────────────────────────────────────────────
ax.text(
    0.995, 0.005,
    'Source: 2022 Philippines DHS-VIII (PSA / USAID)\n'
    'GPS coordinates randomly displaced up to 5 km (rural)\n'
    'and 2 km (urban) per DHS anonymisation protocol.',
    transform=ax.transAxes,
    fontsize=7.5, color='#555',
    ha='right', va='bottom', style='italic',
    bbox=dict(boxstyle='round,pad=0.45',
              facecolor=CREAM, edgecolor=RULE, alpha=0.88)
)

# ── Save ──────────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
fig.savefig(OUT_PATH, bbox_inches='tight', dpi=300)
plt.close()
print(f'\nSaved → {OUT_PATH}')
