'use client'
// src/components/Map.tsx
// Mapbox GL heatmap with point click support.
// Loaded dynamically (no SSR) since Mapbox requires window.

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { PredictionPoint, SelectedArea } from '@/types'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

// WI value → color (matches legend)
function wiToColor(wi: number): string {
  if (wi >= 1.0) return '#27ae60'
  if (wi >= 0.5) return '#2ecc71'
  if (wi >= 0.0) return '#f1c40f'
  if (wi >= -0.5) return '#e67e22'
  if (wi >= -1.0) return '#e74c3c'
  return '#c0392b'
}

interface Props {
  points:        PredictionPoint[]
  selected:      SelectedArea | null
  onSelectArea:  (type: 'province' | 'municipality', key: string) => void
}

export default function TalaMap({ points, selected, onSelectArea }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const popupRef     = useRef<mapboxgl.Popup | null>(null)

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container : containerRef.current,
      style     : 'mapbox://styles/mapbox/dark-v11',
      center    : [122.0, 12.0],
      zoom      : 5.5,
      minZoom   : 4,
      maxZoom   : 14,
    })

    mapRef.current = map
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'tala-popup'
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      // Build GeoJSON from points
      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: points.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: {
            id         : p.id,
            wi         : p.wi,
            wi_class   : p.wi_class,
            province   : p.province,
            municipality: p.municipality,
            viirs      : p.osm.VIIRS_Median,
            pois       : p.osm.Total_POI_Count,
            roads      : p.osm.Total_Road_Length,
          }
        }))
      }

      map.addSource('points', {
        type: 'geojson',
        data: geojson,
        cluster            : false,
      })

      // ── HEATMAP LAYER ──────────────────────────────
      map.addLayer({
        id    : 'heatmap',
        type  : 'heatmap',
        source: 'points',
        maxzoom: 9,
        paint : {
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'wi'],
            -2.5, 0,
            0,    0.5,
            2.0,  1
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.5
          ],
          'heatmap-color': [
            'interpolate', ['linear'],
            ['heatmap-density'],
            0,   'rgba(192,57,43,0)',
            0.2, '#c0392b',
            0.4, '#e67e22',
            0.6, '#f1c40f',
            0.8, '#2ecc71',
            1,   '#27ae60'
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'], 4, 12, 9, 24
          ],
          'heatmap-opacity': 0.80,
        }
      })

      // ── CIRCLE LAYER (zoom in) ─────────────────────
      map.addLayer({
        id     : 'points-circle',
        type   : 'circle',
        source : 'points',
        minzoom: 7,
        paint  : {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'], 7, 4, 12, 8
          ],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'wi'],
            -2.5, '#c0392b',
            -0.5, '#e67e22',
             0,   '#f1c40f',
             0.5, '#2ecc71',
             2.0, '#27ae60'
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 0.5,
          'circle-opacity': 0.85,
        }
      })

      // ── CLICK: circles → select municipality ───────
      map.on('click', 'points-circle', (e) => {
        const feat  = e.features?.[0]
        if (!feat) return
        const props = feat.properties as any
        const key   = `${props.province}|${props.municipality}`
        onSelectArea('municipality', key)
      })

      // ── HOVER POPUP ────────────────────────────────
      map.on('mousemove', 'points-circle', (e) => {
        const feat  = e.features?.[0]
        if (!feat || !popupRef.current) return
        const props = feat.properties as any
        const coord = (feat.geometry as GeoJSON.Point).coordinates as [number, number]
        const wiStr = props.wi >= 0 ? `+${props.wi.toFixed(2)}` : props.wi.toFixed(2)

        popupRef.current
          .setLngLat(coord)
          .setHTML(`
            <div style="font-family:monospace;font-size:12px;padding:8px 10px;background:#1e293b;color:#e2e8f0;border-radius:4px;border:1px solid #334155">
              <div style="font-weight:600;margin-bottom:4px">${props.municipality}</div>
              <div style="color:#94a3b8">${props.province}</div>
              <div style="margin-top:6px;color:#f1c40f;font-size:13px">WI ${wiStr}</div>
              <div style="color:#94a3b8;font-size:11px">VIIRS ${parseFloat(props.viirs).toFixed(2)} nW · ${props.pois} POIs</div>
            </div>
          `)
          .addTo(map)
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'points-circle', () => {
        popupRef.current?.remove()
        map.getCanvas().style.cursor = ''
      })

      // Same hover on heatmap
      map.on('click', 'heatmap', () => {
        // At low zoom, fly to click and zoom in
        map.flyTo({ center: [map.getCenter().lng, map.getCenter().lat], zoom: 8 })
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line

  // Fly to selected area
  useEffect(() => {
    if (!selected || !mapRef.current) return
    const pts = selected.points
    if (pts.length === 0) return

    const lons = pts.map(p => p.lon)
    const lats = pts.map(p => p.lat)
    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(...lons) - 0.05, Math.min(...lats) - 0.05],
      [Math.max(...lons) + 0.05, Math.max(...lats) + 0.05]
    )
    mapRef.current.fitBounds(bounds, { padding: 80, duration: 800 })

    // Highlight selected points
    const map = mapRef.current
    if (map.getLayer('selected-points')) map.removeLayer('selected-points')
    if (map.getSource('selected')) map.removeSource('selected')

    const selectedIds = new Set(pts.map(p => p.id))
    map.addSource('selected', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pts.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: { wi: p.wi }
        }))
      }
    })
    map.addLayer({
      id    : 'selected-points',
      type  : 'circle',
      source: 'selected',
      paint : {
        'circle-radius'      : 10,
        'circle-color'       : 'transparent',
        'circle-stroke-color': '#facc15',
        'circle-stroke-width': 2,
      }
    })
  }, [selected])

  return (
    <>
      <div ref={containerRef} className="w-full h-full" />
      <style>{`
        .tala-popup .mapboxgl-popup-content {
          background: transparent;
          padding: 0;
          box-shadow: none;
        }
        .tala-popup .mapboxgl-popup-tip { display: none; }
      `}</style>
    </>
  )
}
