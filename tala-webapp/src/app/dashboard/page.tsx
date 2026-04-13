'use client'
// src/app/dashboard/page.tsx
// Main dashboard — heatmap + search + side panel

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'
import SearchBar from '@/components/SearchBar'
import SidePanel from '@/components/SidePanel'
import type {
  PredictionPoint, ProvinceData, MunicipalityData,
  ShapFeature, SelectedArea
} from '@/types'

// Map must be loaded client-side only (Mapbox uses window)
const TalaMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900">
      <div className="text-slate-400 font-mono text-sm">Loading map…</div>
    </div>
  )
})

export default function DashboardPage() {
  const [points, setPoints] = useState<PredictionPoint[]>([])
  const [provinces, setProvinces] = useState<Record<string, ProvinceData>>({})
  const [municipalities, setMunicipalities] = useState<Record<string, MunicipalityData>>({})
  const [shapGlobal, setShapGlobal] = useState<ShapFeature[]>([])
  const [shapByArea, setShapByArea] = useState<Record<string, ShapFeature[]>>({})
  const [selected, setSelected] = useState<SelectedArea | null>(null)
  const [loading, setLoading] = useState(true)

  // Load all static data on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [pRes, provRes, muniRes, shapGRes, shapARes] = await Promise.all([
          fetch('/data/points.json'),
          fetch('/data/provinces.json'),
          fetch('/data/municipalities.json'),
          fetch('/data/shap_global.json'),
          fetch('/data/shap_by_area.json'),
        ])
        const [pts, provs, munis, sg, sa] = await Promise.all([
          pRes.json(), provRes.json(), muniRes.json(),
          shapGRes.json(), shapARes.json()
        ])
        setPoints(pts)
        setProvinces(provs)
        setMunicipalities(munis)
        setShapGlobal(sg)
        setShapByArea(sa)
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Handle area selection from search or map click
  const handleSelectArea = useCallback((
    type: 'province' | 'municipality',
    key: string
  ) => {
    if (type === 'province') {
      const data = provinces[key]
      if (!data) return
      const areaPoints = points.filter(p => p.province === key)
      const shap = shapByArea[key] ?? shapGlobal

      setSelected({
        type: 'province',
        name: key,
        data,
        points: areaPoints,
        shap
      })
    } else {
      const data = municipalities[key]
      if (!data) return
      const areaPoints = points.filter(
        p => p.municipality === data.municipality &&
          p.province === data.province
      )
      const shap = shapByArea[data.province] ?? shapGlobal

      setSelected({
        type: 'municipality',
        name: data.municipality,
        province: data.province,
        data,
        points: areaPoints,
        shap
      })
    }
  }, [provinces, municipalities, points, shapGlobal, shapByArea])

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

      {/* ── TOP BAR ─────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5
                         bg-slate-900 border-b border-slate-800 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-red-700 flex items-center
                          justify-center text-xs font-bold font-mono">T</div>
          <span className="font-mono text-sm font-medium tracking-wide">
            Project TALA
          </span>
          <span className="text-slate-500 text-xs font-mono">
            · Poverty Incidence Estimation · Philippines 2025
          </span>
        </div>

        <div className="flex items-center gap-4 flex-1 justify-end">
          <SearchBar
            provinces={provinces}
            municipalities={municipalities}
            onSelect={handleSelectArea}
          />
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white
                       text-xs font-mono transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Map fills the space */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <div className="text-center">
                <div className="text-slate-400 font-mono text-sm mb-2">
                  Loading {points.length > 0 ? points.length : '…'} prediction points
                </div>
                <div className="w-48 h-1 bg-slate-800 rounded mx-auto overflow-hidden">
                  <div className="h-full bg-red-600 rounded animate-pulse w-1/2" />
                </div>
              </div>
            </div>
          ) : (
            <TalaMap
              points={points}
              selected={selected}
              onSelectArea={handleSelectArea}
            />
          )}

          {/* Legend */}
          <div className="absolute bottom-8 left-4 bg-slate-900/90 backdrop-blur
                          border border-slate-700 rounded px-3 py-2 z-10">
            <div className="font-mono text-xs text-slate-400 mb-2 uppercase tracking-wider">
              Wealth Index
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-32 h-2.5 rounded"
                style={{ background: 'linear-gradient(to right,#c0392b,#e67e22,#326189,#5ce1e6)' }} />
            </div>
            <div className="flex justify-between font-mono text-xs text-slate-500 w-32">
              <span>Poor</span><span>Wealthy</span>
            </div>
          </div>
        </div>

        {/* Side panel — shown when area is selected */}
        {selected && (
          <SidePanel
            area={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
