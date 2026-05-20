/**
 * __tests__/utils/test-helpers.ts
 * Shared test utilities and mock data generators
 */

import type {
  PredictionPoint,
  ProvinceData,
  MunicipalityData,
  ShapFeature,
  SelectedArea,
} from '@/types'

/**
 * Mock Data Generators
 */

export const mockPredictionPoint = (overrides?: Partial<PredictionPoint>): PredictionPoint => ({
  id: 'point-1',
  lat: 14.5,
  lon: 121.0,
  wi: 0.5,
  wi_class: 'high',
  province: 'NCR',
  municipality: 'Manila',
  osm: {
    VIIRS_Median: 50.5,
    Total_POI_Count: 100,
    Total_Road_Length: 5000,
  },
  ...overrides,
})

export const mockProvinceData = (overrides?: Partial<ProvinceData>): ProvinceData => ({
  count: 100,
  mean_wi: 0.2,
  min_wi: -1.5,
  max_wi: 1.8,
  ...overrides,
})

export const mockMunicipalityData = (overrides?: Partial<MunicipalityData>): MunicipalityData => ({
  municipality: 'Manila',
  province: 'NCR',
  count: 50,
  mean_wi: 0.0,
  min_wi: -1.0,
  max_wi: 1.0,
  ...overrides,
})

export const mockShapFeature = (overrides?: Partial<ShapFeature>): ShapFeature => ({
  feature: 'VIIRS_Median',
  value: 0.35,
  ...overrides,
})

export const mockSelectedArea = (overrides?: Partial<SelectedArea>): SelectedArea => ({
  type: 'province',
  name: 'NCR',
  data: mockProvinceData(),
  points: [mockPredictionPoint(), mockPredictionPoint({ id: 'point-2', municipality: 'Pasig' })],
  shap: [mockShapFeature()],
  ...overrides,
})

/**
 * Test Data Collections
 */

export const mockProvinces = (): Record<string, ProvinceData> => ({
  NCR: mockProvinceData({ count: 500, mean_wi: 0.3 }),
  'Quezon': mockProvinceData({ count: 200, mean_wi: -0.2 }),
  'Laguna': mockProvinceData({ count: 150, mean_wi: 0.1 }),
})

export const mockMunicipalities = (): Record<string, MunicipalityData> => ({
  'NCR|Manila': mockMunicipalityData({ municipality: 'Manila', province: 'NCR', count: 100 }),
  'NCR|Pasig': mockMunicipalityData({ municipality: 'Pasig', province: 'NCR', count: 80 }),
  'Quezon|Lucena': mockMunicipalityData({
    municipality: 'Lucena',
    province: 'Quezon',
    count: 60,
  }),
})

export const mockPoints = (): PredictionPoint[] => [
  mockPredictionPoint({ id: '1', province: 'NCR', municipality: 'Manila' }),
  mockPredictionPoint({ id: '2', province: 'NCR', municipality: 'Pasig', wi: 0.3 }),
  mockPredictionPoint({
    id: '3',
    province: 'Quezon',
    municipality: 'Lucena',
    wi: -0.5,
    lat: 13.9,
    lon: 121.6,
  }),
]

export const mockShapGlobal = (): ShapFeature[] => [
  mockShapFeature({ feature: 'VIIRS_Median', value: 0.35 }),
  mockShapFeature({ feature: 'Total_POI_Count', value: 0.28 }),
  mockShapFeature({ feature: 'Total_Road_Length', value: 0.22 }),
]

export const mockShapByArea = (): Record<string, ShapFeature[]> => ({
  NCR: [
    mockShapFeature({ feature: 'VIIRS_Median', value: 0.4 }),
    mockShapFeature({ feature: 'Total_POI_Count', value: 0.3 }),
  ],
  'Quezon': [
    mockShapFeature({ feature: 'Total_Road_Length', value: 0.45 }),
    mockShapFeature({ feature: 'VIIRS_Median', value: 0.25 }),
  ],
})

/**
 * Validation Helpers
 */

export const validatePredictionPoint = (point: any): boolean => {
  return (
    typeof point.id === 'string' &&
    typeof point.lat === 'number' &&
    typeof point.lon === 'number' &&
    typeof point.wi === 'number' &&
    typeof point.province === 'string' &&
    typeof point.municipality === 'string' &&
    point.wi >= -2.5 &&
    point.wi <= 2.0 &&
    point.lat >= 4.58 &&
    point.lat <= 20.61 &&
    point.lon >= 116.04 &&
    point.lon <= 127.5
  )
}

export const validateWealthIndex = (wi: number): boolean => {
  return wi >= -2.5 && wi <= 2.0
}

export const validateCoordinates = (lat: number, lon: number): boolean => {
  return (
    lat >= 4.58 &&
    lat <= 20.61 &&
    lon >= 116.04 &&
    lon <= 127.5
  )
}

/**
 * Mapbox Mock Helpers
 */

export const createMockMapboxMap = () => {
  const listeners: Record<string, Function[]> = {}

  return {
    on: jest.fn((event: string, callback: Function) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(callback)
    }),
    once: jest.fn((event: string, callback: Function) => {
      const wrappedCallback = (...args: any[]) => {
        callback(...args)
        listeners[event]?.splice(listeners[event].indexOf(wrappedCallback), 1)
      }
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(wrappedCallback)
    }),
    off: jest.fn((event: string, callback?: Function) => {
      if (callback && listeners[event]) {
        const index = listeners[event].indexOf(callback)
        if (index > -1) listeners[event].splice(index, 1)
      } else if (listeners[event]) {
        listeners[event] = []
      }
    }),
    emit: (event: string, ...args: any[]) => {
      listeners[event]?.forEach(fn => fn(...args))
    },
    addSource: jest.fn(),
    removeSource: jest.fn(),
    addLayer: jest.fn(),
    removeLayer: jest.fn(),
    getLayer: jest.fn(id => ({ id })),
    getSource: jest.fn(id => ({ id })),
    setFeatureState: jest.fn(),
    getFeatureState: jest.fn(() => ({})),
    fitBounds: jest.fn(),
    flyTo: jest.fn(),
    getZoom: jest.fn(() => 5.5),
    getCenter: jest.fn(() => ({ lng: 122.0, lat: 12.0 })),
    getCanvas: jest.fn(() => ({ style: {} })),
    remove: jest.fn(),
    isSourceLoaded: jest.fn(() => true),
    getStyle: jest.fn(() => ({ layers: [] })),
  }
}

/**
 * DOM Testing Helpers
 */

export const waitFor = (
  callback: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (callback()) {
        resolve()
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for condition'))
      } else {
        setTimeout(check, interval)
      }
    }
    check()
  })
}

export const createMockGeojson = (features?: any[]) => ({
  type: 'FeatureCollection' as const,
  features: features || [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121.0, 14.5] },
      properties: { id: '1', wi: 0.5 },
    },
  ],
})

/**
 * Assertion Helpers
 */

export const expectWealthIndexColor = (wi: number): string => {
  if (wi <= -2.5) return '#c0392b' // red
  if (wi <= -0.5) return '#e67e22' // orange
  if (wi < 0) return '#326189' // dark blue
  if (wi < 0.5) return '#88bcbd' // light blue
  return '#5ce1e6' // cyan
}

export const getWealthIndexClass = (wi: number): string => {
  if (wi <= -1) return 'poor'
  if (wi <= 0) return 'low'
  if (wi <= 0.5) return 'medium'
  return 'high'
}
