import geopandas as gpd

gdf = gpd.read_file('/Users/ruben/Desktop/Thesis/2025Data/PH_Adm1_Regions.shp')
gdf = gdf.to_crs(epsg=4326)   # ensure WGS84
gdf.to_file('public/geodata/phl_regions.geojson', driver='GeoJSON')