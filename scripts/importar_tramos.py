import os
import json
import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv

# Carga las credenciales desde el archivo .env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Estación a importar
ESTACION = "Valdesqui"

nodos_path  = f"../data/Nodos_{ESTACION}.geojson"
tramos_path = f"../data/Tramos_{ESTACION}.geojson"

# Lee el GeoJSON de nodos y extrae solo los campos necesarios para la topología
with open(nodos_path, encoding="utf-8") as f:
    nodos_data = json.load(f)

nodos_rows = []
for feature in nodos_data["features"]:
    props = feature["properties"]
    nodos_rows.append({
        "id_nodo":    props["id_nodo"],
        "id_tramo":   props["id_tramo"],
        "vertex_pos": props["vertex_pos"],
    })

df_nodos = pd.DataFrame(nodos_rows)

# Separa los nodos de inicio (vertex_pos 0) y fin (vertex_pos -1) de cada tramo
inicio = df_nodos[df_nodos["vertex_pos"] == 0][["id_tramo", "id_nodo"]].rename(columns={"id_nodo": "nodo_inicio"})
fin    = df_nodos[df_nodos["vertex_pos"] == -1][["id_tramo", "id_nodo"]].rename(columns={"id_nodo": "nodo_fin"})

# Une inicio y fin por id_tramo para construir la topología del grafo
df_topologia = pd.merge(inicio, fin, on="id_tramo")

# Lee el GeoJSON de tramos y extrae los atributos de cada uno
with open(tramos_path, encoding="utf-8") as f:
    tramos_data = json.load(f)

tramos_rows = []
for feature in tramos_data["features"]:
    props = feature["properties"]
    tramos_rows.append({
        "id_tramo":   props["id_tramo"],
        "tipo_tramo": props["tipo_tramo"],
        "dificultad": props["dificultad"],
        "longitud":   props["long_m"],
    })

df_tramos = pd.DataFrame(tramos_rows)

# Combina la topología con los atributos para obtener las conexiones completas
df_conexiones = pd.merge(df_topologia, df_tramos, on="id_tramo")

# Conecta a la base de datos usando las credenciales del archivo .env
engine = create_engine(
    f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
)

# Inserta las conexiones en la tabla, añadiendo a los datos existentes
df_conexiones.to_sql(
    name="conexiones",
    con=engine,
    if_exists="append",
    index=False
)

print(f"Conexiones de {ESTACION} importadas correctamente ({len(df_conexiones)} filas)")
