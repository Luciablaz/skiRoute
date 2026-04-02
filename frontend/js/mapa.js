// obtener estación desde la URL
const params = new URLSearchParams(window.location.search);
const estacion = params.get("estacion") || "valdesqui";

const centros = {
  valdesqui:   [40.790, -3.970],
  navacerrada: [40.783, -4.013],
};

const nombres = {
  valdesqui:   "Valdesquí",
  navacerrada: "Puerto de Navacerrada",
};

document.getElementById("titulo-estacion").innerText = nombres[estacion] || estacion;

const centro = centros[estacion] || [40.790, -3.970];
const map = L.map("map", { zoomControl: true }).setView(centro, 14);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

// ── Estado de selección ──────────────────────────────────────────────────────
let modoActivo = null; // 'origen' | 'destino' | null
let seleccion       = { origen: null, destino: null };
let capasResaltadas = { origen: null, destino: null };
let marcadores      = { origen: null, destino: null };
let todosLosTramos  = [];
let capaGeoJSON     = null;

// ── Estilos ──────────────────────────────────────────────────────────────────
function estiloPista(feature) {
  const dificultad = feature.properties.dificultad;
  const tipo       = feature.properties.tipo_tramo;

  if (tipo === "telesilla" || tipo === "telesqui" || tipo === "telecabina") {
    return { color: "#9ca3af", weight: 3, opacity: 0.8 };
  }

  const colores = {
    Verde: "#16a34a",
    Azul:  "#2563eb",
    Roja:  "#dc2626",
    Negra: "#111111",
  };

  return { color: colores[dificultad] || "#8899bb", weight: 4, opacity: 0.9 };
}

const coloresBrillantes = {
  Verde: "#4ade80",
  Azul:  "#60a5fa",
  Roja:  "#f87171",
  Negra: "#6b7280",
};

function estiloResaltado(feature) {
  const base       = estiloPista(feature);
  const dificultad = feature.properties.dificultad;
  const tipo       = feature.properties.tipo_tramo;
  const esRemonteFn = tipo === "telesilla" || tipo === "telesqui" || tipo === "telecabina";

  return {
    ...base,
    color:  esRemonteFn ? "#d1d5db" : (coloresBrillantes[dificultad] || base.color),
    weight: base.weight + 5,
    opacity: 1,
  };
}

// ── Marcadores A / B ─────────────────────────────────────────────────────────
function puntoMedio(feature) {
  const coords = feature.geometry.coordinates;
  const mid    = coords[Math.floor(coords.length / 2)];
  return [mid[1], mid[0]];
}

function crearMarcador(feature, modo) {
  const letra = modo === "origen" ? "A" : "B";
  const icon  = L.divIcon({
    className: "",
    html: `<div class="marcador-seleccion marcador-${modo}">${letra}</div>`,
    iconSize:   [26, 26],
    iconAnchor: [13, 13],
  });
  return L.marker(puntoMedio(feature), { icon, interactive: false }).addTo(map);
}

function quitarMarcador(modo) {
  if (marcadores[modo]) {
    map.removeLayer(marcadores[modo]);
    marcadores[modo] = null;
  }
}

// ── Modo selección ───────────────────────────────────────────────────────────
function activarModo(modo) {
  modoActivo = modo;
  document.getElementById("rowOrigen").classList.toggle("activo", modo === "origen");
  document.getElementById("rowDestino").classList.toggle("activo", modo === "destino");
  map.getContainer().style.cursor = "crosshair";
}

function desactivarModo() {
  modoActivo = null;
  document.getElementById("rowOrigen").classList.remove("activo");
  document.getElementById("rowDestino").classList.remove("activo");
  map.getContainer().style.cursor = "";
}

// ── Seleccionar tramo ────────────────────────────────────────────────────────
function actualizarBotonCalcular() {
  const btn = document.getElementById("btnCalcular");
  btn.style.display = (seleccion.origen && seleccion.destino) ? "block" : "none";
}

