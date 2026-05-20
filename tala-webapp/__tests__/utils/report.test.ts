/**
 * __tests__/utils/report.test.ts
 * White-box unit tests for src/utils/report.ts
 *
 * Private helpers (wiChipClass, wiLabel, fmt, CAT_MAP, POLICY_MAP) are tested
 * indirectly through the HTML output of generateReport — the only public export.
 */

import { generateReport } from '@/utils/report'
import type { SelectedArea } from '@/types'

// ── Test data factories ──────────────────────────────────────────────────────

function makePoint(wi: number, extra: Record<string, any> = {}): any {
  return {
    id: 1,
    municipality: 'TestMuni',
    urban_rural: 'U',
    source: 'grid',
    wi,
    osm: { VIIRS_Median: 1.5, Total_POI_Count: 50 },
    ...extra,
  }
}

function makeShap(feature: string, value: number) {
  return { feature, mean_abs_shap: value }
}

function makeProvince(overrides: Partial<SelectedArea> = {}): SelectedArea {
  return {
    type: 'province',
    name: 'Test Province',
    data: {
      mean_wi: 0.1,
      min_wi: -1.0,
      max_wi: 1.0,
      std_wi: 0.4,
      n_points: 3,
      pct_low: 30,
      pct_high: 40,
      osm_agg: {},
    } as any,
    points: [
      makePoint(0.6, { municipality: 'MuniA' }),
      makePoint(-0.2, { municipality: 'MuniB' }),
      makePoint(-0.7, { municipality: 'MuniC' }),
    ],
    shap: [makeShap('VIIRS_Median', 0.5), makeShap('Total_Road_Length', 0.3)],
    ...overrides,
  }
}

function makeMunicipality(overrides: Partial<SelectedArea> = {}): SelectedArea {
  return {
    type: 'municipality',
    name: 'Test Municipality',
    province: 'Test Province',
    data: { mean_wi: 0.2, osm_agg: {} } as any,
    points: [makePoint(0.2)],
    shap: [makeShap('VIIRS_Median', 0.4)],
    ...overrides,
  }
}

// ── HTML structure ───────────────────────────────────────────────────────────

describe('generateReport — HTML structure', () => {
  it('returns a string', () => {
    expect(typeof generateReport(makeProvince())).toBe('string')
  })

  it('produces a complete HTML document starting with DOCTYPE', () => {
    expect(generateReport(makeProvince()).trim()).toMatch(/^<!DOCTYPE html>/i)
  })

  it('contains closing </html> tag', () => {
    expect(generateReport(makeProvince())).toContain('</html>')
  })

  it('embeds the province name in the document', () => {
    expect(generateReport(makeProvince())).toContain('Test Province')
  })

  it('embeds municipality name and its province in the label', () => {
    const html = generateReport(makeMunicipality())
    expect(html).toContain('Test Municipality, Test Province')
  })

  it('sets the page <title> to include the area label', () => {
    const html = generateReport(makeProvince())
    expect(html).toMatch(/<title>.*Test Province.*<\/title>/)
  })
})

// ── wiChipClass — CSS class boundaries ──────────────────────────────────────

describe('wiChipClass — wealth classification CSS classes', () => {
  it('assigns w-high for wi >= 0.5', () => {
    const html = generateReport(makeProvince({ points: [makePoint(0.5)] }))
    expect(html).toContain('wealth-chip w-high')
  })

  it('assigns w-high for wi > 0.5 (above boundary)', () => {
    const html = generateReport(makeProvince({ points: [makePoint(1.2)] }))
    expect(html).toContain('wealth-chip w-high')
  })

  it('assigns w-mid for wi exactly 0.0', () => {
    const html = generateReport(makeProvince({ points: [makePoint(0.0)] }))
    expect(html).toContain('wealth-chip w-mid')
  })

  it('assigns w-mid for wi in (-0.5, 0.5)', () => {
    const html = generateReport(makeProvince({ points: [makePoint(0.3)] }))
    expect(html).toContain('wealth-chip w-mid')
  })

  it('assigns w-mid for wi exactly -0.5 (boundary: -0.5 is NOT low)', () => {
    const html = generateReport(makeProvince({ points: [makePoint(-0.5)] }))
    expect(html).toContain('wealth-chip w-mid')
  })

  it('assigns w-low for wi < -0.5', () => {
    const html = generateReport(makeProvince({ points: [makePoint(-0.6)] }))
    expect(html).toContain('wealth-chip w-low')
  })

  it('assigns w-low for strongly negative wi', () => {
    const html = generateReport(makeProvince({ points: [makePoint(-2.0)] }))
    expect(html).toContain('wealth-chip w-low')
  })
})

