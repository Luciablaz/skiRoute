// obtener estación desde la URL
const params = new URLSearchParams(window.location.search);
const estacion = params.get("estacion") || "valdesqui";

// centros por estación
const centros = {
  valdesqui:    [40.790, -3.970],
  navacerrada:  [40.783, -4.013],
};

// nombres legibles
const nombres = {
  valdesqui:   "Valdesquí",
  navacerrada: "Puerto de Navacerrada",
};

// título en la barra superior
document.getElementById("titulo-estacion").innerText = nombres[estacion] || estacion;

// crear mapa
const centro = centros[estacion] || [40.790, -3.970];
const map = L.map("map", { zoomControl: true }).setView(centro, 14);

// capa base clara (CartoDB Positron — gratuita, sin API key)
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

// función para colorear pistas
function estiloPista(feature) {
  const dificultad = feature.properties.dificultad;
  const tipo = feature.properties.tipo_tramo;

  if (tipo === "telesilla" || tipo === "telesqui" || tipo === "telecabina") {
    return { color: "#9ca3af", weight: 2, dashArray: "5,5", opacity: 0.9 };
  }

  const colores = {
    Verde: "#16a34a",
    Azul:  "#2563eb",
    Roja:  "#dc2626",
    Negra: "#111111",
  };

  return {
    color: colores[dificultad] || "#8899bb",
    weight: 4,
    opacity: 0.9,
  };
}

// cargar geojson de pistas
fetch("data/" + estacion + "/tramos.geojson")
  .then((res) => res.json())
  .then((data) => {
    L.geoJSON(data, { style: estiloPista }).addTo(map);
  });
