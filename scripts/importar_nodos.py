import os
import geopandas as gpd
from sqlalchemy import create_engine
from dotenv import load_dotenv

# Carga las credenciales desde el archivo .env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Estación a importar
ESTACION = "Formigal"

# Archivo GeoJSON con los nodos de la estación a importar
gdf = gpd.read_file(f"../data/Nodos_{ESTACION}.geojson")

# Solo se necesitan el identificador y la geometría de cada nodo
gdf = gdf[["id_nodo", "geometry"]]

# Conecta a la base de datos usando las credenciales del archivo .env
engine = create_engine(
    f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
)

# Inserta los nodos en la tabla, añadiendo a los datos existentes
gdf.to_postgis(
    name="nodos",
    con=engine,
    if_exists="append",
    index=False
)

print(f"Nodos de {ESTACION} importados correctamente")
