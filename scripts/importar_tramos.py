import json
import pandas as pd
from sqlalchemy import create_engine

# ── Parámetro: estación a importar ───────────────────────────────────────────
ESTACION = "Astun"

nodos_path  = f"../data/Nodos_{ESTACION}.geojson"
tramos_path = f"../data/Tramos_{ESTACION}.geojson"

# ── Leer nodos ────────────────────────────────────────────────────────────────
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

# nodo_inicio = vertex_pos 0, nodo_fin = vertex_pos -1
inicio = df_nodos[df_nodos["vertex_pos"] == 0][["id_tramo", "id_nodo"]].rename(columns={"id_nodo": "nodo_inicio"})
fin    = df_nodos[df_nodos["vertex_pos"] == -1][["id_tramo", "id_nodo"]].rename(columns={"id_nodo": "nodo_fin"})

df_topologia = pd.merge(inicio, fin, on="id_tramo")

# ── Leer tramos ───────────────────────────────────────────────────────────────
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

# ── Unir topología + atributos ────────────────────────────────────────────────
df_conexiones = pd.merge(df_topologia, df_tramos, on="id_tramo")

# ── Subir a PostgreSQL ────────────────────────────────────────────────────────
engine = create_engine("postgresql://postgres:1234asdf@localhost:5432/skiRoute")

df_conexiones.to_sql(
    name="conexiones",
    con=engine,
    if_exists="append",
    index=False
)

print(f"Conexiones de {ESTACION} importadas correctamente ({len(df_conexiones)} filas)")
