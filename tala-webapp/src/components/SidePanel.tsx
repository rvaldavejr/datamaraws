'use client'
// src/components/SidePanel.tsx
import { useState } from 'react'
import { X, Download, BarChart2, MapPin } from 'lucide-react'
import type { SelectedArea } from '@/types'

function fmt(n: number, d = 2) {
  return (n >= 0 ? '+' : '') + n.toFixed(d)
}

function WealthBar({ pctLow, pctMid, pctHigh }: {
  pctLow: number, pctMid: number, pctHigh: number
}) {
  return (
    <div className="flex rounded overflow-hidden h-2 w-full mt-1">
      <div style={{ width: `${pctLow}%` }} className="bg-red-600" title={`Low ${pctLow}%`}/>
      <div style={{ width: `${pctMid}%` }} className="bg-yellow-500" title={`Mid ${pctMid}%`}/>
      <div style={{ width: `${pctHigh}%`}} className="bg-green-500" title={`High ${pctHigh}%`}/>
    </div>
  )
}

interface Props {
  area   : SelectedArea
  onClose: () => void
}

export default function SidePanel({ area, onClose }: Props) {
  const [downloading, setDownloading] = useState(false)
  const d    = area.data as any
  const osm  = d.osm_mean ?? {}
  const shap = area.shap.slice(0, 8)
  const maxShap = shap[0]?.mean_abs_shap ?? 1

  const pctLow  = d.pct_low  ?? 0
  const pctHigh = d.pct_high ?? 0
  const pctMid  = Math.max(0, 100 - pctLow - pctHigh)

  async function downloadReport() {
    setDownloading(true)
    try {
      const payload = {
        type    : area.type,
        name    : area.name,
        province    : area.province,
        data        : area.data,
        points      : area.points,
        shap        : area.shap,
      }
      const res  = await fetch('/api/report', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload),
      })
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `tala-report-${area.name.replace(/\s+/g, '-').toLowerCase()}.html`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <aside className="w-80 shrink-0 bg-slate-900 border-l border-slate-800
                      flex flex-col overflow-hidden z-20">

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between shrink-0">
        <div>
          <div className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-0.5">
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

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Wealth Index Summary */}
        <div>
          <div className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-2">
            Predicted Wealth Index
          </div>
          <div className="text-3xl font-bold font-mono text-white">
            {fmt(d.mean_wi ?? 0)}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-0.5">
            mean · range {fmt(d.min_wi ?? 0)} to {fmt(d.max_wi ?? 0)}
          </div>
          <WealthBar pctLow={pctLow} pctMid={pctMid} pctHigh={pctHigh} />
          <div className="flex justify-between mt-1 font-mono text-xs text-slate-500">
            <span className="text-red-400">{pctLow.toFixed(0)}% low</span>
            <span className="text-yellow-400">{pctMid.toFixed(0)}% mid</span>
            <span className="text-green-400">{pctHigh.toFixed(0)}% high</span>
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Points', value: d.n_points ?? area.points.length },
            { label: 'PSA Poverty', value: d.poverty_rate != null ? `${d.poverty_rate}%` : 'N/A' },
            { label: 'VIIRS (nW)', value: (osm.VIIRS_Median ?? 0).toFixed(2) },
            { label: 'Total POIs', value: Math.round(osm.Total_POI_Count ?? 0) },
            { label: 'Roads (km)', value: (osm.Total_Road_Length ?? 0).toFixed(1) },
            { label: 'Banks', value: Math.round(osm.POI_bank_Count ?? 0) },
          ].map(({ label, value }) => (
            <div key={label}
                 className="bg-slate-800 rounded px-3 py-2 border border-slate-700">
              <div className="font-mono text-xs text-slate-500">{label}</div>
              <div className="text-white text-sm font-mono font-medium mt-0.5">
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* SHAP Feature Drivers */}
        <div>
          <div className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-3
                          flex items-center gap-1.5">
            <BarChart2 size={11} />
            Top Feature Drivers
          </div>
          <div className="space-y-2">
            {shap.map((s, i) => (
              <div key={i}>
                <div className="flex justify-between mb-0.5">
                  <span className="font-mono text-xs text-slate-300 truncate max-w-[160px]">
                    {s.feature.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {s.mean_abs_shap.toFixed(3)}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(s.mean_abs_shap / maxShap * 100).toFixed(0)}%`,
                      background: `hsl(${210 - i * 15}, 60%, ${45 + i * 3}%)`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Point list preview */}
        <div>
          <div className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-2
                          flex items-center gap-1.5">
            <MapPin size={11} />
            Prediction Points ({area.points.length})
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {area.points
              .sort((a, b) => a.wi - b.wi)
              .slice(0, 10)
              .map(p => (
                <div key={p.id}
                     className="flex items-center justify-between py-1 border-b
                                border-slate-800 last:border-0">
                  <span className="text-xs text-slate-400 font-mono">
                    PT-{String(p.id).padStart(5,'0')}
                  </span>
                  <span className="text-xs text-slate-400 truncate mx-2 flex-1">
                    {p.municipality}
                  </span>
                  <span className={`text-xs font-mono font-medium
                    ${p.wi >= 0.5 ? 'text-green-400' :
                      p.wi >= -0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {fmt(p.wi)}
                  </span>
                </div>
              ))
            }
            {area.points.length > 10 && (
              <div className="text-xs text-slate-600 font-mono pt-1">
                + {area.points.length - 10} more points in report
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Download button */}
      <div className="px-4 py-3 border-t border-slate-800 shrink-0">
        <button
          onClick={downloadReport}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 bg-red-700
                     hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white text-sm font-mono py-2.5 rounded transition-colors"
        >
          <Download size={14} />
          {downloading ? 'Generating…' : 'Download Analytics Report'}
        </button>
        <div className="text-xs text-slate-600 font-mono text-center mt-2">
          Downloads as HTML · Print to PDF in browser
        </div>
      </div>
    </aside>
  )
}
