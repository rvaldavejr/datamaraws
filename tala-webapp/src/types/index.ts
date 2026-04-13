// src/types/index.ts

export interface PredictionPoint {
  id: number
  lat: number
  lon: number
  province: string
  municipality: string
  region: string
  urban_rural: string
  source: string
  wi: number
  wi_class: 'high' | 'mid' | 'low'
  poverty_rate: number | null
  osm: OsmFeatures
}

export interface OsmFeatures {
  Total_Road_Length: number
  Main_Roads_Length: number
  Secondary_Roads_Length: number
  Local_Roads_Length: number
  Tracks_Length: number
  Total_Bldg_Count: number
  Bldg_residential_Count: number
  Bldg_commercial_Count: number
  Bldg_industrial_Count: number
  Bldg_school_Count: number
  Bldg_hospital_Count: number
  Total_Bldg_Area: number
  Total_POI_Count: number
  POI_bank_Count: number
  POI_hotel_Count: number
  POI_fast_food_Count: number
  POI_convenience_Count: number
  POI_school_Count: number
  POI_hospital_Count: number
  VIIRS_Median: number
}

export interface ProvinceData {
  name: string
  n_points: number
  n_municipalities: number
  mean_wi: number
  median_wi: number
  min_wi: number
  max_wi: number
  std_wi: number
  pct_low: number
  pct_mid: number
  pct_high: number
  poverty_rate: number | null
  region: string
  osm_mean: OsmFeatures
  municipalities: string[]
}

export interface MunicipalityData {
  municipality: string
  province: string
  region: string
  n_points: number
  mean_wi: number
  median_wi: number
  min_wi: number
  max_wi: number
  pct_low: number
  pct_high: number
  osm_mean: OsmFeatures
  point_ids: number[]
}

export interface ShapFeature {
  rank?: number
  feature: string
  mean_abs_shap: number
  category?: string
}

export type AreaType = 'province' | 'municipality'

export interface SelectedArea {
  type: AreaType
  name: string
  province?: string
  data: ProvinceData | MunicipalityData
  points: PredictionPoint[]
  shap: ShapFeature[]
}
