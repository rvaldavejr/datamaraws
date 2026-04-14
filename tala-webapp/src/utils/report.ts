// src/lib/report.ts
// Generates a downloadable HTML analytics report — revised section map.
//
// Sections:
//   01  Area Overview          — KPIs + summary paragraph
//   02  Point-Level Estimates  — table (no district, no actual WI)
//   03  Wealth Distribution    — WI bar, histogram, VIIRS scatter, PSA comparison
//   04  Infrastructure Profile — radar, road donut, indicators bar
//   05  Municipal Breakdown    — province reports only: ranked bar + table
//   06  SHAP Feature Attribution — importance bar, category grouped bar, ranked table
//   07  Policy Recommendations — 4 cards, SHAP-driven, municipality level
//   08  Methodology            — data sources, model, limitations
//
// ── FONT CONFIGURATION ─────────────────────────────────────────────────────
// To change fonts, edit only this object.
//
// Option A — DM Family (current):
//   googleUrl: 'DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500'
//   sans: "'DM Sans', sans-serif"   serif: "'DM Serif Display', Georgia, serif"
//   mono: "'DM Mono', 'Courier New', monospace"
//
// Option B — Plus Jakarta Sans + Lora + JetBrains Mono:
//   googleUrl: 'Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500'
//   sans: "'Plus Jakarta Sans', sans-serif"   serif: "'Lora', Georgia, serif"
//   mono: "'JetBrains Mono', 'Courier New', monospace"
//
// Option C — Inter + Playfair Display + IBM Plex Mono:
//   googleUrl: 'Inter:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@400;500'
//   sans: "'Inter', sans-serif"   serif: "'Playfair Display', Georgia, serif"
//   mono: "'IBM Plex Mono', 'Courier New', monospace"
// ───────────────────────────────────────────────────────────────────────────

const FONTS = {
  googleUrl: 'DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500',
  sans : "'DM Sans', sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
  mono : "'DM Mono', 'Courier New', monospace",
}

import type { SelectedArea, OsmFeatures } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function wiChipClass(wi: number) {
  if (wi >= 0.5)  return 'w-high'
  if (wi >= -0.5) return 'w-mid'
  return 'w-low'
}

function wiLabel(wi: number) {
  if (wi >= 0.5)  return 'High Wealth'
  if (wi >= 0.0)  return 'Moderate'
  if (wi >= -0.5) return 'Below Average'
  return 'Low Wealth'
}

function fmt(n: number, d = 2) {
  return (n >= 0 ? '+' : '') + n.toFixed(d)
}

// SHAP feature policy domain mapping
const POLICY_MAP: Record<string, {
  domain: string
  agency: string
  body: (v: number, a: string, s: number) => string
}> = {
  VIIRS_Median: {
    domain: 'Electrification',
    agency: 'MERALCO / DOE / DSWD',
    body: (v, a, s) => `Nighttime luminosity is a leading predictor of wealth in ${a} (SHAP = ${s.toFixed(3)}). The area mean of ${v.toFixed(2)} nW/cm²/sr indicates ${v < 1.0 ? 'critically limited' : v < 3.0 ? 'below-average' : 'moderate'} electrification. MERALCO and DOE should prioritise household electricity connections, solar streetlighting, and off-grid energy access programmes in the lowest-wealth municipalities within ${a}.`,
  },
  Total_Road_Length: {
    domain: 'Road Network',
    agency: 'DPWH / DILG',
    body: (v, a, s) => `Overall road network density (mean ${v.toFixed(1)} km per buffer, SHAP = ${s.toFixed(3)}) is a significant predictor of wealth in ${a}. DPWH should assess road construction and maintenance priorities to improve internal municipal connectivity, particularly for the lowest-wealth municipalities identified in this report.`,
  },
  Main_Roads_Length: {
    domain: 'Connectivity',
    agency: 'DPWH',
    body: (v, a, s) => `Primary road access (mean ${v.toFixed(1)} km per buffer, SHAP = ${s.toFixed(3)}) is a key wealth predictor in ${a}. Upgrading farm-to-market roads and provincial highways to primary classification would improve market access and economic integration for underserved municipalities.`,
  },
  Tracks_Length: {
    domain: 'Rural Access',
    agency: 'DPWH / DA',
    body: (v, a, s) => `Reliance on unpaved tracks (mean ${v.toFixed(1)} km, SHAP = ${s.toFixed(3)}) is associated with lower predicted wealth in ${a}, reflecting geographic isolation. DA farm-to-market road and DPWH rural road upgrading programmes should prioritise track formalisation in the most isolated municipalities.`,
  },
  POI_bank_Count: {
    domain: 'Financial Inclusion',
    agency: 'BSP / DSWD',
    body: (v, a, s) => `Bank and financial service density (mean ${v.toFixed(1)} per buffer, SHAP = ${s.toFixed(3)}) contributes significantly to wealth predictions in ${a}. BSP financial inclusion programmes including agent banking licences and e-money operator onboarding should target municipalities with the lowest predicted wealth indices.`,
  },
  Bldg_school_Count: {
    domain: 'Education Infrastructure',
    agency: 'DepEd / CHED',
    body: (v, a, s) => `School building density (mean ${v.toFixed(1)} per buffer, SHAP = ${s.toFixed(3)}) is a positive predictor of wealth in ${a}. DepEd should prioritise school construction, classroom repair, and teacher deployment in municipalities where school count falls below the provincial average.`,
  },
  POI_school_Count: {
    domain: 'Education Access',
    agency: 'DepEd',
    body: (v, a, s) => `Access to educational facilities (mean ${v.toFixed(1)} per buffer, SHAP = ${s.toFixed(3)}) predicts wealth variation in ${a}. Expanding formal school infrastructure and alternative learning centres in underserved municipalities is recommended.`,
  },
  Total_Bldg_Area: {
    domain: 'Housing Quality',
    agency: 'SHFC / NHA',
    body: (v, a, s) => `Mean built-up area (${v.toFixed(0)} m² per buffer, SHAP = ${s.toFixed(3)}) reflects ${v < 50000 ? 'informal or low-density settlement patterns' : 'moderate built environment density'} in ${a}. SHFC and NHA should prioritise settlement upgrading and socialized housing in the lowest-wealth municipalities.`,
  },
  POI_hospital_Count: {
    domain: 'Health Access',
    agency: 'DOH / PhilHealth',
    body: (v, a, s) => `Health facility density (mean ${v.toFixed(1)} per buffer, SHAP = ${s.toFixed(3)}) predicts wealth in ${a}. DOH should assess barangay health center coverage and rural health unit placement in municipalities with below-average predicted wealth indices.`,
  },
  POI_convenience_Count: {
    domain: 'Retail Commerce',
    agency: 'DTI / MSME',
    body: (v, a, s) => `Convenience store density (mean ${v.toFixed(1)} per buffer, SHAP = ${s.toFixed(3)}) proxies consumer purchasing power in ${a}. DTI MSME development programmes should target the lowest-wealth municipalities to stimulate commercial activity.`,
  },
}

