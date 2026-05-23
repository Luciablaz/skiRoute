# SkiRoute

Aplicación web para planificar rutas en estaciones de esquí españolas. Desarrollada como Trabajo de Fin de Grado (TFG).

🔗 **App desplegada:** [curious-peony-1ab95d.netlify.app](https://curious-peony-1ab95d.netlify.app/)

---

## Descripción

SkiRoute permite al usuario seleccionar un origen y un destino dentro de una estación de esquí y calcular la ruta óptima entre ellos usando el algoritmo A*. La ruta se pinta sobre el mapa y se muestra un itinerario paso a paso con los tramos recorridos.

## Funcionalidades

- Selección de origen y destino con autocompletado
- Cálculo de ruta óptima con algoritmo A*
- Filtro de dificultad máxima (Verde, Azul, Roja, Negra)
- Itinerario con distancia total y tipo de cada tramo
- Panel inferior deslizable con itinerario flotante
- Aviso automático de cierre de remontes a las 15:30 y 16:00
- Soporte para 6 estaciones: Valdesquí, Cerler, Formigal, Astún, Candanchú y Panticosa

## Estaciones disponibles

| Estación | Provincia |
|---|---|
| Valdesquí | Madrid |
| Cerler | Huesca |
| Formigal | Huesca |
| Astún | Huesca |
| Candanchú | Huesca |
| Panticosa | Huesca |

## Tecnologías

**Frontend**
- HTML, CSS y JavaScript
- Leaflet 1.9.4 (mapas interactivos)
- GeoJSON (datos de pistas y remontes)

**Backend**
- Python + FastAPI
- NetworkX (grafo y algoritmo A*)
- PostgreSQL + PostGIS (base de datos espacial)
- psycopg2

**Despliegue**
- Frontend: Netlify
- Backend y base de datos: Render

## Estructura del proyecto

```
skiRoute/
├── frontend/         # Interfaz web (HTML, CSS, JS, GeoJSON)
├── backend/          # API REST (FastAPI)
│   ├── api.py
│   ├── config.py
│   └── routing/
├── scripts/          # Scripts de importación de datos a la BD
└── data/             # Archivos GeoJSON de cada estación
```

## Instalación local

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --port 8001
```

Crea un archivo `.env` en la raíz del proyecto con los datos de tu base de datos:

```
DB_NAME=skiRoute
DB_USER=postgres
DB_PASSWORD=tu_contraseña
DB_HOST=localhost
DB_PORT=5432
```

### Frontend

Abre `frontend/index.html` en el navegador o sírvelo con cualquier servidor estático.

> Asegúrate de que la variable `API_URL` en `frontend/js/mapa.js` apunta a tu backend local (`http://localhost:8001`).
