// Escena 3D de Sprint Quest (Three.js).
// La meseta del jugador, inspirada en el cañón del Chicamocha (Santander), crece con
// cada reporte: cada día registrado levanta un módulo cuya forma depende de la
// evidencia. El cielo sigue la hora real y atardece al acercarse la hora límite.
import * as THREE from "three";

const C = (hex) => new THREE.Color(hex);

const ESTRATOS = ["#B97A4C", "#9D5C3D", "#CC9C66", "#8B5037", "#B8875C", "#7C4A35", "#A9693F"];
const TOPE = "#8E9B5C";
const PIEDRA = "#E8E0D0";
const PIEDRA_TARDE = "#8F8B85";
const GUAYACAN = "#F2B93B";
const AGUA = "#4E8FA6";

// Cielo por fase del día: [t, arriba, horizonte]
const CIELOS = [
  [0.0, "#5D86B0", "#F3D2A2"],
  [0.35, "#3F7DB3", "#CFE2EC"],
  [0.65, "#3C72A8", "#E9D9B8"],
  [0.9, "#3A3E6E", "#F2934A"],
  [1.0, "#15233A", "#5E3F63"],
];

function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const suavizar = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const salirAtras = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: C(color), roughness: 0.9, metalness: 0, flatShading: true, ...extra });
}

// ---------- Geometría de mesetas ----------
function crearMeseta(radio, altura, semilla, conTope = true) {
  const r = azar(semilla);
  const grupo = new THREE.Group();
  const capas = 6;
  let y = 0;
  let radioActual = radio;
  const piezas = [];
  for (let i = 0; i < capas; i++) {
    const h = (altura / capas) * (0.75 + r() * 0.5);
    const abajo = radioActual * (1.04 + r() * 0.08);
    const geo = new THREE.CylinderGeometry(radioActual, abajo, h, 11, 1);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const ang = Math.atan2(z, x);
      const ruido = 1 + 0.07 * Math.sin(ang * 3 + semilla) + 0.05 * Math.sin(ang * 7 + i);
      pos.setX(v, x * ruido);
      pos.setZ(v, z * ruido);
    }
    geo.computeVertexNormals();
    const capa = new THREE.Mesh(geo, mat(ESTRATOS[(i + semilla) % ESTRATOS.length]));
    capa.position.y = -y - h / 2;
    capa.castShadow = true;
    capa.receiveShadow = true;
    grupo.add(capa);
    piezas.push(capa);
    y += h;
    radioActual = abajo;
  }
  if (conTope) {
    const geo = new THREE.CylinderGeometry(radio * 1.0, radio * 1.01, 0.18, 11, 1);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const ang = Math.atan2(pos.getZ(v), pos.getX(v));
      const ruido = 1 + 0.07 * Math.sin(ang * 3 + semilla) + 0.05 * Math.sin(ang * 7);
      pos.setX(v, pos.getX(v) * ruido);
      pos.setZ(v, pos.getZ(v) * ruido);
    }
    geo.computeVertexNormals();
    const tope = new THREE.Mesh(geo, mat(TOPE));
    tope.position.y = 0.0;
    tope.receiveShadow = true;
    grupo.add(tope);
  }
  return grupo;
}

function crearGuayacan(r) {
  const g = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.55, 5), mat("#5B4030"));
  tronco.position.y = 0.27;
  g.add(tronco);
  const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 + r() * 0.1, 0), mat(GUAYACAN, { roughness: 0.7 }));
  copa.position.y = 0.7;
  copa.scale.y = 0.75;
  g.add(copa);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- Módulos (uno por reporte) ----------
