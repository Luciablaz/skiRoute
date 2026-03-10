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

  let color = "gray";

  if (dificultad === "verde") color = "green";
  if (dificultad === "azul") color = "blue";
  if (dificultad === "roja") color = "red";
  if (dificultad === "negra") color = "black";

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
