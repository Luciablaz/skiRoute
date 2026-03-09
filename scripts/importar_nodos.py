import geopandas as gpd
from sqlalchemy import create_engine

gdf = gpd.read_file("Nodos_Valdesqui.geojson")

engine = create_engine("postgresql://postgres:1234asdf@localhost:5432/skiRoute")

gdf.to_postgis(
    name="nodos",
    con=engine,
    if_exists="replace",
    index=False
)

print("Nodos importados correctamente")