// ── wiLabel — wealth label text ──────────────────────────────────────────────

describe('wiLabel — wealth label text', () => {
  it('labels "High Wealth" for wi >= 0.5', () => {
    expect(generateReport(makeProvince({ points: [makePoint(0.8)] }))).toContain('High Wealth')
  })

  it('labels "High Wealth" at the exact 0.5 boundary', () => {
    expect(generateReport(makeProvince({ points: [makePoint(0.5)] }))).toContain('High Wealth')
  })

  it('labels "Moderate" for 0 <= wi < 0.5', () => {
    expect(generateReport(makeProvince({ points: [makePoint(0.3)] }))).toContain('Moderate')
  })

  it('labels "Moderate" at wi == 0.0', () => {
    expect(generateReport(makeProvince({ points: [makePoint(0.0)] }))).toContain('Moderate')
  })

  it('labels "Below Average" for -0.5 <= wi < 0', () => {
    expect(generateReport(makeProvince({ points: [makePoint(-0.2)] }))).toContain('Below Average')
  })

  it('labels "Below Average" at wi == -0.5 boundary', () => {
    expect(generateReport(makeProvince({ points: [makePoint(-0.5)] }))).toContain('Below Average')
  })

  it('labels "Low Wealth" for wi < -0.5', () => {
    expect(generateReport(makeProvince({ points: [makePoint(-0.8)] }))).toContain('Low Wealth')
  })
})

// ── fmt — number formatting ──────────────────────────────────────────────────

describe('fmt — signed number formatting', () => {
  it('prefixes positive mean_wi with +', () => {
    const html = generateReport(makeProvince({ data: { mean_wi: 0.5, osm_agg: {} } as any }))
    expect(html).toContain('+0.50')
  })

  it('preserves - sign for negative mean_wi', () => {
    const html = generateReport(makeProvince({ data: { mean_wi: -0.5, osm_agg: {} } as any }))
    expect(html).toContain('-0.50')
  })

  it('formats zero mean_wi as +0.00', () => {
    const html = generateReport(makeProvince({ data: { mean_wi: 0, osm_agg: {} } as any }))
    expect(html).toContain('+0.00')
  })

  it('formats point wi values in the point table', () => {
    const html = generateReport(makeProvince({ points: [makePoint(1.23)] }))
    expect(html).toContain('+1.23')
  })

  it('formats negative point wi with - in the point table', () => {
    const html = generateReport(makeProvince({ points: [makePoint(-1.23)] }))
    expect(html).toContain('-1.23')
  })
})

// ── Province vs Municipality section structure ───────────────────────────────

describe('Province vs Municipality sections', () => {
  it('province report includes Municipal Breakdown heading', () => {
    expect(generateReport(makeProvince())).toContain('Municipal Breakdown')
  })

  it('municipality report omits Municipal Breakdown', () => {
    expect(generateReport(makeMunicipality())).not.toContain('Municipal Breakdown')
  })

  it('province uses section number 05 for Municipal Breakdown', () => {
    const html = generateReport(makeProvince())
    expect(html).toMatch(/05[\s\S]*?Municipal Breakdown/)
  })

  it('province SHAP section uses number 06', () => {
    const html = generateReport(makeProvince())
    expect(html).toMatch(/06[\s\S]*?SHAP Feature Attribution/)
  })

  it('municipality SHAP section uses number 05 (shifted down by 1)', () => {
    const html = generateReport(makeMunicipality())
    expect(html).toMatch(/05[\s\S]*?SHAP Feature Attribution/)
  })

  it('province Policy Recommendations uses section 07', () => {
    const html = generateReport(makeProvince())
    expect(html).toMatch(/07[\s\S]*?Policy Recommendations/)
  })

  it('municipality Policy Recommendations uses section 06', () => {
    const html = generateReport(makeMunicipality())
    expect(html).toMatch(/06[\s\S]*?Policy Recommendations/)
  })

  it('province includes municipal bar chart canvas when multiple municipalities', () => {
    const area = makeProvince({
      points: [
        makePoint(0.5, { municipality: 'A', id: 1 }),
        makePoint(-0.2, { municipality: 'B', id: 2 }),
      ],
    })
    expect(generateReport(area)).toContain('id="muniBar"')
  })

  it('province with only one municipality still renders Municipal Breakdown', () => {
    const area = makeProvince({
      points: [makePoint(0.1, { municipality: 'SingleMuni' })],
    })
    expect(generateReport(area)).toContain('Municipal Breakdown')
  })
})

