// Lee el parámetro de estación desde la URL para saber qué datos cargar
const params = new URLSearchParams(window.location.search);
const estacion = params.get("estacion") || "valdesqui";

// Coordenadas del centro del mapa para cada estación
const centros = {
  formigal: [42.77341, -0.40996],
  astun: [42.80391, -0.49816],
  candanchu: [42.78284, -0.53733],
  valdesqui: [40.79735, -3.97303],
  cerler: [42.55688, 0.55291],
  panticosa: [42.70083, -0.27218],
};

// Nombres legibles de cada estación para mostrar en la barra superior
const nombres = {
  formigal: "Formigal",
  astun: "Astún",
  candanchu: "Candanchú",
  valdesqui: "Valdesquí",
  cerler: "Cerler",
  panticosa: "Panticosa",
};

// Muestra el nombre de la estación en la barra superior
document.getElementById("titulo-estacion").innerText =
  nombres[estacion] || estacion;

// Inicializa el mapa centrado en la estación seleccionada
const centro = centros[estacion] || [40.79735, -3.97303];
const map = L.map("map", { zoomControl: false }).setView(centro, 14);
L.control.zoom({ position: "topright" }).addTo(map);

// Capa base de mapa en estilo claro de CartoCDN
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

// Variables de estado de la selección de origen y destino
let dificultadMaxima = null; // null = sin restricción
let modoActivo = null; // 'origen' | 'destino' | null
let seleccion = { origen: null, destino: null };
let capasResaltadas = { origen: null, destino: null };
let marcadores = { origen: null, destino: null };
let todosLosTramos = [];
let capaGeoJSON = null;

// Devuelve el estilo por defecto de cada tramo según su tipo y dificultad
function estiloPista(feature) {
  const dificultad = feature.properties.dificultad;
  const tipo = feature.properties.tipo_tramo;

  if (tipo === "telesilla" || tipo === "telesqui" || tipo === "telecabina") {
    return { color: "#9ca3af", weight: 3, opacity: 0.8 };
  }

  const colores = {
    Verde: "#16a34a",
    Azul: "#2563eb",
    Roja: "#dc2626",
    Negra: "#111111",
    "Fuera de pista": "#92400e",
  };

  return { color: colores[dificultad] || "#8899bb", weight: 4, opacity: 0.9 };
}

// Versión más brillante de cada color para resaltar tramos seleccionados
const coloresBrillantes = {
  Verde: "#4ade80",
  Azul: "#60a5fa",
  Roja: "#f87171",
  Negra: "#6b7280",
  "Fuera de pista": "#b45309",
};

// Devuelve el estilo resaltado de un tramo (más grueso y con color más claro)
function estiloResaltado(feature) {
  const base = estiloPista(feature);
  const dificultad = feature.properties.dificultad;
  const tipo = feature.properties.tipo_tramo;
  const esRemonteFn =
    tipo === "telesilla" || tipo === "telesqui" || tipo === "telecabina";

  return {
    ...base,
    color: esRemonteFn
      ? "#d1d5db"
      : coloresBrillantes[dificultad] || base.color,
    weight: base.weight + 5,
    opacity: 1,
  };
}

// Calcula el punto central de un tramo para colocar el marcador A o B
function puntoMedio(feature) {
  const geom = feature.geometry;
  const coords =
    geom.type === "MultiLineString"
      ? geom.coordinates[0] // primera línea del MultiLineString
      : geom.coordinates; // LineString normal
  const mid = coords[Math.floor(coords.length / 2)];
  return [mid[1], mid[0]];
}

