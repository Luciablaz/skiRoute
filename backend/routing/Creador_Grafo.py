import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import psycopg2
import networkx as nx
from config import DB_CONFIG


def construir_grafo():
    # Conecta a la base de datos PostgreSQL donde están almacenados
    # los nodos y conexiones de las estaciones de esquí
    conn = psycopg2.connect(**DB_CONFIG)

    cur = conn.cursor()

    # Carga todos los nodos con su identificador y sus coordenadas (longitud, latitud)
    cur.execute("""
        SELECT id_nodo, ST_X(geometry), ST_Y(geometry)
        FROM nodos
    """)
    nodos = cur.fetchall()

    # Carga todas las conexiones entre nodos
    cur.execute("""
        SELECT nodo_inicio, nodo_fin, longitud
        FROM conexiones
    """)
    conexiones = cur.fetchall()

    # Crea un grafo dirigido
    G = nx.DiGraph()

    # Añade cada nodo al grafo guardando su posición para usarla en la heurística
    for nodo, x, y in nodos:
        G.add_node(nodo, pos=(x, y))

    # Añade cada conexión como un arco del grafo con la longitud como peso
    for inicio, fin, longitud in conexiones:
        G.add_edge(inicio, fin, weight=longitud)

    return G

def heuristica(n1, n2, G):
    # Calcula la distancia euclídea entre dos nodos
    x1, y1 = G.nodes[n1]["pos"]
    x2, y2 = G.nodes[n2]["pos"]

    return ((x1 - x2)**2 + (y1 - y2)**2) ** 0.5

def calcular_ruta(G, origen, destino):
    # Busca el camino más corto entre origen y destino usando el algoritmo A*
    try:
        # Obtiene la secuencia de nodos que forman la ruta óptima
        ruta = nx.astar_path(
            G,
            origen,
            destino,
            heuristic=lambda a, b: heuristica(a, b, G),
            weight="weight"
        )

        # Calcula la distancia total sumando los pesos de los arcos recorridos
        distancia = nx.astar_path_length(
            G,
            origen,
            destino,
            heuristic=lambda a, b: heuristica(a, b, G),
            weight="weight"
        )

        return ruta, distancia

    except nx.NetworkXNoPath:
        # Si no hay ningún camino posible entre los dos nodos, devuelve vacío
        print("No existe ruta entre los nodos")
        return None, None

if __name__ == "__main__":
    # Bloque de prueba: construye el grafo y calcula una ruta de ejemplo en Valdesquí
    G = construir_grafo()

    origen = "Valdesqui_N_003"
    destino = "Valdesqui_N_017"

    ruta, distancia = calcular_ruta(G, origen, destino)

    print("Ruta encontrada:")
    print(ruta)

    print("Distancia total:", distancia)