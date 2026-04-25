// src/lib/report.ts
// Generates a downloadable HTML analytics report.
//
// Sections:
//   01  Area Overview
//   02  Point-Level Estimates
//   03  Wealth Distribution
//   04  Infrastructure Profile
//   05  Municipal Breakdown  (province only)
//   06  SHAP Feature Attribution
//   07  Policy Recommendations
//   08  National Comparison  (all 11 provinces + 166 municipalities)
//   09  Methodology

import type { SelectedArea, OsmFeatures } from '@/types'

// ── Font config ─────────────────────────────────────────────────────────────
const FONTS = {
  googleUrl: 'DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500',
  sans: "'DM Sans', sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
  mono: "'DM Mono', 'Courier New', monospace",
}

// ── Mean features in osm_agg (per-buffer averages) ──────────────────────────
// All other keys in osm_agg are province/municipality totals.
const MEAN_FEATURES = new Set([
  'Mean_Bldg_Area', 'Total_Bldg_Proportion', 'Bldg_Density_per_km2',
  'Bldg_residential_MeanArea', 'Bldg_residential_Proportion',
  'Bldg_commercial_MeanArea', 'Bldg_commercial_Proportion',
  'Bldg_industrial_MeanArea', 'Bldg_industrial_Proportion',
  'Bldg_school_MeanArea', 'Bldg_school_Proportion',
  'Bldg_hospital_MeanArea', 'Bldg_hospital_Proportion',
  'VIIRS_Median',
])

// ── Helpers ──────────────────────────────────────────────────────────────────

function wiChipClass(wi: number) {
  if (wi >= 0.5) return 'w-high'
  if (wi >= -0.5) return 'w-mid'
  return 'w-low'
}
function wiLabel(wi: number) {
  if (wi >= 0.5) return 'High Wealth'
  if (wi >= 0.0) return 'Moderate'
  if (wi >= -0.5) return 'Below Average'
  return 'Low Wealth'
}
function fmt(n: number, d = 2) {
  return (n >= 0 ? '+' : '') + n.toFixed(d)
}
function isMean(f: string) { return MEAN_FEATURES.has(f) }
// Returns a short unit string for display
function featureUnit(f: string): string {
  if (f.includes('Road') || f.includes('Track')) return 'km'
  if (f.includes('_m2')) return 'km²'
  if (f.includes('Area') && !f.includes('Mean')) return 'm²'
  if (f === 'VIIRS_Median') return 'nW'
  return ''
}

// ── SHAP category mapping ────────────────────────────────────────────────────
const CAT_MAP: Record<string, string> = {
  VIIRS_Median: 'Satellite',
  Total_Road_Length: 'Road', Main_Roads_Length: 'Road',
  Secondary_Roads_Length: 'Road', Local_Roads_Length: 'Road', Tracks_Length: 'Road',
  Total_Bldg_Count: 'Building', Total_Bldg_Area: 'Building',
  Mean_Bldg_Area: 'Building', Total_Bldg_Proportion: 'Building', Bldg_Density_per_km2: 'Building',
  Bldg_residential_Count: 'Building', Bldg_residential_TotalArea: 'Building',
  Bldg_residential_MeanArea: 'Building', Bldg_residential_Proportion: 'Building',
  Bldg_commercial_Count: 'Building', Bldg_commercial_TotalArea: 'Building',
  Bldg_commercial_MeanArea: 'Building', Bldg_commercial_Proportion: 'Building',
  Bldg_industrial_Count: 'Building', Bldg_industrial_TotalArea: 'Building',
  Bldg_industrial_MeanArea: 'Building', Bldg_industrial_Proportion: 'Building',
  Bldg_school_Count: 'Building', Bldg_school_TotalArea: 'Building',
  Bldg_school_MeanArea: 'Building', Bldg_school_Proportion: 'Building',
  Bldg_hospital_Count: 'Building', Bldg_hospital_TotalArea: 'Building',
  Bldg_hospital_MeanArea: 'Building', Bldg_hospital_Proportion: 'Building',
  Total_POI_Count: 'POI',
  POI_bank_Count: 'POI', POI_atm_Count: 'POI', POI_hotel_Count: 'POI',
  POI_fast_food_Count: 'POI', POI_convenience_Count: 'POI', POI_restaurant_Count: 'POI',
  POI_market_Count: 'POI', POI_school_Count: 'POI', POI_hospital_Count: 'POI',
  POI_pharmacy_Count: 'POI', POI_government_Count: 'POI', POI_police_Count: 'POI',
  POI_post_office_Count: 'POI', POI_community_Count: 'POI', POI_sports_Count: 'POI',
  LU_Residential_m2: 'Landuse', LU_Commercial_m2: 'Landuse',
  LU_Industrial_m2: 'Landuse', LU_Agricultural_m2: 'Landuse', LU_Forest_m2: 'Landuse',
}

// ── Policy map ───────────────────────────────────────────────────────────────
const POLICY_MAP: Record<string, {
  domain: string; agency: string
  body: (v: number, a: string, s: number) => string
}> = {
  VIIRS_Median: {
    domain: 'Electrification', agency: 'MERALCO / DOE / DSWD',
    body: (v, a, s) => `Nighttime luminosity is a key predictor of wealth in ${a} (SHAP = ${s.toFixed(3)}). Mean VIIRS radiance of ${v.toFixed(2)} nW/cm²/sr indicates ${v < 1 ? 'critically limited' : v < 3 ? 'below-average' : 'moderate'} electrification. DOE and MERALCO should prioritise household electricity connections and solar streetlighting in the lowest-wealth municipalities.`,
  },
  LU_Agricultural_m2: {
    domain: 'Agricultural Development', agency: 'DA / DAR / DTI',
    body: (v, a, s) => `Agricultural landuse (${(v / 1e6).toFixed(0)} km² total, SHAP = ${s.toFixed(3)}) is the strongest static predictor in ${a}. High agricultural coverage with low wealth indicates subsistence farming. DA should prioritise crop diversification, value chain access, and smallholder credit in the lowest-wealth municipalities.`,
  },
  LU_Forest_m2: {
    domain: 'Forest Community Development', agency: 'DENR / NCIP / DSWD',
    body: (v, a, s) => `Forest cover (${(v / 1e6).toFixed(0)} km² total, SHAP = ${s.toFixed(3)}) is associated with lower wealth in ${a}, reflecting isolation of upland communities. DENR CBFM and NCIP IP development plans should target forest-adjacent barangays for livelihood programmes and social protection.`,
  },
  LU_Commercial_m2: {
    domain: 'Commercial Development', agency: 'DTI / PEZA / LGU',
    body: (v, a, s) => `Commercial landuse (${(v / 1e6).toFixed(2)} km² total, SHAP = ${s.toFixed(3)}) reflects formal economic activity in ${a}. DTI investment promotion and LGU business permitting reform should target municipalities with the smallest commercial footprint.`,
  },
  Total_POI_Count: {
    domain: 'Service Accessibility', agency: 'DILG / DTI / LGU',
    body: (v, a, s) => `Total service facility count (${Math.round(v)} total POIs in ${a}, SHAP = ${s.toFixed(3)}) captures aggregate economic footprint. Low POI density signals limited market access. LGU infrastructure investment and DTI enterprise development should target underserved municipalities.`,
  },
  Bldg_school_Count: {
    domain: 'Education Infrastructure', agency: 'DepEd / CHED',
    body: (v, a, s) => `School building count (${Math.round(v)} total in ${a}, SHAP = ${s.toFixed(3)}) is a positive predictor of wealth. DepEd should prioritise construction, repair, and teacher deployment in municipalities where school count falls below the provincial average.`,
  },
  Bldg_school_MeanArea: {
    domain: 'Education Quality', agency: 'DepEd / DPWH',
    body: (v, a, s) => `Mean school building area (${v.toFixed(0)} m² per buffer, SHAP = ${s.toFixed(3)}) proxies education infrastructure quality in ${a}. DepEd and DPWH should prioritise structural upgrades and multi-storey classroom construction in municipalities with the smallest average school footprint.`,
  },
  Total_Road_Length: {
    domain: 'Road Network', agency: 'DPWH / DILG',
    body: (v, a, s) => `Total road length (${v.toFixed(0)} km in ${a}, SHAP = ${s.toFixed(3)}) is a significant wealth predictor. DPWH should assess road construction and maintenance in the lowest-wealth municipalities to improve market connectivity.`,
  },
  Tracks_Length: {
    domain: 'Rural Access', agency: 'DPWH / DA',
    body: (v, a, s) => `Unpaved track length (${v.toFixed(0)} km total, SHAP = ${s.toFixed(3)}) signals geographic isolation in ${a}. DA farm-to-market and DPWH rural road programmes should prioritise track formalisation in the most isolated municipalities.`,
  },
  POI_bank_Count: {
    domain: 'Financial Inclusion', agency: 'BSP / DSWD',
    body: (v, a, s) => `Bank count (${Math.round(v)} in ${a}, SHAP = ${s.toFixed(3)}) contributes significantly to wealth prediction. BSP financial inclusion programmes—agent banking, e-money operators—should target the lowest-wealth municipalities.`,
  },
  POI_restaurant_Count: {
    domain: 'Local Economy', agency: 'DTI / DOLE',
    body: (v, a, s) => `Food establishment count (${Math.round(v)} total, SHAP = ${s.toFixed(3)}) proxies consumer spending and economic activity in ${a}. DTI MSME and DOLE livelihood programmes should target municipalities with the lowest food service count.`,
  },
  POI_pharmacy_Count: {
    domain: 'Healthcare Access', agency: 'DOH / FDA',
    body: (v, a, s) => `Pharmacy count (${Math.round(v)} total, SHAP = ${s.toFixed(3)}) reflects both healthcare access and purchasing power in ${a}. DOH should assess Botika ng Barangay coverage and medication access in municipalities with below-average pharmacy density.`,
  },
  POI_market_Count: {
    domain: 'Market Access', agency: 'DA / LGU',
    body: (v, a, s) => `Marketplace count (${Math.round(v)} total, SHAP = ${s.toFixed(3)}) captures formal trading infrastructure in ${a}. LGUs should invest in public market construction in municipalities without formal market facilities.`,
  },
  Bldg_residential_MeanArea: {
    domain: 'Housing Standards', agency: 'NHA / HUDCC',
    body: (v, a, s) => `Mean residential building size (${v.toFixed(0)} m² per buffer, SHAP = ${s.toFixed(3)}) distinguishes formal from informal housing in ${a}. NHA Socialized Housing and HUDCC Balik-Probinsya programmes should target municipalities with the smallest mean residential footprint.`,
  },
  POI_hospital_Count: {
    domain: 'Health Infrastructure', agency: 'DOH / PhilHealth',
    body: (v, a, s) => `Health facility count (${Math.round(v)} total, SHAP = ${s.toFixed(3)}) predicts wealth in ${a}. DOH should assess barangay health center and rural health unit placement in the lowest-wealth municipalities.`,
  },
}

