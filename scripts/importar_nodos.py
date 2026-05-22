import geopandas as gpd
from sqlalchemy import create_engine

gdf = gpd.read_file("../data/Nodos_Astun.geojson")
gdf = gdf[["id_nodo", "geometry"]]

engine = create_engine("postgresql://postgres:1234asdf@localhost:5432/skiRoute")

gdf.to_postgis(
    name="nodos",
    con=engine,
    if_exists="append",
    index=False
)

print("Nodos importados correctamente")