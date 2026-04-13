// src/lib/data.ts
// Server-side data loaders — reads static JSON from public/data/
// These run at request time on the server, never in the browser.

import path from 'path'
import fs from 'fs'
import type {
  PredictionPoint, ProvinceData, MunicipalityData, ShapFeature
} from '@/types'

function loadJson<T>(filename: string): T {
  const fpath = path.join(process.cwd(), 'public', 'data', filename)
  const raw   = fs.readFileSync(fpath, 'utf-8')
  return JSON.parse(raw) as T
}

export function getAllPoints(): PredictionPoint[] {
  return loadJson<PredictionPoint[]>('points.json')
}

export function getAllProvinces(): Record<string, ProvinceData> {
  return loadJson<Record<string, ProvinceData>>('provinces.json')
}

export function getAllMunicipalities(): Record<string, MunicipalityData> {
  return loadJson<Record<string, MunicipalityData>>('municipalities.json')
}

export function getGlobalShap(): ShapFeature[] {
  return loadJson<ShapFeature[]>('shap_global.json')
}

export function getShapByArea(): Record<string, ShapFeature[]> {
  return loadJson<Record<string, ShapFeature[]>>('shap_by_area.json')
}

// Build search index — called once at build time / request time
export function buildSearchIndex(
  provinces: Record<string, ProvinceData>,
  municipalities: Record<string, MunicipalityData>
) {
  const results: Array<{
    label: string
    sublabel: string
    type: 'province' | 'municipality'
    key: string
  }> = []

  for (const [name, data] of Object.entries(provinces)) {
    results.push({
      label   : name,
      sublabel: `Province · ${data.region}`,
      type    : 'province',
      key     : name
    })
  }

  for (const [key, data] of Object.entries(municipalities)) {
    results.push({
      label   : data.municipality,
      sublabel: `Municipality · ${data.province}`,
      type    : 'municipality',
      key
    })
  }

  return results
}