// ── CAT_MAP — SHAP category classification ──────────────────────────────────

describe('CAT_MAP — SHAP feature categories', () => {
  it('VIIRS_Median maps to VIIRS NTL category', () => {
    const area = makeProvince({ shap: [makeShap('VIIRS_Median', 0.5)] })
    expect(generateReport(area)).toContain('VIIRS NTL')
  })

  it('Total_Road_Length maps to Road category', () => {
    const area = makeProvince({ shap: [makeShap('Total_Road_Length', 0.4)] })
    expect(generateReport(area)).toContain('Road')
  })

  it('Total_Bldg_Count maps to Building category', () => {
    const area = makeProvince({ shap: [makeShap('Total_Bldg_Count', 0.3)] })
    expect(generateReport(area)).toContain('Building')
  })

  it('Total_POI_Count maps to POI category', () => {
    const area = makeProvince({ shap: [makeShap('Total_POI_Count', 0.3)] })
    expect(generateReport(area)).toContain('POI')
  })

  it('LU_Agricultural_m2 maps to Landuse category', () => {
    const area = makeProvince({ shap: [makeShap('LU_Agricultural_m2', 0.2)] })
    expect(generateReport(area)).toContain('Landuse')
  })

  it('unknown feature defaults to Temporal category', () => {
    const area = makeProvince({ shap: [makeShap('LSTM_dim_99', 0.8)] })
    expect(generateReport(area)).toContain('Temporal')
  })

  it('renders feature name with spaces replacing underscores', () => {
    const area = makeProvince({ shap: [makeShap('Total_Road_Length', 0.3)] })
    expect(generateReport(area)).toContain('Total Road Length')
  })
})

// ── POLICY_MAP — recommendation generation ──────────────────────────────────