function seleccionarTramo(feature, layer) {
  if (!modoActivo) return;
  const modo = modoActivo;

  // quitar resaltado y marcador anterior del mismo slot
  if (capasResaltadas[modo]) {
    capaGeoJSON.resetStyle(capasResaltadas[modo]);
  }
  quitarMarcador(modo);

  layer.setStyle(estiloResaltado(feature));
  layer.bringToFront();
  capasResaltadas[modo] = layer;
  marcadores[modo]      = crearMarcador(feature, modo);
  seleccion[modo]       = feature;

  const inputId = modo === "origen" ? "inputOrigen" : "inputDestino";
  document.getElementById(inputId).value = feature.properties.nombre;

  cerrarDropdowns();
  desactivarModo();
  actualizarBotonCalcular();
}

// ── Autocomplete ─────────────────────────────────────────────────────────────
function filtrarTramos(texto) {
  const q = texto.toLowerCase().trim();
  if (!q) return [];
  return todosLosTramos
    .filter(f => f.properties.nombre && f.properties.nombre.toLowerCase().includes(q))
    .slice(0, 8);
}

function esRemonte(feature) {
  const t = feature.properties.tipo_tramo;
  return t === "telesilla" || t === "telesqui" || t === "telecabina";
}

function mostrarDropdown(dropId, resultados, modo) {
  const drop = document.getElementById(dropId);
  drop.innerHTML = "";

  if (!resultados.length) {
    drop.style.display = "none";
    return;
  }

  resultados.forEach(feature => {
    const remonte = esRemonte(feature);
    const dif     = (feature.properties.dificultad || "").toLowerCase();

    const item = document.createElement("div");
    item.className = "drop-item";
    item.innerHTML = `
      <span class="drop-icono">${remonte ? "⬆" : "⬇"}</span>
      <span class="drop-nombre">${feature.properties.nombre}</span>
      <span class="drop-badge ${remonte ? "badge-remonte" : "badge-" + dif}">
        ${remonte ? "Remonte" : feature.properties.dificultad || ""}
      </span>`;

    item.addEventListener("mousedown", e => {
      e.preventDefault();
      activarModo(modo);
      capaGeoJSON.eachLayer(layer => {
        if (layer.feature === feature) seleccionarTramo(feature, layer);
      });
    });

    drop.appendChild(item);
  });

  drop.style.display = "block";
}

function cerrarDropdowns() {
  document.getElementById("dropOrigen").style.display  = "none";
  document.getElementById("dropDestino").style.display = "none";
}

// ── Eventos de inputs ────────────────────────────────────────────────────────
document.getElementById("inputOrigen").addEventListener("focus", () => activarModo("origen"));
document.getElementById("inputDestino").addEventListener("focus", () => activarModo("destino"));

document.getElementById("inputOrigen").addEventListener("input", e => {
  mostrarDropdown("dropOrigen", filtrarTramos(e.target.value), "origen");
});
document.getElementById("inputDestino").addEventListener("input", e => {
  mostrarDropdown("dropDestino", filtrarTramos(e.target.value), "destino");
});

document.getElementById("clearOrigen").addEventListener("click", () => {
  document.getElementById("inputOrigen").value = "";
  if (capasResaltadas.origen) { capaGeoJSON.resetStyle(capasResaltadas.origen); capasResaltadas.origen = null; }
  quitarMarcador("origen");
  seleccion.origen = null;
  cerrarDropdowns();
  actualizarBotonCalcular();
});
document.getElementById("clearDestino").addEventListener("click", () => {
  document.getElementById("inputDestino").value = "";
  if (capasResaltadas.destino) { capaGeoJSON.resetStyle(capasResaltadas.destino); capasResaltadas.destino = null; }
  quitarMarcador("destino");
  seleccion.destino = null;
  cerrarDropdowns();
  actualizarBotonCalcular();
});

// cerrar al clicar fuera del panel
document.addEventListener("click", e => {
  if (!e.target.closest(".punto-row")) {
    cerrarDropdowns();
    desactivarModo();
  }
});

// click en mapa vacío → desactivar modo
map.on("click", () => {
  if (modoActivo) { desactivarModo(); cerrarDropdowns(); }
});

// ── Cargar GeoJSON ───────────────────────────────────────────────────────────
fetch("data/" + estacion + "/tramos.geojson")
  .then(res => res.json())
  .then(data => {
    todosLosTramos = data.features;

    capaGeoJSON = L.geoJSON(data, {
      style: estiloPista,
      onEachFeature: (feature, layer) => {
        layer.on("click", e => {
          L.DomEvent.stopPropagation(e);
          if (modoActivo) seleccionarTramo(feature, layer);
        });
      },
    }).addTo(map);
  });
