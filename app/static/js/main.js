// Punto de entrada del cliente: carga la configuración, crea la escena 3D y arranca la interfaz.
import { AlmacenApi, servidorDisponible } from "./almacen-api.js";
import { AlmacenLocal } from "./almacen-local.js";
import { Escena3D } from "./escena.js";
import { Interfaz } from "./ui.js";

const CLAVE_AJUSTES = "sprintquest:ajustes";

async function cargarConfig() {
  if (window.__CONFIG_JUEGO__) return window.__CONFIG_JUEGO__;
  const respuesta = await fetch("/config_juego.json");
  return respuesta.json();
}

function leerAjustes() {
  const porDefecto = {
    sonido: true,
    calidad: window.innerWidth < 760 ? "baja" : "alta",
    movimientoReducido: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
  try {
    return { ...porDefecto, ...JSON.parse(localStorage.getItem(CLAVE_AJUSTES) || "{}") };
  } catch {
    return porDefecto;
  }
}

function guardarAjustes(ajustes) {
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
  } catch {
    /* sin almacenamiento: los ajustes duran esta sesión */
  }
}

async function principal() {
  const config = await cargarConfig();
  const ajustes = leerAjustes();
  document.documentElement.classList.toggle("sin-movimiento", ajustes.movimientoReducido);

  let escena = null;
  try {
    escena = new Escena3D(document.getElementById("mundo"), {
      calidad: ajustes.calidad,
      reducirMovimiento: ajustes.movimientoReducido,
    });
  } catch (error) {
    console.warn("WebGL no disponible; el juego sigue sin escena 3D.", error);
    document.body.classList.add("sin-3d");
  }

  const soloSolitario = window.__MODO__ === "solitario";
  const interfaz = new Interfaz({
    raiz: document.getElementById("ui"),
    config,
    escena,
    ajustes,
    guardarAjustes,
    comprobarServidor: () => (soloSolitario ? Promise.resolve(false) : servidorDisponible()),
    crearAlmacenApi: () => new AlmacenApi(),
    crearAlmacenLocal: () => new AlmacenLocal(config),
  });
  window.sprintQuest = { escena, interfaz };
  await interfaz.iniciar(soloSolitario);
}

principal().catch((error) => {
  console.error(error);
  document.getElementById("ui").innerHTML =
    `<div class="pantalla pantalla-centro"><p class="carga">No se pudo iniciar el juego: ${String(error.message)}</p></div>`;
});
