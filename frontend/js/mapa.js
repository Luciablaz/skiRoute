// obtener estación desde la URL
const params = new URLSearchParams(window.location.search);
const estacion = params.get("estacion");

// título
document.getElementById("titulo-estacion").innerText = "Estación: " + estacion;

// crear mapa centrado en Valdesquí (luego lo automatizaremos)
var map = L.map("map").setView([40.79, -3.97], 14);

// capa base
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

// función para colorear pistas
function estiloPista(feature) {
  const dificultad = feature.properties.dificultad;
  const tipo = feature.properties.tipo_tramo;

  // remontes
  if (tipo === "telesilla" || tipo === "telesqui" || tipo === "telecabina") {
    return {
      color: "gray",
      weight: 3,
      dashArray: "5,5",
    };
  }

  // pistas
  let color = "gray";

  if (dificultad === "Verde") color = "green";
  if (dificultad === "Azul") color = "blue";
  if (dificultad === "Roja") color = "red";
  if (dificultad === "Negra") color = "black";

  return {
    color: color,
    weight: 4,
  };
}

// cargar geojson de pistas
fetch("data/" + estacion + "/tramos.geojson")
  .then((res) => res.json())
  .then((data) => {
    L.geoJSON(data, {
      style: estiloPista,
    }).addTo(map);
  });