const PRIORITY_CLASSES = ['', 'priority2', 'priority3', 'priority4']

// ── National data type ───────────────────────────────────────────────────────
interface NationalData {
  allProvinces: Record<string, any>
  allMunicipalities: Record<string, any>
  nationalStats?: any   // pre-computed from national_stats.json
}

// ── Main export ──────────────────────────────────────────────────────────────

export function generateReport(
  area: SelectedArea,
  national?: NationalData,
): string {
  const d = area.data as any
  const pts = area.points as any[]
  const shap = area.shap.slice(0, 12)
  const isProvince = area.type === 'province'

  // osm_agg contains: sum features as area totals, mean features as per-buffer averages
  const osm = (d.osm_agg ?? {}) as Record<string, number>
  const g = (f: string) => osm[f] ?? 0

  const meanWI = d.mean_wi ?? 0
  const minWI = d.min_wi ?? 0
  const maxWI = d.max_wi ?? 0
  const stdWI = d.std_wi ?? 0
  const nPoints = d.n_points ?? pts.length
  const nDhsPts = d.n_dhs_points ?? 0
  const pctLow = d.pct_low ?? 0
  const pctHigh = d.pct_high ?? 0
  const dhsMeanWI = (d.dhs_mean_wi ?? null) as number | null

  const today = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const areaLabel = isProvince ? area.name : `${area.name}, ${area.province}`

  // ── §02 Point table ─────────────────────────────────────────────────────────
  const sortedPts = [...pts].sort((a, b) => a.wi - b.wi)
  const ptRows = sortedPts.slice(0, 20).map((p: any) => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:11px">${String(p.id).padStart(5, '0')}</td>
      <td>${p.municipality}</td>
      <td>${p.urban_rural === 'U' ? 'Urban' : 'Rural'}</td>
      <td><span style="font-size:10px;padding:1px 5px;border-radius:3px;
                background:${p.source === 'DHS' ? 'rgba(92,225,230,.15)' : 'rgba(133,148,152,.1)'};
                color:${p.source === 'DHS' ? '#5ce1e6' : '#859498'};
                font-family:var(--font-mono)">${p.source}</span></td>
      <td style="font-family:var(--font-mono)">${fmt(p.wi)}</td>
      ${p.source === 'DHS' && p.dhs_wi != null
      ? `<td style="font-family:var(--font-mono);color:var(--muted)">${fmt(p.dhs_wi)}</td>`
      : `<td style="color:var(--muted);font-size:11px">—</td>`}
      <td style="font-family:var(--font-mono)">${(p.osm?.VIIRS_Median ?? 0).toFixed(2)}</td>
      <td style="font-family:var(--font-mono)">${Math.round(p.osm?.Total_POI_Count ?? 0)}</td>
      <td><span class="wealth-chip ${wiChipClass(p.wi)}">${wiLabel(p.wi)}</span></td>
    </tr>`).join('')

  // ── §03 Chart data ───────────────────────────────────────────────────────────
  const wiData = JSON.stringify(sortedPts.slice(0, 20).map(p => +p.wi.toFixed(3)))
  const wiLabels = JSON.stringify(sortedPts.slice(0, 20).map(p => `PT-${p.id}`))
  const bins = [-2.5, -2.25, -2, -1.75, -1.5, -1.25, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
  const histData = JSON.stringify(bins.slice(0, -1).map((_, i) =>
    pts.filter(p => p.wi >= bins[i] && p.wi < bins[i + 1]).length))
  const histLbls = JSON.stringify(bins.slice(0, -1).map(b => b.toFixed(2)))
  const scatterData = JSON.stringify(
    pts.slice(0, 80).map(p => ({ x: +(p.osm?.VIIRS_Median ?? 0).toFixed(3), y: +p.wi.toFixed(3) })))
  // DHS province chart uses national data (allProvinces), computed below in §08 block

  // ── §04 Infrastructure chart data ────────────────────────────────────────────
  const norm = (v: number, max: number) => Math.min(100, Math.round(v / max * 100))

  // Radar uses mean features and scaled totals for display
  const radarData = JSON.stringify([
    norm(g('Total_Road_Length'), isProvince ? 15000 : 1500),
    norm(g('Total_Bldg_Count'), isProvince ? 500000 : 50000),
    norm(g('Bldg_Density_per_km2'), 500),   // mean
    norm(g('POI_bank_Count') + g('POI_atm_Count'), isProvince ? 500 : 50),
    norm(g('Bldg_school_Count') + g('POI_school_Count'), isProvince ? 5000 : 500),
    norm(g('POI_hospital_Count') + g('POI_pharmacy_Count'), isProvince ? 500 : 50),
    norm(g('Total_POI_Count'), isProvince ? 8000 : 800),
    norm(g('VIIRS_Median'), 15),    // mean
  ])

  const roadDonut = JSON.stringify([
    +g('Main_Roads_Length').toFixed(1),
    +g('Secondary_Roads_Length').toFixed(1),
    +g('Local_Roads_Length').toFixed(1),
    +g('Tracks_Length').toFixed(1),
  ])

  // Landuse donut — totals converted to km²
  const luDonut = JSON.stringify([
    +(g('LU_Agricultural_m2') / 1e6).toFixed(2),
    +(g('LU_Forest_m2') / 1e6).toFixed(2),
    +(g('LU_Residential_m2') / 1e6).toFixed(2),
    +(g('LU_Commercial_m2') / 1e6).toFixed(2),
    +(g('LU_Industrial_m2') / 1e6).toFixed(2),
  ])

  // Building type counts (totals)
  const bldgTypeLabels = JSON.stringify(['Residential', 'Commercial', 'Industrial', 'School', 'Hospital'])
  const bldgTypeData = JSON.stringify([
    g('Bldg_residential_Count'), g('Bldg_commercial_Count'),
    g('Bldg_industrial_Count'), g('Bldg_school_Count'), g('Bldg_hospital_Count'),
  ])

  // Mean building area per type (mean features)
  const bldgAreaLabels = JSON.stringify(['Residential', 'Commercial', 'Industrial', 'School', 'Hospital'])
  const bldgAreaData = JSON.stringify([
    +g('Bldg_residential_MeanArea').toFixed(0),
    +g('Bldg_commercial_MeanArea').toFixed(0),
    +g('Bldg_industrial_MeanArea').toFixed(0),
    +g('Bldg_school_MeanArea').toFixed(0),
    +g('Bldg_hospital_MeanArea').toFixed(0),
  ])

  // Infrastructure bar — totals
  const infraLabels = JSON.stringify([
    'Total POIs', 'Restaurants', 'Markets', 'Banks + ATMs',
    'Schools', 'Pharmacies', 'Health Fac.', 'Govt + Police'])
  const infraData = JSON.stringify([
    Math.round(g('Total_POI_Count')),
    Math.round(g('POI_restaurant_Count')),
    Math.round(g('POI_market_Count')),
    Math.round(g('POI_bank_Count') + g('POI_atm_Count')),
    Math.round(g('Bldg_school_Count') + g('POI_school_Count')),
    Math.round(g('POI_pharmacy_Count')),
    Math.round(g('POI_hospital_Count') + g('Bldg_hospital_Count')),
    Math.round(g('POI_government_Count') + g('POI_police_Count')),
  ])

  // ── §05 Municipality breakdown ────────────────────────────────────────────────
  const muniRows = pts.reduce((acc: Record<string, number[]>, p: any) => {
    if (!acc[p.municipality]) acc[p.municipality] = []
    acc[p.municipality].push(p.wi)
    return acc
  }, {})
  const muniStats = Object.entries(muniRows)
    .map(([name, wis]) => ({
      name,
      mean: wis.reduce((a, b) => a + b, 0) / wis.length,
      n: wis.length,
      pctLow: wis.filter(w => w < -0.5).length / wis.length * 100,
    }))
    .sort((a, b) => a.mean - b.mean)

  const muniTableRows = muniStats.map(m => `
    <tr>
      <td>${m.name}</td>
      <td style="font-family:var(--font-mono)">${m.n}</td>
      <td style="font-family:var(--font-mono)">${fmt(m.mean)}</td>
      <td style="font-family:var(--font-mono)">${m.pctLow.toFixed(0)}%</td>
      <td><span class="wealth-chip ${wiChipClass(m.mean)}">${wiLabel(m.mean)}</span></td>
    </tr>`).join('')
  const muniBarLabels = JSON.stringify(muniStats.map(m => m.name))
  const muniBarData = JSON.stringify(muniStats.map(m => +m.mean.toFixed(3)))

  // ── §06 SHAP data ─────────────────────────────────────────────────────────────
  const maxShap = shap[0]?.mean_abs_shap ?? 1
  const shapFeats = JSON.stringify(shap.map(s => s.feature.replace(/_/g, ' ')))
  const shapVals = JSON.stringify(shap.map(s => s.mean_abs_shap))

  const shapCats = ['Temporal', 'Satellite', 'Road', 'Building', 'POI', 'Landuse']
  const catColors = ['#5ce1e6', '#88bcbd', '#859498', '#326189', '#1a3c5c', '#e67e22']
  const catTotals = shapCats.map(cat =>
    +shap.filter(s => (CAT_MAP[s.feature] ?? 'Temporal') === cat)
      .reduce((sum, s) => sum + s.mean_abs_shap, 0).toFixed(4))
  const catLabels = JSON.stringify(shapCats)
  const catData = JSON.stringify(catTotals)
  const catColorsJS = JSON.stringify(catColors)

  const shapRows = shap.map((s, i) => {
    const pct = Math.round(s.mean_abs_shap / maxShap * 100)
    const cat = CAT_MAP[s.feature] ?? 'Temporal'
    return `
    <tr>
      <td class="rank-num">${i + 1}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${s.feature.replace(/_/g, ' ')}</td>
      <td style="font-size:11px;color:var(--muted)">${cat}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${s.mean_abs_shap.toFixed(4)}</td>
      <td><span class="shap-badge pos">Driver</span></td>
      <td class="shap-bar-wrap">
        <div class="shap-bar-bg">
          <div class="shap-bar-fill shap-pos" style="width:${pct}%"></div>
        </div>
      </td>
    </tr>`
  }).join('')

  // ── §07 Recommendations ───────────────────────────────────────────────────────
  const recCards = shap
    .filter(s => POLICY_MAP[s.feature])
    .slice(0, 4)
    .map((s, i) => {
      const p = POLICY_MAP[s.feature]
      const val = g(s.feature)
      return `
    <div class="rec-card ${PRIORITY_CLASSES[i]}">
      <div class="rec-priority">Priority ${i + 1} · ${p.domain} · SHAP ${s.mean_abs_shap.toFixed(3)} · ${p.agency}</div>
      <h4>${p.domain} Intervention in ${areaLabel}</h4>
      <p>${p.body(val, areaLabel, s.mean_abs_shap)}</p>
    </div>`
    }).join('')

  // ── §08 National comparison data ──────────────────────────────────────────────
  const provData = national?.allProvinces ?? {}
  const muniData = national?.allMunicipalities ?? {}

  const provList = Object.values(provData) as any[]
  provList.sort((a, b) => a.mean_wi - b.mean_wi)
  const natProvLabels = JSON.stringify(provList.map(p => p.name))
  const natProvWI = JSON.stringify(provList.map(p => +p.mean_wi.toFixed(3)))
  const natProvPts = JSON.stringify(provList.map(p => p.n_points))

  // ── National mean and std — use pre-computed national_stats.json when available ──
  // Falls back to province-weighted computation if national_stats not provided.
  const ns = national?.nationalStats
  const natTotalPts = ns?.n_points
    ?? provList.reduce((s, p) => s + (p.n_points ?? 0), 0)
  const natMeanWI = ns?.mean_wi
    ?? (natTotalPts > 0
      ? provList.reduce((s, p) => s + (p.mean_wi ?? 0) * (p.n_points ?? 0), 0) / natTotalPts
      : 0)
  const natStdWI = ns?.std_wi
    ?? (natTotalPts > 0
      ? Math.sqrt(
        provList.reduce((s, p) => {
          const n = p.n_points ?? 0
          const v = (p.std_wi ?? 0) ** 2
          const d2 = ((p.mean_wi ?? 0) - natMeanWI) ** 2
          return s + n * (v + d2)
        }, 0) / natTotalPts
      )
      : 0)
  const natMedianWI = ns?.median_wi ?? null
  const natDhsMean = ns?.dhs_mean_wi ?? null
  const natDhsMAE = ns?.dhs_mae ?? null

  // Province scatter: predicted WI vs DHS mean WI (provinces with DHS data only)
  const natScatterData = JSON.stringify(
    provList
      .filter(p => p.dhs_mean_wi != null)
      .map(p => ({
        x: +p.dhs_mean_wi.toFixed(3),
        y: +p.mean_wi.toFixed(3),
        label: p.name,
      }))
  )

  // Province infrastructure comparison (totals from osm_agg)
  const natInfraLabels = JSON.stringify(provList.map(p => p.name))
  const natInfraRoads = JSON.stringify(provList.map(p => +(p.osm_agg?.Total_Road_Length ?? 0).toFixed(0)))
  const natInfraBldgs = JSON.stringify(provList.map(p => Math.round(p.osm_agg?.Total_Bldg_Count ?? 0)))
  const natInfraPOIs = JSON.stringify(provList.map(p => Math.round(p.osm_agg?.Total_POI_Count ?? 0)))
  const natInfraVIIRS = JSON.stringify(provList.map(p => +(p.osm_agg?.VIIRS_Median ?? 0).toFixed(3)))

  // Top/bottom 20 municipalities
  const muniList = Object.values(muniData) as any[]
  muniList.sort((a, b) => a.mean_wi - b.mean_wi)
  const bottomMunis = muniList.slice(0, 20)
  const topMunis = muniList.slice(-20).reverse()

  const bottomMuniRows = bottomMunis.map((m, i) => `
    <tr>
      <td class="rank-num">${i + 1}</td>
      <td>${m.municipality}</td>
      <td>${m.province}</td>
      <td style="font-family:var(--font-mono)">${m.n_points}</td>
      <td style="font-family:var(--font-mono)">${fmt(m.mean_wi)}</td>
      <td style="font-family:var(--font-mono)">${m.pct_low.toFixed(0)}%</td>
      <td><span class="wealth-chip w-low">${wiLabel(m.mean_wi)}</span></td>
    </tr>`).join('')

  const topMuniRows = topMunis.map((m, i) => `
    <tr>
      <td class="rank-num">${i + 1}</td>
      <td>${m.municipality}</td>
      <td>${m.province}</td>
      <td style="font-family:var(--font-mono)">${m.n_points}</td>
      <td style="font-family:var(--font-mono)">${fmt(m.mean_wi)}</td>
      <td style="font-family:var(--font-mono)">${m.pct_high.toFixed(0)}%</td>
      <td><span class="wealth-chip ${wiChipClass(m.mean_wi)}">${wiLabel(m.mean_wi)}</span></td>
    </tr>`).join('')

  // Province table rows
  const natProvTableRows = provList.map((p, i) => `
    <tr>
      <td class="rank-num">${i + 1}</td>
      <td><strong>${p.name}</strong></td>
      <td style="font-family:var(--font-mono)">${p.n_points}</td>
      <td style="font-family:var(--font-mono)">${fmt(p.mean_wi)}</td>
      <td style="font-family:var(--font-mono)">${p.dhs_mean_wi != null ? fmt(p.dhs_mean_wi) : '—'}</td>
      <td style="font-family:var(--font-mono)">${(p.osm_agg?.VIIRS_Median ?? 0).toFixed(2)}</td>
      <td style="font-family:var(--font-mono)">${Math.round(p.osm_agg?.Total_POI_Count ?? 0).toLocaleString()}</td>
      <td style="font-family:var(--font-mono)">${Math.round(p.osm_agg?.Total_Road_Length ?? 0).toLocaleString()} km</td>
      <td><span class="wealth-chip ${wiChipClass(p.mean_wi)}">${wiLabel(p.mean_wi)}</span></td>
    </tr>`).join('')

  // ── Section numbering ─────────────────────────────────────────────────────────
  // Province has §05 Municipal; both have §08 National; municipality skips §05.
  const s = (n: number) => isProvince ? String(n).padStart(2, '0') : String(n - 1).padStart(2, '0')

  // ── HTML ──────────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Poverty Analytics Report — ${areaLabel}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=${FONTS.googleUrl}&display=swap');
  :root{
    --ink:#1a3c5c; --paper:#f5f8fa; --cream:#eaf1f5;
    --accent:#326189; --accent2:#e67e22; --accent3:#5ce1e6;
    --muted:#859498; --rule:#d4dfe6;
    --positive:#5ce1e6; --negative:#c0392b; --warn:#e67e22;
    --font-sans:${FONTS.sans}; --font-serif:${FONTS.serif}; --font-mono:${FONTS.mono};
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:var(--font-sans);background:var(--paper);color:var(--ink);line-height:1.6;font-size:14px;}
  .masthead{background:var(--ink);color:var(--paper);padding:48px 60px 36px;position:relative;overflow:hidden;}
  .masthead::before{content:'';position:absolute;top:-60px;right:-60px;width:320px;height:320px;border-radius:50%;background:rgba(50,97,137,.25);}
  .masthead-kicker{font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent3);margin-bottom:12px;}
  .masthead h1{font-family:var(--font-serif);font-size:36px;line-height:1.15;max-width:620px;margin-bottom:18px;}
  .masthead h1 em{font-style:italic;color:#88bcbd;}
  .masthead-meta{display:flex;gap:32px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.15);padding-top:18px;}
  .masthead-meta .meta-item{font-size:12px;}
  .masthead-meta .meta-item strong{display:block;font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;color:#88bcbd;margin-bottom:2px;}
  .exec-band{background:var(--accent);color:#fff;padding:22px 60px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0;}
  .exec-stat{padding:0 20px;border-right:1px solid rgba(255,255,255,.2);}
  .exec-stat:first-child{padding-left:0;}.exec-stat:last-child{border-right:none;}
  .exec-stat .val{font-family:var(--font-serif);font-size:30px;line-height:1;}
  .exec-stat .lbl{font-size:11px;letter-spacing:.06em;opacity:.82;margin-top:4px;}
  .page{max-width:1080px;margin:0 auto;padding:0 60px 80px;}
  .section{margin-top: 0;  padding-top: 40px;  page-break-before: always;  break-before: always;  page-break-inside: avoid;  break-inside: avoid;}
  .section-header{display:flex;align-items:baseline;gap:14px;border-bottom:2px solid var(--ink);padding-bottom:8px;margin-bottom:28px;}
  .section-num{font-family:var(--font-mono);font-size:11px;color:var(--accent);letter-spacing:.1em;}
  .section-header h2{font-family:var(--font-serif);font-size:22px;font-weight:400;}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;}
  .kpi-card{background:var(--cream);border:1px solid var(--rule);padding:20px 22px;}
  .kpi-card .kpi-label{font-size:11px;font-family:var(--font-mono);letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:8px;}
  .kpi-card .kpi-value{font-family:var(--font-serif);font-size:26px;line-height:1;}
  .kpi-card .kpi-sub{font-size:11px;color:var(--muted);margin-top:6px;}
  .kpi-card.good{border-left:4px solid var(--positive);}
  .kpi-card.warn{border-left:4px solid var(--warn);}
  .kpi-card.bad{border-left:4px solid var(--negative);}
  .kpi-card.info{border-left:4px solid var(--accent);}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
  .chart-card{background:#fff;border:1px solid var(--rule);padding:22px 24px;}
  .chart-title{font-size:12px;font-family:var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-bottom:4px;}
  .chart-sub{font-size:11px;color:var(--muted);margin-bottom:16px;}
  canvas{width:100%!important;}
  .shap-table,.cluster-table{width:100%;border-collapse:collapse;margin-top:8px;}
  .shap-table th,.cluster-table th{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:2px solid var(--ink);text-align:left;}
  .shap-table td,.cluster-table td{padding:9px 10px;border-bottom:1px solid var(--rule);font-size:12px;vertical-align:middle;}
  .shap-table tr:last-child td,.cluster-table tr:last-child td{border-bottom:none;}
  .shap-bar-wrap{width:120px;}
  .shap-bar-bg{background:var(--cream);height:8px;border-radius:2px;overflow:hidden;}
  .shap-bar-fill{height:100%;border-radius:2px;}
  .shap-pos{background:var(--positive);}
  .shap-badge{display:inline-block;font-family:var(--font-mono);font-size:11px;padding:2px 8px;border-radius:2px;font-weight:500;}
  .shap-badge.pos{background:#d4f6f7;color:#1a3c5c;}
  .rank-num{font-family:var(--font-mono);font-size:11px;color:var(--muted);width:24px;}
  .wealth-chip{display:inline-block;padding:2px 10px;border-radius:2px;font-family:var(--font-mono);font-size:11px;font-weight:500;}
  .w-high{background:#d4f6f7;color:#1a3c5c;}
  .w-mid{background:#eaf1f5;color:#224d75;}
  .w-low{background:#fadbd8;color:#922b21;}
  .body-text{font-size:13.5px;line-height:1.75;color:#2c3e50;}
  .body-text+.body-text{margin-top:12px;}
  .method-box{background:var(--cream);border:1px solid var(--rule);border-left:3px solid var(--accent3);padding:16px 20px;margin-top:16px;font-size:12px;color:var(--muted);line-height:1.7;}
  .method-box strong{color:var(--ink);}
  .rec-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;}
  .rec-card{background:var(--cream);border:1px solid var(--rule);border-top:3px solid var(--accent);padding:18px 20px;}
  .rec-card.priority2{border-top-color:var(--accent2);}
  .rec-card.priority3{border-top-color:var(--accent3);}
  .rec-card.priority4{border-top-color:var(--positive);}
  .rec-priority{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
  .rec-card h4{font-family:var(--font-serif);font-size:16px;font-weight:400;margin-bottom:8px;line-height:1.3;}
  .rec-card p{font-size:12.5px;color:#555;line-height:1.6;}
  .nat-band{background:var(--ink);color:#fff;padding:14px 60px;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-top:52px;}
  .footer{background:var(--ink);color:rgba(245,240,232,.5);padding:24px 60px;font-size:11px;font-family:var(--font-mono);display:flex;justify-content:space-between;align-items:center;letter-spacing:.04em;margin-top:60px;}
  .footer span{color:var(--paper);}
  @media print{.masthead,.exec-band,.nat-band{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.section{page-break-before:always;break-before:always;}.chart-card,.kpi-grid,.rec-card,.cluster-table,.shap-table{page-break-inside:avoid;break-inside:avoid;}}
</style>
</head>
<body>

<div class="masthead">
  <div class="masthead-kicker">Project TALA · Per-Area Analytics Report</div>
  <h1>Poverty Incidence Analysis<br><em>${areaLabel}</em></h1>
  <div class="masthead-meta">
    <div class="meta-item"><strong>Report Date</strong>${today}</div>
    <div class="meta-item"><strong>Data Source</strong>2025 Sentinel-2 · VIIRS · OpenStreetMap</div>
    <div class="meta-item"><strong>Model</strong>CNN–LSTM Hybrid (v2.0 · R²=0.5244)</div>
    <div class="meta-item"><strong>Coverage</strong>${nPoints} prediction points</div>
    <div class="meta-item"><strong>Interpretability</strong>SHAP · Kernel Explainer · 1,112 points</div>
  </div>
</div>

<div class="exec-band">
  <div class="exec-stat">
    <div class="val">${fmt(meanWI)}</div>
    <div class="lbl">Mean Predicted Wealth Index</div>
  </div>
  <div class="exec-stat">
    <div class="val">${nPoints}</div>
    <div class="lbl">Prediction Points (${nDhsPts} DHS)</div>
  </div>
  <div class="exec-stat">
    <div class="val">${pctLow.toFixed(0)}%</div>
    <div class="lbl">Points Below WI −0.50</div>
  </div>
  <div class="exec-stat">
    <div class="val">${area.shap[0]?.feature?.replace(/_/g, ' ') ?? 'N/A'}</div>
    <div class="lbl">Top SHAP Driver</div>
  </div>
</div>

<div class="page">

  <!-- ── §01 AREA OVERVIEW ─────────────────────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">01</span>
      <h2>Area Overview</h2>
    </div>
    <p class="body-text">
      ${areaLabel} contains ${nPoints} prediction points (${nDhsPts} DHS survey clusters,
      ${nPoints - nDhsPts} grid-generated) with a mean predicted wealth index of ${fmt(meanWI)}
      (range ${fmt(minWI)} to ${fmt(maxWI)}, σ = ${stdWI.toFixed(3)}).
      ${natTotalPts > 0 ? `Across all ${natTotalPts} study-area points, the mean predicted WI is ${fmt(natMeanWI)} (σ = ${natStdWI.toFixed(3)}).` : ''}
      ${pctLow.toFixed(0)}% of points fall below the poverty threshold (WI &lt; −0.50) and
      ${pctHigh.toFixed(0)}% are in the high-wealth category (WI ≥ +0.50).
      ${dhsMeanWI !== null
      ? `The mean DHS survey wealth index for the ${nDhsPts} survey clusters in this area is ${fmt(dhsMeanWI)}, yielding a model deviation of ${fmt(meanWI - dhsMeanWI)}.`
      : ''}
      ${isProvince && muniStats.length > 0
      ? `Across ${muniStats.length} municipalities, ${muniStats.filter(m => m.mean < -0.5).length} average below the poverty threshold.`
      : ''}
      The strongest SHAP driver is
      <strong>${area.shap[0]?.feature?.replace(/_/g, ' ') ?? 'N/A'}</strong>
      (mean |SHAP| = ${(area.shap[0]?.mean_abs_shap ?? 0).toFixed(3)}).
    </p>

    <div class="kpi-grid" style="margin-top:28px">
      <div class="kpi-card info">
        <div class="kpi-label">Mean Wealth Index</div>
        <div class="kpi-value">${fmt(meanWI)}</div>
        <div class="kpi-sub">σ = ${stdWI.toFixed(3)} · Study mean: ${natTotalPts > 0 ? fmt(natMeanWI) : '+0.00'} · Study σ: ${natTotalPts > 0 ? natStdWI.toFixed(3) : '—'}${natMedianWI !== null ? ` · Median: ${fmt(natMedianWI)}` : ''}${natDhsMAE !== null ? ` · DHS MAE: ${natDhsMAE.toFixed(4)}` : ''}</div>
      </div>
      <div class="kpi-card ${pctLow > 40 ? 'bad' : pctLow > 20 ? 'warn' : 'good'}">
        <div class="kpi-label">WI Range</div>
        <div class="kpi-value">${fmt(minWI, 1)} to ${fmt(maxWI, 1)}</div>
        <div class="kpi-sub">Spread ${(maxWI - minWI).toFixed(2)} units</div>
      </div>
      <div class="kpi-card ${pctLow > 40 ? 'bad' : pctLow > 20 ? 'warn' : 'good'}">
        <div class="kpi-label">Below −0.50 WI</div>
        <div class="kpi-value">${pctLow.toFixed(0)}%</div>
        <div class="kpi-sub">${Math.round(nPoints * pctLow / 100)} of ${nPoints} points</div>
      </div>
      <div class="kpi-card ${dhsMeanWI !== null ? 'info' : ''}">
        <div class="kpi-label">DHS Survey Mean WI</div>
        <div class="kpi-value">${dhsMeanWI !== null ? fmt(dhsMeanWI) : 'N/A'}</div>
        <div class="kpi-sub">${dhsMeanWI !== null
      ? `${nDhsPts} DHS cluster${nDhsPts !== 1 ? 's' : ''} · deviation ${fmt(meanWI - dhsMeanWI)}`
      : 'No DHS clusters in this area'}</div>
      </div>
      <div class="kpi-card good">
        <div class="kpi-label">VIIRS Mean (nW/cm²/sr)</div>
        <div class="kpi-value">${g('VIIRS_Median').toFixed(2)}</div>
        <div class="kpi-sub">Per-buffer avg · rural baseline ~0.28</div>
      </div>
      <div class="kpi-card info">
        <div class="kpi-label">Total POIs</div>
        <div class="kpi-value">${Math.round(g('Total_POI_Count')).toLocaleString()}</div>
        <div class="kpi-sub">Area total · ${Math.round(g('POI_bank_Count') + g('POI_atm_Count'))} banks/ATMs</div>
      </div>
      <div class="kpi-card warn">
        <div class="kpi-label">Total Road Length</div>
        <div class="kpi-value">${Math.round(g('Total_Road_Length')).toLocaleString()} km</div>
        <div class="kpi-sub">Area total · ${Math.round(g('Main_Roads_Length'))} km primary</div>
      </div>
    </div>

    ${dhsMeanWI !== null ? `
    <div class="method-box">
      <strong>DHS Survey Validation.</strong>
      This area contains ${nDhsPts} DHS-origin prediction points with verified 2022 survey wealth
      labels. Mean DHS WI = ${fmt(dhsMeanWI)} vs. model predicted mean = ${fmt(meanWI)}
      (deviation ${fmt(meanWI - dhsMeanWI)}). The difference reflects both the 2022→2025 temporal
      gap and the geographic displacement inherent in the DHS jitter protocol (≤5 km rural).
    </div>` : ''}
  </div>

  <!-- ── §02 POINT-LEVEL ESTIMATES ──────────────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">02</span>
      <h2>Point-Level Wealth Index Estimates</h2>
    </div>
    <p class="body-text">
      Up to 20 prediction points within ${areaLabel}, sorted ascending by predicted wealth index.
      DHS-origin points show the verified survey wealth index (DHS WI) alongside the model prediction.
      Grid-generated points show — in the DHS WI column.
    </p>
    <div style="overflow-x:auto;margin-top:20px">
      <table class="cluster-table">
        <thead>
          <tr>
            <th>Point ID</th><th>Municipality</th><th>Type</th>
            <th>Source</th><th>Pred. WI</th><th>DHS WI</th>
            <th>VIIRS (nW)</th><th>Total POIs</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${ptRows}</tbody>
      </table>
    </div>
    <div class="method-box">
      <strong>Model note.</strong> R² = 0.5244, Pearson r = 0.7271 (5-fold CV, 1,234 DHS clusters).
      Inference applied to 2025 Sentinel-2 composites. DHS WI = verified 2022 survey label
      (DHS-origin points only).
    </div>
  </div>

  <!-- ── §03 WEALTH DISTRIBUTION ────────────────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">03</span>
      <h2>Wealth Index Distribution</h2>
    </div>
    <div class="two-col">
      <div class="chart-card">
        <div class="chart-title">Wealth Index by Point</div>
        <div class="chart-sub">Predicted WI sorted ascending · top 20 points</div>
        <canvas id="wealthChart" height="220"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Wealth Index Histogram</div>
        <div class="chart-sub">All ${nPoints} points · 0.25-unit bins</div>
        <canvas id="histChart" height="220"></canvas>
      </div>
    </div>
    <div class="two-col" style="margin-top:20px">
      <div class="chart-card">
        <div class="chart-title">VIIRS Luminosity vs Predicted WI</div>
        <div class="chart-sub">Each point = one prediction point (up to 80 shown)</div>
        <canvas id="viirScatter" height="220"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">DHS Survey WI by Province</div>
        <div class="chart-sub">Mean actual DHS wealth index from survey clusters per province · 2022</div>
        <canvas id="dhsProvChart" height="220"></canvas>
      </div>
    </div>
  </div>

  <!-- ── §04 INFRASTRUCTURE PROFILE ────────────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">04</span>
      <h2>Infrastructure Profile</h2>
    </div>
    <p class="body-text">
      Infrastructure metrics for ${areaLabel}. <strong>Area totals</strong> represent the sum
      across all prediction point buffers (roads, buildings, POIs, landuse).
      <strong>Per-buffer averages</strong> (VIIRS, mean building area, building density, proportions)
      reflect the typical value for a single buffer in this area.
    </p>
    <div class="two-col" style="margin-top:20px">
      <div class="chart-card">
        <div class="chart-title">Infrastructure Radar</div>
        <div class="chart-sub">Normalised 0–100 relative to study-area benchmarks</div>
        <canvas id="radarChart" height="280"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Road Network Composition</div>
        <div class="chart-sub">Total road length by type (km) — area total</div>
        <canvas id="roadDonut" height="280"></canvas>
      </div>
    </div>
    <div class="two-col" style="margin-top:20px">
      <div class="chart-card">
        <div class="chart-title">Landuse Composition</div>
        <div class="chart-sub">Total landuse area by class (km²) — area total</div>
        <canvas id="luDonut" height="260"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Building Count by Type</div>
        <div class="chart-sub">Total classified buildings — area total</div>
        <canvas id="bldgTypeBar" height="260"></canvas>
      </div>
    </div>
    <div class="two-col" style="margin-top:20px">
      <div class="chart-card">
        <div class="chart-title">Mean Building Area by Type (m²)</div>
        <div class="chart-sub">Per-buffer average footprint — building quality proxy</div>
        <canvas id="bldgAreaBar" height="220"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Service Infrastructure Count</div>
        <div class="chart-sub">Total facilities by category — area total</div>
        <canvas id="infraBar" height="220"></canvas>
      </div>
    </div>
  </div>

  ${isProvince && muniStats.length > 0 ? `
  <!-- ── §05 MUNICIPAL BREAKDOWN ────────────────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">05</span>
      <h2>Municipal Breakdown</h2>
    </div>
    <p class="body-text">
      ${muniStats.length} municipalities within ${areaLabel} ranked by mean predicted wealth index.
      ${muniStats.filter(m => m.mean < -0.5).length} municipalities average below the poverty threshold (WI &lt; −0.50).
      <strong>${muniStats[0]?.name ?? ''}</strong> records the lowest mean WI
      (${fmt(muniStats[0]?.mean ?? 0)}) and
      <strong>${muniStats[muniStats.length - 1]?.name ?? ''}</strong> the highest
      (${fmt(muniStats[muniStats.length - 1]?.mean ?? 0)}).
    </p>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-title">Municipalities Ranked by Mean Predicted Wealth Index</div>
      <div class="chart-sub">Sorted ascending · all municipalities in ${areaLabel}</div>
      <canvas id="muniBar" height="${Math.max(120, muniStats.length * 18)}"></canvas>
    </div>
    <div style="overflow-x:auto;margin-top:20px">
      <table class="cluster-table">
        <thead>
          <tr>
            <th>Municipality</th><th>Points</th><th>Mean WI</th>
            <th>% Below −0.50</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${muniTableRows}</tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- ── §06/05 SHAP FEATURE ATTRIBUTION ───────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">${s(6)}</span>
      <h2>SHAP Feature Attribution</h2>
    </div>
    <p class="body-text">
      SHAP values quantify the marginal contribution of each feature to wealth index predictions
      in ${areaLabel}. Temporal satellite features (LSTM) account for approximately 51.8% of total
      absolute SHAP contribution per cluster, with static OSM and VIIRS features contributing 48.2%.
      This near-equal split reflects the expanded 52-feature static branch in the retrained model.
    </p>
    <div class="two-col" style="margin-top:24px">
      <div class="chart-card">
        <div class="chart-title">Feature Importance (mean |SHAP|)</div>
        <div class="chart-sub">Top 12 features · 1,112 prediction points</div>
        <canvas id="shapBar" height="300"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">SHAP Contribution by Category</div>
        <div class="chart-sub">Summed mean |SHAP| per feature category</div>
        <canvas id="shapCat" height="300"></canvas>
      </div>
    </div>
    <div style="margin-top:24px">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">
        Ranked Feature Attribution
      </div>
      <table class="shap-table">
        <thead>
          <tr><th>#</th><th>Feature</th><th>Category</th><th>Mean |SHAP|</th><th>Role</th><th>Importance</th></tr>
        </thead>
        <tbody>${shapRows}</tbody>
      </table>
    </div>
    <div class="method-box" style="margin-top:20px">
      <strong>Interpretation.</strong> Kernel SHAP · 1,112 prediction points · 200 background
      samples · 500 coalition samples per instance · l1_reg='aic'. Base value ≈ −0.58 (mean
      predicted WI across output provinces). LSTM dimensions represent compressed temporal
      satellite signal not decomposable into named features. Landuse and POI sum features reflect
      area totals; mean features (VIIRS, building areas, proportions) are per-buffer averages.
    </div>
  </div>

  <!-- ── §07/06 POLICY RECOMMENDATIONS ─────────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">${s(7)}</span>
      <h2>Policy Recommendations</h2>
    </div>
    <p class="body-text">
      Derived from SHAP feature attribution for ${areaLabel}. Ranked by SHAP signal magnitude.
    </p>
    <div class="rec-grid">
      ${recCards || '<p style="color:var(--muted);font-size:13px">No policy-mapped SHAP drivers found for this area.</p>'}
    </div>
    <div class="method-box" style="margin-top:20px">
      <strong>Limitations.</strong> Recommendations are derived from a model trained on 2022 DHS
      data applied to 2025 imagery. Validation against ground-truth surveys and community
      consultation is required before policy action.
    </div>
  </div>

<!--</div><!-- end .page -->

<!-- ── §08/07 NATIONAL COMPARISON ──────────────────────────────────────── -->
${national && provList.length > 0 ? `
<!-- <div class="nat-band">§${s(8)} — National Comparison · All Study Provinces &amp; Municipalities</div> -->
<!-- <div class="page"> -->
  <div class="section" style="margin-top:32px">
    <div class="section-header">
      <span class="section-num">${s(8)}</span>
      <h2>National Analysis</h2>
    </div>
    <p class="body-text">
      This section ranks all ${provList.length} study provinces and ${muniList.length} municipalities
      by predicted wealth index. The study covers ${provList.reduce((s, p) => s + p.n_points, 0)} prediction
      points across the 5 poorest provinces, 5 richest provinces, and NCR. Aggregate infrastructure
      totals are drawn from osm_agg in the provincial data file.
    </p>

    <!-- Province WI ranking -->
    <div class="chart-card" style="margin-top:24px">
      <div class="chart-title">Provinces Ranked by Mean Predicted Wealth Index</div>
      <div class="chart-sub">Sorted ascending · all ${provList.length} study provinces · 2025 inference</div>
      <canvas id="natProvBar" height="180"></canvas>
    </div>

    <div class="two-col" style="margin-top:20px">
      <div class="chart-card">
        <div class="chart-title">DHS Survey WI vs Predicted WI</div>
        <div class="chart-sub">Each point = one province with DHS clusters · ideal: points near diagonal</div>
        <canvas id="natScatter" height="260"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">VIIRS Mean Luminosity by Province</div>
        <div class="chart-sub">Per-buffer average VIIRS radiance (nW/cm²/sr)</div>
        <canvas id="natVIIRS" height="260"></canvas>
      </div>
    </div>

    <div class="two-col" style="margin-top:20px">
      <div class="chart-card">
        <div class="chart-title">Total Road Length by Province (km)</div>
        <div class="chart-sub">Province-level total across all prediction buffers</div>
        <canvas id="natRoads" height="260"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Total POI Count by Province</div>
        <div class="chart-sub">Province-level total service facility count</div>
        <canvas id="natPOIs" height="260"></canvas>
      </div>
    </div>

    <!-- Province summary table -->
    <div style="overflow-x:auto;margin-top:24px">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">
        Province Summary Table
      </div>
      <table class="cluster-table">
        <thead>
          <tr>
            <th>#</th><th>Province</th><th>Points</th>
            <th>Mean WI</th><th>DHS Mean WI</th>
            <th>VIIRS (nW)</th><th>Total POIs</th>
            <th>Total Roads</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${natProvTableRows}</tbody>
      </table>
    </div>

    <!-- Bottom 20 municipalities -->
    <div style="overflow-x:auto;margin-top:32px">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">
        20 Lowest-Wealth Municipalities
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
        Municipalities most likely to benefit from targeted poverty interventions
      </div>
      <table class="cluster-table">
        <thead>
          <tr>
            <th>#</th><th>Municipality</th><th>Province</th>
            <th>Points</th><th>Mean WI</th><th>% Low WI</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${bottomMuniRows}</tbody>
      </table>
    </div>

    <!-- Top 20 municipalities -->
    <div style="overflow-x:auto;margin-top:24px">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">
        20 Highest-Wealth Municipalities
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
        Municipalities with strongest predicted economic performance
      </div>
      <table class="cluster-table">
        <thead>
          <tr>
            <th>#</th><th>Municipality</th><th>Province</th>
            <th>Points</th><th>Mean WI</th><th>% High WI</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${topMuniRows}</tbody>
      </table>
    </div>
  </div>
</div>` : ''}

<div class="page">
  <!-- ── §09/08/07 METHODOLOGY ───────────────────────────────────────────── -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">${s(9)}</span>
      <h2>Methodology Summary</h2>
    </div>
    <div class="two-col">
      <div>
        <p class="body-text"><strong>Data sources</strong></p>
        <p class="body-text">
          Sentinel-2 Level-2A, 10 m, quarterly median composites Q1–Q4 2025 (Google Earth Engine).
          VIIRS VNP46A1 Day/Night Band, ~500 m, 2025 annual median. OSM via Geofabrik Philippines
          (2026 vintage, 52 features). Ground truth: 2022 Philippines DHS Wealth Index (PSA / USAID).
        </p>
      </div>
      <div>
        <p class="body-text"><strong>Model architecture</strong></p>
        <p class="body-text">
          VGG16 CNN pre-trained on VIIRS proxy task (71.97% val. accuracy) → 4,096-dim features
          → 256-dim PCA (90.87% variance). 64-unit LSTM aggregates 4 quarterly vectors.
          Fused with 52 static OSM + VIIRS features via 64-unit dense static branch
          → 64-unit fusion layer → regression output.
          5-fold CV on 1,234 DHS clusters: R² = 0.5244 ± 0.025, r = 0.7271 ± 0.016.
        </p>
      </div>
    </div>
    <div class="method-box" style="margin-top:20px">
      <strong>Feature semantics.</strong> In province and municipality aggregations, road lengths,
      building counts, POI counts, and landuse areas are <strong>area totals</strong> summed across
      all prediction point buffers. Mean building area (m²), building density (per km²), building
      proportions, and VIIRS radiance are <strong>per-buffer averages</strong>.
      SHAP values are computed on 1,112 prediction points using Kernel Explainer with 200 background
      samples and 500 coalition samples per instance.
    </div>
  </div>
</div>

<div class="footer">
  <div>Project TALA by Datamaraws · FEU Institute of Technology · BS CS Data Science · 2026</div>
  <div>Generated ${today} · Model v2.0 · <span>CONFIDENTIAL RESEARCH OUTPUT</span></div>
</div>

<script>
const FM = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
const FS = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();
const defOpts = {
  responsive:true,
  plugins:{
    legend:{labels:{font:{family:FM,size:10},color:'#555'}},
    tooltip:{titleFont:{family:FM},bodyFont:{family:FS}}
  },
  scales:{
    x:{ticks:{font:{family:FM,size:9},color:'#888',maxRotation:45},grid:{color:'rgba(0,0,0,.05)'}},
    y:{ticks:{font:{family:FM,size:10},color:'#555'},grid:{color:'rgba(0,0,0,.05)'}}
  }
};
Chart.defaults.animation=false;
function wiColor(v){
  if(v<-0.5)return'rgba(192,57,43,.75)';
  if(v<0)   return'rgba(230,126,34,.75)';
  if(v<0.5) return'rgba(50,97,137,.75)';
  return'rgba(92,225,230,.75)';
}

// §03 — Wealth distribution
new Chart(document.getElementById('wealthChart'),{type:'bar',
  data:{labels:${wiLabels},datasets:[{label:'Predicted WI',data:${wiData},
    backgroundColor:${wiData}.map(wiColor),borderRadius:2}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,y:{...defOpts.scales.y,
      title:{display:true,text:'Wealth Index',font:{family:FM,size:10}}}}}
});
new Chart(document.getElementById('histChart'),{type:'bar',
  data:{labels:${histLbls},datasets:[{label:'Points',data:${histData},
    backgroundColor:${histLbls}.map(b=>wiColor(parseFloat(b))),
    borderRadius:2,barPercentage:1.0,categoryPercentage:1.0}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,
      x:{...defOpts.scales.x,title:{display:true,text:'WI Bin',font:{family:FM,size:9}}},
      y:{...defOpts.scales.y,title:{display:true,text:'Count',font:{family:FM,size:10}}}}}
});
new Chart(document.getElementById('viirScatter'),{type:'scatter',
  data:{datasets:[{label:'Prediction point',data:${scatterData},
    backgroundColor:'rgba(50,97,137,.55)',pointRadius:5,pointHoverRadius:7}]},
  options:{...defOpts,scales:{
    x:{...defOpts.scales.x,title:{display:true,text:'VIIRS Radiance (nW/cm²/sr)',font:{family:FM,size:9}}},
    y:{...defOpts.scales.y,title:{display:true,text:'Predicted WI',font:{family:FM,size:9}}}}}
});
// §03 — DHS province WI chart (uses national data if available, else area DHS WI)
(function(){
  var provNames = [], provDhsWI = [], provPredWI = [];
  ${national && provList.length > 0
      ? `provNames=${natProvLabels}; provDhsWI=${JSON.stringify(provList.map(p => p.dhs_mean_wi ?? null))}; provPredWI=${natProvWI};`
      : `provNames=['${areaLabel.replace(/'/g, "\\'")}']; provDhsWI=[${dhsMeanWI ?? 'null'}]; provPredWI=[${+meanWI.toFixed(3)}];`}
  var validNames=[], validDhs=[], validPred=[];
  for(var i=0;i<provNames.length;i++){
    if(provDhsWI[i]!=null){validNames.push(provNames[i]);validDhs.push(provDhsWI[i]);validPred.push(provPredWI[i]);}
  }
  if(validNames.length===0){
    var el=document.getElementById('dhsProvChart');
    if(el&&el.parentElement){el.parentElement.innerHTML+='<p style="color:var(--muted);font-size:12px;margin-top:8px">No DHS survey clusters available for this area.</p>';}
    return;
  }
  new Chart(document.getElementById('dhsProvChart'),{type:'bar',
    data:{
      labels:validNames,
      datasets:[
        {label:'DHS Survey WI',data:validDhs,backgroundColor:'rgba(92,225,230,.75)',borderRadius:2},
        {label:'Predicted WI', data:validPred,backgroundColor:'rgba(50,97,137,.55)',borderRadius:2}
      ]
    },
    options:{...defOpts,
      plugins:{...defOpts.plugins,legend:{display:true,position:'bottom',labels:{font:{family:FM,size:10},color:'#555'}}},
      scales:{...defOpts.scales,
        x:{...defOpts.scales.x,ticks:{...defOpts.scales.x.ticks,maxRotation:35}},
        y:{...defOpts.scales.y,title:{display:true,text:'Wealth Index',font:{family:FM,size:10}}}}}
  });
})();

// §04 — Infrastructure
new Chart(document.getElementById('radarChart'),{type:'radar',
  data:{
    labels:['Roads','Buildings','Bldg Density','Finance','Education','Health','Total POIs','VIIRS'],
    datasets:[{label:'${areaLabel.replace(/'/g, "\\'")}',data:${radarData},
      borderColor:'#326189',backgroundColor:'rgba(50,97,137,.18)',
      pointBackgroundColor:'#5ce1e6',pointRadius:4}]
  },
  options:{responsive:true,
    plugins:{legend:{labels:{font:{family:FM,size:10},color:'#555'}}},
    scales:{r:{ticks:{font:{family:FM,size:9},color:'#888',backdropColor:'transparent'},
      pointLabels:{font:{family:FM,size:9},color:'#1a3c5c'},
      grid:{color:'rgba(0,0,0,.07)'},angleLines:{color:'rgba(0,0,0,.07)'},
      suggestedMin:0,suggestedMax:100}}}
});
new Chart(document.getElementById('roadDonut'),{type:'doughnut',
  data:{labels:['Main Roads','Secondary','Local Roads','Tracks'],
    datasets:[{data:${roadDonut},
      backgroundColor:['#1a3c5c','#326189','#88bcbd','#d4dfe6'],
      borderWidth:2,borderColor:'#f5f8fa'}]},
  options:{responsive:true,
    plugins:{legend:{position:'bottom',labels:{font:{family:FM,size:10},color:'#555'}}}}
});
new Chart(document.getElementById('luDonut'),{type:'doughnut',
  data:{labels:['Agricultural','Forest','Residential','Commercial','Industrial'],
    datasets:[{data:${luDonut},
      backgroundColor:['#e67e22','#27ae60','#326189','#1a3c5c','#859498'],
      borderWidth:2,borderColor:'#f5f8fa'}]},
  options:{responsive:true,
    plugins:{legend:{position:'bottom',labels:{font:{family:FM,size:10},color:'#555'}}}}
});
new Chart(document.getElementById('bldgTypeBar'),{type:'bar',
  data:{labels:${bldgTypeLabels},datasets:[{label:'Total count',data:${bldgTypeData},
    backgroundColor:['#326189','#1a3c5c','#859498','#5ce1e6','#88bcbd'],borderRadius:3}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,y:{...defOpts.scales.y,
      title:{display:true,text:'Total count (area)',font:{family:FM,size:9}}}}}
});
new Chart(document.getElementById('bldgAreaBar'),{type:'bar',
  data:{labels:${bldgAreaLabels},datasets:[{label:'Mean area (m²)',data:${bldgAreaData},
    backgroundColor:['#326189','#1a3c5c','#859498','#5ce1e6','#88bcbd'],borderRadius:3}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,y:{...defOpts.scales.y,
      title:{display:true,text:'Mean area m² (per buffer)',font:{family:FM,size:9}}}}}
});
new Chart(document.getElementById('infraBar'),{type:'bar',
  data:{labels:${infraLabels},datasets:[{label:'Count',data:${infraData},
    backgroundColor:['#1a3c5c','#e67e22','#326189','#5ce1e6','#88bcbd','#88bcbd','#c0392b','#859498'],
    borderRadius:2}]},
  options:{...defOpts,indexAxis:'y',plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{
      x:{...defOpts.scales.x,title:{display:true,text:'Total count (area)',font:{family:FM,size:9}}},
      y:{ticks:{font:{family:FM,size:10},color:'#555'},grid:{display:false}}}}
});

