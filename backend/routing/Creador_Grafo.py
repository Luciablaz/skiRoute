import psycopg2
import networkx as nx


def construir_grafo():

    conn = psycopg2.connect(
        dbname="skiRoute",
        user="postgres",
        password="1234asdf",
        host="localhost",
        port="5432"
    )

    cur = conn.cursor()

    cur.execute("""
        SELECT id_nodo, ST_X(geometry), ST_Y(geometry)
        FROM nodos
    """)
    nodos = cur.fetchall()

    cur.execute("""
        SELECT nodo_inicio, nodo_fin, longitud
        FROM conexiones
    """)
    conexiones = cur.fetchall()

    G = nx.DiGraph()

    for nodo, x, y in nodos:
        G.add_node(nodo, pos=(x, y))

    for inicio, fin, longitud in conexiones:
        G.add_edge(inicio, fin, weight=longitud)

    return G

def heuristica(n1, n2, G):

    x1, y1 = G.nodes[n1]["pos"]
    x2, y2 = G.nodes[n2]["pos"]

    return ((x1 - x2)**2 + (y1 - y2)**2) ** 0.5

def calcular_ruta(G, origen, destino):

    try:

        ruta = nx.astar_path(
            G,
            origen,
            destino,
            heuristic=lambda a, b: heuristica(a, b, G),
            weight="weight"
        )

        distancia = nx.astar_path_length(
            G,
            origen,
            destino,
            heuristic=lambda a, b: heuristica(a, b, G),
            weight="weight"
        )

        return ruta, distancia

    except nx.NetworkXNoPath:
        print("No existe ruta entre los nodos")
        return None, None

if __name__ == "__main__":
    G = construir_grafo()

    origen = "Valdesqui_N_003"
    destino = "Valdesqui_N_017"

    ruta, distancia = calcular_ruta(G, origen, destino)

    print("Ruta encontrada:")
    print(ruta)

    print("Distancia total:", distancia)