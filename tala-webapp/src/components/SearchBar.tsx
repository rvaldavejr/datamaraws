'use client'
// src/components/SearchBar.tsx
import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import type { ProvinceData, MunicipalityData } from '@/types'

interface SearchItem {
  label   : string
  sublabel: string
  type    : 'province' | 'municipality'
  key     : string
}

interface Props {
  provinces     : Record<string, ProvinceData>
  municipalities: Record<string, MunicipalityData>
  onSelect      : (type: 'province' | 'municipality', key: string) => void
}

export default function SearchBar({ provinces, municipalities, onSelect }: Props) {
  const [query,   setQuery]   = useState('')
  const [open,    setOpen]    = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)

  const index = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = []
    for (const name of Object.keys(provinces)) {
      items.push({ label: name, sublabel: `Province · ${provinces[name].region}`, type: 'province', key: name })
    }
    for (const [key, d] of Object.entries(municipalities)) {
      items.push({ label: d.municipality, sublabel: `Municipality · ${d.province}`, type: 'municipality', key })
    }
    return items
  }, [provinces, municipalities])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return index.filter(
      i => i.label.toLowerCase().includes(q) ||
           i.sublabel.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [query, index])

  useEffect(() => {
    setOpen(results.length > 0)
  }, [results])

  function handleSelect(item: SearchItem) {
    setQuery('')
    setOpen(false)
    onSelect(item.type, item.key)
  }

  return (
    <div className="relative w-72">
      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700
                      rounded px-3 py-1.5 focus-within:border-slate-500 transition-colors">
        <Search size={13} className="text-slate-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search province or municipality…"
          className="bg-transparent text-sm text-white placeholder-slate-500
                     outline-none w-full font-mono"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }}>
            <X size={13} className="text-slate-500 hover:text-white" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-slate-800
                        border border-slate-700 rounded shadow-xl z-50 overflow-hidden">
          {results.map((item, i) => (
            <button
              key={i}
              onClick={() => handleSelect(item)}
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left
                         hover:bg-slate-700 transition-colors border-b border-slate-700/50
                         last:border-0"
            >
              <div className="shrink-0 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full mt-1
                  ${item.type === 'province' ? 'bg-red-500' : 'bg-yellow-500'}`}/>
              </div>
              <div>
                <div className="text-sm text-white font-medium">{item.label}</div>
                <div className="text-xs text-slate-400 font-mono">{item.sublabel}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
