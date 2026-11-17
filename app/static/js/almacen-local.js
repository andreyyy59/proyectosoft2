// Almacén solitario: todo se guarda en este navegador (localStorage) y las reglas se
// calculan con reglas.js. Sirve como respaldo si el servidor no está disponible.
import {
  aFechaISO,
  calcularEstadisticas,
  calcularPuntos,
  calcularRacha,
  diaSemana,
  esDiaHabil,
  evaluarInsignias,
  minutos,
  nivelPara,
  rachaMaxima,
  rachaVigente,
  sumarDias,
  validarReporte,
} from "./reglas.js";

const CLAVE = "sprintquest:solitario:v1";
let memoria = null; // respaldo si el navegador bloquea localStorage

function leer() {
  try {
    const texto = localStorage.getItem(CLAVE);
    if (texto) return JSON.parse(texto);
  } catch {
    /* almacenamiento no disponible */
  }
  return memoria;
}

function escribir(datos) {
  memoria = datos;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    /* se queda en memoria */
  }
}

function relojSimulado() {
  try {
    const valor = new URLSearchParams(window.location.search).get("simular");
    if (valor && !Number.isNaN(Date.parse(valor))) return new Date(valor);
  } catch {
    /* sin URL */
  }
  return null;
}

export class AlmacenLocal {
  constructor(config) {
    this.modo = "solitario";
    this.config = config;
    this.simulado = relojSimulado();
  }

  ahora() {
    return this.simulado ? new Date(this.simulado) : new Date();
  }

  datos() {
    return leer();
  }

  guardar(datos) {
    escribir(datos);
  }

  evento(datos, tipo, extra = {}) {
    datos.eventos.push({ id: datos.eventos.length + 1, tipo, datos: extra, creado_en: this.ahora().toISOString() });
    if (datos.eventos.length > 500) datos.eventos.splice(0, datos.eventos.length - 500);
  }

  // ---------- Sesión ----------
  async sesionActual() {
    const d = this.datos();
    return d?.usuario ?? null;
  }

  async crearPerfil({ alias, perfil, equipo }) {
    alias = String(alias || "").trim();
    if (!/^[A-Za-z0-9_.-]{3,40}$/.test(alias)) {
      throw new Error("El alias debe tener de 3 a 40 letras, números, punto, guion o guion bajo.");
    }
    if (!this.config.perfiles[perfil]) throw new Error("Elige tu perfil.");
    const datos = {
      usuario: { id: 1, alias, perfil, equipo: String(equipo || "").trim() || "Mi equipo", es_admin: false, consintio: false },
      puntos: 0,
      reportes: [],
      insignias: {},
      eventos: [],
      parametros: { hora_limite: this.config.hora_limite_por_defecto, meta_equipo: this.config.meta_equipo_por_defecto },
    };
    this.evento(datos, "perfil_creado", { perfil });
    this.guardar(datos);
    return datos.usuario;
  }

  async salir() {
    const d = this.datos();
    if (d) {
      this.evento(d, "sesion_cerrada");
      this.guardar(d);
    }
  }

