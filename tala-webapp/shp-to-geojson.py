"""
convert_shp_to_geojson.py
=========================
Converts PH_Adm2_ProvDists.shp and PH_Adm3_Municipalities.shp to
lightweight GeoJSON files for Map.tsx.

Three size-reduction steps (applied in order):
  1. Column filter  — keep only the fields Map.tsx needs (promoteId + debug).
  2. Geometry simplification — Douglas-Peucker with topology preservation.
       PROV_TOLERANCE  = 0.001 deg (~110 m): safe for province outlines.
       MUNI_TOLERANCE  = 0.0005 deg (~55 m): finer for municipality polygons.
  3. Coordinate precision — round all lon/lat to 5 decimal places (~1 m),
       which is invisible at any web-map zoom level.

Typical size outcomes vs full-resolution:
  Province GeoJSON  :  raw ~1-2 MB   → output ~80-150 KB
  Municipality GeoJSON: raw ~10-30 MB → output ~500 KB-1.5 MB

Usage
-----
    pip install geopandas shapely
    python convert_shp_to_geojson.py

Output (copy both to tala-webapp/public/geodata/)
------
    ph_adm2_provdists.json
    ph_adm3_municipalities.json
"""

import json
import os
import tempfile
from pathlib import Path

import geopandas as gpd

# ── Paths ──────────────────────────────────────────────────────────────────
THESIS_ROOT = Path('/Users/ruben/Desktop/Thesis')
SHP_PROV    = THESIS_ROOT / '2025Data' / 'PH_Adm2_ProvDists.shp' / 'PH_Adm2_ProvDists.shp.shp'
SHP_MUNI    = THESIS_ROOT / '2025Data' / 'PH_Adm3_MuniCities.shp' / 'PH_Adm3_MuniCities.shp.shp'

WEBAPP_ROOT = THESIS_ROOT / 'Code' / 'tala-webapp' / 'public' / 'geodata'
OUT_PROV    = WEBAPP_ROOT / 'ph_adm2_provdists.json'
OUT_MUNI    = WEBAPP_ROOT / 'ph_adm3_municipalities.json'

WEBAPP_ROOT.mkdir(parents=True, exist_ok=True)

# ── Tunable parameters ─────────────────────────────────────────────────────
# Simplification tolerance in degrees (WGS-84).
# Increase if files are still too large; decrease if boundaries look blocky.
PROV_TOLERANCE  = 0.001   # ~110 m — suitable for province/district outlines
MUNI_TOLERANCE  = 0.0005  # ~55 m  — finer for municipality boundaries

# Coordinate decimal places. 5 = ~1 m precision (more than enough for maps).
COORD_PRECISION = 5

# Columns to keep — everything else is dropped before export.
PROV_KEEP_COLS = ['adm1_psgc', 'adm2_psgc', 'adm2_en', 'geo_level', 'geometry']
MUNI_KEEP_COLS = ['adm2_psgc', 'adm3_psgc', 'adm3_en', 'adm2_en', 'geometry']

# Study province names from prediction_points.csv
STUDY_PROVINCES = {
    'Zamboanga del Norte', 'Basilan', 'Tawi-Tawi',
    'Maguindanao del Sur', 'Davao Oriental', 'Aklan', 'Kalinga', 'Benguet',
    'Pampanga', 'Ilocos Norte', 'NCR',
    'Bataan', 'Zambales', 'Oriental Mindoro', 'Occidental Mindoro',
}


# ── Helpers ────────────────────────────────────────────────────────────────

