# ============================================================
# 1. SETUP
# ============================================================
# Run once in your terminal first:
#   pip install rasterio

import os
import glob
import re
import time
import numpy as np
import rasterio
from rasterio.merge import merge

print("Libraries loaded.")

# ============================================================
# 2. CONFIGURATION
# ============================================================
# Point this to wherever your GEE exports landed on your machine.
# This is the folder containing the split .tif files.
IMAGE_DIR = '/Users/ruben/Desktop/'

# ============================================================
# 3. FIND SPLIT FILES
# ============================================================
all_tifs = glob.glob(os.path.join(IMAGE_DIR, '*.tif'))
pattern  = re.compile(r'^(.*?)(-\d{10}-\d{10})\.tif$')

split_groups = {}
for filepath in all_tifs:
    filename = os.path.basename(filepath)
    match    = pattern.match(filename)
    if match:
        base_name = match.group(1)
        split_groups.setdefault(base_name, []).append(filepath)

split_groups = {k: sorted(v) for k, v in split_groups.items() if len(v) > 1}

print(f"Found {len(split_groups)} province/quarter pairs that need stitching.")
for base, files in split_groups.items():
    print(f"  {base}  ({len(files)} parts)")

# ============================================================
# 4. STITCH AND SAVE
# ============================================================
skipped = 0
for base_name, file_paths in split_groups.items():
    out_path = os.path.join(IMAGE_DIR, f"{base_name}.tif")
    print(f"\nStitching: {base_name} ...")
    start = time.time()
    srcs  = []
    # Skip if the stitched file already exists
    if os.path.exists(out_path):
        size_mb = os.path.getsize(out_path) / 1e6
        print(f"  SKIP : {base_name}.tif already exists ({size_mb:.0f} MB)")
        skipped += 1
        continue
    try:
        srcs = [rasterio.open(fp) for fp in file_paths]

        src_nodata = srcs[0].nodata

        mosaic, out_trans = merge(
            srcs,
            nodata=None,     # do not mask valid dark pixels
            method='first',
        )

        out_meta = srcs[0].meta.copy()
        out_meta.update({
            "driver"    : "GTiff",
            "height"    : mosaic.shape[1],
            "width"     : mosaic.shape[2],
            "transform" : out_trans,
            "nodata"    : src_nodata,
            "compress"  : "lzw",
            "tiled"     : True,
            "blockxsize": 512,
            "blockysize": 512,
        })

        out_path = os.path.join(IMAGE_DIR, f"{base_name}.tif")
        with rasterio.open(out_path, "w", **out_meta) as dst:
            dst.write(mosaic)

        elapsed = time.time() - start
        size_mb = os.path.getsize(out_path) / 1e6
        print(f"  Saved: {base_name}.tif  ({elapsed:.1f}s, {size_mb:.0f} MB)")

    except Exception as e:
        print(f"  ERROR: {e}")

    finally:
        for src in srcs:
            src.close()

print("\nDone.")

# ============================================================
# 5. VERIFY
# ============================================================
print("\nVerifying stitched files...\n")

stitched = sorted(glob.glob(os.path.join(IMAGE_DIR, 'output_*_2025_Q*.tif')))
stitched_clean = [f for f in stitched
                  if not re.search(r'-\d{10}-\d{10}\.tif$', f)]

for fp in stitched_clean:
    with rasterio.open(fp) as src:
        h, w   = src.height, src.width
        window = rasterio.windows.Window(w//4, h//4, w//2, h//2)
        data   = src.read(1, window=window).astype(float)
        if src.nodata is not None:
            data[data == src.nodata] = np.nan

    n_valid   = int(np.sum(~np.isnan(data)))
    pct_valid = n_valid / data.size * 100
    mean_val  = float(np.nanmean(data)) if n_valid > 0 else 0
    status    = "OK" if pct_valid > 50 and mean_val > 0 else "CHECK"

    print(f"  [{status}] {os.path.basename(fp)}")
    print(f"         valid={pct_valid:.1f}%  mean={mean_val:.4f}")