  async borrarTodo() {
    memoria = null;
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      /* nada */
    }
  }

  async aceptarConsentimiento() {
    const d = this.datos();
    d.usuario.consintio = true;
    d.usuario.fecha_consentimiento = this.ahora().toISOString();
    this.evento(d, "consentimiento_aceptado");
    this.guardar(d);
  }

  // ---------- Juego ----------
  async estado() {
    const d = this.datos();
    const ahora = this.ahora();
    const hoy = aFechaISO(ahora);
    const reportes = [...d.reportes].sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1));
    const fechas = new Set(d.reportes.filter((r) => r.a_tiempo && !r.duplicado).map((r) => r.fecha));
    return {
      modo: "solitario",
      usuario: d.usuario,
      puntos: d.puntos,
      nivel: nivelPara(d.puntos, this.config.niveles),
      racha: rachaVigente(fechas, hoy),
      racha_maxima: rachaMaxima(fechas),
      reporto_hoy: d.reportes.some((r) => r.fecha === hoy && !r.duplicado),
      hoy,
      ahora: ahora.toTimeString().slice(0, 5),
      hora_limite: d.parametros.hora_limite,
      insignias: this.config.insignias
        .filter((i) => !i.perfil || i.perfil === d.usuario.perfil)
        .map((i) => ({ codigo: i.codigo, obtenida: Boolean(d.insignias[i.codigo]), fecha: d.insignias[i.codigo] ?? null })),
      reportes: reportes.slice(0, 60),
      estadisticas: calcularEstadisticas(d.reportes, d.usuario.perfil, this.config),
    };
  }

  async registrarReporte(entrada) {
    const d = this.datos();
    if (!d.usuario.consintio) throw new Error("Primero debes aceptar el consentimiento informado.");
    const limpio = validarReporte(d.usuario.perfil, entrada, this.config);
    const momento = this.ahora();
    const fecha = aFechaISO(momento);
    const hora = momento.toTimeString().slice(0, 5);
    const limite = d.parametros.hora_limite;

    const esDuplicado = d.reportes.some((r) => r.fecha === fecha && !r.duplicado);
    const aTiempo = minutos(hora) <= minutos(limite) && !esDuplicado;
    const fechas = new Set(d.reportes.filter((r) => r.a_tiempo && !r.duplicado).map((r) => r.fecha));
    if (aTiempo) fechas.add(fecha);
    const racha = aTiempo ? calcularRacha(fechas, fecha) : 0;

    const resultado = calcularPuntos({
      fecha, hora, hora_limite: limite,
      tiene_evidencia: limpio.evidencia_tipo !== "ninguna",
      reporto_bloqueo: Boolean(limpio.bloqueo),
      racha, es_duplicado: esDuplicado,
    }, this.config);
    const retraso = minutos(hora) <= minutos(limite) ? 0 : minutos(hora) - minutos(limite);

    const nivelAntes = nivelPara(d.puntos, this.config.niveles);
    const reporte = {
      id: d.reportes.length + 1, fecha, hora, ...limpio,
      a_tiempo: aTiempo, duplicado: esDuplicado, minutos_retraso: retraso,
      puntos: resultado.total, desglose: resultado.desglose,
    };
    d.reportes.push(reporte);
    d.puntos += resultado.total;
    const nivelDespues = nivelPara(d.puntos, this.config.niveles);

    const est = calcularEstadisticas(d.reportes, d.usuario.perfil, this.config);
    const nuevas = evaluarInsignias(est, d.usuario.perfil, this.config).filter((c) => !d.insignias[c]);
    for (const c of nuevas) d.insignias[c] = momento.toISOString();

    this.evento(d, "reporte_registrado", { reporte_id: reporte.id, a_tiempo: aTiempo, duplicado: esDuplicado, minutos_retraso: retraso });
    this.evento(d, "puntos_otorgados", resultado);
    for (const c of nuevas) this.evento(d, "insignia_obtenida", { codigo: c });
    if (nivelDespues.numero > nivelAntes.numero) this.evento(d, "nivel_subido", { de: nivelAntes.numero, a: nivelDespues.numero });
    this.guardar(d);

    return {
      reporte, resultado, racha, nuevas_insignias: nuevas,
      nivel_antes: nivelAntes, nivel_despues: nivelDespues,
      subio_nivel: nivelDespues.numero > nivelAntes.numero,
    };
  }

  async equipo() {
    const d = this.datos();
    const hoy = aFechaISO(this.ahora());
    const lunes = sumarDias(hoy, -diaSemana(hoy));
    const dias = [0, 1, 2, 3, 4].map((i) => sumarDias(lunes, i)).filter((x) => x <= hoy);
    const aTiempo = d.reportes.filter((r) => r.a_tiempo && !r.duplicado && r.fecha >= lunes && r.fecha <= hoy).length;
    const porcentaje = dias.length ? Math.round((1000 * aTiempo) / dias.length) / 10 : 0;
    const meta = d.parametros.meta_equipo;
    return {
      semana_desde: lunes, dias_habiles: dias.length, meta,
      equipos: [{ equipo: d.usuario.equipo, miembros: 1, a_tiempo: aTiempo, puntos: d.puntos, esperado: dias.length, porcentaje, cumplida: porcentaje >= meta }],
    };
  }

  telemetria(vista) {
    const d = this.datos();
    if (!d) return;
    this.evento(d, "vista_abierta", { vista });
    this.guardar(d);
  }

  // ---------- "Administrador" local (solo con tus propios datos) ----------
  async indicadores(desde, hasta) {
    const d = this.datos();
    hasta = hasta || aFechaISO(this.ahora());
    desde = desde || sumarDias(hasta, -6);
    const dias = [];
    for (let x = desde; x <= hasta; x = sumarDias(x, 1)) dias.push(x);
    const habiles = dias.filter(esDiaHabil);
    const rep = d.reportes.filter((r) => !r.duplicado && r.fecha >= desde && r.fecha <= hasta);
    const aTiempoHabil = new Set(rep.filter((r) => r.a_tiempo && esDiaHabil(r.fecha)).map((r) => r.fecha));
    const tardios = rep.filter((r) => !r.a_tiempo).map((r) => r.minutos_retraso);
    const redondear = (v) => Math.round(v * 10) / 10;
    return {
      desde, hasta, jugadores: 1, dias_habiles: habiles.length, reportes: rep.length,
      eventos: d.eventos.length, hay_demo: false,
      indicadores: {
        tasa_a_tiempo: habiles.length ? redondear((100 * aTiempoHabil.size) / habiles.length) : null,
        tasa_evidencia: rep.length ? redondear((100 * rep.filter((r) => r.evidencia_tipo !== "ninguna").length) / rep.length) : null,
        retraso_promedio_min: tardios.length ? redondear(tardios.reduce((a, b) => a + b, 0) / tardios.length) : null,
      },
      serie: dias.map((x) => {
        const del = rep.filter((r) => r.fecha === x);
        return {
          fecha: x, habil: esDiaHabil(x),
          participacion: del.length ? 100 : 0,
          a_tiempo: del.some((r) => r.a_tiempo) ? 100 : 0,
          reportes: del.length,
        };
      }),
      equipos: await this.equipo(),
    };
  }

  async descargar(nombre) {
    const d = this.datos();
    let csv = "";
    if (nombre === "reportes") {
      csv = "jugador,perfil,fecha,hora,a_tiempo,duplicado,minutos_retraso,evidencia_tipo,con_bloqueo,avance,horas,puntos\n";
      for (const r of d.reportes) {
        csv += ["J01", d.usuario.perfil, r.fecha, r.hora, +r.a_tiempo, +r.duplicado, r.minutos_retraso,
          r.evidencia_tipo, +Boolean(r.bloqueo), r.avance, r.horas, r.puntos].join(",") + "\n";
      }
    } else {
      csv = "id,jugador,tipo,creado_en\n" + d.eventos.map((e) => [e.id, "J01", e.tipo, e.creado_en].join(",")).join("\n");
    }
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `sprintquest_${nombre}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
