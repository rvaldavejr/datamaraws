'use client'
// src/components/SidePanel.tsx

import { useState, useEffect } from 'react'
import { X, Download, BarChart2, MapPin, Database, Globe } from 'lucide-react'
import type { SelectedArea } from '@/types'
import { generateReport } from '@/utils/report'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return (n >= 0 ? '+' : '') + n.toFixed(d)
}

function WealthBar({ pctLow, pctMid, pctHigh }: {
  pctLow: number; pctMid: number; pctHigh: number
}) {
  return (
    <div className="flex rounded overflow-hidden h-2 w-full mt-1">
      <div style={{ width: `${pctLow}%`,  background: 'var(--tala-low)'   }} />
      <div style={{ width: `${pctMid}%`,  background: 'var(--tala-below)' }} />
      <div style={{ width: `${pctHigh}%`, background: 'var(--tala-teal)'  }} />
    </div>
  )
}

function shapCategoryColor(category?: string): string {
  switch (category) {
    case 'Temporal':  return '#5ce1e6'
    case 'Satellite': return '#93c5fd'   // sky blue — brighter than mist
    case 'Landuse':   return '#f59e0b'   // amber-gold — warmer, distinct
    case 'Building':  return '#60a5fa'   // sky blue — readable on dark
    case 'Road':      return '#94a3b8'   // slate-400 — lighter grey
    case 'POI':       return '#a78bfa'   // violet — distinct, readable
    default:          return '#d4dfe6'
  }
}

// ── Mean features in osm_agg (already per-buffer averages) ────────────────
// All other features in osm_agg are area totals and displayed as-is.
const MEAN_FEATURES = new Set([
  'Mean_Bldg_Area', 'Total_Bldg_Proportion', 'Bldg_Density_per_km2',
  'Bldg_residential_MeanArea', 'Bldg_residential_Proportion',
  'Bldg_commercial_MeanArea',  'Bldg_commercial_Proportion',
  'Bldg_industrial_MeanArea',  'Bldg_industrial_Proportion',
  'Bldg_school_MeanArea',      'Bldg_school_Proportion',
  'Bldg_hospital_MeanArea',    'Bldg_hospital_Proportion',
  'VIIRS_Median',
])

// ── Component ──────────────────────────────────────────────────────────────

// ── Inline SVG donut chart ─────────────────────────────────────────────────
// Renders a compact donut inside the sidebar without any external dependency.

interface DonutSlice { label: string; val: number; color: string }

function DonutChart({ slices, size = 110 }: { slices: DonutSlice[]; size?: number }) {
  const total  = slices.reduce((s, d) => s + d.val, 0)
  if (total === 0) return null

  const cx = size / 2
  const cy = size / 2
  const R  = size * 0.38   // outer radius
  const r  = size * 0.22   // inner radius (hole)

  // Build arc paths
  let angle = -Math.PI / 2  // start at 12 o'clock
  const paths = slices
    .filter(d => d.val > 0)
    .map(d => {
      const sweep  = (d.val / total) * 2 * Math.PI
      const x1o    = cx + R * Math.cos(angle)
      const y1o    = cy + R * Math.sin(angle)
      const x1i    = cx + r * Math.cos(angle)
      const y1i    = cy + r * Math.sin(angle)
      angle       += sweep
      const x2o    = cx + R * Math.cos(angle)
      const y2o    = cy + R * Math.sin(angle)
      const x2i    = cx + r * Math.cos(angle)
      const y2i    = cy + r * Math.sin(angle)
      const large  = sweep > Math.PI ? 1 : 0
      const path   = [
        `M ${x1o} ${y1o}`,
        `A ${R} ${R} 0 ${large} 1 ${x2o} ${y2o}`,
        `L ${x2i} ${y2i}`,
        `A ${r} ${r} 0 ${large} 0 ${x1i} ${y1i}`,
        'Z',
      ].join(' ')
      return { path, color: d.color, label: d.label, val: d.val }
    })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         style={{ overflow: 'visible', flexShrink: 0 }}>
      {paths.map((p, i) => (
        <path key={i} d={p.path} fill={p.color} stroke="#0f172a" strokeWidth={1} />
      ))}
    </svg>
  )
}

