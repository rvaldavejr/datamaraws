'use client'
// src/components/Map.tsx
// Mapbox GL heatmap with point click support and boundary highlight on selection.
// Loaded dynamically (no SSR) since Mapbox requires window.

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { PredictionPoint, SelectedArea } from '@/types'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface Props {
  points: PredictionPoint[]
  selected: SelectedArea | null
  onSelectArea: (type: 'province' | 'municipality', key: string) => void
}

// ── Types ──────────────────────────────────────────────────────────────────

interface HighlightRef {
  source: 'provinces-boundary' | 'municipalities-boundary'
  // Array to support NCR, which spans four district polygons in the
  // PH_Adm2_ProvDists shapefile rather than a single province polygon.
  ids: string[]
}

// Add this above the component in Map.tsx

// ── PSA shapefile boundary ID resolution ──────────────────────────────────
//
// Sources now use PH_Adm2_ProvDists.shp (provinces + NCR districts) and
// PH_Adm3_Municipalities.shp (municipalities).  Both shapefiles use plain
// English names in adm2_en / adm3_en, so most names match prediction_points
// directly.  Only add entries here where they diverge.
//
// NCR is a special case: the shapefile splits NCR into four legislative
// district polygons (geo_level = "Dist") rather than a single province.
// When "NCR" is selected, all four district features are highlighted.
// Verify the exact adm2_en strings against your converted GeoJSON — they
// are truncated in QGIS but the full values are shown below.

const NCR_DISTRICT_IDS: string[] = [
  'NCR, City of Manila, First District (Not a Province)',
  'NCR, Second District (Not a Province)',
  'NCR, Third District (Not a Province)',
  'NCR, Fourth District (Not a Province)',
]

// Province overrides: data name → adm2_en in PH_Adm2_ProvDists.shp.
// Most province names match exactly; only exceptions are listed.
const PROVINCE_OVERRIDE: Record<string, string> = {
  // Add entries here after confirming adm2_en values from your GeoJSON.
  // Example: 'Maguindanao del Sur': 'Maguindanao Del Sur',
}

// Municipality overrides: data name → adm3_en in PH_Adm3_Municipalities.shp.
// Verify each value against the actual shapefile adm3_en field.
/*const MUNICIPALITY_OVERRIDE: Record<string, string> = {
  'New Washington'           : 'New Washington',
  'City of Lamitan'          : 'Lamitan',
  'Hadji Mohammad Ajul'      : 'Hadji Mohammad Ajul',
  'Ungkaya Pukan'            : 'Ungkaya Pukan',
  'La Trinidad'              : 'La Trinidad',
  'City of Mati'             : 'Mati',
  'Governor Generoso'        : 'Governor Generoso',
  'San Isidro'               : 'San Isidro',
  'City of Batac'            : 'Batac',
  'City of Laoag'            : 'Laoag',
  'Nueva Era'                : 'Nueva Era',
  'San Nicolas'              : 'San Nicolas',
  'City of Tabuk'            : 'Tabuk',
  'City of San Fernando'     : 'San Fernando',
  'Mabalacat City'           : 'Mabalacat',
  'San Luis'                 : 'San Luis',
  'San Simon'                : 'San Simon',
  'Santa Ana'                : 'Santa Ana',
  'Santa Rita'               : 'Santa Rita',
  'Panglima Sugala'          : 'Panglima Sugala',
  'South Ubian'              : 'South Ubian',
  'City of Dapitan'          : 'Dapitan',
  'City of Dipolog'          : 'Dipolog',
  'Jose Dalman'              : 'Jose Dalman',
  'La Libertad'              : 'La Libertad',
  'Pres. Manuel A. Roxas'    : 'Pres. Manuel A. Roxas',
  // NCR cities — adm3_en values in PSA shapefile typically omit "City of"
  'City of Las Piñas'        : 'Las Piñas',
  'City of Muntinlupa'       : 'Muntinlupa',
  'City of Parañaque'        : 'Parañaque',
  'Pasay City'               : 'Pasay',
  'City of Valenzuela'       : 'Valenzuela',
  'City of Caloocan'         : 'Caloocan',
  'City of Malabon'          : 'Malabon',
  'City of Navotas'          : 'Navotas',
  'City of Mandaluyong'      : 'Mandaluyong',
  'City of Marikina'         : 'Marikina',
  'Quezon City'              : 'Quezon City',
  'City of San Juan'         : 'San Juan',
  'City of Pasig'            : 'Pasig',
  'City of Taguig'           : 'Taguig',
  'City of Manila'           : 'Manila',
  'City of Makati'           : 'Makati',
  'City of Calapan'          : 'Calapan',
  'City of Balanga'          : 'Balanga',
  'City of Olongapo'         : 'Olongapo', 
}*/

