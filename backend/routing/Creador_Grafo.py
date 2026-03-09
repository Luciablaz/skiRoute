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
        SELECT nodo_inicio, nodo_fin, tipo_tramo, longitud
        FROM conexiones
    """)

    rows = cur.fetchall()

    G = nx.DiGraph()

    for inicio, fin, tipo, longitud in rows:
        G.add_edge(inicio, fin, tipo=tipo, weight=longitud)

    print("Nodos:", G.number_of_nodes())
    print("Conexiones:", G.number_of_edges())

    return G


if __name__ == "__main__":
    construir_grafo()