interface Props {
  area: SelectedArea
  onClose: () => void
}

export default function SidePanel({ area, onClose }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [natStats, setNatStats]       = useState<{ mean: number; std: number; n: number } | null>(null)

  const d   = area.data as any
  // Province/municipality aggregated features use key osm_agg in the JSON.
  // Point-level features use key osm.
  const osm = (d.osm_agg ?? {}) as Record<string, number>
  const shap      = area.shap.slice(0, 10)
  const pctLow    = d.pct_low      ?? 0
  const pctHigh   = d.pct_high     ?? 0
  const pctMid    = Math.max(0, 100 - pctLow - pctHigh)
  const nPoints   = d.n_points     ?? area.points.length
  const nDhsPts   = d.n_dhs_points ?? 0
  const dhsMeanWI = (d.dhs_mean_wi ?? null) as number | null

  const g = (f: string) => osm[f] ?? 0

  // Fetch pre-computed national stats from national_stats.json on mount.
  // Computed directly from all 1,112 prediction points in prepare_webapp_data.py.
  useEffect(() => {
    fetch('/data/national_stats.json')
      .then(r => r.json())
      .then((ns: any) => {
        setNatStats({
          mean: ns.mean_wi,
          std : ns.std_wi,
          n   : ns.n_points,
        })
      })
      .catch(() => { /* silently skip if fetch fails */ })
  }, [])

  // Landuse totals → km²
  const luAgri  = g('LU_Agricultural_m2') / 1e6
  const luFor   = g('LU_Forest_m2')        / 1e6
  const luRes   = g('LU_Residential_m2')  / 1e6
  const luCom   = g('LU_Commercial_m2')   / 1e6
  const luInd   = g('LU_Industrial_m2')   / 1e6
  const luTotal = luAgri + luFor + luRes + luCom + luInd

  // ── PDF / report ─────────────────────────────────────────────────────────

  async function generateAndDownload() {
    setDownloading(true)
    try {
      const [provRes, muniRes, natRes] = await Promise.all([
        fetch('/data/provinces.json'),
        fetch('/data/municipalities.json'),
        fetch('/data/national_stats.json'),
      ])
      const allProvinces      = await provRes.json()
      const allMunicipalities = await muniRes.json()
      const nationalStats     = await natRes.json()
      const html     = generateReport(area, { allProvinces, allMunicipalities, nationalStats })
      const filename = `tala-report-${area.name.toLowerCase().replace(/\s+/g, '-')}.pdf`

      // Open in new tab immediately
      const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
      window.open(URL.createObjectURL(blob), '_blank')

      // PDF in background
      const html2pdf = (await import('html2pdf.js')).default
      const iframe   = document.createElement('iframe')
      Object.assign(iframe.style, {
        position: 'fixed', top: '0', left: '0', width: '1080px',
        height: '100vh', opacity: '0', zIndex: '-9999', pointerEvents: 'none',
      })
      document.body.appendChild(iframe)
      const doc = iframe.contentWindow!.document
      doc.open(); doc.write(html); doc.close()
      await new Promise(r => setTimeout(r, 2000))
      const el = doc.documentElement
      await html2pdf().set({
        margin: 0, filename,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { scale: 2, useCORS: true, logging: false,
                       windowWidth: el.scrollWidth, scrollY: 0 },
        jsPDF: { unit: 'px',
                 format: [el.scrollWidth, el.scrollHeight + 2],
                 orientation: 'portrait' },
      }).from(el).save()
      document.body.removeChild(iframe)
    } catch (err) {
      console.error('Report generation failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <aside className="w-80 shrink-0 bg-slate-900 border-l border-slate-800
                      flex flex-col overflow-hidden z-20">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-800
                      flex items-start justify-between shrink-0">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider mb-0.5"
               style={{ color: 'var(--tala-teal)' }}>
            {area.type === 'province' ? 'Province' : 'Municipality'}
          </div>
          <div className="text-white font-semibold text-sm leading-tight">
            {area.name}
          </div>
          {area.province && (
            <div className="text-slate-400 text-xs font-mono mt-0.5">
              {area.province}
            </div>
          )}
        </div>
        <button onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors mt-0.5">
          <X size={16} />
        </button>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Wealth Index */}
        <div>
          <div className="font-mono text-xs uppercase tracking-wider mb-2"
               style={{ color: 'var(--tala-teal)' }}>
            Estimated Wealth Index (mean)
          </div>
          <div className="text-3xl font-bold font-mono text-white">
            {fmt(d.mean_wi ?? 0)}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-0.5">
            RANGE {fmt(d.min_wi ?? 0)} to {fmt(d.max_wi ?? 0)}
            {(d.std_wi ?? 0) > 0 ? ` · σ ${d.std_wi.toFixed(3)}` : ''}
          </div>
          <WealthBar pctLow={pctLow} pctMid={pctMid} pctHigh={pctHigh} />
          <div className="flex justify-between mt-1 font-mono text-xs">
            <span className="text-red-400">{pctLow.toFixed(0)}% low</span>
            <span className="text-yellow-400">{pctMid.toFixed(0)}% mid</span>
            <span className="text-green-400">{pctHigh.toFixed(0)}% high</span>
          </div>
          {/* Study-wide benchmarks */}
          {natStats && (
            <div className="mt-2 flex gap-3 font-mono text-[10px] text-slate-500">
              <span>
                Study mean{' '}
                <span className="text-slate-300">{fmt(natStats.mean)}</span>
              </span>
              <span>
                Study σ{' '}
                <span className="text-slate-300">{natStats.std.toFixed(3)}</span>
              </span>
              <span>
                n{' '}
                <span className="text-slate-300">{natStats.n}</span>
              </span>
            </div>
          )}
        </div>

        {/* DHS Survey WI */}
        {dhsMeanWI !== null && (
          <div className="px-3 py-2 rounded border"
               style={{ background: 'rgba(92,225,230,.06)',
                        borderColor: 'rgba(92,225,230,.2)' }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Database size={10} style={{ color: 'var(--tala-teal)' }} />
              <span className="font-mono text-xs uppercase tracking-wider"
                    style={{ color: 'var(--tala-teal)' }}>
                DHS Survey WI (mean)
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-white font-mono font-semibold text-base">
                {fmt(dhsMeanWI)}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {nDhsPts} DHS cluster{nDhsPts !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">
              model deviation {fmt((d.mean_wi ?? 0) - dhsMeanWI)}
            </div>
          </div>
        )}

        {/* Area summary stats */}
        <div>
          <div className="font-mono text-xs uppercase tracking-wider mb-2"
               style={{ color: 'var(--tala-teal)' }}>
            Area Summary
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Points',          value: nPoints,
                sub: `${nDhsPts} DHS` },
              { label: 'DHS Mean WI',
                value: dhsMeanWI !== null ? fmt(dhsMeanWI) : 'No DHS data',
                sub: dhsMeanWI !== null ? `${nDhsPts} survey cluster${nDhsPts!==1?'s':''}` : 'no survey clusters' },
              { label: 'VIIRS Mean (nW)', value: g('VIIRS_Median').toFixed(2),
                sub: 'per-buffer avg' },
              { label: 'Mean Bldg Area',  value: `${g('Mean_Bldg_Area').toFixed(0)} m²`,
                sub: 'per-buffer avg' },
              { label: 'Bldg Density',    value: `${g('Bldg_Density_per_km2').toFixed(1)}/km²`,
                sub: 'per-buffer avg' },
              { label: 'Total Roads',     value: `${Math.round(g('Total_Road_Length'))} km`,
                sub: 'area total' },
              { label: 'Total Buildings', value: Math.round(g('Total_Bldg_Count')).toLocaleString(),
                sub: 'area total' },
              { label: 'Total POIs',      value: Math.round(g('Total_POI_Count')).toLocaleString(),
                sub: 'area total' },
            ].map(({ label, value, sub }) => (
              <div key={label}
                   className="bg-slate-800 rounded px-3 py-2 border border-slate-700">
                <div className="font-mono text-xs" style={{ color: 'var(--tala-teal)' }}>
                  {label}
                </div>
                <div className="text-white text-sm font-mono font-medium mt-0.5">
                  {value}
                </div>
                {sub && <div className="text-slate-600 text-[10px] font-mono">{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Service infrastructure — donut */}
        <div>
          <div className="font-mono text-xs uppercase tracking-wider mb-3"
               style={{ color: 'var(--tala-teal)' }}>
            Service Infrastructure (area totals)
          </div>
          {(() => {
            const infraSlices: DonutSlice[] = [
              { label: 'Banks + ATMs',      val: g('POI_bank_Count') + g('POI_atm_Count'),       color: '#5ce1e6' },
              { label: 'Schools',           val: g('Bldg_school_Count') + g('POI_school_Count'),  color: '#60a5fa' },
              { label: 'Restaurants',       val: g('POI_restaurant_Count'),                       color: '#f59e0b' },
              { label: 'Pharmacies',        val: g('POI_pharmacy_Count'),                          color: '#86efac' },
              { label: 'Markets',           val: g('POI_market_Count'),                            color: '#27ae60' },
              { label: 'Health Facilities', val: g('POI_hospital_Count') + g('Bldg_hospital_Count'), color: '#c0392b' },
              { label: 'Govt + Police',     val: g('POI_government_Count') + g('POI_police_Count'),  color: '#a78bfa' },
            ].filter(s => s.val > 0)
            const infraTotal = infraSlices.reduce((s, d) => s + d.val, 0)
            if (infraTotal === 0) return (
              <p className="text-xs text-slate-600 font-mono">No service data available.</p>
            )
            return (
              <div className="flex gap-3 items-center">
                <DonutChart slices={infraSlices} size={100} />
                <div className="flex-1 space-y-1.5 min-w-0">
                  {infraSlices.map(({ label, val, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm shrink-0"
                           style={{ background: color }} />
                      <span className="text-[10px] text-slate-400 font-mono truncate flex-1">
                        {label}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {Math.round(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Landuse composition — donut */}
        {luTotal > 0 && (
          <div>
            <div className="font-mono text-xs uppercase tracking-wider mb-3"
                 style={{ color: 'var(--tala-teal)' }}>
              Landuse (total km²)
            </div>
            {(() => {
              const luSlices: DonutSlice[] = [
                { label: 'Agricultural', val: luAgri, color: '#f59e0b' },
                { label: 'Forest',       val: luFor,  color: '#27ae60' },
                { label: 'Residential',  val: luRes,  color: '#60a5fa' },
                { label: 'Commercial',   val: luCom,  color: '#a78bfa' },
                { label: 'Industrial',   val: luInd,  color: '#f87171' },
              ].filter(s => s.val > 0)
              return (
                <div className="flex gap-3 items-center">
                  <DonutChart slices={luSlices} size={100} />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {luSlices.map(({ label, val, color }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm shrink-0"
                             style={{ background: color }} />
                        <span className="text-[10px] text-slate-400 font-mono truncate flex-1">
                          {label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {val >= 1000 ? `${(val/1000).toFixed(1)}k` : val.toFixed(1)} km²
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* SHAP drivers — ranked list, no bars */}
        <div>
          <div className="font-mono text-xs uppercase tracking-wider mb-3
                          flex items-center gap-1.5"
               style={{ color: 'var(--tala-teal)' }}>
            <BarChart2 size={11} />
            Top Feature Drivers
          </div>
          <div className="space-y-2">
            {shap.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2">
                {/* Rank */}
                <span className="font-mono text-[10px] text-slate-600 w-4 shrink-0">
                  {i + 1}
                </span>
                {/* Feature name */}
                <span className="font-mono text-[10px] text-slate-300 truncate flex-1 min-w-0">
                  {s.feature.replace(/_/g, ' ')}
                </span>
                {/* Category badge */}
                {s.category && (
                  <span className="font-mono text-[9px] px-1 rounded shrink-0" style={{
                    background: `${shapCategoryColor(s.category)}22`,
                    color: shapCategoryColor(s.category),
                    border: `1px solid ${shapCategoryColor(s.category)}44`,
                  }}>
                    {s.category}
                  </span>
                )}
                {/* SHAP value */}
                <span className="font-mono text-[10px] text-slate-400 shrink-0 w-10 text-right">
                  {s.mean_abs_shap.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
          {/* Category legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2 border-t border-slate-800">
            {(['Temporal','Landuse','Building','POI','Road','Satellite'] as const)
              .map(cat => (
                <div key={cat} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm"
                       style={{ background: shapCategoryColor(cat) }} />
                  <span className="font-mono text-[9px] text-slate-500">{cat}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Prediction points list */}
        <div>
          <div className="font-mono text-xs uppercase tracking-wider mb-2
                          flex items-center gap-1.5"
               style={{ color: 'var(--tala-teal)' }}>
            <MapPin size={11} />
            Prediction Points ({area.points.length})
          </div>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {(area.points as any[])
              .sort((a, b) => a.wi - b.wi)
              .slice(0, 12)
              .map((p: any) => (
                <div key={p.id}
                  className="flex items-center justify-between py-1 border-b
                             border-slate-800 last:border-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-slate-500 font-mono shrink-0">
                      {String(p.id).padStart(4, '0')}
                    </span>
                    <span className={`text-[9px] font-mono px-1 rounded shrink-0 ${
                      p.source === 'DHS'
                        ? 'bg-teal-900/50 text-teal-400'
                        : 'bg-slate-700 text-slate-500'
                    }`}>
                      {p.source === 'DHS' ? 'DHS' : 'GRD'}
                    </span>
                    <span className="text-xs text-slate-400 truncate">
                      {p.municipality}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    {p.source === 'DHS' && p.dhs_wi != null && (
                      <span className="text-[9px] font-mono text-slate-500">
                        ({fmt(p.dhs_wi, 2)})
                      </span>
                    )}
                    <span className={`text-xs font-mono font-medium ${
                      p.wi >= 0.5  ? 'text-green-400' :
                      p.wi >= -0.5 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {fmt(p.wi)}
                    </span>
                  </div>
                </div>
              ))}
            {area.points.length > 12 && (
              <div className="text-xs text-slate-600 font-mono pt-1">
                + {area.points.length - 12} more points in report
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-2">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono px-1 rounded bg-teal-900/50 text-teal-400">
                DHS
              </span>
              <span className="text-[9px] text-slate-500 font-mono">survey cluster</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono px-1 rounded bg-slate-700 text-slate-500">
                GRD
              </span>
              <span className="text-[9px] text-slate-500 font-mono">grid point</span>
            </div>
          </div>
        </div>

        

      </div>

      {/* Download */}
      <div className="px-4 py-3 border-t border-slate-800 shrink-0">
        <button
          onClick={generateAndDownload}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 bg-red-700
                     hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white text-sm font-mono py-2.5 rounded transition-colors"
        >
          <Download size={14} />
          {downloading ? 'Generating…' : 'Download Analytics Report'}
        </button>
      </div>
    </aside>
  )
}