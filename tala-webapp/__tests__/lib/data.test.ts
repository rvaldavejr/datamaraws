/**
 * __tests__/lib/data.test.ts
 * White-box unit tests for src/lib/data.ts
 *
 * buildSearchIndex is pure and tested directly.
 * The five loadJson wrappers (getAllPoints, etc.) are tested by mocking fs
 * to verify correct file paths and JSON parsing without hitting disk.
 */

import { buildSearchIndex } from '@/lib/data'

// ── buildSearchIndex ─────────────────────────────────────────────────────────

describe('buildSearchIndex', () => {
  describe('empty inputs', () => {
    it('returns an empty array when both inputs are empty', () => {
      expect(buildSearchIndex({}, {})).toEqual([])
    })

    it('returns only province entries when municipalities is empty', () => {
      const provinces = { NCR: { region: 'NCR' } as any }
      const result = buildSearchIndex(provinces, {})
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('province')
    })

    it('returns only municipality entries when provinces is empty', () => {
      const munis = { 'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any }
      const result = buildSearchIndex({}, munis)
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('municipality')
    })
  })

  describe('province entries', () => {
    const provinces = {
      NCR: { region: 'NCR' } as any,
      Quezon: { region: 'Calabarzon' } as any,
    }

    it('creates one entry per province', () => {
      expect(buildSearchIndex(provinces, {})).toHaveLength(2)
    })

    it('uses province map key as label', () => {
      const result = buildSearchIndex({ NCR: { region: 'NCR' } as any }, {})
      expect(result[0].label).toBe('NCR')
    })

    it('uses province map key as key', () => {
      const result = buildSearchIndex({ NCR: { region: 'NCR' } as any }, {})
      expect(result[0].key).toBe('NCR')
    })

    it('sets type to "province"', () => {
      const result = buildSearchIndex({ NCR: { region: 'NCR' } as any }, {})
      expect(result[0].type).toBe('province')
    })

    it('sublabel contains the province region', () => {
      const result = buildSearchIndex({ Quezon: { region: 'Calabarzon' } as any }, {})
      expect(result[0].sublabel).toBe('Province · Calabarzon')
    })

    it('sublabel format is "Province · <region>"', () => {
      const result = buildSearchIndex({ NCR: { region: 'NCR' } as any }, {})
      expect(result[0].sublabel).toMatch(/^Province · /)
    })
  })

  describe('municipality entries', () => {
    const munis = {
      'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any,
      'Calabarzon|Lucena': { municipality: 'Lucena', province: 'Quezon' } as any,
    }

    it('creates one entry per municipality', () => {
      expect(buildSearchIndex({}, munis)).toHaveLength(2)
    })

    it('uses data.municipality as label (not the map key)', () => {
      const result = buildSearchIndex({}, { 'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any })
      expect(result[0].label).toBe('Manila')
    })

    it('uses the original map key as key (preserves compound key)', () => {
      const result = buildSearchIndex({}, { 'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any })
      expect(result[0].key).toBe('NCR|Manila')
    })

    it('sets type to "municipality"', () => {
      const result = buildSearchIndex({}, { 'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any })
      expect(result[0].type).toBe('municipality')
    })

    it('sublabel contains data.province', () => {
      const result = buildSearchIndex({}, { 'Calabarzon|Lucena': { municipality: 'Lucena', province: 'Quezon' } as any })
      expect(result[0].sublabel).toBe('Municipality · Quezon')
    })

    it('sublabel format is "Municipality · <province>"', () => {
      const result = buildSearchIndex({}, { 'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any })
      expect(result[0].sublabel).toMatch(/^Municipality · /)
    })
  })

  describe('combined output ordering and count', () => {
    it('provinces appear before municipalities in the result', () => {
      const provinces = { NCR: { region: 'NCR' } as any }
      const munis = { 'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any }
      const result = buildSearchIndex(provinces, munis)
      expect(result[0].type).toBe('province')
      expect(result[1].type).toBe('municipality')
    })

    it('total count equals provinces + municipalities', () => {
      const provinces = {
        NCR: { region: 'NCR' } as any,
        Quezon: { region: 'Calabarzon' } as any,
      }
      const munis = {
        'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any,
        'NCR|Pasig': { municipality: 'Pasig', province: 'NCR' } as any,
        'Calabarzon|Lucena': { municipality: 'Lucena', province: 'Quezon' } as any,
      }
      expect(buildSearchIndex(provinces, munis)).toHaveLength(5)
    })

    it('every entry has label, sublabel, type, and key', () => {
      const provinces = { NCR: { region: 'NCR' } as any }
      const munis = { 'NCR|Manila': { municipality: 'Manila', province: 'NCR' } as any }
      buildSearchIndex(provinces, munis).forEach(entry => {
        expect(entry).toHaveProperty('label')
        expect(entry).toHaveProperty('sublabel')
        expect(entry).toHaveProperty('type')
        expect(entry).toHaveProperty('key')
      })
    })
  })

  describe('edge cases', () => {
    it('handles a province with an empty region string', () => {
      const result = buildSearchIndex({ NCR: { region: '' } as any }, {})
      expect(result[0].sublabel).toBe('Province · ')
    })

    it('handles a municipality whose name differs from its key prefix', () => {
      const result = buildSearchIndex({}, {
        'Quezon|San Antonio': { municipality: 'San Antonio', province: 'Quezon' } as any,
      })
      expect(result[0].label).toBe('San Antonio')
      expect(result[0].key).toBe('Quezon|San Antonio')
    })

    it('handles a large number of entries without error', () => {
      const provinces: Record<string, any> = {}
      const munis: Record<string, any> = {}
      for (let i = 0; i < 50; i++) {
        provinces[`Province${i}`] = { region: `Region${i}` }
        munis[`Province${i}|Muni${i}`] = { municipality: `Muni${i}`, province: `Province${i}` }
      }
      const result = buildSearchIndex(provinces, munis)
      expect(result).toHaveLength(100)
    })
  })
})

// ── loadJson wrappers ─────────────────────────────────────────────────────────

describe('data loaders (loadJson wrappers)', () => {
  const mockReadFileSync = jest.fn()

  beforeEach(() => {
    jest.resetModules()
    jest.mock('fs', () => ({ readFileSync: mockReadFileSync }))
  })

  afterEach(() => {
    jest.unmock('fs')
  })

  it('getAllPoints reads from points.json and parses JSON', async () => {
    const mockPoints = [{ id: 1, wi: 0.5 }]
    mockReadFileSync.mockReturnValue(JSON.stringify(mockPoints))
    const { getAllPoints } = await import('@/lib/data')
    expect(getAllPoints()).toEqual(mockPoints)
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('points.json'),
      'utf-8'
    )
  })

  it('getAllProvinces reads from provinces.json', async () => {
    const mockData = { NCR: { mean_wi: 0.5 } }
    mockReadFileSync.mockReturnValue(JSON.stringify(mockData))
    const { getAllProvinces } = await import('@/lib/data')
    expect(getAllProvinces()).toEqual(mockData)
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('provinces.json'),
      'utf-8'
    )
  })

  it('getAllMunicipalities reads from municipalities.json', async () => {
    const mockData = { 'NCR|Manila': { municipality: 'Manila' } }
    mockReadFileSync.mockReturnValue(JSON.stringify(mockData))
    const { getAllMunicipalities } = await import('@/lib/data')
    expect(getAllMunicipalities()).toEqual(mockData)
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('municipalities.json'),
      'utf-8'
    )
  })

  it('getGlobalShap reads from shap_global.json', async () => {
    const mockData = [{ feature: 'VIIRS_Median', mean_abs_shap: 0.5 }]
    mockReadFileSync.mockReturnValue(JSON.stringify(mockData))
    const { getGlobalShap } = await import('@/lib/data')
    expect(getGlobalShap()).toEqual(mockData)
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('shap_global.json'),
      'utf-8'
    )
  })

  it('getShapByArea reads from shap_by_area.json', async () => {
    const mockData = { NCR: [{ feature: 'VIIRS_Median', mean_abs_shap: 0.4 }] }
    mockReadFileSync.mockReturnValue(JSON.stringify(mockData))
    const { getShapByArea } = await import('@/lib/data')
    expect(getShapByArea()).toEqual(mockData)
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('shap_by_area.json'),
      'utf-8'
    )
  })

  it('throws when the JSON file does not exist', async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const { getAllPoints } = await import('@/lib/data')
    expect(() => getAllPoints()).toThrow('ENOENT')
  })

  it('throws when the file contains malformed JSON', async () => {
    mockReadFileSync.mockReturnValue('{ invalid json }')
    const { getAllPoints } = await import('@/lib/data')
    expect(() => getAllPoints()).toThrow(SyntaxError)
  })
})