function crearModulo(reporte) {
  const aTiempo = reporte.a_tiempo;
  const g = new THREE.Group();
  const piedra = mat(aTiempo ? PIEDRA : PIEDRA_TARDE, { roughness: 0.8 });
  const ventana = new THREE.MeshStandardMaterial({
    color: C(aTiempo ? "#F6D27A" : "#6B6864"),
    emissive: C(aTiempo ? GUAYACAN : "#000000"),
    emissiveIntensity: aTiempo ? 0.6 : 0,
    flatShading: true,
  });
  const f = (0.6 + (Math.min(reporte.horas || 4, 10) / 10) * 0.9) * (aTiempo ? 1 : 0.8);
  const caja = (w, h, d, x = 0, y = 0, z = 0, m = piedra) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    g.add(mesh);
    return mesh;
  };
  const ventanas = (w, h, d, y0) => {
    for (let k = 0; k < Math.max(1, Math.floor(h / 0.28)); k++) {
      caja(w * 0.62, 0.07, 0.02, 0, y0 + 0.12 + k * 0.28, d / 2 + 0.005, ventana);
      caja(0.02, 0.07, d * 0.62, w / 2 + 0.005, y0 + 0.12 + k * 0.28, 0, ventana);
    }
  };

  switch (reporte.evidencia_tipo) {
    case "commit": {
      caja(0.5, 1.0 * f, 0.5);
      caja(0.34, 0.45 * f, 0.34, 0, 1.0 * f);
      ventanas(0.5, 1.0 * f, 0.5, 0);
      break;
    }
    case "pull_request": {
      caja(0.26, 1.15 * f, 0.26, -0.2);
      caja(0.26, 0.9 * f, 0.26, 0.2);
      caja(0.18, 0.1, 0.16, 0, 0.65 * f, 0, ventana);
      break;
    }
    case "prueba": {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.45 * f, 9), piedra);
      base.position.y = 0.225 * f;
      g.add(base);
      const domo = new THREE.Mesh(new THREE.SphereGeometry(0.31, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), ventana);
      domo.position.y = 0.45 * f;
      g.add(domo);
      break;
    }
    case "documento": {
      caja(0.72, 0.42 * f, 0.5);
      const techo = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.74, 3), piedra);
      techo.rotation.z = Math.PI / 2;
      techo.position.y = 0.42 * f + 0.11;
      techo.scale.set(1, 1, 0.9);
      g.add(techo);
      ventanas(0.72, 0.42 * f, 0.5, 0);
      break;
    }
    case "acta_cliente": {
      caja(0.56, 0.55 * f, 0.56);
      const techo = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.38, 4), mat("#A85B3C"));
      techo.rotation.y = Math.PI / 4;
      techo.position.y = 0.55 * f + 0.19;
      g.add(techo);
      ventanas(0.56, 0.55 * f, 0.56, 0);
      break;
    }
    case "ticket": {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.0 * f, 10), piedra);
      silo.position.y = 0.5 * f;
      g.add(silo);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.24, 10), ventana);
      cap.position.y = 1.0 * f + 0.12;
      g.add(cap);
      break;
    }
    case "capacitacion": {
      caja(0.66, 0.24 * f, 0.66);
      caja(0.46, 0.24 * f, 0.46, 0, 0.24 * f);
      caja(0.26, 0.24 * f, 0.26, 0, 0.48 * f, 0, ventana);
      break;
    }
    default: {
      caja(0.48, 0.5 * f, 0.48);
      ventanas(0.48, 0.5 * f, 0.48, 0);
    }
  }

  if (reporte.evidencia_tipo && reporte.evidencia_tipo !== "ninguna") {
    const luz = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), ventana);
    const caja3 = new THREE.Box3().setFromObject(g);
    luz.position.set(0, caja3.max.y + 0.16, 0);
    luz.userData.gira = true;
    g.add(luz);
  }
  if (reporte.bloqueo) {
    const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), mat("#3B3B3B"));
    asta.position.set(0.32, 0.27, 0.32);
    g.add(asta);
    const forma = new THREE.Shape();
    forma.moveTo(0, 0);
    forma.lineTo(0.24, -0.07);
    forma.lineTo(0, -0.14);
    const bandera = new THREE.Mesh(new THREE.ShapeGeometry(forma), mat("#5FA8D3", { side: THREE.DoubleSide }));
    bandera.position.set(0.33, 0.54, 0.32);
    bandera.userData.ondea = true;
    g.add(bandera);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.modulo = g;
    }
  });
  g.userData.reporte = reporte;
  g.userData.ventana = ventana;
  return g;
}

