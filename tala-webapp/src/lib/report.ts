// src/lib/report.ts
// Generates a downloadable HTML analytics report matching sample-report.html style.
// Called by the API route /api/report, returns a complete HTML string.

import type {
  SelectedArea, ShapFeature, OsmFeatures
} from '@/types'

function wiClass(wi: number) {
  if (wi >= 0.5) return 'good'
  if (wi >= -0.5) return 'warn'
  return 'bad'
}

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

export function generateReport(area: SelectedArea): string {
  const d   = area.data as any
  const pts = area.points
  const shap = area.shap.slice(0, 10)

  const meanWI   = d.mean_wi ?? 0
  const minWI    = d.min_wi  ?? 0
  const maxWI    = d.max_wi  ?? 0
  const nPoints  = d.n_points ?? pts.length
  const pctLow   = d.pct_low ?? 0
  const pctHigh  = d.pct_high ?? 0
  const osm      = (d.osm_mean ?? {}) as OsmFeatures
  const topDriver = shap[0]?.feature ?? 'N/A'

  const today = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const areaLabel = area.type === 'province'
    ? area.name
    : `${area.name}, ${area.province}`

  // Point rows (top 20 by WI, sorted low→high)
  const sortedPts = [...pts]
    .sort((a, b) => a.wi - b.wi)
    .slice(0, 20)

  const ptRows = sortedPts.map((p, i) => `
    <tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${String(p.id).padStart(5,'0')}</td>
      <td>${p.municipality}</td>
      <td>${p.urban_rural === 'U' ? 'Urban' : 'Rural'}</td>
      <td style="font-family:'DM Mono',monospace">${fmt(p.wi)}</td>
      <td style="font-family:'DM Mono',monospace">${p.osm.VIIRS_Median.toFixed(2)}</td>
      <td style="font-family:'DM Mono',monospace">${p.osm.Total_POI_Count}</td>
      <td style="font-family:'DM Mono',monospace">${p.osm.Total_Road_Length.toFixed(1)}</td>
      <td><span class="wealth-chip ${wiChipClass(p.wi)}">${wiLabel(p.wi)}</span></td>
    </tr>`).join('')

  // SHAP table rows
  const maxShap = shap[0]?.mean_abs_shap ?? 1
  const shapRows = shap.map((s, i) => {
    const pct = Math.round(s.mean_abs_shap / maxShap * 100)
    return `
    <tr>
      <td class="rank-num">${i + 1}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${s.feature}</td>
      <td style="font-size:11px;color:var(--muted)">${s.category ?? ''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${s.mean_abs_shap.toFixed(3)}</td>
      <td><span class="shap-badge pos">Wealth ↑</span></td>
      <td class="shap-bar-wrap">
        <div class="shap-bar-bg">
          <div class="shap-bar-fill shap-pos" style="width:${pct}%"></div>
        </div>
      </td>
    </tr>`
  }).join('')

  // Chart data as JSON strings
  const wiData   = JSON.stringify(sortedPts.map(p => p.wi))
  const wiLabels = JSON.stringify(sortedPts.map(p => `PT-${p.id}`))
  const shapFeats = JSON.stringify(shap.map(s => s.feature))
  const shapVals  = JSON.stringify(shap.map(s => s.mean_abs_shap))

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Poverty Analytics Report — ${areaLabel}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');
  :root {
    --ink:#1a1a2e;--paper:#f5f0e8;--cream:#ede8df;
    --accent:#c0392b;--accent2:#e67e22;--accent3:#2980b9;
    --muted:#7f8c8d;--rule:#d4cfc6;
    --positive:#27ae60;--negative:#c0392b;--warn:#e67e22;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;background:var(--paper);color:var(--ink);line-height:1.6;font-size:14px;}
  .print-btn{position:fixed;top:20px;right:20px;background:var(--accent);color:#fff;border:none;padding:10px 22px;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.08em;cursor:pointer;z-index:999;}
  .print-btn:hover{background:#a93226;}
  .masthead{background:var(--ink);color:var(--paper);padding:48px 60px 36px;position:relative;overflow:hidden;}
  .masthead::before{content:'';position:absolute;top:-60px;right:-60px;width:320px;height:320px;border-radius:50%;background:rgba(192,57,43,.18);}
  .masthead-kicker{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent2);margin-bottom:12px;}
  .masthead h1{font-family:'DM Serif Display',serif;font-size:36px;line-height:1.15;max-width:620px;margin-bottom:18px;}
  .masthead h1 em{font-style:italic;color:#f0a070;}
  .masthead-meta{display:flex;gap:32px;flex-wrap:wrap;border-top:1px solid rgba(245,240,232,.18);padding-top:18px;}
  .masthead-meta .meta-item{font-size:12px;}
  .masthead-meta .meta-item strong{display:block;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;color:var(--muted);margin-bottom:2px;}
  .exec-band{background:var(--accent);color:#fff;padding:22px 60px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0;}
  .exec-stat{padding:0 20px;border-right:1px solid rgba(255,255,255,.25);}
  .exec-stat:first-child{padding-left:0;}
  .exec-stat:last-child{border-right:none;}
  .exec-stat .val{font-family:'DM Serif Display',serif;font-size:30px;line-height:1;}
  .exec-stat .lbl{font-size:11px;letter-spacing:.06em;opacity:.82;margin-top:4px;}
  .page{max-width:1080px;margin:0 auto;padding:0 60px 80px;}
  .section{margin-top:52px;}
  .section-header{display:flex;align-items:baseline;gap:14px;border-bottom:2px solid var(--ink);padding-bottom:8px;margin-bottom:28px;}
  .section-num{font-family:'DM Mono',monospace;font-size:11px;color:var(--accent);letter-spacing:.1em;}
  .section-header h2{font-family:'DM Serif Display',serif;font-size:22px;font-weight:400;}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;}
  .kpi-card{background:var(--cream);border:1px solid var(--rule);padding:20px 22px;}
  .kpi-card .kpi-label{font-size:11px;font-family:'DM Mono',monospace;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:8px;}
  .kpi-card .kpi-value{font-family:'DM Serif Display',serif;font-size:26px;line-height:1;}
  .kpi-card .kpi-sub{font-size:11px;color:var(--muted);margin-top:6px;}
  .kpi-card.good{border-left:4px solid var(--positive);}
  .kpi-card.warn{border-left:4px solid var(--warn);}
  .kpi-card.bad{border-left:4px solid var(--negative);}
  .kpi-card.info{border-left:4px solid var(--accent3);}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
  .chart-card{background:#fff;border:1px solid var(--rule);padding:22px 24px;}
  .chart-title{font-size:12px;font-family:'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-bottom:4px;}
  .chart-sub{font-size:11px;color:var(--muted);margin-bottom:16px;}
  canvas{width:100%!important;}
  .shap-table{width:100%;border-collapse:collapse;margin-top:8px;}
  .shap-table th{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:8px 12px;border-bottom:1px solid var(--rule);text-align:left;}
  .shap-table td{padding:9px 12px;border-bottom:1px solid var(--rule);font-size:13px;vertical-align:middle;}
  .shap-table tr:last-child td{border-bottom:none;}
  .shap-bar-wrap{width:160px;}
  .shap-bar-bg{background:var(--cream);height:8px;border-radius:2px;overflow:hidden;}
  .shap-bar-fill{height:100%;border-radius:2px;}
  .shap-pos{background:var(--positive);}
  .shap-badge{display:inline-block;font-family:'DM Mono',monospace;font-size:11px;padding:2px 8px;border-radius:2px;font-weight:500;}
  .shap-badge.pos{background:#d5f5e3;color:#1e8449;}
  .rank-num{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);width:24px;}
  .cluster-table{width:100%;border-collapse:collapse;}
  .cluster-table th{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.08em;color:var(--muted);padding:8px 10px;border-bottom:2px solid var(--ink);text-align:left;}
  .cluster-table td{padding:9px 10px;border-bottom:1px solid var(--rule);font-size:12px;}
  .cluster-table tr:last-child td{border-bottom:none;}
  .wealth-chip{display:inline-block;padding:2px 10px;border-radius:2px;font-family:'DM Mono',monospace;font-size:11px;font-weight:500;}
  .w-high{background:#d5f5e3;color:#1e8449;}
  .w-mid{background:#fef9e7;color:#b7950b;}
  .w-low{background:#fadbd8;color:#922b21;}
  .body-text{font-size:13.5px;line-height:1.75;color:#2c3e50;max-width:720px;}
  .method-box{background:var(--cream);border:1px solid var(--rule);border-left:3px solid var(--accent3);padding:16px 20px;margin-top:16px;font-size:12px;color:var(--muted);line-height:1.7;}
  .method-box strong{color:var(--ink);}
  .footer{background:var(--ink);color:rgba(245,240,232,.5);padding:24px 60px;font-size:11px;font-family:'DM Mono',monospace;display:flex;justify-content:space-between;align-items:center;letter-spacing:.04em;margin-top:60px;}
  .footer span{color:var(--paper);}
  .divider{border:none;border-top:1px solid var(--rule);margin:32px 0;}
  @media print{.print-btn{display:none;}.masthead{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.exec-band{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
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
  <div class="exec-stat">
    <div class="val">${fmt(meanWI)}</div>
    <div class="lbl">Mean Predicted Wealth Index</div>
  </div>
  <div class="exec-stat">
    <div class="val">${nPoints}</div>
    <div class="lbl">Prediction Points Analysed</div>
  </div>
  <div class="exec-stat">
    <div class="val">${pctLow.toFixed(0)}%</div>
    <div class="lbl">Points Below WI −0.50</div>
  </div>
  <div class="exec-stat">
    <div class="val">${topDriver.replace(/_/g,' ')}</div>
    <div class="lbl">Top SHAP Feature Driver</div>
  </div>
</div>

<div class="page">

  <div class="section">
    <div class="section-header">
      <span class="section-num">01</span>
      <h2>Area Overview</h2>
    </div>
    <p class="body-text">
      ${areaLabel} contains ${nPoints} prediction points with a mean predicted wealth index of ${fmt(meanWI)}.
      The wealth index ranges from ${fmt(minWI)} to ${fmt(maxWI)}, a spread of ${(maxWI - minWI).toFixed(2)} units.
      ${pctLow.toFixed(0)}% of points fall below the poverty threshold of −0.50 and
      ${pctHigh.toFixed(0)}% are in the high-wealth category.
      The strongest predictor of wealth variation is <strong>${topDriver.replace(/_/g,' ')}</strong>
      (mean |SHAP| = ${shap[0]?.mean_abs_shap.toFixed(3) ?? 'N/A'}).
    </p>
    <div class="kpi-grid" style="margin-top:28px">
      <div class="kpi-card info">
        <div class="kpi-label">Mean Wealth Index</div>
        <div class="kpi-value">${fmt(meanWI)}</div>
        <div class="kpi-sub">National mean: +0.00 · Range: −2.5 to +2.0</div>
      </div>
      <div class="kpi-card warn">
        <div class="kpi-label">Wealth Index Range</div>
        <div class="kpi-value">${fmt(minWI)} to ${fmt(maxWI)}</div>
        <div class="kpi-sub">Spread of ${(maxWI - minWI).toFixed(2)} units across ${nPoints} points</div>
      </div>
      <div class="kpi-card ${pctLow > 40 ? 'bad' : pctLow > 20 ? 'warn' : 'good'}">
        <div class="kpi-label">Points Below −0.50 WI</div>
        <div class="kpi-value">${pctLow.toFixed(0)}%</div>
        <div class="kpi-sub">Poverty threshold proxy (${Math.round(nPoints * pctLow / 100)} of ${nPoints} points)</div>
      </div>
      <div class="kpi-card good">
        <div class="kpi-label">VIIRS Nighttime Luminosity</div>
        <div class="kpi-value">${(osm.VIIRS_Median ?? 0).toFixed(2)} nW</div>
        <div class="kpi-sub">Area median · National rural baseline: ~0.28 nW</div>
      </div>
      <div class="kpi-card info">
        <div class="kpi-label">Total POI Count</div>
        <div class="kpi-value">${Math.round(osm.Total_POI_Count ?? 0)}</div>
        <div class="kpi-sub">Area mean per prediction point</div>
      </div>
      <div class="kpi-card warn">
        <div class="kpi-label">Road Network</div>
        <div class="kpi-value">${(osm.Total_Road_Length ?? 0).toFixed(1)} km</div>
        <div class="kpi-sub">Mean per point buffer · ${(osm.Main_Roads_Length ?? 0).toFixed(1)} km primary</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-num">02</span>
      <h2>Point-Level Wealth Index Estimates</h2>
    </div>
    <p class="body-text">
      The table below shows up to 20 prediction points within ${areaLabel} sorted by wealth index ascending.
      Predicted values are derived from the CNN–LSTM model applied to 2025 quarterly Sentinel-2 composites and OpenStreetMap features.
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
      <strong>Model note.</strong> Predictions are derived from the CNN–LSTM hybrid model trained on 2022 Philippine DHS clusters
      (R² = 0.46, Pearson r = 0.69 on 5-fold CV). The 2025 inference uses the same feature extraction pipeline applied to 2025
      Sentinel-2 quarterly composites. SHAP values are derived from training clusters and used as proxies for feature importance
      in the inference area.
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-num">03</span>
      <h2>Wealth Index Distribution</h2>
    </div>
    <div class="two-col">
      <div class="chart-card">
        <div class="chart-title">Wealth Index by Point</div>
        <div class="chart-sub">Predicted WI sorted ascending · top 20 points shown</div>
        <canvas id="wealthChart" height="240"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Wealth Category Breakdown</div>
        <div class="chart-sub">% of prediction points by wealth class</div>
        <canvas id="pieChart" height="240"></canvas>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-num">04</span>
      <h2>SHAP Feature Attribution</h2>
    </div>
    <p class="body-text">
      SHAP (SHapley Additive exPlanations) values quantify each feature's contribution to the model's wealth index prediction.
      Values are computed using Kernel SHAP on the training cluster dataset. Higher mean |SHAP| indicates a stronger
      influence on the prediction, regardless of direction.
    </p>
    <div class="two-col" style="margin-top:20px">
      <div class="chart-card">
        <div class="chart-title">Feature Importance (mean |SHAP|)</div>
        <div class="chart-sub">Top 10 features · all training clusters</div>
        <canvas id="shapBar" height="300"></canvas>
      </div>
      <div class="chart-card">
        <div style="overflow-x:auto;margin-top:0">
          <table class="shap-table">
            <thead>
              <tr><th>#</th><th>Feature</th><th>Category</th><th>Mean |SHAP|</th><th>Direction</th><th>Importance</th></tr>
            </thead>
            <tbody>${shapRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-num">05</span>
      <h2>Methodology</h2>
    </div>
    <p class="body-text">
      Poverty estimates are generated by Project TALA, a CNN–LSTM hybrid model that predicts wealth index from
      Sentinel-2 satellite imagery and OpenStreetMap geospatial features. The CNN (VGG16 fine-tuned on VIIRS nighttime
      luminosity proxy labels) extracts 4,096-dimensional spatial feature vectors from quarterly satellite composites,
      reduced to 128 dimensions via PCA. An LSTM processes the four quarterly feature vectors as a temporal sequence.
      Static OSM and VIIRS features are processed through a parallel dense branch and fused with the LSTM output
      for the final wealth index regression.
    </p>
    <div class="method-box">
      <strong>Training data.</strong> 1,234 DHS survey clusters · Philippines 2022 DHS.<br>
      <strong>Model performance.</strong> Mean R² = 0.46 ± 0.04, Mean r = 0.69 ± 0.03 (5-fold CV).<br>
      <strong>Prediction points.</strong> 5 km grid (rural) / 2 km grid (NCR) + DHS cluster locations.<br>
      <strong>Inference year.</strong> 2025 Sentinel-2 annual quarterly composites, cloud-masked median.<br>
      <strong>SHAP method.</strong> Kernel SHAP with 200 background samples, 200 coalition samples per instance.
    </div>
  </div>

</div>

<div class="footer">
  <div>Project TALA · FEU Institute of Technology · BS CS Data Science · 2026</div>
  <div>Generated ${today} · Model v1.0 · <span>CONFIDENTIAL RESEARCH OUTPUT</span></div>
</div>

<script>
const defOpts={
  responsive:true,
  plugins:{legend:{labels:{font:{family:"'DM Mono',monospace",size:10},color:'#555'}},tooltip:{titleFont:{family:"'DM Mono',monospace"},bodyFont:{family:"'DM Sans',sans-serif"}}},
  scales:{
    x:{ticks:{font:{family:"'DM Mono',monospace",size:9},color:'#888',maxRotation:45},grid:{color:'rgba(0,0,0,.05)'}},
    y:{ticks:{font:{family:"'DM Mono',monospace",size:10},color:'#555'},grid:{color:'rgba(0,0,0,.05)'}}
  }
};

const wiVals=${wiData};
const wiLbls=${wiLabels};
new Chart(document.getElementById('wealthChart'),{
  type:'bar',
  data:{
    labels:wiLbls,
    datasets:[{
      label:'Predicted WI',
      data:wiVals,
      backgroundColor:wiVals.map(v=>v<-0.5?'rgba(192,57,43,.75)':v<0?'rgba(230,126,34,.75)':v<0.5?'rgba(243,156,18,.75)':'rgba(39,174,96,.75)'),
      borderRadius:2
    }]
  },
  options:{...defOpts,plugins:{...defOpts.plugins,legend:{display:false}},scales:{...defOpts.scales,y:{...defOpts.scales.y,title:{display:true,text:'Wealth Index',font:{family:"'DM Mono',monospace",size:10}}}}}
});

new Chart(document.getElementById('pieChart'),{
  type:'doughnut',
  data:{
    labels:['Low Wealth (< −0.5)','Moderate (−0.5 to 0.5)','High Wealth (> 0.5)'],
    datasets:[{data:[${pctLow},${100 - pctLow - pctHigh},${pctHigh}],backgroundColor:['rgba(192,57,43,.8)','rgba(243,156,18,.8)','rgba(39,174,96,.8)'],borderWidth:0}]
  },
  options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#555'}}}}
});

new Chart(document.getElementById('shapBar'),{
  type:'bar',
  data:{
    labels:${shapFeats},
    datasets:[{label:'Mean |SHAP|',data:${shapVals},backgroundColor:${shapVals}.map((_,i)=>\`hsl(\${210-i*15},60%,\${40+i*3}%)\`),borderRadius:2}]
  },
  options:{
    ...defOpts,indexAxis:'y',
    plugins:{...defOpts.plugins,legend:{display:false}},
    scales:{
      x:{...defOpts.scales.x,title:{display:true,text:'Mean |SHAP Value|',font:{family:"'DM Mono',monospace",size:10}}},
      y:{ticks:{font:{family:"'DM Mono',monospace",size:10},color:'#555'},grid:{display:false}}
    }
  }
});
</script>
</body>
</html>`
}
