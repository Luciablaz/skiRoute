import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import psycopg2
import networkx as nx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from config import DB_CONFIG

# Crea la aplicación FastAPI que sirve como backend de SkiRoute
app = FastAPI(title="SkiRoute API")

# Permite que el frontend (cualquier origen) pueda hacer peticiones a la API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_conn():
    # Abre una conexión a la base de datos usando los datos del archivo .env
    return psycopg2.connect(**DB_CONFIG)

def construir_grafo():
    # Carga nodos y conexiones de la BD para construir el grafo de la estación
    conn = get_conn()
    cur  = conn.cursor()

    # Carga todos los nodos con su identificador y coordenadas
    cur.execute("SELECT id_nodo, ST_X(geometry), ST_Y(geometry) FROM nodos")
    nodos = cur.fetchall()

    # Carga todas las conexiones con sus datos de tramo
    cur.execute("SELECT nodo_inicio, nodo_fin, id_tramo, tipo_tramo, dificultad, longitud FROM conexiones")
    conexiones = cur.fetchall()

    cur.close()
    conn.close()

    # Construye el grafo dirigido con los nodos y aristas cargados
    G = nx.DiGraph()
    for nodo, x, y in nodos:
        G.add_node(nodo, pos=(x, y))
    for inicio, fin, id_tramo, tipo_tramo, dificultad, longitud in conexiones:
        # Guarda en cada arista los datos del tramo para usarlos al devolver la ruta
        G.add_edge(inicio, fin, weight=longitud,
                   id_tramo=id_tramo, tipo_tramo=tipo_tramo, dificultad=dificultad)

    return G

# El grafo se construye una sola vez cuando arranca el servidor
grafo = construir_grafo()

def heuristica(n1, n2, G):
    # Distancia euclídea entre dos nodos, usada por A* para estimar el coste restante
    x1, y1 = G.nodes[n1]["pos"]
    x2, y2 = G.nodes[n2]["pos"]
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5

# Orden numérico de dificultades para poder comparar "Verde <- Azul" etc.
ORDEN_DIFICULTAD = {"Verde": 0, "Azul": 1, "Roja": 2, "Negra": 3}
# Tipos de infraestructura que suben al esquiador: siempre se incluyen sin importar la dificultad
TIPOS_REMONTE = {"telesilla", "telesqui", "telecabina"}

def subgrafo_filtrado(G, dificultad_maxima: str | None):
    # Si no se especifica dificultad máxima, devuelve el grafo completo sin filtrar
    if not dificultad_maxima or dificultad_maxima not in ORDEN_DIFICULTAD:
        return G
    nivel_max = ORDEN_DIFICULTAD[dificultad_maxima]
    H = nx.DiGraph()
    # Se añaden todos los nodos para que origen y destino siempre sean localizables
    for nodo, data in G.nodes(data=True):
        H.add_node(nodo, **data)
    # Solo se añaden las aristas que cumplan el filtro de dificultad
    for u, v, data in G.edges(data=True):
        tipo = (data.get("tipo_tramo") or "").lower()
        dif  = (data.get("dificultad") or "")
        es_remonte   = tipo in TIPOS_REMONTE
        nivel_tramo  = ORDEN_DIFICULTAD.get(dif, None)
        # Los remontes siempre pasan, los tramos sin dificultad definida también
        if es_remonte or nivel_tramo is None or nivel_tramo <= nivel_max:
            H.add_edge(u, v, **data)
    return H

class RutaRequest(BaseModel):
    # Datos que el frontend envía para solicitar una ruta
    id_tramo_origen:   str
    id_tramo_destino:  str
    dificultad_maxima: str | None = None  # Si no se envía, no hay restricción de dificultad

@app.get("/health")
def health():
    # Endpoint de comprobación: confirma que la API está activa y el grafo cargado
    return {"status": "ok", "nodos": grafo.number_of_nodes(), "aristas": grafo.number_of_edges()}

@app.post("/ruta")
def calcular_ruta(req: RutaRequest):
    conn = get_conn()
    cur  = conn.cursor()

    # Busca el nodo de salida del tramo origen (el esquiador sale desde el final del tramo)
    cur.execute(
        "SELECT nodo_fin FROM conexiones WHERE id_tramo = %s ORDER BY id DESC LIMIT 1",
        (req.id_tramo_origen,)
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, f"Tramo origen no encontrado: {req.id_tramo_origen}")
    nodo_origen = row[0]

    # Busca el nodo de entrada al tramo destino (el esquiador llega al inicio del tramo)
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

    # Filtra el grafo según la dificultad máxima solicitada y ejecuta A*
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
        # No hay ningún camino posible con las restricciones dadas
        raise HTTPException(404, "No existe ruta entre los puntos seleccionados")
    except nx.NodeNotFound:
        # Alguno de los nodos no existe en el subgrafo filtrado
        raise HTTPException(404, "No existe ruta entre los puntos seleccionados")

    # Construye la lista de tramos recorridos eliminando duplicados consecutivos
    tramos_ruta = []
    vistos = set()
    for i in range(len(ruta) - 1):
        edge = grafo[ruta[i]][ruta[i + 1]]
        id_tramo = edge["id_tramo"]
        if id_tramo not in vistos:
            vistos.add(id_tramo)
            tramos_ruta.append({
                "id_tramo": id_tramo,
                "tipo_tramo": edge["tipo_tramo"],
                "dificultad": edge["dificultad"],
            })

    # Devuelve la secuencia de tramos y la distancia total en metros
    return {
        "tramos": tramos_ruta,
        "distancia": round(distancia, 2),
    }