const PRIORITY_CLASSES = ['', 'priority2', 'priority3', 'priority4']

// ── PSA poverty rate reference for all output provinces ────────────────────
const PSA_PROVINCES = [
  { name: 'Zamboanga del Norte', psa: 37.7 },
  { name: 'Basilan',             psa: 33.7 },
  { name: 'Tawi-Tawi',           psa: 32.3 },
  { name: 'Maguindanao del Sur',  psa: 32.1 },
  { name: 'Davao Oriental',       psa: 29.1 },
  { name: 'Aklan',               psa:  3.1 },
  { name: 'Kalinga',             psa:  2.6 },
  { name: 'Benguet',             psa:  2.5 },
  { name: 'Pampanga',            psa:  1.0 },
  { name: 'Ilocos Norte',        psa:  0.3 },
  { name: 'NCR',                 psa:  1.5 },
]

// ── Main export ────────────────────────────────────────────────────────────

export function generateReport(area: SelectedArea): string {
  const d         = area.data as any
  const pts       = area.points
  const shap      = area.shap.slice(0, 10)
  const isProvince = area.type === 'province'

  const meanWI  = d.mean_wi   ?? 0
  const minWI   = d.min_wi    ?? 0
  const maxWI   = d.max_wi    ?? 0
  const stdWI   = d.std_wi    ?? 0
  const nPoints = d.n_points  ?? pts.length
  const pctLow  = d.pct_low   ?? 0
  const pctHigh = d.pct_high  ?? 0
  const osm     = (d.osm_mean ?? {}) as OsmFeatures
  const poverty = d.poverty_rate != null ? `${d.poverty_rate}%` : 'N/A'

  const today = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const areaLabel = isProvince
    ? area.name
    : `${area.name}, ${area.province}`

  // ── §02 Point table ───────────────────────────────────────────────────────
  const sortedPts = [...pts].sort((a, b) => a.wi - b.wi)
  const ptRows    = sortedPts.slice(0, 20).map(p => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:11px">${String(p.id).padStart(5,'0')}</td>
      <td>${p.municipality}</td>
      <td>${p.urban_rural === 'U' ? 'Urban' : 'Rural'}</td>
      <td style="font-family:var(--font-mono)">${fmt(p.wi)}</td>
      <td style="font-family:var(--font-mono)">${p.osm.VIIRS_Median.toFixed(2)}</td>
      <td style="font-family:var(--font-mono)">${p.osm.Total_POI_Count}</td>
      <td style="font-family:var(--font-mono)">${p.osm.Total_Road_Length.toFixed(1)}</td>
      <td><span class="wealth-chip ${wiChipClass(p.wi)}">${wiLabel(p.wi)}</span></td>
    </tr>`).join('')

  // ── §03 Chart data ────────────────────────────────────────────────────────
  const wiData   = JSON.stringify(sortedPts.slice(0,20).map(p => p.wi))
  const wiLabels = JSON.stringify(sortedPts.slice(0,20).map(p => `PT-${p.id}`))

  const bins      = [-2.5,-2.25,-2,-1.75,-1.5,-1.25,-1,-0.75,-0.5,-0.25,0,0.25,0.5,0.75,1,1.25,1.5,1.75,2]
  const histCounts= bins.slice(0,-1).map((_,i) =>
    pts.filter(p => p.wi >= bins[i] && p.wi < bins[i+1]).length
  )
  const histData  = JSON.stringify(histCounts)
  const histLbls  = JSON.stringify(bins.slice(0,-1).map(b => b.toFixed(2)))

  const scatterData = JSON.stringify(
    pts.slice(0,80).map(p => ({ x: p.osm.VIIRS_Median, y: p.wi }))
  )
  const psaNames = JSON.stringify(PSA_PROVINCES.map(p => p.name))
  const psaVals  = JSON.stringify(PSA_PROVINCES.map(p => p.psa))

  // ── §04 Infrastructure data ───────────────────────────────────────────────
  const norm = (v: number, max: number) =>
    Math.min(100, Math.round((v / max) * 100))

  const radarData = JSON.stringify([
    norm(osm.Total_Road_Length   ?? 0, 400),
    norm(osm.Total_Bldg_Count    ?? 0, 20000),
    norm(osm.POI_bank_Count      ?? 0, 50),
    norm(osm.Bldg_school_Count   ?? 0, 200),
    norm(osm.POI_hospital_Count  ?? 0, 10),
    norm(osm.VIIRS_Median        ?? 0, 15),
  ])

  const roadDonut   = JSON.stringify([
    +(osm.Main_Roads_Length       ?? 0).toFixed(1),
    +(osm.Secondary_Roads_Length  ?? 0).toFixed(1),
    +(osm.Local_Roads_Length      ?? 0).toFixed(1),
    +(osm.Tracks_Length           ?? 0).toFixed(1),
  ])

  const infraLabels = JSON.stringify(['Total POIs','Banks','Schools','Hospitals','Fast Food','Convenience'])
  const infraData   = JSON.stringify([
    osm.Total_POI_Count       ?? 0,
    osm.POI_bank_Count        ?? 0,
    osm.POI_school_Count      ?? 0,
    osm.POI_hospital_Count    ?? 0,
    osm.POI_fast_food_Count   ?? 0,
    osm.POI_convenience_Count ?? 0,
  ])

  // ── §05 Municipality breakdown ────────────────────────────────────────────
  const muniRows = pts.reduce((acc: Record<string, number[]>, p) => {
    if (!acc[p.municipality]) acc[p.municipality] = []
    acc[p.municipality].push(p.wi)
    return acc
  }, {})

  const muniStats = Object.entries(muniRows)
    .map(([name, wis]) => ({
      name,
      mean    : wis.reduce((a,b) => a+b, 0) / wis.length,
      n       : wis.length,
      pctLow  : wis.filter(w => w < -0.5).length / wis.length * 100,
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
  const muniBarData   = JSON.stringify(muniStats.map(m => +m.mean.toFixed(3)))

  // ── §06 SHAP data ─────────────────────────────────────────────────────────
  const maxShap  = shap[0]?.mean_abs_shap ?? 1
  const shapFeats = JSON.stringify(shap.map(s => s.feature.replace(/_/g,' ')))
  const shapVals  = JSON.stringify(shap.map(s => s.mean_abs_shap))

  const catMap: Record<string, string> = {
    VIIRS_Median:            'Satellite',
    Total_Road_Length:       'Road',  Main_Roads_Length:       'Road',
    Secondary_Roads_Length:  'Road',  Local_Roads_Length:      'Road',
    Tracks_Length:           'Road',
    Total_Bldg_Count:        'Building', Total_Bldg_Area:      'Building',
    Bldg_school_Count:       'Building', Bldg_commercial_Count:'Building',
    Bldg_hospital_Count:     'Building', Bldg_residential_Count:'Building',
    Bldg_industrial_Count:   'Building',
    Total_POI_Count:         'POI',   POI_bank_Count:          'POI',
    POI_hotel_Count:         'POI',   POI_fast_food_Count:     'POI',
    POI_convenience_Count:   'POI',   POI_school_Count:        'POI',
    POI_hospital_Count:      'POI',
  }
  const shapCats  = ['Satellite','Road','Building','POI','Temporal']
  const catTotals = shapCats.map(cat =>
    +shap.filter(s => (catMap[s.feature] ?? 'Temporal') === cat)
         .reduce((sum, s) => sum + s.mean_abs_shap, 0).toFixed(4)
  )
  const catLabels = JSON.stringify(shapCats)
  const catData   = JSON.stringify(catTotals)

  const shapRows  = shap.map((s, i) => {
    const pct = Math.round(s.mean_abs_shap / maxShap * 100)
    return `
    <tr>
      <td class="rank-num">${i+1}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${s.feature.replace(/_/g,' ')}</td>
      <td style="font-size:11px;color:var(--muted)">${catMap[s.feature] ?? 'Temporal'}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${s.mean_abs_shap.toFixed(3)}</td>
      <td><span class="shap-badge pos">Wealth ↑</span></td>
      <td class="shap-bar-wrap">
        <div class="shap-bar-bg">
          <div class="shap-bar-fill shap-pos" style="width:${pct}%"></div>
        </div>
      </td>
    </tr>`
  }).join('')

  // ── §07 Recommendations ───────────────────────────────────────────────────
  const recCards = shap
    .filter(s => POLICY_MAP[s.feature])
    .slice(0, 4)
    .map((s, i) => {
      const p   = POLICY_MAP[s.feature]
      const val = (osm as any)[s.feature] ?? 0
      return `
    <div class="rec-card ${PRIORITY_CLASSES[i]}">
      <div class="rec-priority">Priority ${i+1} · ${p.domain} · SHAP ${s.mean_abs_shap.toFixed(3)} · ${p.agency}</div>
      <h4>${p.domain} Intervention in ${areaLabel}</h4>
      <p>${p.body(val, areaLabel, s.mean_abs_shap)}</p>
    </div>`
    }).join('')

  // ── Section numbering: province has §05 Municipal; municipality skips it ──
  const s = (n: number) => isProvince ? String(n).padStart(2,'0') : String(n-1).padStart(2,'0')

  // ── HTML ──────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Poverty Analytics Report — ${areaLabel}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=${FONTS.googleUrl}&display=swap');
  :root {
    --ink:       #1a3c5c;  --paper:    #f5f8fa;  --cream:    #eaf1f5;
    --accent:    #326189;  --accent2:  #e67e22;  --accent3:  #5ce1e6;
    --muted:     #859498;  --rule:     #d4dfe6;
    --positive:  #5ce1e6;  --negative: #c0392b;  --warn:     #e67e22;
    --font-sans:  ${FONTS.sans};
    --font-serif: ${FONTS.serif};
    --font-mono:  ${FONTS.mono};
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:var(--font-sans);background:var(--paper);color:var(--ink);line-height:1.6;font-size:14px;}
  .print-btn{position:fixed;top:20px;right:20px;background:var(--accent);color:#fff;border:none;padding:10px 22px;font-family:var(--font-mono);font-size:12px;letter-spacing:.08em;cursor:pointer;z-index:999;}
  .print-btn:hover{background:#1a3c5c;}
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
  .exec-stat:first-child{padding-left:0;} .exec-stat:last-child{border-right:none;}
  .exec-stat .val{font-family:var(--font-serif);font-size:30px;line-height:1;}
  .exec-stat .lbl{font-size:11px;letter-spacing:.06em;opacity:.82;margin-top:4px;}
  .page{max-width:1080px;margin:0 auto;padding:0 60px 80px;}
  .section{margin-top:52px;}
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
  .shap-table{width:100%;border-collapse:collapse;margin-top:8px;}
  .shap-table th{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:8px 12px;border-bottom:1px solid var(--rule);text-align:left;}
  .shap-table td{padding:9px 12px;border-bottom:1px solid var(--rule);font-size:13px;vertical-align:middle;}
  .shap-table tr:last-child td{border-bottom:none;}
  .shap-bar-wrap{width:160px;}
  .shap-bar-bg{background:var(--cream);height:8px;border-radius:2px;overflow:hidden;}
  .shap-bar-fill{height:100%;border-radius:2px;}
  .shap-pos{background:var(--positive);}
  .shap-badge{display:inline-block;font-family:var(--font-mono);font-size:11px;padding:2px 8px;border-radius:2px;font-weight:500;}
  .shap-badge.pos{background:#d4f6f7;color:#1a3c5c;}
  .rank-num{font-family:var(--font-mono);font-size:11px;color:var(--muted);width:24px;}
  .cluster-table{width:100%;border-collapse:collapse;}
  .cluster-table th{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;color:var(--muted);padding:8px 10px;border-bottom:2px solid var(--ink);text-align:left;}
  .cluster-table td{padding:9px 10px;border-bottom:1px solid var(--rule);font-size:12px;}
  .cluster-table tr:last-child td{border-bottom:none;}
  .wealth-chip{display:inline-block;padding:2px 10px;border-radius:2px;font-family:var(--font-mono);font-size:11px;font-weight:500;}
  .w-high{background:#d4f6f7;color:#1a3c5c;}
  .w-mid{background:#eaf1f5;color:#224d75;}
  .w-low{background:#fadbd8;color:#922b21;}
  .body-text{font-size:13.5px;line-height:1.75;color:#2c3e50;max-width:720px;}
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
  .footer{background:var(--ink);color:rgba(245,240,232,.5);padding:24px 60px;font-size:11px;font-family:var(--font-mono);display:flex;justify-content:space-between;align-items:center;letter-spacing:.04em;margin-top:60px;}
  .footer span{color:var(--paper);}
  .divider{border:none;border-top:1px solid var(--rule);margin:32px 0;}
  @media print{.print-btn{display:none;}.masthead,.exec-band{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.section{page-break-inside:avoid;}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">↓ DOWNLOAD PDF</button>

<div class="masthead">
  <div class="masthead-kicker">Project TALA · Per-Area Analytics Report</div>
  <h1>Poverty Incidence Analysis<br><em>${areaLabel}</em></h1>
  <div class="masthead-meta">
    <div class="meta-item"><strong>Report Date</strong>${today}</div>
    <div class="meta-item"><strong>Data Source</strong>2025 Sentinel-2 · VIIRS · OpenStreetMap</div>
    <div class="meta-item"><strong>Model</strong>CNN–LSTM Hybrid (v1.0)</div>
    <div class="meta-item"><strong>Coverage</strong>${nPoints} prediction points</div>
    <div class="meta-item"><strong>Interpretability</strong>SHAP (Kernel Explainer)</div>
  </div>
</div>

<div class="exec-band">
  <div class="exec-stat"><div class="val">${fmt(meanWI)}</div><div class="lbl">Mean Predicted Wealth Index</div></div>
  <div class="exec-stat"><div class="val">${nPoints}</div><div class="lbl">Prediction Points Analysed</div></div>
  <div class="exec-stat"><div class="val">${pctLow.toFixed(0)}%</div><div class="lbl">Points Below WI −0.50</div></div>
  <div class="exec-stat"><div class="val">${area.shap[0]?.feature?.replace(/_/g,' ') ?? 'N/A'}</div><div class="lbl">Top SHAP Feature Driver</div></div>
</div>

<div class="page">

  <!-- 01 AREA OVERVIEW -->
  <div class="section">
    <div class="section-header"><span class="section-num">01</span><h2>Area Overview</h2></div>
    <p class="body-text">
      ${areaLabel} contains ${nPoints} prediction points with a mean predicted wealth index of ${fmt(meanWI)}
      (range ${fmt(minWI)} to ${fmt(maxWI)}, spread ${(maxWI-minWI).toFixed(2)}, std ${stdWI.toFixed(2)}).
      ${pctLow.toFixed(0)}% of points fall below the poverty threshold (WI &lt; −0.50) and
      ${pctHigh.toFixed(0)}% are in the high-wealth category.
      ${isProvince && muniStats.length > 0
        ? `Across ${muniStats.length} municipalities, ${muniStats.filter(m=>m.mean<-0.5).length} average below the poverty threshold.`
        : ''}
      The strongest static predictor of wealth is
      <strong>${area.shap[0]?.feature?.replace(/_/g,' ') ?? 'N/A'}</strong>
      (mean |SHAP| = ${(area.shap[0]?.mean_abs_shap ?? 0).toFixed(3)}).
    </p>
    <div class="kpi-grid" style="margin-top:28px">
      <div class="kpi-card info">
        <div class="kpi-label">Mean Wealth Index</div>
        <div class="kpi-value">${fmt(meanWI)}</div>
        <div class="kpi-sub">National mean: +0.00 · Std dev: ${stdWI.toFixed(2)}</div>
      </div>
      <div class="kpi-card ${pctLow > 40 ? 'bad' : pctLow > 20 ? 'warn' : 'good'}">
        <div class="kpi-label">Wealth Index Range</div>
        <div class="kpi-value">${fmt(minWI,1)} to ${fmt(maxWI,1)}</div>
        <div class="kpi-sub">Spread of ${(maxWI-minWI).toFixed(2)} units</div>
      </div>
      <div class="kpi-card ${pctLow > 40 ? 'bad' : pctLow > 20 ? 'warn' : 'good'}">
        <div class="kpi-label">Points Below −0.50 WI</div>
        <div class="kpi-value">${pctLow.toFixed(0)}%</div>
        <div class="kpi-sub">${Math.round(nPoints*pctLow/100)} of ${nPoints} · PSA rate: ${poverty}</div>
      </div>
      <div class="kpi-card good">
        <div class="kpi-label">VIIRS Nighttime Luminosity</div>
        <div class="kpi-value">${(osm.VIIRS_Median ?? 0).toFixed(2)} nW</div>
        <div class="kpi-sub">Area mean · Rural baseline: ~0.28 nW</div>
      </div>
      <div class="kpi-card info">
        <div class="kpi-label">Total POI Count</div>
        <div class="kpi-value">${Math.round(osm.Total_POI_Count ?? 0)}</div>
        <div class="kpi-sub">Mean per buffer · ${Math.round(osm.POI_bank_Count ?? 0)} banks</div>
      </div>
      <div class="kpi-card warn">
        <div class="kpi-label">Road Network</div>
        <div class="kpi-value">${(osm.Total_Road_Length ?? 0).toFixed(1)} km</div>
        <div class="kpi-sub">Mean per buffer · ${(osm.Main_Roads_Length ?? 0).toFixed(1)} km primary</div>
      </div>
    </div>
  </div>

  <!-- 02 POINT-LEVEL ESTIMATES -->
  <div class="section">
    <div class="section-header"><span class="section-num">02</span><h2>Point-Level Wealth Index Estimates</h2></div>
    <p class="body-text">
      Up to 20 prediction points within ${areaLabel}, sorted ascending by predicted wealth index.
      The lowest spatial unit of analysis is the municipality.
    </p>
    <div style="overflow-x:auto;margin-top:20px">
      <table class="cluster-table">
        <thead>
          <tr>
            <th>Point ID</th><th>Municipality</th><th>Urban/Rural</th>
            <th>Predicted WI</th><th>VIIRS (nW)</th>
            <th>Total POIs</th><th>Road Length (km)</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${ptRows}</tbody>
      </table>
    </div>
    <div class="method-box">
      <strong>Model note.</strong> R² = 0.46, Pearson r = 0.69 (5-fold CV, 1,234 DHS clusters).
      Inference applied to 2025 Sentinel-2 composites. SHAP values are from training clusters.
    </div>
  </div>

  <!-- 03 WEALTH DISTRIBUTION -->
  <div class="section">
    <div class="section-header"><span class="section-num">03</span><h2>Wealth Index Distribution</h2></div>
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
        <div class="chart-title">VIIRS vs Wealth Index</div>
        <div class="chart-sub">Each point = one prediction point · up to 80 shown</div>
        <canvas id="viirScatter" height="220"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">PSA Poverty Rate — All Output Provinces</div>
        <div class="chart-sub">Official PSA 2023 poverty incidence · sorted by rate</div>
        <canvas id="psaChart" height="220"></canvas>
      </div>
    </div>
  </div>

  <!-- 04 INFRASTRUCTURE PROFILE -->
  <div class="section">
    <div class="section-header"><span class="section-num">04</span><h2>Infrastructure Profile</h2></div>
    <div class="two-col">
      <div class="chart-card">
        <div class="chart-title">Infrastructure Radar</div>
        <div class="chart-sub">Normalised 0–100 · relative to national benchmarks</div>
        <canvas id="radarChart" height="260"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Road Network Composition</div>
        <div class="chart-sub">Mean road length by type (km per buffer)</div>
        <canvas id="roadDonut" height="260"></canvas>
      </div>
    </div>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-title">POI Infrastructure Indicators</div>
      <div class="chart-sub">Mean count per prediction point buffer</div>
      <canvas id="infraBar" height="100"></canvas>
    </div>
  </div>

  ${isProvince && muniStats.length > 0 ? `
  <!-- 05 MUNICIPAL BREAKDOWN (province only) -->
  <div class="section">
    <div class="section-header"><span class="section-num">05</span><h2>Municipal Breakdown</h2></div>
    <p class="body-text">
      The ${muniStats.length} municipalities within ${areaLabel} ranked by mean predicted wealth index.
      ${muniStats.filter(m=>m.mean<-0.5).length} municipalities average below the poverty threshold.
      ${muniStats[0]?.name ?? ''} records the lowest mean WI (${fmt(muniStats[0]?.mean ?? 0)})
      and ${muniStats[muniStats.length-1]?.name ?? ''} the highest
      (${fmt(muniStats[muniStats.length-1]?.mean ?? 0)}).
    </p>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-title">Municipalities Ranked by Mean Wealth Index</div>
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

  <!-- 06 / 05 SHAP FEATURE ATTRIBUTION -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">${s(6)}</span>
      <h2>SHAP Feature Attribution</h2>
    </div>
    <p class="body-text">
      SHAP values quantify the marginal contribution of each feature to wealth index predictions.
      Temporal satellite features (LSTM) account for approximately 86.6% of total absolute SHAP
      contribution per cluster. The named static features below represent the remaining
      interpretable signal. Higher mean |SHAP| indicates stronger influence on predictions.
    </p>
    <div class="two-col" style="margin-top:24px">
      <div class="chart-card">
        <div class="chart-title">Feature Importance (mean |SHAP|)</div>
        <div class="chart-sub">Top 10 static features · training clusters</div>
        <canvas id="shapBar" height="280"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">SHAP Contribution by Category</div>
        <div class="chart-sub">Summed mean |SHAP| per feature category · top 10</div>
        <canvas id="shapCat" height="280"></canvas>
      </div>
    </div>
    <div style="margin-top:24px">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">
        Ranked Feature Attribution Table
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px">
        Mean absolute SHAP value · higher = stronger driver of wealth prediction
      </div>
      <table class="shap-table">
        <thead>
          <tr><th>#</th><th>Feature</th><th>Category</th><th>Mean |SHAP|</th><th>Direction</th><th>Importance</th></tr>
        </thead>
        <tbody>${shapRows}</tbody>
      </table>
    </div>
    <div class="method-box" style="margin-top:20px">
      <strong>Interpretation.</strong> Kernel SHAP on 1,234 training clusters · 200 background samples ·
      200 coalition samples per instance. Base value ≈ −0.08. LSTM temporal signal is not decomposable
      into named features.
    </div>
  </div>

  <!-- 07 / 06 POLICY RECOMMENDATIONS -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">${s(7)}</span>
      <h2>Policy Recommendations</h2>
    </div>
    <p class="body-text">
      Derived from the SHAP feature attribution for ${areaLabel}. Ranked by SHAP signal magnitude.
      Targeted at the municipality level within the area.
    </p>
    <div class="rec-grid">${recCards || '<p style="color:var(--muted);font-size:13px">No policy-mapped SHAP drivers found for this area.</p>'}</div>
    <div class="method-box" style="margin-top:20px">
      <strong>Limitations.</strong> Recommendations are derived from a model trained on 2022 DHS data applied to 2025 imagery.
      Validation against ground-truth surveys and community consultation at the municipality level is required
      before policy action. The wealth index does not directly capture all dimensions of deprivation.
    </div>
  </div>

  <!-- 08 / 07 METHODOLOGY -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">${s(8)}</span>
      <h2>Methodology Summary</h2>
    </div>
    <div class="two-col">
      <div>
        <p class="body-text"><strong>Data sources</strong></p>
        <p class="body-text">
          Sentinel-2 Level-2A, 10 m, quarterly median composites Q1–Q4 2025 (Google Earth Engine).
          VIIRS VNP46A1 Day/Night Band, ~500 m, 2025 annual median. OSM via Geofabrik Philippines
          (2026 vintage). Ground truth: 2022 Philippines DHS Wealth Index (PSA / USAID).
        </p>
      </div>
      <div>
        <p class="body-text"><strong>Model architecture</strong></p>
        <p class="body-text">
          VGG16 CNN pre-trained on VIIRS proxy task → 4,096-dim features → 128-dim PCA (85.1% variance).
          64-unit LSTM aggregates 4 quarterly vectors. Fused with 20 static OSM + VIIRS features
          via dense regression head. 5-fold CV on 1,234 DHS clusters: R² = 0.46, r = 0.69.
        </p>
      </div>
    </div>
  </div>

</div>

<div class="footer">
  <div>Project TALA · FEU Institute of Technology · BS CS Data Science · 2026</div>
  <div>Generated ${today} · Model v1.0 · <span>CONFIDENTIAL RESEARCH OUTPUT</span></div>
</div>

<script>
const FONT_SANS = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();
const FONT_MONO = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();

const defOpts = {
  responsive: true,
  plugins: {
    legend: { labels: { font: { family: FONT_MONO, size: 10 }, color: '#555' } },
    tooltip: { titleFont: { family: FONT_MONO }, bodyFont: { family: FONT_SANS } }
  },
  scales: {
    x: { ticks: { font: { family: FONT_MONO, size: 9 }, color: '#888', maxRotation: 45 }, grid: { color: 'rgba(0,0,0,.05)' } },
    y: { ticks: { font: { family: FONT_MONO, size: 10 }, color: '#555' }, grid: { color: 'rgba(0,0,0,.05)' } }
  }
};

Chart.defaults.animation = false;

function wiColor(v) {
  if (v < -0.5) return 'rgba(192,57,43,.75)';
  if (v <  0.0) return 'rgba(230,126,34,.75)';
  if (v <  0.5) return 'rgba(50,97,137,.75)';
  return 'rgba(92,225,230,.75)';
}

new Chart(document.getElementById('wealthChart'), {
  type: 'bar',
  data: { labels: ${wiLabels}, datasets: [{ label: 'Predicted WI', data: ${wiData},
    backgroundColor: ${wiData}.map(wiColor), borderRadius: 2 }] },
  options: { ...defOpts, plugins: { ...defOpts.plugins, legend: { display: false } },
    scales: { ...defOpts.scales, y: { ...defOpts.scales.y,
      title: { display: true, text: 'Wealth Index', font: { family: FONT_MONO, size: 10 } } } } }
});

new Chart(document.getElementById('histChart'), {
  type: 'bar',
  data: { labels: ${histLbls}, datasets: [{ label: 'Points', data: ${histData},
    backgroundColor: ${histLbls}.map(b => wiColor(parseFloat(b))),
    borderRadius: 2, barPercentage: 1.0, categoryPercentage: 1.0 }] },
  options: { ...defOpts, plugins: { ...defOpts.plugins, legend: { display: false } },
    scales: { ...defOpts.scales,
      x: { ...defOpts.scales.x, title: { display: true, text: 'Wealth Index Bin', font: { family: FONT_MONO, size: 9 } } },
      y: { ...defOpts.scales.y, title: { display: true, text: 'Count', font: { family: FONT_MONO, size: 10 } } } } }
});

new Chart(document.getElementById('viirScatter'), {
  type: 'scatter',
  data: { datasets: [{ label: 'Prediction point', data: ${scatterData},
    backgroundColor: 'rgba(50,97,137,.55)', pointRadius: 5, pointHoverRadius: 7 }] },
  options: { ...defOpts,
    scales: {
      x: { ...defOpts.scales.x, title: { display: true, text: 'VIIRS Radiance (nW/cm²/sr)', font: { family: FONT_MONO, size: 9 } } },
      y: { ...defOpts.scales.y, title: { display: true, text: 'Predicted Wealth Index', font: { family: FONT_MONO, size: 9 } } }
    } }
});

new Chart(document.getElementById('psaChart'), {
  type: 'bar',
  data: { labels: ${psaNames}, datasets: [{ label: 'PSA Poverty Rate (%)', data: ${psaVals},
    backgroundColor: ${psaVals}.map(v => v > 20 ? 'rgba(192,57,43,.75)' : v > 5 ? 'rgba(230,126,34,.75)' : 'rgba(50,97,137,.75)'),
    borderRadius: 2 }] },
  options: { ...defOpts, plugins: { ...defOpts.plugins, legend: { display: false } },
    scales: { ...defOpts.scales, y: { ...defOpts.scales.y,
      title: { display: true, text: 'PSA Poverty Rate (%)', font: { family: FONT_MONO, size: 10 } } } } }
});

new Chart(document.getElementById('radarChart'), {
  type: 'radar',
  data: {
    labels: ['Road Network','Building Density','Banks','Schools','Hospitals','VIIRS'],
    datasets: [{ label: '${areaLabel.replace(/'/g,"\\'")}', data: ${radarData},
      borderColor: '#326189', backgroundColor: 'rgba(50,97,137,.18)',
      pointBackgroundColor: '#5ce1e6', pointRadius: 4 }]
  },
  options: { responsive: true,
    plugins: { legend: { labels: { font: { family: FONT_MONO, size: 10 }, color: '#555' } } },
    scales: { r: {
      ticks: { font: { family: FONT_MONO, size: 9 }, color: '#888', backdropColor: 'transparent' },
      pointLabels: { font: { family: FONT_MONO, size: 10 }, color: '#1a3c5c' },
      grid: { color: 'rgba(0,0,0,.07)' }, angleLines: { color: 'rgba(0,0,0,.07)' },
      suggestedMin: 0, suggestedMax: 100
    } }
  }
});

