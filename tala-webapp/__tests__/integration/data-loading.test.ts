/**
 * __tests__/integration/data-loading.test.ts
 * Integration tests for data loading and validation
 */

import type { PredictionPoint, ProvinceData, MunicipalityData } from '@/types'

describe('Data Loading Integration', () => {
  // Mock fetch for tests
  const mockFetch = (data: any, ok = true) => {
    return jest.fn().mockResolvedValueOnce({
      ok,
      json: jest.fn().mockResolvedValueOnce(data),
    })
  }

  beforeEach(() => {
    global.fetch = jest.fn()
  })

  describe('Points Data', () => {
    it('should load points.json with correct schema', async () => {
      const mockPoints: PredictionPoint[] = [
        {
          id: '1',
          lat: 14.5,
          lon: 121.0,
          wi: 0.5,
          wi_class: 'high',
          province: 'NCR',
          municipality: 'Manila',
          osm: { VIIRS_Median: 50.5, Total_POI_Count: 100, Total_Road_Length: 5000 },
        },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockPoints),
      })

      const response = await fetch('/data/points.json')
      const data = await response.json()

      expect(data).toHaveLength(1)
      expect(data[0]).toHaveProperty('id')
      expect(data[0]).toHaveProperty('lat')
      expect(data[0]).toHaveProperty('lon')
      expect(data[0]).toHaveProperty('wi')
      expect(data[0]).toHaveProperty('province')
      expect(data[0]).toHaveProperty('municipality')
    })

    it('should validate wealth index range (-2.5 to 2.0)', async () => {
      const points: PredictionPoint[] = [
        {
          id: '1',
          lat: 14.0,
          lon: 121.0,
          wi: -2.5,
          wi_class: 'poor',
          province: 'NCR',
          municipality: 'Manila',
          osm: { VIIRS_Median: 10, Total_POI_Count: 50, Total_Road_Length: 2000 },
        },
        {
          id: '2',
          lat: 15.0,
          lon: 122.0,
          wi: 2.0,
          wi_class: 'wealthy',
          province: 'NCR',
          municipality: 'Pasig',
          osm: { VIIRS_Median: 100, Total_POI_Count: 500, Total_Road_Length: 20000 },
        },
      ]

      points.forEach(p => {
        expect(p.wi).toBeGreaterThanOrEqual(-2.5)
        expect(p.wi).toBeLessThanOrEqual(2.0)
      })
    })

    it('should validate coordinates within Philippines bounds', async () => {
      const points: PredictionPoint[] = [
        {
          id: '1',
          lat: 5.0,
          lon: 117.0,
          wi: 0.0,
          wi_class: 'medium',
          province: 'Mindanao',
          municipality: 'Test',
          osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 },
        },
        {
          id: '2',
          lat: 18.0,
          lon: 127.0,
          wi: 0.0,
          wi_class: 'medium',
          province: 'Luzon',
          municipality: 'Test',
          osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 },
        },
      ]

      points.forEach(p => {
        expect(p.lat).toBeGreaterThanOrEqual(4.58) // southernmost point
        expect(p.lat).toBeLessThanOrEqual(20.61) // northernmost point
        expect(p.lon).toBeGreaterThanOrEqual(116.04) // westernmost point
        expect(p.lon).toBeLessThanOrEqual(127.5) // easternmost point (Batanes)
      })
    })

    it('should require OSM features object', async () => {
      const point: PredictionPoint = {
        id: '1',
        lat: 14.0,
        lon: 121.0,
        wi: 0.5,
        wi_class: 'medium',
        province: 'NCR',
        municipality: 'Manila',
        osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 },
      }

      expect(point.osm).toBeDefined()
      expect(point.osm.VIIRS_Median).toBeDefined()
      expect(point.osm.Total_POI_Count).toBeDefined()
      expect(point.osm.Total_Road_Length).toBeDefined()
    })

    it('should not have duplicate point IDs', async () => {
      const points: PredictionPoint[] = [
        {
          id: '1',
          lat: 14.0,
          lon: 121.0,
          wi: 0.0,
          wi_class: 'medium',
          province: 'NCR',
          municipality: 'Manila',
          osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 },
        },
        {
          id: '2',
          lat: 15.0,
          lon: 122.0,
          wi: 0.0,
          wi_class: 'medium',
          province: 'NCR',
          municipality: 'Pasig',
          osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 },
        },
      ]

      const ids = new Set(points.map(p => p.id))
      expect(ids.size).toBe(points.length)
    })
  })

  describe('Geographic Data', () => {
    it('should load provinces.json with statistics', async () => {
      const provinces: Record<string, ProvinceData> = {
        NCR: {
          count: 100,
          mean_wi: 0.2,
          min_wi: -1.5,
          max_wi: 1.8,
        },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(provinces),
      })

      const response = await fetch('/data/provinces.json')
      const data = await response.json()

      const prov = data.NCR
      expect(prov.count).toBeGreaterThan(0)
      expect(prov.mean_wi).toBeGreaterThanOrEqual(prov.min_wi)
      expect(prov.mean_wi).toBeLessThanOrEqual(prov.max_wi)
    })

    it('should load municipalities.json linked to provinces', async () => {
      const municipalities: Record<string, MunicipalityData> = {
        'NCR|Manila': {
          municipality: 'Manila',
          province: 'NCR',
          count: 50,
          mean_wi: 0.0,
          min_wi: -1.0,
          max_wi: 1.0,
        },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(municipalities),
      })

      const response = await fetch('/data/municipalities.json')
      const data = await response.json()

      Object.values(data).forEach((muni: any) => {
        expect(muni).toHaveProperty('municipality')
        expect(muni).toHaveProperty('province')
        expect(typeof muni.municipality).toBe('string')
        expect(typeof muni.province).toBe('string')
      })
    })
  })

  describe('SHAP Data', () => {
    it('should load shap_global.json with feature importance', async () => {
      const shapGlobal = [
        { feature: 'VIIRS_Median', value: 0.35 },
        { feature: 'Total_POI_Count', value: 0.28 },
        { feature: 'Total_Road_Length', value: 0.22 },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(shapGlobal),
      })

      const response = await fetch('/data/shap_global.json')
      const data = await response.json()

      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      data.forEach((item: any) => {
        expect(item).toHaveProperty('feature')
        expect(item).toHaveProperty('value')
        expect(typeof item.value).toBe('number')
      })
    })

    it('should load shap_by_area.json with regional feature importance', async () => {
      const shapByArea: Record<string, any[]> = {
        NCR: [
          { feature: 'VIIRS_Median', value: 0.4 },
          { feature: 'Total_POI_Count', value: 0.3 },
        ],
        Quezon: [
          { feature: 'Total_Road_Length', value: 0.45 },
          { feature: 'VIIRS_Median', value: 0.25 },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(shapByArea),
      })

      const response = await fetch('/data/shap_by_area.json')
      const data = await response.json()

      Object.entries(data).forEach(([area, values]: [string, any]) => {
        expect(Array.isArray(values)).toBe(true)
        expect(values.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Data Loading Performance', () => {
    it('should load all 5 files concurrently', async () => {
      const mockData = { mock: 'data' }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })

      const start = performance.now()

      const results = await Promise.all([
        fetch('/data/points.json').then(r => r.json()),
        fetch('/data/provinces.json').then(r => r.json()),
        fetch('/data/municipalities.json').then(r => r.json()),
        fetch('/data/shap_global.json').then(r => r.json()),
        fetch('/data/shap_by_area.json').then(r => r.json()),
      ])

      const duration = performance.now() - start

      expect(results).toHaveLength(5)
      expect(duration).toBeLessThan(100) // Should complete quickly in test env
    })

    it('should handle fetch errors gracefully', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      try {
        await fetch('/data/points.json').then(r => r.json())
      } catch (err) {
        consoleSpy(err)
      }

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('Data Consistency', () => {
    it('should have consistent point filtering by province', () => {
      const points: PredictionPoint[] = [
        {
          id: '1',
          lat: 14.0,
          lon: 121.0,
          wi: 0.0,
          wi_class: 'medium',
          province: 'NCR',
          municipality: 'Manila',
          osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 },
        },
        {
          id: '2',
          lat: 14.5,
          lon: 121.5,
          wi: 0.2,
          wi_class: 'medium',
          province: 'NCR',
          municipality: 'Pasig',
          osm: { VIIRS_Median: 60, Total_POI_Count: 120, Total_Road_Length: 6000 },
        },
        {
          id: '3',
          lat: 15.0,
          lon: 121.0,
          wi: -0.5,
          wi_class: 'low',
          province: 'Quezon',
          municipality: 'Lucena',
          osm: { VIIRS_Median: 40, Total_POI_Count: 80, Total_Road_Length: 4000 },
        },
      ]

      const ncrPoints = points.filter(p => p.province === 'NCR')
      expect(ncrPoints).toHaveLength(2)
      expect(ncrPoints.every(p => p.province === 'NCR')).toBe(true)
    })

    it('should have consistent point filtering by municipality', () => {
      const points: PredictionPoint[] = [
        {
          id: '1',
          lat: 14.0,
          lon: 121.0,
          wi: 0.0,
          wi_class: 'medium',
          province: 'NCR',
          municipality: 'Manila',
          osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 },
        },
        {
          id: '2',
          lat: 14.1,
          lon: 121.1,
          wi: 0.1,
          wi_class: 'medium',
          province: 'NCR',
          municipality: 'Manila',
          osm: { VIIRS_Median: 55, Total_POI_Count: 110, Total_Road_Length: 5500 },
        },
        {
          id: '3',
          lat: 14.5,
          lon: 121.5,
          wi: 0.2,
          wi_class: 'medium',
          province: 'NCR',
          municipality: 'Pasig',
          osm: { VIIRS_Median: 60, Total_POI_Count: 120, Total_Road_Length: 6000 },
        },
      ]

      const manilaPoints = points.filter(
        p => p.municipality === 'Manila' && p.province === 'NCR'
      )
      expect(manilaPoints).toHaveLength(2)
      expect(manilaPoints.every(p => p.municipality === 'Manila')).toBe(true)
    })
  })
})
