// obtener estación desde la URL
const params = new URLSearchParams(window.location.search);
const estacion = params.get("estacion") || "valdesqui";

const centros = {
  valdesqui:   [40.790, -3.970],
  navacerrada: [40.783, -4.013],
  cerler:      [42.570,  0.560],
};

const nombres = {
  valdesqui:   "Valdesquí",
  navacerrada: "Puerto de Navacerrada",
  cerler:      "Cerler",
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
let dificultadMaxima = null; // null = sin restricción
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
  const geom  = feature.geometry;
  const coords = geom.type === "MultiLineString"
    ? geom.coordinates[0]   // primera línea del MultiLineString
    : geom.coordinates;     // LineString normal
  const mid = coords[Math.floor(coords.length / 2)];
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
  const vistos = new Set();
  return todosLosTramos
    .filter(f => {
      const nombre = f.properties.nombre;
      if (!nombre || !nombre.toLowerCase().includes(q)) return false;
      if (vistos.has(nombre)) return false;
      vistos.add(nombre);
      return true;
    })
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

// ── Selector de dificultad máxima ────────────────────────────────────────────
document.querySelectorAll(".btn-dif").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".btn-dif").forEach(b => b.classList.remove("activo"));
    btn.classList.add("activo");
    dificultadMaxima = btn.dataset.dif || null;
  });
});

// ── Modal de error ───────────────────────────────────────────────────────────
function mostrarError(texto) {
  document.getElementById("errorTexto").innerText = texto;
  document.getElementById("errorOverlay").style.display = "flex";
}

document.getElementById("errorBtn").addEventListener("click", () => {
  document.getElementById("errorOverlay").style.display = "none";
});

// ── Calcular y pintar ruta ───────────────────────────────────────────────────
const API_URL = "http://localhost:8001";
let capasRuta = [];

