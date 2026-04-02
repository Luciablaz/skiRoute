import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import psycopg2
import networkx as nx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from config import DB_CONFIG

app = FastAPI(title="SkiRoute API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers BD ───────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(**DB_CONFIG)

# ── Grafo (se construye una vez al arrancar) ─────────────────────────────────
def construir_grafo():
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute("SELECT id_nodo, ST_X(geometry), ST_Y(geometry) FROM nodos")
    nodos = cur.fetchall()

    cur.execute("SELECT nodo_inicio, nodo_fin, longitud FROM conexiones")
    conexiones = cur.fetchall()

    cur.close()
    conn.close()

    G = nx.DiGraph()
    for nodo, x, y in nodos:
        G.add_node(nodo, pos=(x, y))
    for inicio, fin, longitud in conexiones:
        G.add_edge(inicio, fin, weight=longitud)

    return G

grafo = construir_grafo()

# ── Heurística A* ────────────────────────────────────────────────────────────
def heuristica(n1, n2, G):
    x1, y1 = G.nodes[n1]["pos"]
    x2, y2 = G.nodes[n2]["pos"]
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5

# ── Modelos ──────────────────────────────────────────────────────────────────
class RutaRequest(BaseModel):
    id_tramo_origen:  str
    id_tramo_destino: str

# ── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "nodos": grafo.number_of_nodes(), "aristas": grafo.number_of_edges()}

@app.post("/ruta")
def calcular_ruta(req: RutaRequest):
    conn = get_conn()
    cur  = conn.cursor()

    # Nodo de inicio del tramo origen
    cur.execute(
        "SELECT nodo_inicio FROM conexiones WHERE id_tramo = %s LIMIT 1",
        (req.id_tramo_origen,)
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, f"Tramo origen no encontrado: {req.id_tramo_origen}")
    nodo_origen = row[0]

    # Nodo de fin del tramo destino
    cur.execute(
        "SELECT nodo_fin FROM conexiones WHERE id_tramo = %s ORDER BY id DESC LIMIT 1",
        (req.id_tramo_destino,)
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, f"Tramo destino no encontrado: {req.id_tramo_destino}")
    nodo_destino = row[0]

    cur.close()
    conn.close()

    # A*
    try:
        ruta = nx.astar_path(
            grafo, nodo_origen, nodo_destino,
            heuristic=lambda a, b: heuristica(a, b, grafo),
            weight="weight"
        )
        distancia = nx.astar_path_length(
            grafo, nodo_origen, nodo_destino,
            heuristic=lambda a, b: heuristica(a, b, grafo),
            weight="weight"
        )
    except nx.NetworkXNoPath:
        raise HTTPException(404, "No existe ruta entre los puntos seleccionados")
    except nx.NodeNotFound as e:
        raise HTTPException(404, str(e))

    # Coordenadas de cada nodo de la ruta
    puntos = []
    for nodo_id in ruta:
        x, y = grafo.nodes[nodo_id]["pos"]
        puntos.append({"id": nodo_id, "lat": y, "lng": x})

    return {
        "ruta":      puntos,
        "distancia": round(distancia, 2),
        "n_nodos":   len(ruta),
    }
