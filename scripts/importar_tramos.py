import geopandas as gpd
from sqlalchemy import create_engine

# leer geojson
gdf = gpd.read_file("../data/Tramos_Cerler.geojson")
gdf = gdf[["nombre", "id_estacion", "id_tramo", "tipo_tramo", "dificultad", "long_m", "long_km", "geometry"]]

# conexión a PostgreSQL
engine = create_engine("postgresql://postgres:1234asdf@localhost:5432/skiRoute")

# subir a la base de datos
gdf.to_postgis(
    name="tramos",
    con=engine,
    if_exists="append",
    index=False
)

print("Tramos importados correctamente")