def to_wgs84(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.crs is None or gdf.crs.to_epsg() != 4326:
        print(f"  Reprojecting from {gdf.crs} to EPSG:4326")
        gdf = gdf.to_crs(epsg=4326)
    return gdf


def drop_extra_cols(gdf: gpd.GeoDataFrame, keep: list) -> gpd.GeoDataFrame:
    present = [c for c in keep if c in gdf.columns]
    missing = [c for c in keep if c not in gdf.columns]
    if missing:
        print(f"  WARNING: columns not found and skipped: {missing}")
    return gdf[present].copy()


def coerce_geometry(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Ensure every entry in the geometry column is a Shapely object.
    Rows with unparseable or empty geometries are dropped."""
    from shapely.geometry.base import BaseGeometry
    from shapely import wkt as shapely_wkt

    def parse_one(g):
        if isinstance(g, BaseGeometry):
            return g
        if isinstance(g, str):
            try:
                return shapely_wkt.loads(g)
            except Exception:
                return None
        return None

    gdf = gdf.copy()
    crs = gdf.crs                          # save before drop strips GeoDataFrame
    parsed = gdf['geometry'].apply(parse_one)
    gdf = gdf.drop(columns=['geometry'])
    gdf = gpd.GeoDataFrame(gdf, geometry=parsed, crs=crs)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]
    return gdf
    from shapely.geometry.base import BaseGeometry
    total = 0
    for geom in gdf.geometry:
        if geom is None or not isinstance(geom, BaseGeometry):
            continue
        if geom.geom_type == 'Polygon':
            total += len(geom.exterior.coords)
        elif geom.geom_type == 'MultiPolygon':
            for part in geom.geoms:
                total += len(part.exterior.coords)
    return total


def simplify_geom(gdf: gpd.GeoDataFrame, tolerance: float) -> gpd.GeoDataFrame:
    before = count_coords(gdf)
    gdf = gdf.copy()
    gdf['geometry'] = gdf['geometry'].simplify(tolerance, preserve_topology=True)
    after = count_coords(gdf)
    pct = 100 * (1 - after / before) if before > 0 else 0
    print(f"  Simplify (tol={tolerance}): {before:,} -> {after:,} coords "
          f"({pct:.0f}% reduction)")
    return gdf


def round_coords(obj, precision: int):
    """Recursively round all coordinate values in a GeoJSON geometry dict."""
    if isinstance(obj, float):
        return round(obj, precision)
    if isinstance(obj, int):
        return obj
    if isinstance(obj, list):
        return [round_coords(v, precision) for v in obj]
    if isinstance(obj, dict):
        return {k: round_coords(v, precision) for k, v in obj.items()}
    return obj


def write_geojson(gdf: gpd.GeoDataFrame, path: Path, precision: int) -> None:
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False, mode='w') as tmp:
        tmp_path = tmp.name
    gdf.to_file(tmp_path, driver='GeoJSON')

    with open(tmp_path, encoding='utf-8') as f:
        data = json.load(f)
    os.unlink(tmp_path)

    for feat in data.get('features', []):
        if feat.get('geometry'):
            feat['geometry'] = round_coords(feat['geometry'], precision)

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)

    kb = path.stat().st_size / 1_000
    print(f"  Written : {path.name}  ({kb:.0f} KB)")


# ── Province / District layer ──────────────────────────────────────────────
print("=" * 65)
print("PROVINCE / DISTRICT  (PH_Adm2_ProvDists.shp)")
print("=" * 65)

gdf_prov = gpd.read_file(SHP_PROV)
print(f"  Raw features : {len(gdf_prov)}")
print(f"  Raw columns  : {list(gdf_prov.columns)}")

gdf_prov = to_wgs84(gdf_prov)
gdf_prov = drop_extra_cols(gdf_prov, PROV_KEEP_COLS)
gdf_prov = coerce_geometry(gdf_prov)
print(f"  Features after geometry coercion: {len(gdf_prov)}")
gdf_prov = simplify_geom(gdf_prov, PROV_TOLERANCE)

# Print exact adm2_en values for Map.tsx override verification
shapefile_prov_names = set(gdf_prov['adm2_en'].dropna().unique())
print(f"\nAll adm2_en values ({len(shapefile_prov_names)} unique):")
for v in sorted(shapefile_prov_names):
    print(f"  '{v}'")

print("\nStudy-province match check:")
for prov in sorted(STUDY_PROVINCES):
    if prov == 'NCR':
        ncr_ids = gdf_prov.loc[gdf_prov['geo_level'] == 'Dist', 'adm2_en'].tolist()
        print(f"  NCR -> {len(ncr_ids)} district polygon(s):")
        for d in ncr_ids:
            print(f"       '{d}'")
    elif prov in shapefile_prov_names:
        print(f"  '{prov}' -> DIRECT MATCH")
    else:
        print(f"  '{prov}' -> *** NO MATCH -- add to PROVINCE_OVERRIDE in Map.tsx ***")

write_geojson(gdf_prov, OUT_PROV, COORD_PRECISION)


# ── Municipality layer ─────────────────────────────────────────────────────
print("\n" + "=" * 65)
print("MUNICIPALITY  (PH_Adm3_Municipalities.shp)")
print("=" * 65)

gdf_muni = gpd.read_file(SHP_MUNI)
print(f"  Raw features : {len(gdf_muni)}")
print(f"  Raw columns  : {list(gdf_muni.columns)}")

gdf_muni = to_wgs84(gdf_muni)

# Detect the municipality name field
ID_FIELD = 'adm3_en' if 'adm3_en' in gdf_muni.columns else 'adm2_en'
print(f"  Municipality ID field detected: '{ID_FIELD}'")

# Substitute adm3_en placeholder in keep-list with whatever field exists
muni_keep = []
seen = set()
for c in MUNI_KEEP_COLS:
    actual = c if c != 'adm3_en' else ID_FIELD
    if actual not in seen:
        muni_keep.append(actual)
        seen.add(actual)

gdf_muni = drop_extra_cols(gdf_muni, muni_keep + ['geometry'])
gdf_muni = coerce_geometry(gdf_muni)
print(f"  Features after geometry coercion: {len(gdf_muni)}")
gdf_muni = simplify_geom(gdf_muni, MUNI_TOLERANCE)

print(f"\nFirst 60 {ID_FIELD} values (sorted):")
for v in sorted(gdf_muni[ID_FIELD].dropna().unique())[:60]:
    print(f"  '{v}'")

write_geojson(gdf_muni, OUT_MUNI, COORD_PRECISION)


# ── Summary ────────────────────────────────────────────────────────────────
print("\n" + "=" * 65)
print("SIZE SUMMARY")
print("=" * 65)
prov_kb = OUT_PROV.stat().st_size / 1_000
muni_kb = OUT_MUNI.stat().st_size / 1_000
print(f"  ph_adm2_provdists.json     : {prov_kb:.0f} KB")
print(f"  ph_adm3_municipalities.json: {muni_kb:.0f} KB")
print()
print("If files are still too large, increase tolerances at the top of this script:")
print("  PROV_TOLERANCE = 0.003   # ~330 m, still visually clean at province level")
print("  MUNI_TOLERANCE = 0.001   # ~110 m, acceptable for municipality polygons")
print()
print("If boundaries look blocky at high zoom, decrease them:")
print("  PROV_TOLERANCE = 0.0005")
print("  MUNI_TOLERANCE = 0.0002")
print()
print("Next: copy both files to tala-webapp/public/geodata/")
print("Then verify NCR district strings and any NO MATCH lines above against Map.tsx.")