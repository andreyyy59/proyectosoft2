// Utilidades de texto y fechas para la interfaz.
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fechaCorta = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fechaLarga = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function utc(iso) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export const fmtFecha = (iso) => fechaCorta.format(utc(iso)).replace(/\./g, "");
export const fmtFechaLarga = (iso) => fechaLarga.format(utc(iso));

export function fmtDuracion(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
export const fmtNum = (v) => numero.format(v);
export const fmtPct = (v) => `${numero.format(v)} %`;