// Returns the array of adm2_en / adm3_en feature IDs to highlight.
// NCR returns all four district IDs; every other area returns one.
function toBoundaryIds(name: string, type: 'province' | 'municipality'): string[] {
  if (type === 'province') {
    if (name === 'NCR') return NCR_DISTRICT_IDS
    return [name]
  }
  return [name]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtWI(wi: number) {
  return wi >= 0 ? `+${wi.toFixed(2)}` : wi.toFixed(2)
}

// Clear feature-state highlight on all features in the ref
function clearFeatureHighlight(map: mapboxgl.Map, h: HighlightRef) {
  for (const id of h.ids) {
    try {
      map.setFeatureState({ source: h.source, id }, { selected: false })
    } catch {
      // source may not be loaded yet — ignore
    }
  }
}

// Apply feature-state highlight on all features in the ref
function applyFeatureHighlight(map: mapboxgl.Map, h: HighlightRef) {
  for (const id of h.ids) {
    try {
      map.setFeatureState({ source: h.source, id }, { selected: true })
    } catch {
      // source may not be loaded yet — ignore
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TalaMap({ points, selected, onSelectArea }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  // Tracks the feature whose boundary is currently highlighted so we can
  // clear it before applying the next selection.
  const prevHighlight = useRef<HighlightRef | null>(null)

  // ── Map initialisation (runs once) ────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [122.0, 12.0],
      zoom: 5.5,
      minZoom: 4,
      maxZoom: 14,
    })

    mapRef.current = map

    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'tala-popup',
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {

      // ── Build point GeoJSON ──────────────────────────────────────────

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: points.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: {
            id: p.id,
            wi: p.wi,
            wi_class: p.wi_class,
            province: p.province,
            municipality: p.municipality,
            viirs: p.osm.VIIRS_Median,
            pois: p.osm.Total_POI_Count,
            roads: p.osm.Total_Road_Length,
          },
        })),
      }

      // ── Boundary sources ─────────────────────────────────────────────
      // promoteId promotes a string property to the feature ID used by
      // setFeatureState.  Both files come from the PSA shapefiles:
      //   PH_Adm2_ProvDists.shp  → adm2_en  (province or NCR district name)
      //   PH_Adm3_Municipalities.shp → adm3_en  (municipality name)
      // Convert each .shp to GeoJSON via QGIS or ogr2ogr and place in
      // public/geodata/ before deploying.

      map.addSource('provinces-boundary', {
        type: 'geojson',
        data: '/geodata/tala-prov.geojson',
        promoteId: 'adm2_en',
      })

      map.addSource('municipalities-boundary', {
        type: 'geojson',
        data: '/geodata/tala-muni.geojson',
        promoteId: 'adm3_en',
      })

      // ── Province highlight layers ────────────────────────────────────
      // Both layers are always present but invisible (opacity 0) until
      // setFeatureState({ selected: true }) is called on a feature.

      map.addLayer({
        id: 'province-highlight-fill',
        type: 'fill',
        source: 'provinces-boundary',
        paint: {
          'fill-color': '#5ce1e6',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.12,
            0,
          ],
        },
      })

      map.addLayer({
        id: 'province-highlight-line',
        type: 'line',
        source: 'provinces-boundary',
        paint: {
          'line-color': '#5ce1e6',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0],
          'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
        },
      })

      // ── Municipality highlight layers ────────────────────────────────

      map.addLayer({
        id: 'municipality-highlight-fill',
        type: 'fill',
        source: 'municipalities-boundary',
        paint: {
          'fill-color': '#5ce1e6',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.12,
            0,
          ],
        },
      })

      map.addLayer({
        id: 'municipality-highlight-line',
        type: 'line',
        source: 'municipalities-boundary',
        paint: {
          'line-color': '#5ce1e6',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0],
          'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
        },
      })

      // ── Point source ─────────────────────────────────────────────────

      map.addSource('points', {
        type: 'geojson',
        data: geojson,
        cluster: false,
      })

      // ── Circle layer (all zoom levels) ────────────────────────────────
      // Color is driven directly by the wealth index value, not density.
      // Radius and blur scale with zoom for a soft glow when zoomed out
      // and crisp points when zoomed in.

      map.addLayer({
        id: 'points-circle',
        type: 'circle',
        source: 'points',
        paint: {
          // Large blurry circles at low zoom merge into a smooth field.
          // They shrink and sharpen as you zoom in to individual points.
          'circle-radius': [
            'interpolate', ['exponential', 2], ['zoom'],
            4, 2,
            6, 10,
            8, 10,
            10, 8,
            13, 8,
          ],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'wi'],
            -2.5, '#c0392b',
            -0.5, '#e67e22',
            0, '#326189',
            0.5, '#88bcbd',
            2.0, '#5ce1e6',
          ],
          'circle-blur': [
            'interpolate', ['linear'], ['zoom'],
            4, .6,
            7, 0.8,
            9, 0.2,
            10, 0,
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            9, 0,
            10, 0.5,
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            4, 0.55,
            7, 0.65,
            9, 0.8,
            11, 0.9,
          ],
        },
      })

      // ── Click: point → select municipality ──────────────────────────

      map.on('click', 'points-circle', (e) => {
        const feat = e.features?.[0]
        if (!feat) return
        const p = feat.properties as any
        onSelectArea('municipality', `${p.province}|${p.municipality}`)
      })

      // ── Hover popup ──────────────────────────────────────────────────

      map.on('mousemove', 'points-circle', (e) => {
        const feat = e.features?.[0]
        if (!feat || !popupRef.current) return
        const p = feat.properties as any
        const coord = (feat.geometry as GeoJSON.Point).coordinates as [number, number]

        popupRef.current
          .setLngLat(coord)
          .setHTML(`
            <div style="
              font-family:monospace;font-size:12px;padding:8px 10px;
              background:#162d44;color:#eaf1f5;
              border-radius:4px;border:1px solid #326189;
              min-width:140px;
            ">
              <div style="font-weight:600;margin-bottom:2px">${p.municipality}</div>
              <div style="color:#88bcbd;font-size:11px">${p.province}</div>
              <div style="margin-top:6px;color:#5ce1e6;font-size:13px">
                WI ${fmtWI(p.wi)}
              </div>
              <div style="color:#859498;font-size:10px;margin-top:2px">
                VIIRS ${Number(p.viirs).toFixed(2)} nW &nbsp;·&nbsp;
                ${Math.round(p.pois)} POIs
              </div>
            </div>
          `)
          .addTo(map)

        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'points-circle', () => {
        popupRef.current?.remove()
        map.getCanvas().style.cursor = ''
      })

      // ── Click empty area: zoom in ───────────────────────────────────

      map.on('dblclick', (e) => {
        map.flyTo({ center: e.lngLat, zoom: map.getZoom() + 2 })
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Respond to selection changes ───────────────────────────────────────
  //
  // Runs whenever `selected` changes.  Responsible for:
  //   1. Clearing the previous boundary highlight via setFeatureState.
  //   2. Applying a new highlight to the selected province / municipality.
  //   3. Flying the camera to the bounding box of the selected points.
  //   4. Updating the selected-points ring layer.

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // ── Clear previous boundary highlight ──────────────────────────────

    if (prevHighlight.current) {
      clearFeatureHighlight(map, prevHighlight.current)
      prevHighlight.current = null
    }

    // If nothing is selected, also remove the point ring layer and stop
    if (!selected) {
      if (map.getLayer('selected-points')) map.removeLayer('selected-points')
      if (map.getSource('selected')) map.removeSource('selected')
      return
    }

    // ── Apply new boundary highlight ────────────────────────────────────
    //
    // toBoundaryIds returns the adm2_en values to highlight.  For every
    // province this is a single-element array; for NCR it contains all four
    // district adm2_en strings.  The feature IDs must match the promoteId
    // field in the GeoJSON (adm2_en for provinces, adm3_en for municipalities).
    //
    // NCR is intentionally absent from provinces.json / municipalities.json
    // because the DHS survey does not report wealth index at the NCR level.
    // We still highlight the district polygons so the map shows where the
    // points are — the side panel will simply show no aggregate stats.

    const boundaryIds = toBoundaryIds(selected.name, selected.type)

    const highlight: HighlightRef = selected.type === 'province'
      ? { source: 'provinces-boundary', ids: boundaryIds }
      : { source: 'municipalities-boundary', ids: boundaryIds }

    // Wait for the source to be fully loaded before calling setFeatureState.
    //
    // WHY NOT map.once('sourcedata'):
    //   Mapbox fires sourcedata multiple times per load cycle (start, tiles
    //   received, parse complete).  map.once() consumes on the *first* event,
    //   which arrives before isSourceLoaded() returns true, so the callback
    //   exits without applying the state and is never re-registered.
    //
    // FIX: use map.on() + map.off() so we keep listening until the source is
    //   actually ready, then remove the listener immediately.
    const applyWhenReady = () => {
      if (map.isSourceLoaded(highlight.source)) {
        applyFeatureHighlight(map, highlight)
        prevHighlight.current = highlight
        return
      }

      const onData = (e: mapboxgl.MapSourceDataEvent) => {
        if (e.sourceId !== highlight.source) return
        if (!map.isSourceLoaded(highlight.source)) return
        // Source is ready — apply state and stop listening.
        map.off('sourcedata', onData)
        applyFeatureHighlight(map, highlight)
        prevHighlight.current = highlight
      }
      map.on('sourcedata', onData)
    }
    applyWhenReady()

    // ── Fly to bounding box of selected prediction points ───────────────

    const pts = selected.points
    if (pts.length > 0) {
      const lons = pts.map(p => p.lon)
      const lats = pts.map(p => p.lat)
      const bounds = new mapboxgl.LngLatBounds(
        [Math.min(...lons) - 0.05, Math.min(...lats) - 0.05],
        [Math.max(...lons) + 0.05, Math.max(...lats) + 0.05],
      )
      map.fitBounds(bounds, {
        padding: 80,
        duration: 800,
        // Don't zoom in more than 11 — keeps context visible
        maxZoom: 11,
      })
    }

    // ── Update selected-point ring layer ────────────────────────────────
    // Draws a teal stroke ring around every prediction point in the area.

    if (map.getLayer('selected-points')) map.removeLayer('selected-points')
    if (map.getSource('selected')) map.removeSource('selected')

    map.addSource('selected', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pts.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: { wi: p.wi },
        })),
      },
    })

    map.addLayer({
      id: 'selected-points',
      type: 'circle',
      source: 'selected',
      paint: {
        'circle-radius': 10,
        'circle-color': 'transparent',
        'circle-stroke-color': '#5ce1e6',
        'circle-stroke-width': 2,
        'circle-opacity': 0.85,
      },
    })
  }, [selected])

  return (
    <>
      <div ref={containerRef} className="w-full h-full" />
      <style>{`
        .tala-popup .mapboxgl-popup-content {
          background : transparent;
          padding    : 0;
          box-shadow : none;
        }
        .tala-popup .mapboxgl-popup-tip { display: none; }
      `}</style>
    </>
  )
}