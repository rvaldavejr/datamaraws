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
  id: string
}

// Add this above the component in Map.tsx

// Manual overrides where normalization alone is insufficient
const PROVINCE_GADM: Record<string, string> = {
  'Davao Oriental': 'DavaoOriental',
  'Ilocos Norte': 'IlocosNorte',
  'Maguindanao del Sur': 'Maguindanao',    // GADM has undivided province
  'Zamboanga del Norte': 'ZamboangadelNorte',
  'NCR': 'MetropolitanManila',               // not in GADM — no highlight possible
}

const MUNICIPALITY_GADM: Record<string, string> = {
  'New Washington': 'NewWashington',
  'City of Lamitan': 'LamitanCity',
  'Hadji Mohammad Ajul': 'HadjiMohammadAjul',
  'Ungkaya Pukan': 'UngkayaPukan',
  'La Trinidad': 'LaTrinidad',
  'City of Mati': 'MatiCity',
  'Governor Generoso': 'GovernorGeneroso',
  'San Isidro': 'SanIsidro',
  'City of Batac': 'Batac',
  'City of Laoag': 'Laoag',
  'Nueva Era': 'NuevaEra',
  'San Nicolas': 'SanNicolas',
  'City of Tabuk': 'TabukCity',
  'City of San Fernando': 'SanFernandoCity',
  'Mabalacat City': 'Mabalacat',
  'San Luis': 'SanLuis',
  'San Simon': 'SanSimon',
  'Santa Ana': 'SantaAna',
  'Santa Rita': 'SantaRita',
  'Panglima Sugala': 'PanglimaSugala',
  'South Ubian': 'SouthUbian',
  'City of Dapitan': 'Dapitan',
  'City of Dipolog': 'DipologCity',
  'Jose Dalman': 'JoseDalman',
  'La Libertad': 'LaLibertad',
  'Pres. Manuel A. Roxas': 'Pres.ManuelA.Roxas',
  'City of Las Piñas': 'LasPiñas',
  'City of Muntinlupa': 'Muntinlupa',
  'City of Parañaque': 'Parañaque',
  'Pasay City': 'PasayCity',
  'City of Valenzuela': 'Valenzuela',
  'City of Caloocan': 'KalookanCity',
  'City of Malabon': 'Malabon',
  'City of Navotas': 'Navotas',
  'City of Mandaluyong': 'Mandaluyong',
  'City of Marikina': 'Marikina',
  'Quezon City': 'QuezonCity',
  'City of San Juan': 'SanJuan',
  'City of Pasig': 'PasigCity',
  'City of Taguig': 'Taguig',
  'City of Manila': 'Manila',
  'City of Makati': 'MakatiCity',
}

function toGadmId(name: string, type: 'province' | 'municipality'): string {
  if (type === 'province') return PROVINCE_GADM[name] ?? name
  if (type === 'municipality') return MUNICIPALITY_GADM[name] ?? name
  return name
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtWI(wi: number) {
  return wi >= 0 ? `+${wi.toFixed(2)}` : wi.toFixed(2)
}

// Clear feature-state highlight on the given feature
function clearFeatureHighlight(map: mapboxgl.Map, h: HighlightRef) {
  try {
    map.setFeatureState({ source: h.source, id: h.id }, { selected: false })
  } catch {
    // source may not be loaded yet — ignore
  }
}

// Apply feature-state highlight on the given feature
function applyFeatureHighlight(map: mapboxgl.Map, h: HighlightRef) {
  try {
    map.setFeatureState({ source: h.source, id: h.id }, { selected: true })
  } catch {
    // source may not be loaded yet — ignore
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
      // promoteId promotes a string property to act as the numeric-free
      // feature ID, which is required by setFeatureState.
      // The GADM files use NAME_1 for provinces and NAME_2 for municipalities.
      // These must match the names in your provinces.json / municipalities.json.

      map.addSource('provinces-boundary', {
        type: 'geojson',
        data: '/geodata/gadm41_PHL_provinces.json',
        promoteId: 'NAME_1',
      })

      map.addSource('municipalities-boundary', {
        type: 'geojson',
        data: '/geodata/gadm41_PHL_municipalities.json',
        promoteId: 'NAME_2',
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
    // The feature ID used by setFeatureState must match the promoteId
    // property value in the GeoJSON.  For provinces that is NAME_1
    // (the province name) and for municipalities NAME_2 (the municipality
    // name).  Your app stores these names in selected.name and
    // selected.province, so they must match GADM spelling exactly.
    //
    // If you see missing highlights, log `selected.name` and compare
    // with the NAME_1/NAME_2 values in the GeoJSON to find mismatches.

    const gadmId = toGadmId(selected.name, selected.type)
    if (!gadmId) return  // e.g. NCR — no boundary available

    const highlight: HighlightRef = selected.type === 'province'
      ? { source: 'provinces-boundary', id: gadmId }
      : { source: 'municipalities-boundary', id: gadmId }

    // Wait for the source to be loaded before calling setFeatureState —
    // the source may still be fetching if this is the first selection.
    const applyWhenReady = () => {
      if (map.isSourceLoaded(highlight.source)) {
        applyFeatureHighlight(map, highlight)
        prevHighlight.current = highlight
      } else {
        map.once('sourcedata', (e) => {
          if (e.sourceId === highlight.source && map.isSourceLoaded(highlight.source)) {
            applyFeatureHighlight(map, highlight)
            prevHighlight.current = highlight
          }
        })
      }
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