function ranuras(radioUtil) {
  // Posiciones en espiral hexagonal; el centro queda para el faro de la racha.
  const lista = [];
  const paso = 1.2;
  for (let anillo = 1; anillo * paso <= radioUtil; anillo++) {
    const n = anillo * 6;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + anillo * 0.35;
      lista.push(new THREE.Vector2(Math.cos(ang) * anillo * paso, Math.sin(ang) * anillo * paso));
    }
  }
  return lista;
}

// ---------- Escena ----------
export class Escena3D {
  constructor(contenedor, { calidad = "alta", reducirMovimiento = false, onHover = () => {} } = {}) {
    this.contenedor = contenedor;
    this.calidad = calidad;
    this.reducirMovimiento = reducirMovimiento;
    this.onHover = onHover;
    this.animaciones = [];
    this.fase = 0.5;
    this.desplazamiento = 0;
    this.desplazamientoObjetivo = 0;
    this.radioTope = 3.4;
    this.racha = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    contenedor.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(C("#E9D9B8"), 38, 120);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.objetivo = new THREE.Vector3(0, 0.9, 0);
    this.orbita = { azimut: 0.75, elevacion: 0.44, distancia: 21 };

    this.crearCielo();
    this.crearLuces();
    this.crearCanon();
    this.crearMesetaJugador();
    this.crearFaro();
    this.crearParticulas();

    this.modulos = new THREE.Group();
    this.scene.add(this.modulos);

    this.raycaster = new THREE.Raycaster();
    this.puntero = new THREE.Vector2(-9, -9);
    this.instalarControles();
    this.aplicarCalidad();

    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(contenedor);
    this.ajustarTamano();
    this.aplicarFase(this.fase);

    this.reloj = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.cuadro());
  }

  // ----- construcción -----
  crearCielo() {
    this.uniformesCielo = {
      arriba: { value: C(CIELOS[2][1]) },
      horizonte: { value: C(CIELOS[2][2]) },
      suelo: { value: C("#6E5446") },
      dirSol: { value: new THREE.Vector3(0, 1, 0) },
      colorSol: { value: C("#FFE2A8") },
    };
    const cielo = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.uniformesCielo,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform vec3 arriba; uniform vec3 horizonte; uniform vec3 suelo; uniform vec3 dirSol; uniform vec3 colorSol;
          varying vec3 vDir;
          void main(){
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(horizonte, arriba, pow(h, 0.6)) : mix(horizonte, suelo, pow(-h, 0.5));
            float sol = max(dot(normalize(vDir), normalize(dirSol)), 0.0);
            c += colorSol * (pow(sol, 900.0) * 3.0 + pow(sol, 18.0) * 0.35);
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      })
    );
    this.scene.add(cielo);

    const n = 500;
    const pos = new Float32Array(n * 3);
    const r = azar(7);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const ph = Math.acos(r() * 0.9);
      pos.set([Math.sin(ph) * Math.cos(th) * 180, Math.cos(ph) * 180, Math.sin(ph) * Math.sin(th) * 180], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.estrellas = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.scene.add(this.estrellas);
  }

  crearLuces() {
    this.hemi = new THREE.HemisphereLight(C("#CFE2EC"), C("#7A5A44"), 1.2);
    this.scene.add(this.hemi);
    this.sol = new THREE.DirectionalLight(C("#FFF1D6"), 2.4);
    this.sol.shadow.mapSize.set(1024, 1024);
    const s = this.sol.shadow.camera;
    s.left = -9; s.right = 9; s.top = 9; s.bottom = -9; s.near = 1; s.far = 60;
    this.sol.shadow.bias = -0.0008;
    this.sol.shadow.normalBias = 0.02;
    this.scene.add(this.sol, this.sol.target);
  }

  crearCanon() {
    const geo = new THREE.PlaneGeometry(260, 260, 70, 70);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colores = new Float32Array(pos.count * 3);
    const tierra = C("#A0704A");
    const monte = C("#7D8A50");
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const d = Math.hypot(x, z);
      const rio = Math.abs(x - Math.sin(z * 0.045) * 14 - 22);
      let y = Math.sin(x * 0.07) * 1.4 + Math.cos(z * 0.06) * 1.6 + Math.sin((x + z) * 0.13) * 0.6;
      y += suavizar(40, 120, d) * 9;
      y -= (1 - suavizar(0, 7, rio)) * 2.2;
      pos.setY(i, y);
      tmp.copy(tierra).lerp(monte, suavizar(-1, 3, y) * 0.8);
      colores.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));
    geo.computeVertexNormals();
    const suelo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    suelo.position.y = -7.2;
    suelo.receiveShadow = true;
    this.scene.add(suelo);

    const agua = new THREE.PlaneGeometry(9, 260, 1, 120);
    agua.rotateX(-Math.PI / 2);
    const pa = agua.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setX(i, pa.getX(i) + Math.sin(pa.getZ(i) * 0.045) * 14 + 22);
    const rio = new THREE.Mesh(agua, new THREE.MeshStandardMaterial({ color: C(AGUA), roughness: 0.35, metalness: 0.1 }));
    rio.position.y = -8.6;
    this.scene.add(rio);

    const r = azar(11);
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + r() * 0.4;
      const dist = 38 + r() * 34;
      const m = crearMeseta(3 + r() * 5, 6 + r() * 6, 20 + i);
      m.position.set(Math.cos(ang) * dist, -7.2 + 6 + r() * 4, Math.sin(ang) * dist);
      m.rotation.y = r() * Math.PI;
      this.scene.add(m);
    }
  }

  crearMesetaJugador() {
    this.meseta = new THREE.Group();
    this.mesetaCuerpo = crearMeseta(5.2, 7.3, 3);
    this.meseta.add(this.mesetaCuerpo);
    this.scene.add(this.meseta);
    this.arboles = new THREE.Group();
    this.meseta.add(this.arboles);
    this.fijarRadio(3.4, false);
  }

  fijarRadio(radio, animar = true) {
    const escalaFinal = radio / 5.2;
    const inicial = this.mesetaCuerpo.scale.x;
    this.radioTope = radio;
    this.colocarArboles(radio);
    if (!animar || this.reducirMovimiento) {
      this.mesetaCuerpo.scale.set(escalaFinal, 1, escalaFinal);
      return;
    }
    this.animar(1.2, (t) => {
      const s = inicial + (escalaFinal - inicial) * salirAtras(t);
      this.mesetaCuerpo.scale.set(s, 1, s);
    });
  }

  colocarArboles(radio) {
    this.arboles.clear();
    const r = azar(5);
    const n = 4 + Math.round(radio);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + r() * 0.3;
      const arbol = crearGuayacan(r);
      arbol.position.set(Math.cos(ang) * (radio - 0.45), 0.09, Math.sin(ang) * (radio - 0.45));
      arbol.scale.setScalar(0.8 + r() * 0.4);
      this.arboles.add(arbol);
    }
  }

  crearFaro() {
    this.faro = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.4, 8), mat("#D9CDB5"));
    base.position.y = 0.7;
    base.castShadow = true;
    this.faro.add(base);
    this.cristalMat = new THREE.MeshStandardMaterial({ color: C("#FFE7A8"), emissive: C(GUAYACAN), emissiveIntensity: 0.2, flatShading: true, roughness: 0.3 });
    this.cristal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), this.cristalMat);
    this.cristal.position.y = 1.75;
    this.faro.add(this.cristal);
    this.haz = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.5, 1, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: C(GUAYACAN), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    this.haz.position.y = 2.0;
    this.faro.add(this.haz);
    this.luzFaro = new THREE.PointLight(C(GUAYACAN), 0, 6, 1.6);
    this.luzFaro.position.y = 1.8;
    this.faro.add(this.luzFaro);
    this.faro.position.y = 0.09;
    this.scene.add(this.faro);
  }

  crearParticulas() {
    const n = 140;
    const r = azar(3);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 22, r() * 8 - 1, (r() - 0.5) * 22], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.motas = new THREE.Points(geo, new THREE.PointsMaterial({ color: C("#FFE9B8"), size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(this.motas);
  }

  // ----- estado del juego -----
  setEstado(estado, config) {
    this.config = config;
    this.fijarRadio(3.4 + 0.45 * (estado.nivel.numero - 1), this.nivelActual !== undefined && estado.nivel.numero !== this.nivelActual);
    this.nivelActual = estado.nivel.numero;
    this.setRacha(estado.racha);
    this.modulos.clear();
    const validos = estado.reportes.filter((r) => !r.duplicado).slice().reverse();
    this.ranurasLibres = ranuras(this.radioTope - 0.75);
    validos.forEach((rep, i) => this.colocarModulo(rep, i, false));
    this.cantidad = validos.length;
  }

  agregarReporte(reporte, estado) {
    if (estado.nivel.numero !== this.nivelActual) {
      this.fijarRadio(3.4 + 0.45 * (estado.nivel.numero - 1), true);
      this.nivelActual = estado.nivel.numero;
      this.ranurasLibres = ranuras(this.radioTope - 0.75);
    }
    this.setRacha(estado.racha);
    if (reporte.duplicado) return;
    const modulo = this.colocarModulo(reporte, this.cantidad, true);
    this.cantidad += 1;
    return modulo;
  }

  colocarModulo(reporte, indice, animar) {
    const libres = this.ranurasLibres;
    const ranura = libres[indice % libres.length];
    const piso = Math.floor(indice / libres.length);
    const modulo = crearModulo(reporte);
    modulo.position.set(ranura.x, 0.09 + piso * 2, ranura.y);
    modulo.scale.setScalar(1.3);
    modulo.userData.escala = 1.3;
    modulo.rotation.y = Math.atan2(ranura.x, ranura.y) + Math.PI;
    this.modulos.add(modulo);
    this.ajustarVentana(modulo);
    if (animar) {
      const destino = modulo.position.y;
      const altura = new THREE.Box3().setFromObject(modulo).getSize(new THREE.Vector3()).y;
      if (this.reducirMovimiento) {
        this.confeti(modulo.position);
      } else {
        modulo.position.y = destino - altura - 0.1;
        this.animar(1.1, (t) => { modulo.position.y = destino - (altura + 0.1) * (1 - salirAtras(t)); }, () => this.confeti(modulo.position));
      }
    }
    return modulo;
  }

  setRacha(racha) {
    this.racha = racha;
    const k = Math.min(racha, 6) / 6;
    this.cristalMat.emissiveIntensity = 0.15 + k * 1.6;
    this.haz.material.opacity = racha >= 2 ? 0.05 + k * 0.12 : 0;
    this.haz.scale.y = 2 + k * 5;
    this.haz.position.y = 1.9 + this.haz.scale.y / 2;
    this.luzFaro.intensity = racha ? 2 + k * 10 : 0;
  }

  // ----- fase del día -----
  aplicarFase(t) {
    this.fase = Math.min(1, Math.max(0, t));
    let i = 0;
    while (i < CIELOS.length - 2 && this.fase > CIELOS[i + 1][0]) i++;
    const [t0, a0, h0] = CIELOS[i];
    const [t1, a1, h1] = CIELOS[i + 1];
    const k = suavizar(t0, t1, this.fase);
    const arriba = C(a0).lerp(C(a1), k);
    const horizonte = C(h0).lerp(C(h1), k);
    this.uniformesCielo.arriba.value.copy(arriba);
    this.uniformesCielo.horizonte.value.copy(horizonte);
    this.scene.fog.color.copy(horizonte);

    const recorrido = Math.min(this.fase / 0.97, 1);
    const elev = Math.sin(Math.PI * recorrido) * 1.05 + 0.04;
    const azim = Math.PI * (0.15 + recorrido * 0.7);
    const dir = new THREE.Vector3(Math.cos(azim) * Math.cos(elev), Math.sin(elev), -Math.sin(azim) * Math.cos(elev) * 0.6 + 0.4);
    this.uniformesCielo.dirSol.value.copy(dir).normalize();
    this.sol.position.copy(dir.clone().multiplyScalar(30));
    const calidez = 1 - Math.sin(Math.PI * recorrido);
    this.sol.color.copy(C("#FFF4DE").lerp(C("#FF9A4D"), calidez * 0.85));
    this.uniformesCielo.colorSol.value.copy(this.sol.color);
    const noche = suavizar(0.9, 1.0, this.fase);
    this.sol.intensity = 2.6 * (1 - noche * 0.8) * (0.55 + 0.45 * Math.sin(Math.PI * recorrido));
    this.hemi.intensity = 1.25 - noche * 0.75;
    this.hemi.color.copy(arriba).lerp(C("#FFFFFF"), 0.35);
    this.estrellas.material.opacity = suavizar(0.93, 1.0, this.fase) * 0.9;
    this.renderer.toneMappingExposure = 1.05 - noche * 0.15;
    this.modulos.children.forEach((m) => this.ajustarVentana(m));
  }

  ajustarVentana(modulo) {
    const v = modulo.userData.ventana;
    if (v && modulo.userData.reporte.a_tiempo) v.emissiveIntensity = 0.35 + suavizar(0.6, 1.0, this.fase) * 1.6;
  }

  // 1: el menú ocupa la izquierda (la meseta va a la derecha); -1: una hoja ocupa la derecha.
  setDesplazamiento(lado) {
    this.desplazamientoObjetivo = typeof lado === "number" ? lado : lado ? 1 : 0;
  }

  setCalidad(calidad) {
    this.calidad = calidad;
    this.aplicarCalidad();
  }

  setMovimientoReducido(valor) {
    this.reducirMovimiento = valor;
  }

  aplicarCalidad() {
    const alta = this.calidad === "alta";
    this.renderer.setPixelRatio(alta ? Math.min(window.devicePixelRatio || 1, 1.75) : 1);
    this.renderer.shadowMap.enabled = alta;
    this.sol.castShadow = alta;
    this.motas.visible = alta;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.ajustarTamano();
  }

  // ----- controles -----
  instalarControles() {
    const el = this.renderer.domElement;
    const punteros = new Map();
    let distanciaPinza = 0;
    el.addEventListener("pointerdown", (e) => {
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      this.ultimaInteraccion = performance.now();
    });
    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      this.puntero.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.posPuntero = { x: e.clientX, y: e.clientY };
      if (!punteros.has(e.pointerId)) return;
      const previo = punteros.get(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.ultimaInteraccion = performance.now();
      if (punteros.size === 1) {
        this.orbita.azimut -= (e.clientX - previo.x) * 0.006;
        this.orbita.elevacion = Math.min(1.15, Math.max(0.1, this.orbita.elevacion + (e.clientY - previo.y) * 0.004));
      } else if (punteros.size === 2) {
        const [a, b] = [...punteros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (distanciaPinza) this.zoom(distanciaPinza / d);
        distanciaPinza = d;
      }
    });
    const soltar = (e) => {
      punteros.delete(e.pointerId);
      if (punteros.size < 2) distanciaPinza = 0;
    };
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
    el.addEventListener("pointerleave", () => { this.puntero.set(-9, -9); });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom(1 + e.deltaY * 0.001);
      this.ultimaInteraccion = performance.now();
    }, { passive: false });
  }

  zoom(factor) {
    this.orbita.distancia = Math.min(32, Math.max(8, this.orbita.distancia * factor));
  }

  enfocar() {
    this.orbita.distancia = 21;
    this.orbita.elevacion = 0.44;
  }

  // ----- efectos -----
  animar(duracion, paso, fin) {
    this.animaciones.push({ inicio: performance.now(), duracion: duracion * 1000, paso, fin });
  }

  confeti(origen) {
    const n = this.calidad === "alta" ? 140 : 60;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = [];
    const paleta = [C(GUAYACAN), C("#7DB38A"), C("#F4EEE2"), C("#5FA8D3")];
    for (let i = 0; i < n; i++) {
      pos.set([origen.x, origen.y + 1, origen.z], i * 3);
      const c = paleta[i % paleta.length];
      col.set([c.r, c.g, c.b], i * 3);
      const a = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * 2.5;
      vel.push(new THREE.Vector3(Math.cos(a) * v * 0.5, 3 + Math.random() * 3.5, Math.sin(a) * v * 0.5));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const puntos = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, depthWrite: false }));
    this.scene.add(puntos);
    this.animar(1.8, (t, dt) => {
      const p = geo.attributes.position;
      for (let i = 0; i < n; i++) {
        vel[i].y -= 9.8 * dt;
        p.setXYZ(i, p.getX(i) + vel[i].x * dt, p.getY(i) + vel[i].y * dt, p.getZ(i) + vel[i].z * dt);
      }
      p.needsUpdate = true;
      puntos.material.opacity = 1 - suavizar(0.6, 1, t);
    }, () => {
      this.scene.remove(puntos);
      geo.dispose();
      puntos.material.dispose();
    });
  }

  // ----- bucle -----
  ajustarTamano() {
    const w = this.contenedor.clientWidth || window.innerWidth;
    const h = this.contenedor.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.ancho = w;
    this.alto = h;
  }

  cuadro() {
    const dt = Math.min(this.reloj.getDelta(), 0.05);
    const t = this.reloj.elapsedTime;
    const ahora = performance.now();

    this.animaciones = this.animaciones.filter((a) => {
      const k = Math.min(1, (ahora - a.inicio) / a.duracion);
      a.paso(k, dt);
      if (k >= 1) {
        a.fin?.();
        return false;
      }
      return true;
    });

    const quieto = !this.ultimaInteraccion || ahora - this.ultimaInteraccion > 4000;
    if (!this.reducirMovimiento && quieto) this.orbita.azimut += dt * 0.035;

    this.desplazamiento += (this.desplazamientoObjetivo - this.desplazamiento) * Math.min(1, dt * 4);
    const ancho = this.ancho > 760 ? this.ancho : 0;
    if (ancho && Math.abs(this.desplazamiento) > 0.001) {
      this.camera.setViewOffset(this.ancho, this.alto, -this.ancho * 0.17 * this.desplazamiento, 0, this.ancho, this.alto);
    } else {
      this.camera.clearViewOffset();
    }

    const { azimut, elevacion, distancia } = this.orbita;
    this.camera.position.set(
      this.objetivo.x + Math.cos(azimut) * Math.cos(elevacion) * distancia,
      this.objetivo.y + Math.sin(elevacion) * distancia,
      this.objetivo.z + Math.sin(azimut) * Math.cos(elevacion) * distancia
    );
    this.camera.lookAt(this.objetivo);

    if (!this.reducirMovimiento) {
      this.cristal.rotation.y += dt * 0.8;
      this.cristal.position.y = 1.75 + Math.sin(t * 1.6) * 0.05;
      if (this.motas.visible) {
        const p = this.motas.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i) + dt * 0.15;
          if (y > 7) y = -1;
          p.setY(i, y);
        }
        p.needsUpdate = true;
      }
      this.modulos.traverse((o) => {
        if (o.userData.gira) o.rotation.y += dt * 1.5;
        if (o.userData.ondea) o.rotation.y = Math.sin(t * 2 + o.id) * 0.3;
      });
    }

    this.detectarHover();
    this.renderer.render(this.scene, this.camera);
  }

  detectarHover() {
    if (this.puntero.x < -2) {
      if (this.moduloHover) this.marcar(null);
      return;
    }
    this.raycaster.setFromCamera(this.puntero, this.camera);
    const golpe = this.raycaster.intersectObjects(this.modulos.children, true)[0];
    const modulo = golpe?.object.userData.modulo ?? null;
    if (modulo !== this.moduloHover) this.marcar(modulo);
    if (modulo && this.posPuntero) this.onHover(modulo.userData.reporte, this.posPuntero.x, this.posPuntero.y);
  }

  marcar(modulo) {
    if (this.moduloHover) this.moduloHover.scale.setScalar(this.moduloHover.userData.escala ?? 1);
    this.moduloHover = modulo;
    if (modulo) modulo.scale.setScalar((modulo.userData.escala ?? 1) * 1.08);
    else this.onHover(null);
    this.renderer.domElement.style.cursor = modulo ? "pointer" : "grab";
  }
}

// Fase del día (0 = amanecer, 0.9 = hora límite, 1 = anochecer) a partir de "HH:MM".
export function faseDelDia(ahora, horaLimite) {
  const m = (x) => {
    const [h, mi] = x.split(":").map(Number);
    return h * 60 + mi;
  };
  const inicio = 7 * 60;
  const limite = m(horaLimite);
  const actual = m(ahora);
  if (actual <= inicio) return 0;
  if (actual <= limite) return ((actual - inicio) / Math.max(1, limite - inicio)) * 0.9;
  return Math.min(1, 0.9 + ((actual - limite) / 90) * 0.1);
}