new Chart(document.getElementById('roadDonut'), {
  type: 'doughnut',
  data: { labels: ['Main Roads','Secondary','Local Roads','Tracks'],
    datasets: [{ data: ${roadDonut},
      backgroundColor: ['#1a3c5c','#326189','#88bcbd','#d4dfe6'],
      borderWidth: 2, borderColor: '#f5f8fa' }] },
  options: { responsive: true,
    plugins: { legend: { position: 'bottom', labels: { font: { family: FONT_MONO, size: 10 }, color: '#555' } } } }
});

new Chart(document.getElementById('infraBar'), {
  type: 'bar',
  data: { labels: ${infraLabels}, datasets: [{ label: 'Count', data: ${infraData},
    backgroundColor: ['#326189','#1a3c5c','#5ce1e6','#88bcbd','#e67e22','#88bcbd'],
    borderRadius: 2 }] },
  options: { ...defOpts, indexAxis: 'y',
    plugins: { ...defOpts.plugins, legend: { display: false } },
    scales: {
      x: { ...defOpts.scales.x, title: { display: true, text: 'Mean count per buffer', font: { family: FONT_MONO, size: 9 } } },
      y: { ticks: { font: { family: FONT_MONO, size: 10 }, color: '#555' }, grid: { display: false } }
    } }
});