${isProvince && muniStats.length > 0 ? `
new Chart(document.getElementById('muniBar'),{type:'bar',
  data:{labels:${muniBarLabels},datasets:[{label:'Mean WI',data:${muniBarData},
    backgroundColor:${muniBarData}.map(wiColor),borderRadius:2}]},
  options:{...defOpts,indexAxis:'y',plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{
      x:{...defOpts.scales.x,title:{display:true,text:'Mean Predicted WI',font:{family:FM,size:9}}},
      y:{ticks:{font:{family:FM,size:9},color:'#555'},grid:{display:false}}}}
});` : ''}

// §06 — SHAP
new Chart(document.getElementById('shapBar'),{type:'bar',
  data:{labels:${shapFeats},datasets:[{label:'Mean |SHAP|',data:${shapVals},
    backgroundColor:${shapVals}.map((_,i)=>\`hsl(\${210-i*12},55%,\${42+i*3}%)\`),borderRadius:2}]},
  options:{...defOpts,indexAxis:'y',plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{
      x:{...defOpts.scales.x,title:{display:true,text:'Mean |SHAP Value|',font:{family:FM,size:9}}},
      y:{ticks:{font:{family:FM,size:10},color:'#555'},grid:{display:false}}}}
});
new Chart(document.getElementById('shapCat'),{type:'bar',
  data:{labels:${catLabels},datasets:[{label:'Summed mean |SHAP|',data:${catData},
    backgroundColor:${catColorsJS},borderRadius:2}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,y:{...defOpts.scales.y,
      title:{display:true,text:'Summed mean |SHAP|',font:{family:FM,size:10}}}}}
});

// §08 — National comparison charts
${national && provList.length > 0 ? `
new Chart(document.getElementById('natProvBar'),{type:'bar',
  data:{labels:${natProvLabels},datasets:[{label:'Mean Predicted WI',data:${natProvWI},
    backgroundColor:${natProvWI}.map(wiColor),borderRadius:3}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,y:{...defOpts.scales.y,
      title:{display:true,text:'Mean Predicted Wealth Index',font:{family:FM,size:10}}}}}
});
new Chart(document.getElementById('natScatter'),{type:'scatter',
  data:{datasets:[{label:'Province',data:${natScatterData},
    backgroundColor:'rgba(50,97,137,.7)',pointRadius:7,pointHoverRadius:9}]},
  options:{...defOpts,
    plugins:{...defOpts.plugins,
      tooltip:{callbacks:{label:ctx=>\`\${ctx.raw.label}: DHS WI \${ctx.raw.x} · Pred WI \${ctx.raw.y}\`}}},
    scales:{
      x:{...defOpts.scales.x,title:{display:true,text:'DHS Survey Mean WI (actual)',font:{family:FM,size:9}}},
      y:{...defOpts.scales.y,title:{display:true,text:'Predicted Mean WI (model)',font:{family:FM,size:9}}}}}
});
new Chart(document.getElementById('natVIIRS'),{type:'bar',
  data:{labels:${natProvLabels},datasets:[{label:'VIIRS Mean (nW)',data:${natInfraVIIRS},
    backgroundColor:'rgba(92,225,230,.75)',borderRadius:2}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,x:{...defOpts.scales.x,ticks:{...defOpts.scales.x.ticks,maxRotation:35}},
      y:{...defOpts.scales.y,title:{display:true,text:'VIIRS Mean nW/cm²/sr',font:{family:FM,size:9}}}}}
});
new Chart(document.getElementById('natRoads'),{type:'bar',
  data:{labels:${natProvLabels},datasets:[{label:'Road Length (km)',data:${natInfraRoads},
    backgroundColor:'rgba(133,148,152,.75)',borderRadius:2}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,x:{...defOpts.scales.x,ticks:{...defOpts.scales.x.ticks,maxRotation:35}},
      y:{...defOpts.scales.y,title:{display:true,text:'Total road length (km)',font:{family:FM,size:9}}}}}
});
new Chart(document.getElementById('natPOIs'),{type:'bar',
  data:{labels:${natProvLabels},datasets:[{label:'Total POIs',data:${natInfraPOIs},
    backgroundColor:'rgba(26,60,92,.75)',borderRadius:2}]},
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{...defOpts.scales,x:{...defOpts.scales.x,ticks:{...defOpts.scales.x.ticks,maxRotation:35}},
      y:{...defOpts.scales.y,title:{display:true,text:'Total POI count',font:{family:FM,size:9}}}}}
});` : ''}
</script>
</body>
</html>`
}