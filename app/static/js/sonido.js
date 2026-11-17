// Sonidos cortos sintetizados con Web Audio (no hay archivos de audio que cargar).
let contexto = null;
let activo = true;

export function fijarSonido(valor) {
  activo = valor;
}

function ctx() {
  if (!contexto) {
    const Clase = window.AudioContext || window.webkitAudioContext;
    if (!Clase) return null;
    contexto = new Clase();
  }
  if (contexto.state === "suspended") contexto.resume();
  return contexto;
}

function nota(frecuencia, inicio, duracion, volumen = 0.06, tipo = "sine") {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + inicio;
  const osc = c.createOscillator();
  const gan = c.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, t);
  gan.gain.setValueAtTime(0, t);
  gan.gain.linearRampToValueAtTime(volumen, t + 0.012);
  gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
  osc.connect(gan).connect(c.destination);
  osc.start(t);
  osc.stop(t + duracion + 0.02);
}

export const sonar = {
  mover() {
    if (activo) nota(660, 0, 0.06, 0.025, "triangle");
  },
  abrir() {
    if (activo) { nota(520, 0, 0.09, 0.04, "triangle"); nota(780, 0.05, 0.12, 0.035, "triangle"); }
  },
  cerrar() {
    if (activo) nota(420, 0, 0.1, 0.035, "triangle");
  },
  error() {
    if (activo) { nota(220, 0, 0.16, 0.05, "square"); nota(196, 0.1, 0.2, 0.04, "square"); }
  },
  punto(i = 0) {
    if (activo) nota(660 + i * 110, 0, 0.12, 0.04, "sine");
  },
  logro() {
    if (activo) [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.09, 0.35, 0.05, "triangle"));
  },
};