// Crea el marcador circular con la letra A (origen) o B (destino) sobre el mapa
function crearMarcador(feature, modo) {
  const letra = modo === "origen" ? "A" : "B";
  const icon = L.divIcon({
    className: "",
    html: `<div class="marcador-seleccion marcador-${modo}">${letra}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
  return L.marker(puntoMedio(feature), { icon, interactive: false }).addTo(map);
}

// Elimina el marcador de origen o destino del mapa
function quitarMarcador(modo) {
  if (marcadores[modo]) {
    map.removeLayer(marcadores[modo]);
    marcadores[modo] = null;
  }
}

// Activa el modo de selección (origen o destino) y cambia el cursor del mapa
function activarModo(modo) {
  modoActivo = modo;
  document
    .getElementById("rowOrigen")
    .classList.toggle("activo", modo === "origen");
  document
    .getElementById("rowDestino")
    .classList.toggle("activo", modo === "destino");
  map.getContainer().style.cursor = "crosshair";
}

// Desactiva el modo de selección y restaura el cursor normal
function desactivarModo() {
  modoActivo = null;
  document.getElementById("rowOrigen").classList.remove("activo");
  document.getElementById("rowDestino").classList.remove("activo");
  map.getContainer().style.cursor = "";
}

// Muestra u oculta el botón de calcular según si hay origen y destino seleccionados
function actualizarBotonCalcular() {
  const btn = document.getElementById("btnCalcular");
  btn.style.display = seleccion.origen && seleccion.destino ? "block" : "none";
}

// Registra el tramo clicado como origen o destino y actualiza el mapa y el formulario
function seleccionarTramo(feature, layer) {
  if (!modoActivo) return;
  const modo = modoActivo;

  // Quita el resaltado y el marcador anterior del mismo slot
  if (capasResaltadas[modo]) {
    capaGeoJSON.resetStyle(capasResaltadas[modo]);
  }
  quitarMarcador(modo);

  layer.setStyle(estiloResaltado(feature));
  layer.bringToFront();
  capasResaltadas[modo] = layer;
  marcadores[modo] = crearMarcador(feature, modo);
  seleccion[modo] = feature;

  const inputId = modo === "origen" ? "inputOrigen" : "inputDestino";
  document.getElementById(inputId).value = feature.properties.nombre;

  cerrarDropdowns();
  desactivarModo();
  actualizarBotonCalcular();
}

// Filtra los tramos que coinciden con el texto escrito, sin repetir nombres
function filtrarTramos(texto) {
  const q = texto.toLowerCase().trim();
  if (!q) return [];
  const vistos = new Set();
  return todosLosTramos
    .filter((f) => {
      const nombre = f.properties.nombre;
      if (!nombre || !nombre.toLowerCase().includes(q)) return false;
      if (vistos.has(nombre)) return false;
      vistos.add(nombre);
      return true;
    })
    .slice(0, 8);
}

// Comprueba si un tramo es un remonte (sube al esquiador)
function esRemonte(feature) {
  const t = feature.properties.tipo_tramo;
  return t === "telesilla" || t === "telesqui" || t === "telecabina";
}

// Construye y muestra la lista de sugerencias bajo el campo de texto
function mostrarDropdown(dropId, resultados, modo) {
  const drop = document.getElementById(dropId);
  drop.innerHTML = "";

  if (!resultados.length) {
    drop.style.display = "none";
    return;
  }

  resultados.forEach((feature) => {
    const remonte = esRemonte(feature);
    const difRaw = feature.properties.dificultad || "";
    // Convierte "Fuera de pista" al nombre de clase CSS equivalente
    const dif = difRaw === "Fuera de pista" ? "freeride" : difRaw.toLowerCase();
    const etiquetaDif = difRaw;

    const item = document.createElement("div");
    item.className = "drop-item";
    item.innerHTML = `
      <span class="drop-icono">${remonte ? "⬆" : "⬇"}</span>
      <span class="drop-nombre">${feature.properties.nombre}</span>
      <span class="drop-badge ${remonte ? "badge-remonte" : "badge-" + dif}">
        ${remonte ? "Remonte" : etiquetaDif}
      </span>`;

    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      activarModo(modo);
      capaGeoJSON.eachLayer((layer) => {
        if (layer.feature === feature) seleccionarTramo(feature, layer);
      });
    });

    drop.appendChild(item);
  });

  drop.style.display = "block";
}

// Oculta ambos desplegables de autocompletado
function cerrarDropdowns() {
  document.getElementById("dropOrigen").style.display = "none";
  document.getElementById("dropDestino").style.display = "none";
}

// Al enfocar un campo, activa el modo de selección correspondiente
document
  .getElementById("inputOrigen")
  .addEventListener("focus", () => activarModo("origen"));
document
  .getElementById("inputDestino")
  .addEventListener("focus", () => activarModo("destino"));

// Al escribir en un campo, actualiza las sugerencias del desplegable
document.getElementById("inputOrigen").addEventListener("input", (e) => {
  mostrarDropdown("dropOrigen", filtrarTramos(e.target.value), "origen");
});
document.getElementById("inputDestino").addEventListener("input", (e) => {
  mostrarDropdown("dropDestino", filtrarTramos(e.target.value), "destino");
});

// Botón × para limpiar el campo de origen
document.getElementById("clearOrigen").addEventListener("click", () => {
  document.getElementById("inputOrigen").value = "";
  if (capasResaltadas.origen) {
    capaGeoJSON.resetStyle(capasResaltadas.origen);
    capasResaltadas.origen = null;
  }
  quitarMarcador("origen");
  seleccion.origen = null;
  cerrarDropdowns();
  actualizarBotonCalcular();
});

// Botón × para limpiar el campo de destino
document.getElementById("clearDestino").addEventListener("click", () => {
  document.getElementById("inputDestino").value = "";
  if (capasResaltadas.destino) {
    capaGeoJSON.resetStyle(capasResaltadas.destino);
    capasResaltadas.destino = null;
  }
  quitarMarcador("destino");
  seleccion.destino = null;
  cerrarDropdowns();
  actualizarBotonCalcular();
});

// Cierra los desplegables al hacer clic fuera del panel
document.addEventListener("click", (e) => {
  if (!e.target.closest(".punto-row")) {
    cerrarDropdowns();
    desactivarModo();
  }
});

// El handle colapsa y expande el panel al hacer clic
// Alterna entre el itinerario del panel y el flotante si hay ruta calculada
document.getElementById("panelHandle").addEventListener("click", () => {
  const panel = document.getElementById("bottomPanel");
  const handle = document.getElementById("panelHandle");
  panel.classList.toggle("colapsado");
  const colapsado = panel.classList.contains("colapsado");
  // Flecha abajo cuando está expandido, flecha arriba cuando está colapsado
  handle.innerHTML = colapsado ? "↑" : "↓";

  const flotante = document.getElementById("itinerario");
  const panelItinerario = document.getElementById("itinerarioPanel");
  const hayRuta = flotante.dataset.tieneRuta === "true";

  if (hayRuta) {
    flotante.style.display = colapsado ? "block" : "none";
    panelItinerario.style.display = colapsado ? "none" : "block";
  }
});

// Al hacer clic en el mapa desactiva el modo de selección activo
map.on("click", () => {
  if (modoActivo) {
    desactivarModo();
    cerrarDropdowns();
  }
});

// Selector de dificultad máxima: marca el botón activo y guarda el valor
document.querySelectorAll(".btn-dif").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".btn-dif")
      .forEach((b) => b.classList.remove("activo"));
    btn.classList.add("activo");
    dificultadMaxima = btn.dataset.dif || null;
  });
});

// Muestra el modal de error con el mensaje indicado
function mostrarError(texto) {
  document.getElementById("errorTexto").innerText = texto;
  document.getElementById("errorOverlay").style.display = "flex";
}

// Cierra el modal de error al pulsar el botón
document.getElementById("errorBtn").addEventListener("click", () => {
  document.getElementById("errorOverlay").style.display = "none";
});

// URL base de la API del backend
const API_URL = "http://localhost:8001";
let capasRuta = [];

// Envía la solicitud de ruta al backend y pinta el resultado en el mapa
document.getElementById("btnCalcular").addEventListener("click", async () => {
  const btn = document.getElementById("btnCalcular");
  btn.disabled = true;
  btn.textContent = "Calculando…";

  const idOrigen = seleccion.origen?.properties?.id_tramo;
  const idDestino = seleccion.destino?.properties?.id_tramo;

  if (!idOrigen || !idDestino) {
    mostrarError(
      "Selecciona un origen y un destino antes de calcular la ruta.",
    );
    btn.disabled = false;
    btn.textContent = "Calcular ruta";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/ruta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_tramo_origen: idOrigen,
        id_tramo_destino: idDestino,
        dificultad_maxima: dificultadMaxima,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      const detalle = err.detail || "No se pudo calcular la ruta.";
      const esNoRuta = detalle.toLowerCase().includes("no existe ruta");
      mostrarError(
        esNoRuta
          ? "No existe una ruta posible entre los puntos seleccionados con la dificultad máxima elegida.\n\nPrueba a cambiar el origen, el destino o ampliar la dificultad máxima."
          : detalle,
      );
      return;
    }

    const data = await res.json();
    pintarRuta(data.tramos, data.distancia);
  } catch (e) {
    mostrarError(
      "No se pudo conectar con el servidor.\n¿Está el backend corriendo?",
    );
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Calcular ruta";
  }
});

// Restaura el estilo original de todas las capas que formaban la ruta anterior
function limpiarRuta() {
  capasRuta.forEach((layer) => capaGeoJSON.resetStyle(layer));
  capasRuta = [];
  const itinerario = document.getElementById("itinerario");
  if (itinerario) {
    itinerario.style.display = "none";
    itinerario.dataset.tieneRuta = "false";
  }
  const panelItinerario = document.getElementById("itinerarioPanel");
  if (panelItinerario) panelItinerario.style.display = "none";
}

// Pinta en el mapa los tramos de la ruta calculada
function pintarRuta(tramos, distancia) {
  limpiarRuta();

  const idsRuta = new Set(tramos.map((t) => t.id_tramo));

  // Recoge los nombres del origen y destino para pintar también sus segmentos completos
  const nombresExtras = new Set();
  if (seleccion.origen?.properties?.nombre)
    nombresExtras.add(seleccion.origen.properties.nombre);
  if (seleccion.destino?.properties?.nombre)
    nombresExtras.add(seleccion.destino.properties.nombre);

  // Paso 1: reúne todos los nombres de tramos que aparecen en la ruta por ID
  const nombresRuta = new Set([...nombresExtras]);
  capaGeoJSON.eachLayer((layer) => {
    const props = layer.feature?.properties;
    if (props && idsRuta.has(props.id_tramo) && props.nombre) {
      nombresRuta.add(props.nombre);
    }
  });

  // Paso 2: pinta en naranja los tramos de la ruta y con color resaltado el origen y destino
  capaGeoJSON.eachLayer((layer) => {
    const props = layer.feature?.properties;
    if (!props) return;
    if (idsRuta.has(props.id_tramo) || nombresRuta.has(props.nombre)) {
      const esOrigenDestino =
        nombresExtras.has(props.nombre) && !idsRuta.has(props.id_tramo);
      if (esOrigenDestino) {
        layer.setStyle(estiloResaltado(layer.feature));
      } else {
        layer.setStyle({ color: "#f59e0b", weight: 8, opacity: 1 });
      }
      layer.bringToFront();
      capasRuta.push(layer);
    }
  });

  mostrarItinerario(tramos, distancia);
}

// Construye los pasos del itinerario y devuelve el HTML generado
function construirPasosItinerario(tramos) {
  const tramosAgrupados = tramos.reduce((acc, t) => {
    const feature = todosLosTramos.find(
      (f) => f.properties.id_tramo === t.id_tramo,
    );
    const nombre = feature?.properties?.nombre || t.id_tramo;
    const ultimo = acc[acc.length - 1];
    if (ultimo && ultimo.nombre === nombre) return acc;
    acc.push({ ...t, nombre });
    return acc;
  }, []);

  return tramosAgrupados.map((t, i) => {
    const tipoLower = (t.tipo_tramo || "").toLowerCase();
    const esRemonte = ["telesilla", "telesqui", "telecabina"].includes(tipoLower);
    const dif = (t.dificultad || "").toLowerCase();
    return `
      <div class="itinerario-paso">
        <span class="paso-num">${i + 1}</span>
        <span class="paso-icono ${esRemonte ? "icono-sube" : "icono-baja"}">${esRemonte ? "▲" : "▼"}</span>
        <span class="paso-nombre">${t.nombre}</span>
        ${esRemonte
          ? `<span class="drop-badge badge-remonte">${t.tipo_tramo}</span>`
          : t.dificultad
            ? `<span class="drop-badge badge-${t.dificultad === "Fuera de pista" ? "freeride" : dif}">${t.dificultad}</span>`
            : ""}
      </div>`;
  }).join("");
}

// Muestra el itinerario en el panel (expandido) o flotante (colapsado) según el estado
function mostrarItinerario(tramos, distancia) {
  const panelColapsado = document.getElementById("bottomPanel").classList.contains("colapsado");
  const html = construirPasosItinerario(tramos);
  const distTexto = `Distancia total: ${(distancia / 1000).toFixed(2)} km`;

  // Rellena y muestra el itinerario del panel
  document.getElementById("itinerarioListaPanel").innerHTML = html;
  document.getElementById("itinerarioDistanciaPanel").textContent = distTexto;
  document.getElementById("itinerarioPanel").style.display = panelColapsado ? "none" : "block";

  // Rellena y muestra el itinerario flotante
  document.getElementById("itinerarioLista").innerHTML = html;
  document.getElementById("itinerarioDistancia").textContent = distTexto;
  const flotante = document.getElementById("itinerario");
  flotante.dataset.tieneRuta = "true";
  flotante.style.display = panelColapsado ? "block" : "none";
}

// Comprueba la hora actual y muestra un aviso si los remontes están a punto de cerrar
(function comprobarCierreRemontes() {
  const AVISOS = [
    {
      hora: 15,
      min: 30,
      texto:
        "Los remontes cierran aproximadamente en 1 hora.\nNo olvides planificar tu retorno a la base antes de las 16:30.",
    },
    {
      hora: 16,
      min: 0,
      texto:
        "Los remontes cierran en aproximadamente 30 minutos.\n¡Es hora de iniciar el regreso!",
    },
  ];

  const ahora = new Date();
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();

  // Busca si la hora actual cae dentro de la ventana de alguno de los avisos
  const aviso = AVISOS.find((a) => {
    const inicio = a.hora * 60 + a.min;
    return minutos >= inicio && minutos <= inicio + 29;
  });

  if (!aviso) return;

  const overlay = document.getElementById("avisoOverlay");
  document.getElementById("avisoTexto").innerText = aviso.texto;
  overlay.style.display = "flex";
  document.getElementById("avisoBtn").addEventListener("click", () => {
    overlay.style.display = "none";
  });
})();

// Carga el GeoJSON de la estación y lo añade al mapa con los estilos de pista
fetch("data/" + estacion + "/tramos.geojson")
  .then((res) => res.json())
  .then((data) => {
    todosLosTramos = data.features;

    capaGeoJSON = L.geoJSON(data, {
      style: estiloPista,
      onEachFeature: (feature, layer) => {
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (modoActivo) seleccionarTramo(feature, layer);
        });
      },
    }).addTo(map);
  });
