// Almacén en línea: habla con la API de Flask. Misma interfaz que AlmacenLocal
// (patrón Adapter): la interfaz del juego no sabe en qué modo está.

async function pedir(metodo, ruta, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: cuerpo ? { "Content-Type": "application/json" } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
  }
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error || `El servidor respondió ${respuesta.status}.`);
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}

export async function servidorDisponible(msEspera = 2500) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), msEspera);
  try {
    const r = await fetch("/api/salud", { signal: control.signal });
    if (!r.ok) return false;
    const datos = await r.json();
    return datos.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

export class AlmacenApi {
  constructor() {
    this.modo = "en_linea";
  }

  async sesionActual() {
    try {
      const datos = await pedir("GET", "/api/yo");
      return datos.usuario;
    } catch (e) {
      if (e.estado === 401) return null;
      throw e;
    }
  }

  entrar(alias, pin) {
    return pedir("POST", "/api/sesion", { alias, pin }).then((d) => d.usuario);
  }

  salir() {
    return pedir("DELETE", "/api/sesion");
  }

  estado() {
    return pedir("GET", "/api/yo");
  }

  aceptarConsentimiento() {
    return pedir("POST", "/api/consentimiento");
  }

  registrarReporte(datos) {
    return pedir("POST", "/api/reportes", datos);
  }

  equipo() {
    return pedir("GET", "/api/equipo");
  }

  telemetria(vista) {
    pedir("POST", "/api/telemetria", { vista }).catch(() => {});
  }

  // ---------- Administrador ----------
  indicadores(desde, hasta) {
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    return pedir("GET", `/api/admin/indicadores?${q}`);
  }

  jugadores() {
    return pedir("GET", "/api/admin/jugadores").then((d) => d.jugadores);
  }

  crearJugador(datos) {
    return pedir("POST", "/api/admin/jugadores", datos);
  }

  editarJugador(id, datos) {
    return pedir("PATCH", `/api/admin/jugadores/${id}`, datos);
  }

  configuracion() {
    return pedir("GET", "/api/admin/config");
  }

  cambiarConfiguracion(datos) {
    return pedir("PUT", "/api/admin/config", datos);
  }

  eventos(limite = 40) {
    return pedir("GET", `/api/admin/eventos?limite=${limite}`).then((d) => d.eventos);
  }

  async descargar(nombre) {
    window.location.href = `/api/admin/exportar/${nombre}.csv`;
  }
}