${isProvince && muniStats.length > 0 ? `
new Chart(document.getElementById('muniBar'), {
  type: 'bar',
  data: { labels: ${muniBarLabels}, datasets: [{ label: 'Mean WI', data: ${muniBarData},
    backgroundColor: ${muniBarData}.map(wiColor), borderRadius: 2 }] },
  options: { ...defOpts, indexAxis: 'y',
    plugins: { ...defOpts.plugins, legend: { display: false } },
    scales: {
      x: { ...defOpts.scales.x, title: { display: true, text: 'Mean Predicted Wealth Index', font: { family: FONT_MONO, size: 9 } } },
      y: { ticks: { font: { family: FONT_MONO, size: 9 }, color: '#555' }, grid: { display: false } }
    } }
});` : ''}

new Chart(document.getElementById('shapBar'), {
  type: 'bar',
  data: { labels: ${shapFeats}, datasets: [{ label: 'Mean |SHAP|', data: ${shapVals},
    backgroundColor: ${shapVals}.map((_,i) => \`hsl(\${210-i*15},55%,\${42+i*3}%)\`),
    borderRadius: 2 }] },
  options: { ...defOpts, indexAxis: 'y',
    plugins: { ...defOpts.plugins, legend: { display: false } },
    scales: {
      x: { ...defOpts.scales.x, title: { display: true, text: 'Mean |SHAP Value|', font: { family: FONT_MONO, size: 9 } } },
      y: { ticks: { font: { family: FONT_MONO, size: 10 }, color: '#555' }, grid: { display: false } }
    } }
});

new Chart(document.getElementById('shapCat'), {
  type: 'bar',
  data: { labels: ${catLabels}, datasets: [{ label: 'Summed mean |SHAP|', data: ${catData},
    backgroundColor: ['#326189','#1a3c5c','#88bcbd','#5ce1e6','#859498'],
    borderRadius: 2 }] },
  options: { ...defOpts,
    plugins: { ...defOpts.plugins, legend: { display: false } },
    scales: { ...defOpts.scales, y: { ...defOpts.scales.y,
      title: { display: true, text: 'Summed mean |SHAP|', font: { family: FONT_MONO, size: 10 } } } } }
});
</script>
</body>
</html>`
}