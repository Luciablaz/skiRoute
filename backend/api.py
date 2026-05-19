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

    cur.execute("SELECT nodo_inicio, nodo_fin, id_tramo, tipo_tramo, dificultad, longitud FROM conexiones")
    conexiones = cur.fetchall()

    cur.close()
    conn.close()

    G = nx.DiGraph()
    for nodo, x, y in nodos:
        G.add_node(nodo, pos=(x, y))
    for inicio, fin, id_tramo, tipo_tramo, dificultad, longitud in conexiones:
        G.add_edge(inicio, fin, weight=longitud,
                   id_tramo=id_tramo, tipo_tramo=tipo_tramo, dificultad=dificultad)

    return G

grafo = construir_grafo()

# ── Heurística A* ────────────────────────────────────────────────────────────
def heuristica(n1, n2, G):
    x1, y1 = G.nodes[n1]["pos"]
    x2, y2 = G.nodes[n2]["pos"]
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5

# ── Dificultad ───────────────────────────────────────────────────────────────
ORDEN_DIFICULTAD = {"Verde": 0, "Azul": 1, "Roja": 2, "Negra": 3}
TIPOS_REMONTE    = {"telesilla", "telesqui", "telecabina"}

def subgrafo_filtrado(G, dificultad_maxima: str | None):
    if not dificultad_maxima or dificultad_maxima not in ORDEN_DIFICULTAD:
        return G
    nivel_max = ORDEN_DIFICULTAD[dificultad_maxima]
    H = nx.DiGraph()
    # Añadir todos los nodos para que origen/destino siempre sean localizables
    for nodo, data in G.nodes(data=True):
        H.add_node(nodo, **data)
    # Añadir solo las aristas permitidas
    for u, v, data in G.edges(data=True):
        tipo = (data.get("tipo_tramo") or "").lower()
        dif  = (data.get("dificultad") or "")
        es_remonte   = tipo in TIPOS_REMONTE
        nivel_tramo  = ORDEN_DIFICULTAD.get(dif, None)
        # Si dificultad es desconocida o nula → incluir siempre (no penalizar)
        if es_remonte or nivel_tramo is None or nivel_tramo <= nivel_max:
            H.add_edge(u, v, **data)
    return H

# ── Modelos ──────────────────────────────────────────────────────────────────
class RutaRequest(BaseModel):
    id_tramo_origen:   str
    id_tramo_destino:  str
    dificultad_maxima: str | None = None

# ── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "nodos": grafo.number_of_nodes(), "aristas": grafo.number_of_edges()}

@app.post("/ruta")
def calcular_ruta(req: RutaRequest):
    conn = get_conn()
    cur  = conn.cursor()

    # Nodo fin del tramo origen (punto de salida: base de pista o cima de remonte)
    cur.execute(
        "SELECT nodo_fin FROM conexiones WHERE id_tramo = %s ORDER BY id DESC LIMIT 1",
        (req.id_tramo_origen,)
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, f"Tramo origen no encontrado: {req.id_tramo_origen}")
    nodo_origen = row[0]

    # Nodo de inicio del tramo destino (punto de entrada: cima en pistas, base en remontes)
    cur.execute(
        "SELECT nodo_inicio FROM conexiones WHERE id_tramo = %s LIMIT 1",
        (req.id_tramo_destino,)
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, f"Tramo destino no encontrado: {req.id_tramo_destino}")
    nodo_destino = row[0]

    cur.close()
    conn.close()

    # A*
    g = subgrafo_filtrado(grafo, req.dificultad_maxima)
    try:
        ruta = nx.astar_path(
            g, nodo_origen, nodo_destino,
            heuristic=lambda a, b: heuristica(a, b, grafo),
            weight="weight"
        )
        distancia = nx.astar_path_length(
            g, nodo_origen, nodo_destino,
            heuristic=lambda a, b: heuristica(a, b, grafo),
            weight="weight"
        )
    except nx.NetworkXNoPath:
        raise HTTPException(404, "No existe ruta entre los puntos seleccionados")
    except nx.NodeNotFound:
        raise HTTPException(404, "No existe ruta entre los puntos seleccionados")

    # Secuencia de tramos (sin repetir tramos consecutivos iguales)
    tramos_ruta = []
    vistos = set()
    for i in range(len(ruta) - 1):
        edge = grafo[ruta[i]][ruta[i + 1]]
        id_tramo = edge["id_tramo"]
        if id_tramo not in vistos:
            vistos.add(id_tramo)
            tramos_ruta.append({
                "id_tramo":   id_tramo,
                "tipo_tramo": edge["tipo_tramo"],
                "dificultad": edge["dificultad"],
            })

    return {
        "tramos":    tramos_ruta,
        "distancia": round(distancia, 2),
    }