document.getElementById("btnCalcular").addEventListener("click", async () => {
  const btn = document.getElementById("btnCalcular");
  btn.disabled    = true;
  btn.textContent = "Calculando…";

  const idOrigen  = seleccion.origen?.properties?.id_tramo;
  const idDestino = seleccion.destino?.properties?.id_tramo;

  if (!idOrigen || !idDestino) {
    mostrarError("Selecciona un origen y un destino antes de calcular la ruta.");
    btn.disabled    = false;
    btn.textContent = "Calcular ruta";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/ruta`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id_tramo_origen: idOrigen, id_tramo_destino: idDestino, dificultad_maxima: dificultadMaxima }),
    });

    if (!res.ok) {
      const err = await res.json();
      const detalle = err.detail || "No se pudo calcular la ruta.";
      const esNoRuta = detalle.toLowerCase().includes("no existe ruta");
      mostrarError(
        esNoRuta
          ? "No existe una ruta posible entre los puntos seleccionados con la dificultad máxima elegida.\n\nPrueba a cambiar el origen, el destino o ampliar la dificultad máxima."
          : detalle
      );
      return;
    }

    const data = await res.json();
    pintarRuta(data.tramos, data.distancia);
  } catch (e) {
    mostrarError("No se pudo conectar con el servidor.\n¿Está el backend corriendo?");
    console.error(e);
  } finally {
    btn.disabled    = false;
    btn.textContent = "Calcular ruta";
  }
});

function limpiarRuta() {
  capasRuta.forEach(layer => capaGeoJSON.resetStyle(layer));
  capasRuta = [];
  const itinerario = document.getElementById("itinerario");
  if (itinerario) itinerario.style.display = "none";
}

function pintarRuta(tramos, distancia) {
  limpiarRuta();

  const idsRuta = new Set(tramos.map(t => t.id_tramo));

  // Incluir también el nombre del origen y destino seleccionados
  const nombresExtras = new Set();
  if (seleccion.origen?.properties?.nombre)  nombresExtras.add(seleccion.origen.properties.nombre);
  if (seleccion.destino?.properties?.nombre) nombresExtras.add(seleccion.destino.properties.nombre);

  // Paso 1: recoger los nombres de las capas que coinciden por ID
  const nombresRuta = new Set([...nombresExtras]);
  capaGeoJSON.eachLayer(layer => {
    const props = layer.feature?.properties;
    if (props && idsRuta.has(props.id_tramo) && props.nombre) {
      nombresRuta.add(props.nombre);
    }
  });

  // Paso 2: pintar capas de la ruta (naranja) y origen/destino (su color resaltado)
  capaGeoJSON.eachLayer(layer => {
    const props = layer.feature?.properties;
    if (!props) return;
    if (idsRuta.has(props.id_tramo) || nombresRuta.has(props.nombre)) {
      const esOrigenDestino = nombresExtras.has(props.nombre) && !idsRuta.has(props.id_tramo);
      if (esOrigenDestino) {
        layer.setStyle(estiloResaltado(layer.feature));
      } else {
        layer.setStyle({ color: "#f59e0b", weight: 8, opacity: 1 });
      }
      layer.bringToFront();
      capasRuta.push(layer);
    }
  });

  // Mostrar itinerario en el panel
  mostrarItinerario(tramos, distancia);
}

function mostrarItinerario(tramos, distancia) {
  const contenedor = document.getElementById("itinerario");
  const lista      = document.getElementById("itinerarioLista");
  const dist       = document.getElementById("itinerarioDistancia");

  lista.innerHTML = "";

  // Agrupar tramos consecutivos con el mismo nombre
  const tramosAgrupados = tramos.reduce((acc, t) => {
    const feature = todosLosTramos.find(f => f.properties.id_tramo === t.id_tramo);
    const nombre  = feature?.properties?.nombre || t.id_tramo;
    const ultimo  = acc[acc.length - 1];
    if (ultimo && ultimo.nombre === nombre) return acc; // mismo nombre consecutivo → ignorar
    acc.push({ ...t, nombre });
    return acc;
  }, []);

  tramosAgrupados.forEach((t, i) => {
    const nombre  = t.nombre;
    const tipoLower = (t.tipo_tramo || "").toLowerCase();
    const esRemonte = ["telesilla", "telesqui", "telecabina"].includes(tipoLower);
    const dif       = (t.dificultad || "").toLowerCase();

    const paso = document.createElement("div");
    paso.className = "itinerario-paso";
    paso.innerHTML = `
      <span class="paso-num">${i + 1}</span>
      <span class="paso-icono ${esRemonte ? "icono-sube" : "icono-baja"}">${esRemonte ? "▲" : "▼"}</span>
      <span class="paso-nombre">${nombre}</span>
      ${esRemonte
        ? `<span class="drop-badge badge-remonte">${t.tipo_tramo}</span>`
        : t.dificultad ? `<span class="drop-badge badge-${dif}">${t.dificultad}</span>` : ""}
    `;
    lista.appendChild(paso);
  });

  dist.textContent = `Distancia total: ${(distancia / 1000).toFixed(2)} km`;
  contenedor.style.display = "block";
}

// ── Cargar GeoJSON ───────────────────────────────────────────────────────────
// ── Aviso cierre de remontes ─────────────────────────────────────────────────
(function comprobarCierreRemontes() {
  const AVISOS = [
    { hora: 15, min: 30, texto: "Los remontes cierran aproximadamente en 1 hora.\nNo olvides planificar tu retorno a la base antes de las 16:30." },
    { hora: 16, min:  0, texto: "Los remontes cierran en aproximadamente 30 minutos.\n¡Es hora de iniciar el regreso!" },
  ];

  const ahora  = new Date();
  const hh     = ahora.getHours();
  const mm     = ahora.getMinutes();
  const minutos = hh * 60 + mm;

  const aviso = AVISOS.find(a => {
    const inicio = a.hora * 60 + a.min;
    const fin    = inicio + 29;
    return minutos >= inicio && minutos <= fin;
  });

  if (!aviso) return;

  const overlay = document.getElementById("avisoOverlay");
  document.getElementById("avisoTexto").innerText = aviso.texto;
  overlay.style.display = "flex";
  document.getElementById("avisoBtn").addEventListener("click", () => {
    overlay.style.display = "none";
  });
})();

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
