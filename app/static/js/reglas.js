// Motor de reglas en JavaScript: copia fiel de app/reglas (Python) para el modo solitario
// y para la vista previa de puntos. Ambos motores se prueban contra
// compartido/escenarios_reglas.json, así que deben dar los mismos resultados.

const MS_DIA = 86400000;

// ---------- Fechas (siempre como texto AAAA-MM-DD, sin zonas horarias) ----------
export function aFechaISO(d) {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${a}-${m}-${dia}`;
}

function aUTC(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function desdeUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function diaSemana(iso) {
  // 0 = lunes ... 6 = domingo (igual que date.weekday() en Python)
  return (new Date(aUTC(iso)).getUTCDay() + 6) % 7;
}

export function esDiaHabil(iso) {
  return diaSemana(iso) < 5;
}

export function sumarDias(iso, n) {
  return desdeUTC(aUTC(iso) + n * MS_DIA);
}

export function diaHabilAnterior(iso) {
  let d = sumarDias(iso, -1);
  while (!esDiaHabil(d)) d = sumarDias(d, -1);
  return d;
}

function siguienteHabil(iso) {
  let d = sumarDias(iso, 1);
  while (!esDiaHabil(d)) d = sumarDias(d, 1);
  return d;
}

export function minutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ---------- Rachas ----------
export function calcularRacha(fechas, hasta) {
  const conjunto = fechas instanceof Set ? fechas : new Set(fechas);
  if (!esDiaHabil(hasta) || !conjunto.has(hasta)) return 0;
  let racha = 0;
  let d = hasta;
  while (conjunto.has(d)) {
    racha += 1;
    d = diaHabilAnterior(d);
  }
  return racha;
}

export function rachaVigente(fechas, hoy) {
  const conjunto = fechas instanceof Set ? fechas : new Set(fechas);
  if (esDiaHabil(hoy) && conjunto.has(hoy)) return calcularRacha(conjunto, hoy);
  return calcularRacha(conjunto, diaHabilAnterior(hoy));
}

export function rachaMaxima(fechas) {
  const conjunto = fechas instanceof Set ? fechas : new Set(fechas);
  let mejor = 0;
  for (const d of conjunto) {
    if (esDiaHabil(d) && !conjunto.has(diaHabilAnterior(d))) {
      let cuenta = 0;
      let x = d;
      while (conjunto.has(x)) {
        cuenta += 1;
        x = siguienteHabil(x);
      }
      mejor = Math.max(mejor, cuenta);
    }
  }
  return mejor;
}

// ---------- Reglas de puntuación (patrón Strategy) ----------
export const REGLAS = [
  { id: "base", puntos: (c, p) => p.base },
  { id: "puntualidad", puntos: (c, p) => (aTiempo(c) ? p.puntualidad : 0) },
  { id: "evidencia", puntos: (c, p) => (c.tiene_evidencia ? p.evidencia : 0) },
  { id: "transparencia", puntos: (c, p) => (c.reporto_bloqueo ? p.transparencia : 0) },
  {
    id: "racha",
    puntos: (c, p) => (!aTiempo(c) || c.racha < 2 ? 0 : Math.min(p.racha_por_dia * (c.racha - 1), p.racha_maximo)),
  },
];

export const MOTIVO_DUPLICADO = "Ya registraste tu avance de hoy: este reporte se guarda, pero no suma puntos.";

export function aTiempo(ctx) {
  return minutos(ctx.hora) <= minutos(ctx.hora_limite);
}

export function calcularPuntos(ctx, config) {
  if (ctx.es_duplicado) return { total: 0, desglose: [], motivo: MOTIVO_DUPLICADO };
  const desglose = [];
  for (const regla of REGLAS) {
    const valor = regla.puntos(ctx, config.puntos);
    if (valor) desglose.push({ regla: regla.id, puntos: valor });
  }
  return { total: desglose.reduce((s, l) => s + l.puntos, 0), desglose, motivo: null };
}

// ---------- Niveles ----------
export function nivelPara(puntos, niveles) {
  const ordenados = [...niveles].sort((a, b) => a.min - b.min);
  let actual = ordenados[0];
  let siguiente = null;
  ordenados.forEach((n, i) => {
    if (puntos >= n.min) {
      actual = n;
      siguiente = ordenados[i + 1] ?? null;
    }
  });
  const progreso = siguiente ? (puntos - actual.min) / (siguiente.min - actual.min) : 1;
  return {
    numero: actual.numero,
    nombre: actual.nombre,
    min: actual.min,
    siguiente_min: siguiente ? siguiente.min : null,
    siguiente_nombre: siguiente ? siguiente.nombre : null,
    progreso: Math.round(progreso * 10000) / 10000,
  };
}

// ---------- Insignias ----------
export function calcularEstadisticas(reportes, perfil, config) {
  const validos = reportes.filter((r) => !r.duplicado);
  const clave = new Set(config.perfiles[perfil]?.evidencias_clave ?? []);
  const fechasATiempo = new Set(validos.filter((r) => r.a_tiempo).map((r) => r.fecha));
  return {
    total_reportes: validos.length,
    reportes_a_tiempo: fechasATiempo.size,
    racha_maxima: rachaMaxima(fechasATiempo),
    reportes_con_evidencia: validos.filter((r) => r.evidencia_tipo !== "ninguna").length,
    bloqueos_reportados: validos.filter((r) => r.bloqueo).length,
    evidencias_clave: validos.filter((r) => clave.has(r.evidencia_tipo)).length,
  };
}

export function evaluarInsignias(estadisticas, perfil, config) {
  return config.insignias
    .filter((i) => !i.perfil || i.perfil === perfil)
    .filter((i) => (estadisticas[i.estadistica] ?? 0) >= i.minimo)
    .map((i) => i.codigo);
}

// ---------- Validación (mismos mensajes que el servidor) ----------
export function validarReporte(perfil, datos, config) {
  const tarea = String(datos.tarea ?? "").trim();
  if (!tarea) throw new Error("Escribe en qué trabajaste hoy.");
  if (tarea.length > 200) throw new Error("La tarea no puede superar 200 caracteres.");
  const avance = Number(datos.avance);
  const horas = Number(datos.horas);
  if (!Number.isFinite(avance) || !Number.isFinite(horas)) throw new Error("El avance y las horas deben ser números.");
  if (avance < 0 || avance > 100) throw new Error("El avance debe estar entre 0 y 100 %.");
  if (!(horas > 0 && horas <= 24)) throw new Error("Las horas deben estar entre 0 y 24.");
  const evidencia_tipo = datos.evidencia_tipo || "ninguna";
  const permitidas = config.perfiles[perfil]?.evidencias ?? [];
  if (evidencia_tipo !== "ninguna" && !permitidas.includes(evidencia_tipo)) {
    throw new Error("Ese tipo de evidencia no corresponde a tu perfil.");
  }
  const ref = String(datos.evidencia_ref ?? "").trim().slice(0, 300);
  if (evidencia_tipo !== "ninguna" && !ref) throw new Error("Agrega el enlace o la referencia de tu evidencia.");
  const bloqueo = String(datos.bloqueo ?? "").trim().slice(0, 500);
  return {
    tarea,
    avance: Math.trunc(avance),
    horas: Math.round(horas * 100) / 100,
    evidencia_tipo,
    evidencia_ref: evidencia_tipo !== "ninguna" ? ref : null,
    bloqueo: bloqueo || null,
  };
}
