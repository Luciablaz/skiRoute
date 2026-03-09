import geopandas as gpd
from sqlalchemy import create_engine

# leer geojson
gdf = gpd.read_file("Tramos_Valdesqui.geojson")

# conexión a PostgreSQL
engine = create_engine("postgresql://postgres:1234asdf@localhost:5432/skiRoute")

# subir a la base de datos
gdf.to_postgis(
    name="tramos",
    con=engine,
    if_exists="replace",
    index=False
)

print("Tramos importados correctamente")