// Íconos de línea (SVG en línea, sin dependencias). Todos usan currentColor.
const trazos = {
  bandera: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  reloj: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  llama: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5Z"/>',
  corona: '<path d="M4 17h16l-1.5-9-4.5 4-2-6-2 6-4.5-4L4 17Z"/><path d="M5 20h14"/>',
  clip: '<path d="M8 12.5 14 6.5a3 3 0 0 1 4.2 4.2l-7.5 7.6a4.5 4.5 0 0 1-6.4-6.4L12 4.2"/>',
  escudo: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  rama: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10"/><path d="M18 10c0 4-6 3-12 7"/>',
  apreton: '<path d="m3 12 4-4 3 1 3-2 3 1 5 4"/><path d="m7 13 3 3 2-1 2 2 2-1 3-3"/><path d="M3 12l3 3"/>',
  candado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sonido: '<path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  silencio: '<path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="m17 10 4 4m0-4-4 4"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  volver: '<path d="M15 6l-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  nube: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z"/>',
  sinNube: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 9 6.5M14 6.3A6 6 0 0 1 18 9a4.5 4.5 0 0 1 2 8.2M17 18H7"/><path d="m3 3 18 18"/>',
  bloque: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  martillo: '<path d="m14 6 4 4M10.5 9.5 4 16l4 4 6.5-6.5"/><path d="m13 4 7 7-2.5 2.5-7-7L13 4Z"/>',
  mover: '<path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/>',
  girar: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  mejorar: '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
  basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  descarga: '<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/>',
};

export function icono(nombre, clase = "icono") {
  return `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazos[nombre] ?? ""}</svg>`;
}
