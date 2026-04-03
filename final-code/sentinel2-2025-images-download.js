// ── PROJECT TALA: OUTPUT PROVINCE EXPORTS ──────────────
// Run in GEE Code Editor
// Queues 44 export tasks: 11 areas × 4 quarters
// Exports land in Drive folder: Sentinel2_Output_Provinces
// Takes 1-2 days to complete on GEE servers

// ── 5 POOREST + 5 RICHEST PROVINCES + NCR ─────────────
// Based on 2022 PSA poverty incidence data
// Bounding boxes: [west, south, east, north]

var OUTPUT_AREAS = {
  // ── 5 POOREST PROVINCES ──────────────────────────────
  'Zamboanga_del_Norte': ee.Geometry.Rectangle([
    122.00, 7.50, 123.50, 8.80
  ]),
  'Basilan': ee.Geometry.Rectangle([
    121.80, 6.40, 122.60, 7.00
  ]),
  'Tawi_Tawi': ee.Geometry.Rectangle([
    119.40, 4.60, 120.10, 5.40
  ]),
  'Maguindanao_del_Sur': ee.Geometry.Rectangle([
    124.00, 6.60, 125.00, 7.30
  ]),
  'Davao_Oriental': ee.Geometry.Rectangle([
    125.80, 6.20, 126.70, 7.60
  ]),

  // ── 5 RICHEST PROVINCES ──────────────────────────────
  'Ilocos_Norte': ee.Geometry.Rectangle([
    120.40, 17.80, 121.00, 18.60
  ]),
  'Pampanga': ee.Geometry.Rectangle([
    120.40, 14.80, 121.00, 15.40
  ]),
  'Benguet': ee.Geometry.Rectangle([
    120.40, 16.20, 120.90, 16.80
  ]),
  'Kalinga': ee.Geometry.Rectangle([
    120.90, 17.10, 121.50, 18.00
  ]),
  'Aklan': ee.Geometry.Rectangle([
    121.90, 11.40, 122.40, 11.80
  ]),

  // ── NCR ──────────────────────────────────────────────
  'NCR': ee.Geometry.Rectangle([
    120.90, 14.40, 121.20, 14.80
  ])
};

// ── QUARTERS ───────────────────────────────────────────
var QUARTERS = {
  'Q1': { start: '2025-01-01', end: '2025-03-31' },
  'Q2': { start: '2025-04-01', end: '2025-06-30' },
  'Q3': { start: '2025-07-01', end: '2025-09-30' },
  'Q4': { start: '2025-10-01', end: '2025-12-31' }
};

// ── BANDS TO EXPORT ────────────────────────────────────
// Matches your training pipeline: B4, B3, B2, B8, B11
var BANDS = ['B4', 'B3', 'B2', 'B8', 'B11'];

// ── CLOUD MASKING ──────────────────────────────────────
function maskS2Clouds(image) {
  var qa   = image.select('QA60');
  var mask = qa.bitwiseAnd(1 << 10).eq(0)
              .and(qa.bitwiseAnd(1 << 11).eq(0));
  return image.updateMask(mask).divide(10000);
}

// ── EXPORT LOOP ────────────────────────────────────────
var taskCount = 0;

Object.keys(OUTPUT_AREAS).forEach(function(areaName) {
  var roi = OUTPUT_AREAS[areaName];

  Object.keys(QUARTERS).forEach(function(qName) {
    var q = QUARTERS[qName];

    // Build quarterly median composite
    var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(roi)
      .filterDate(q.start, q.end)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 80));

    var n = collection.size().getInfo();

    var composite;
    if (n > 0) {
      // Cloud-masked median
      var masked = collection.map(maskS2Clouds).select(BANDS).median();
      // Fallback mosaic for pixels with persistent cloud
      var fallback = collection.select(BANDS).mosaic().divide(10000);
      composite = masked.unmask(fallback).clip(roi);
    } else {
      // No images at all — use unmasked mosaic as last resort
      composite = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate('2025-01-01', '2025-12-31')
        .select(BANDS)
        .median()
        .divide(10000)
        .clip(roi);
    }

    var taskName = 'output_' + areaName + '_2025_' + qName;

    Export.image.toDrive({
      image       : composite,
      description : taskName,
      folder      : 'Sentinel2_Output_Provinces_2025',
      fileNamePrefix: taskName,
      region      : roi,
      scale       : 10,             // 10m resolution
      crs         : 'EPSG:3857',   // WGS84
      maxPixels   : 1e10,
      fileFormat  : 'GeoTIFF'
    });

    taskCount++;
    print('Queued: ' + taskName + ' (' + n + ' scenes)');
  });
});

print('');
print('Total tasks queued: ' + taskCount);
print('Expected: 44 (11 areas × 4 quarters)');
print('');
print('Tasks are now in the Tasks panel (top right).');
print('Click "Run All" in the Tasks panel to start them.');
print('Exports will appear in Drive/Sentinel2_Output_Provinces/');