describe('POLICY_MAP — policy recommendations', () => {
  it('generates Electrification card for VIIRS_Median driver', () => {
    const area = makeProvince({ shap: [makeShap('VIIRS_Median', 0.5)] })
    expect(generateReport(area)).toContain('Electrification')
  })

  it('generates Road Network card for Total_Road_Length driver', () => {
    const area = makeProvince({ shap: [makeShap('Total_Road_Length', 0.4)] })
    expect(generateReport(area)).toContain('Road Network')
  })

  it('generates Financial Inclusion card for POI_bank_Count driver', () => {
    const area = makeProvince({ shap: [makeShap('POI_bank_Count', 0.35)] })
    expect(generateReport(area)).toContain('Financial Inclusion')
  })

  it('generates Education Infrastructure card for Bldg_school_Count driver', () => {
    const area = makeProvince({ shap: [makeShap('Bldg_school_Count', 0.3)] })
    expect(generateReport(area)).toContain('Education Infrastructure')
  })

  it('generates Agricultural Development card for LU_Agricultural_m2', () => {
    const area = makeProvince({ shap: [makeShap('LU_Agricultural_m2', 0.3)] })
    expect(generateReport(area)).toContain('Agricultural Development')
  })

  it('renders "No policy-mapped SHAP drivers found" when no features match POLICY_MAP', () => {
    const area = makeProvince({ shap: [makeShap('LSTM_dim_0', 0.9)] })
    expect(generateReport(area)).toContain('No policy-mapped SHAP drivers found')
  })

  it('limits recommendations to top 4 SHAP-mapped features', () => {
    const area = makeProvince({
      shap: [
        makeShap('VIIRS_Median', 0.9),
        makeShap('Total_Road_Length', 0.8),
        makeShap('POI_bank_Count', 0.7),
        makeShap('Bldg_school_Count', 0.6),
        makeShap('LU_Agricultural_m2', 0.5),   // 5th — should NOT appear as rec-card
        makeShap('Tracks_Length', 0.4),
      ],
    })
    const html = generateReport(area)
    const cardCount = (html.match(/class="rec-card/g) ?? []).length
    expect(cardCount).toBeLessThanOrEqual(4)
  })

  it('rec-card priority classes are applied in order', () => {
    const area = makeProvince({
      shap: [
        makeShap('VIIRS_Median', 0.9),
        makeShap('Total_Road_Length', 0.8),
        makeShap('POI_bank_Count', 0.7),
        makeShap('Bldg_school_Count', 0.6),
      ],
    })
    const html = generateReport(area)
    expect(html).toContain('rec-card ')          // priority 1 (no extra class)
    expect(html).toContain('rec-card priority2')
    expect(html).toContain('rec-card priority3')
    expect(html).toContain('rec-card priority4')
  })
})

// ── National data handling ────────────────────────────────────────────────────

describe('National data section', () => {
  const national = {
    allProvinces: {
      NCR: { name: 'NCR', mean_wi: 0.5, n_points: 100, pct_high: 60, dhs_mean_wi: null, osm_agg: {} },
      Quezon: { name: 'Quezon', mean_wi: -0.2, n_points: 80, pct_high: 20, dhs_mean_wi: null, osm_agg: {} },
    },
    allMunicipalities: {
      'NCR|Manila': { municipality: 'Manila', province: 'NCR', mean_wi: 0.6, n_points: 50, pct_low: 10, pct_high: 70 },
      'Quezon|Lucena': { municipality: 'Lucena', province: 'Quezon', mean_wi: -0.3, n_points: 40, pct_low: 40, pct_high: 15 },
    },
  }

  it('includes National Analysis heading when national data is provided', () => {
    expect(generateReport(makeProvince(), national)).toContain('National Analysis')
  })

  it('omits National Analysis when national is undefined', () => {
    expect(generateReport(makeProvince())).not.toContain('National Analysis')
  })

  it('omits National Analysis when national province list is empty', () => {
    expect(generateReport(makeProvince(), { allProvinces: {}, allMunicipalities: {} })).not.toContain('National Analysis')
  })

  it('lists province names in the national section', () => {
    const html = generateReport(makeProvince(), national)
    expect(html).toContain('NCR')
    expect(html).toContain('Quezon')
  })

  it('uses pre-computed nationalStats when provided', () => {
    const nationalWithStats = {
      ...national,
      nationalStats: { n_points: 999, mean_wi: 0.99, std_wi: 0.1, median_wi: null, dhs_mean_wi: null, dhs_mae: null },
    }
    const html = generateReport(makeProvince(), nationalWithStats)
    // pre-computed stats override province-weighted fallback
    expect(html).toContain('999')
  })

  it('falls back to province-weighted mean when nationalStats absent', () => {
    const html = generateReport(makeProvince(), national)
    // Both provinces have n_points: 100+80=180 total points
    expect(html).toContain('180')
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles area with zero points gracefully', () => {
    const area = makeProvince({ points: [] })
    expect(() => generateReport(area)).not.toThrow()
  })

  it('handles area with empty shap array', () => {
    const area = makeProvince({ shap: [] })
    expect(() => generateReport(area)).not.toThrow()
  })

  it('handles data object with all undefined fields (all default to 0)', () => {
    const area = makeProvince({ data: {} as any })
    const html = generateReport(area)
    expect(html).toContain('+0.00') // meanWI defaults to 0
  })

  it('handles null dhs_mean_wi (no DHS validation box shown)', () => {
    const area = makeProvince({ data: { mean_wi: 0.1, dhs_mean_wi: null, osm_agg: {} } as any })
    expect(generateReport(area)).not.toContain('DHS Survey Validation.')
  })

  it('shows DHS validation box when dhs_mean_wi is a number', () => {
    const area = makeProvince({ data: { mean_wi: 0.1, dhs_mean_wi: 0.0, osm_agg: {} } as any })
    expect(generateReport(area)).toContain('DHS Survey Validation.')
  })

  it('truncates SHAP list to top 12 features', () => {
    const shap = Array.from({ length: 20 }, (_, i) => makeShap(`Feature_${i}`, 1 - i * 0.04))
    const html = generateReport(makeProvince({ shap }))
    // Features 13–20 should not appear in the SHAP table
    expect(html).not.toContain('Feature 12')
  })
})
