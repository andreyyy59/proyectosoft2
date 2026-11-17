// Escena 3D de Sprint Quest (Three.js).
// La meseta del jugador, inspirada en el cañón del Chicamocha (Santander). Con los materiales
// que ganan sus reportes, el jugador construye edificios sobre una cuadrícula. El cielo sigue
// la hora real y atardece al acercarse la hora límite.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const C = (hex) => new THREE.Color(hex);

const ESTRATOS = ["#B97A4C", "#9D5C3D", "#CC9C66", "#8B5037", "#B8875C", "#7C4A35", "#A9693F"];
const TOPE = "#8E9B5C";
const PIEDRA = "#E8E0D0";
const TEJA = "#A85B3C";
const MADERA = "#7A5236";
const GUAYACAN = "#F2B93B";
const AGUA = "#4E8FA6";
const VIDRIO = "#9FD3E6";
const ESCALA = 1.2; // tamaño de los edificios sobre la meseta

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
  return new THREE.MeshStandardMaterial({ color: C(color), roughness: 0.85, metalness: 0, flatShading: true, ...extra });
}

// ---------- Meseta y paisaje ----------
function ruidoBorde(geo, semilla, fuerza = 1) {
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const ang = Math.atan2(pos.getZ(v), pos.getX(v));
    const k = 1 + fuerza * (0.07 * Math.sin(ang * 3 + semilla) + 0.05 * Math.sin(ang * 7 + semilla * 0.5));
    pos.setX(v, pos.getX(v) * k);
    pos.setZ(v, pos.getZ(v) * k);
  }
  geo.computeVertexNormals();
}

function crearMeseta(radio, altura, semilla, conTope = true) {
  const r = azar(semilla);
  const grupo = new THREE.Group();
  let y = 0;
  let radioActual = radio;
  for (let i = 0; i < 6; i++) {
    const h = (altura / 6) * (0.75 + r() * 0.5);
    const abajo = radioActual * (1.04 + r() * 0.08);
    const geo = new THREE.CylinderGeometry(radioActual, abajo, h, 13, 1);
    ruidoBorde(geo, semilla + i);
    const capa = new THREE.Mesh(geo, mat(ESTRATOS[(i + semilla) % ESTRATOS.length], { roughness: 0.95 }));
    capa.position.y = -y - h / 2;
    capa.castShadow = true;
    capa.receiveShadow = true;
    grupo.add(capa);
    y += h;
    radioActual = abajo;
  }
  if (conTope) {
    const geo = new THREE.CylinderGeometry(radio, radio * 1.01, 0.18, 13, 1);
    ruidoBorde(geo, semilla);
    const tope = new THREE.Mesh(geo, mat(TOPE, { roughness: 1 }));
    tope.receiveShadow = true;
    grupo.add(tope);
  }
  return grupo;
}

function crearCardon(r) {
  // Cactus columnar del Chicamocha
  const g = new THREE.Group();
  const m = mat("#5E7F4A", { roughness: 0.9 });
  const tallo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.6 + r() * 0.3, 6), m);
  tallo.position.y = 0.32;
  g.add(tallo);
  for (const lado of [-1, 1]) {
    if (r() < 0.3) continue;
    const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), m);
    brazo.position.set(lado * 0.11, 0.38 + r() * 0.12, 0);
    g.add(brazo);
    const codo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), m);
    codo.rotation.z = Math.PI / 2;
    codo.position.set(lado * 0.06, 0.27, 0);
    g.add(codo);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function crearRoca(r) {
  const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + r() * 0.1, 0), mat(r() < 0.5 ? "#A27E62" : "#8B6B54"));
  roca.scale.y = 0.6;
  roca.rotation.set(r(), r() * 3, r());
  roca.castShadow = true;
  return roca;
}

function crearNube(r) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  const piezas = 3 + Math.floor(r() * 3);
  for (let i = 0; i < piezas; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.8, 0), m);
    p.position.set(i * 1.1 - piezas * 0.5, r() * 0.4, (r() - 0.5) * 0.8);
    p.scale.y = 0.6;
    g.add(p);
  }
  return g;
}

// ---------- Edificios ----------
// Cada edificio se arma con piezas simples; el nivel (1 a 3) lo hace más alto y le agrega detalles.
function crearEdificio(tipo, nivel = 1) {
  const g = new THREE.Group();
  const piedra = mat(PIEDRA, { roughness: 0.8 });
  const ventana = new THREE.MeshStandardMaterial({ color: C("#F6D27A"), emissive: C(GUAYACAN), emissiveIntensity: 0.5, flatShading: true });
  const k = 0.75 + nivel * 0.25;
  const caja = (w, h, d, x = 0, y = 0, z = 0, m = piedra) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    g.add(mesh);
    return mesh;
  };
  const cilindro = (rt, rb, h, x = 0, y = 0, z = 0, m = piedra, seg = 10) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    mesh.position.set(x, y + h / 2, z);
    g.add(mesh);
    return mesh;
  };
  const ventanas = (w, h, d, y0, x0 = 0, z0 = 0) => {
    for (let n = 0; n < Math.max(1, Math.floor(h / 0.26)); n++) {
      caja(w * 0.6, 0.07, 0.02, x0, y0 + 0.1 + n * 0.26, z0 + d / 2 + 0.006, ventana);
      caja(0.02, 0.07, d * 0.6, x0 + w / 2 + 0.006, y0 + 0.1 + n * 0.26, z0, ventana);
    }
  };
  const techo = (ancho, alto, y, color = TEJA) => {
    const t = new THREE.Mesh(new THREE.ConeGeometry(ancho, alto, 4), mat(color));
    t.rotation.y = Math.PI / 4;
    t.position.y = y + alto / 2;
    g.add(t);
    return t;
  };
  const base = () => caja(0.92, 0.04, 0.92, 0, 0, 0, mat("#B9A27E", { roughness: 1 }));

  switch (tipo) {
    case "guayacan": {
      cilindro(0.05, 0.08, 0.5 * k, 0, 0, 0, mat("#5B4030"), 6);
      const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + 0.08 * nivel, 0), mat(GUAYACAN, { roughness: 0.7 }));
      copa.position.y = 0.5 * k + 0.18;
      copa.scale.y = 0.8;
      g.add(copa);
      if (nivel >= 2) {
        const c2 = copa.clone();
        c2.scale.setScalar(0.6);
        c2.position.set(0.2, 0.5 * k, 0.1);
        g.add(c2);
      }
      if (nivel >= 3) {
        const c3 = copa.clone();
        c3.scale.setScalar(0.55);
        c3.position.set(-0.18, 0.55 * k, -0.12);
        g.add(c3);
      }
      break;
    }
    case "casa": {
      base();
      const h = 0.4 * k;
      caja(0.6, h, 0.55, 0, 0.04);
      ventanas(0.6, h, 0.55, 0.04);
      techo(0.5, 0.32, 0.04 + h);
      caja(0.12, 0.2, 0.02, 0.15, 0.04, 0.28, mat(MADERA));
      if (nivel >= 3) cilindro(0.05, 0.05, 0.25, -0.18, 0.04 + h, -0.1, mat("#8F8B85"), 6);
      break;
    }
    case "plaza": {
      caja(0.95, 0.05, 0.95, 0, 0, 0, mat("#D8C7A6", { roughness: 1 }));
      cilindro(0.34, 0.36, 0.12, 0, 0.05, 0, piedra, 12);
      const agua = cilindro(0.3, 0.3, 0.02, 0, 0.15, 0, new THREE.MeshStandardMaterial({ color: C(AGUA), emissive: C("#2C6C88"), emissiveIntensity: 0.3, roughness: 0.2 }), 16);
      agua.userData.agua = true;
      cilindro(0.04, 0.05, 0.25 + nivel * 0.08, 0, 0.17, 0, piedra, 8);
      const chorro = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: C(VIDRIO), emissive: C(VIDRIO), emissiveIntensity: 0.4, transparent: true, opacity: 0.8 }));
      chorro.position.y = 0.45 + nivel * 0.08;
      chorro.userData.flota = true;
      g.add(chorro);
      for (let n = 0; n < nivel + 1; n++) {
        const ang = (n / (nivel + 1)) * Math.PI * 2;
        caja(0.2, 0.06, 0.07, Math.cos(ang) * 0.42, 0.05, Math.sin(ang) * 0.42, mat(MADERA)).rotation.y = -ang;
      }
      break;
    }
    case "torre": {
      base();
      const h = 0.9 * k;
      caja(0.46, h, 0.46, 0, 0.04);
      ventanas(0.46, h, 0.46, 0.04);
      caja(0.32, 0.3 * k, 0.32, 0, 0.04 + h);
      const antena = cilindro(0.015, 0.015, 0.35, 0, 0.04 + h + 0.3 * k, 0, mat("#5C5C5C"), 4);
      const luz = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), ventana);
      luz.position.y = antena.position.y + 0.2;
      luz.userData.gira = true;
      g.add(luz);
      break;
    }
    case "laboratorio": {
      base();
      cilindro(0.36, 0.38, 0.32 * k, 0, 0.04, 0, piedra, 12);
      const domo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: C(VIDRIO), emissive: C("#3AA0C0"), emissiveIntensity: 0.35, roughness: 0.15, transparent: true, opacity: 0.85 }));
      domo.position.y = 0.04 + 0.32 * k;
      g.add(domo);
      const matraz = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), ventana);
      matraz.position.y = domo.position.y + 0.12;
      g.add(matraz);
      if (nivel >= 2) cilindro(0.08, 0.08, 0.4 * k, 0.32, 0.04, -0.28, piedra, 8);
      break;
    }
    case "archivo": {
      base();
      const h = 0.36 * k;
      caja(0.78, h, 0.5, 0, 0.04);
      ventanas(0.78, h, 0.5, 0.04);
      for (let n = 0; n < 4; n++) cilindro(0.035, 0.035, h, -0.3 + n * 0.2, 0.04, 0.27, piedra, 6);
      const frontis = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.82, 3), piedra);
      frontis.rotation.z = Math.PI / 2;
      frontis.scale.set(0.5, 1, 1);
      frontis.position.y = 0.04 + h + 0.08;
      g.add(frontis);
      break;
    }
    case "casa_cliente": {
      base();
      const h = 0.36 * k;
      caja(0.7, h, 0.5, 0, 0.04);
      ventanas(0.7, h, 0.5, 0.04);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.74, 3), mat(TEJA));
      t.rotation.z = Math.PI / 2;
      t.scale.set(0.7, 1, 1);
      t.position.y = 0.04 + h + 0.1;
      g.add(t);
      caja(0.22, 0.03, 0.18, 0, 0.04 + h * 0.6, 0.34, mat(TEJA));
      if (nivel >= 2) caja(0.3, h * 0.8, 0.3, 0.32, 0.04, -0.15);
      break;
    }
    case "silo": {
      base();
      const h = 0.8 * k;
      cilindro(0.22, 0.24, h, -0.12, 0.04, 0, piedra, 12);
      const tapa = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.2, 12), ventana);
      tapa.position.set(-0.12, 0.04 + h + 0.1, 0);
      g.add(tapa);
      if (nivel >= 2) cilindro(0.15, 0.16, h * 0.7, 0.24, 0.04, 0.12, piedra, 10);
      if (nivel >= 3) cilindro(0.12, 0.13, h * 0.55, 0.22, 0.04, -0.24, piedra, 10);
      break;
    }
    case "aula": {
      base();
      caja(0.8, 0.18, 0.8, 0, 0.04);
      caja(0.58, 0.18 * k, 0.58, 0, 0.22);
      caja(0.36, 0.18 * k, 0.36, 0, 0.22 + 0.18 * k, 0, ventana);
      if (nivel >= 2) caja(0.18, 0.1, 0.18, 0, 0.22 + 0.36 * k, 0);
      break;
    }
    case "molino": {
      base();
      cilindro(0.18, 0.3, 0.9 * k, 0, 0.04, 0, piedra, 10);
      techo(0.24, 0.24, 0.04 + 0.9 * k, TEJA);
      const aspas = new THREE.Group();
      for (let n = 0; n < 4; n++) {
        const aspa = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.02), mat(MADERA));
        aspa.position.y = 0.3;
        const brazo = new THREE.Group();
        brazo.rotation.z = (n * Math.PI) / 2;
        brazo.add(aspa);
        aspas.add(brazo);
      }
      aspas.position.set(0, 0.04 + 0.8 * k, 0.24);
      aspas.userData.aspas = true;
      g.add(aspas);
      break;
    }
    case "observatorio": {
      base();
      cilindro(0.38, 0.42, 0.4 * k, 0, 0.04, 0, piedra, 14);
      ventanas(0.6, 0.4 * k, 0.6, 0.04);
      const cupula = new THREE.Group();
      const domo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#C9CED6", { metalness: 0.3, roughness: 0.4 }));
      cupula.add(domo);
      const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), mat("#4B4F57"));
      tubo.rotation.x = -0.9;
      tubo.position.set(0, 0.22, 0.2);
      cupula.add(tubo);
      cupula.position.y = 0.04 + 0.4 * k;
      cupula.userData.cupula = true;
      g.add(cupula);
      break;
    }
    default:
      caja(0.5, 0.5, 0.5);
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.edificio = g;
    }
  });
  g.userData.ventana = ventana;
  return g;
}

// ---------- Escena ----------
export class Escena3D {
  constructor(contenedor, { calidad = "alta", reducirMovimiento = false } = {}) {
    this.contenedor = contenedor;
    this.calidad = calidad;
    this.reducirMovimiento = reducirMovimiento;
    this.onHover = () => {};
    this.onSeleccionar = () => {};
    this.animaciones = [];
    this.fase = 0.5;
    this.desplazamiento = 0;
    this.desplazamientoObjetivo = 0;
    this.radioTope = 3.4;
    this.racha = 0;
    this.modo = null;
    this.edificiosPorId = new Map();
    this.tamCelda = 1.2;
    this.miniaturas = new Map();

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
    this.orbita = { azimut: 0.75, elevacion: 0.46, distancia: 20 };
    this.orbitaObjetivo = { ...this.orbita };

    this.crearCielo();
    this.crearLuces();
    this.crearCanon();
    this.crearNubes();
    this.crearMesetaJugador();
    this.crearFaro();
    this.crearParticulas();
    this.crearHerramientas();

    this.edificios = new THREE.Group();
    this.scene.add(this.edificios);

    this.raycaster = new THREE.Raycaster();
    this.puntero = new THREE.Vector2(-9, -9);
    this.planoTope = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.09);
    this.instalarControles();
    this.crearComposicion();
    this.aplicarCalidad();

    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(contenedor);
    this.ajustarTamano();
    this.aplicarFase(this.fase);

    this.reloj = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.cuadro());
  }

  // ----- construcción del mundo -----
  crearCielo() {
    this.uniformesCielo = {
      arriba: { value: C(CIELOS[2][1]) },
      horizonte: { value: C(CIELOS[2][2]) },
      suelo: { value: C("#6E5446") },
      dirSol: { value: new THREE.Vector3(0, 1, 0) },
      colorSol: { value: C("#FFE2A8") },
    };
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.uniformesCielo,
        vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
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
    ));
    const n = 600;
    const pos = new Float32Array(n * 3);
    const r = azar(7);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const ph = Math.acos(r() * 0.9);
      pos.set([Math.sin(ph) * Math.cos(th) * 180, Math.cos(ph) * 180, Math.sin(ph) * Math.sin(th) * 180], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.estrellas = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.scene.add(this.estrellas);
  }

  crearLuces() {
    this.hemi = new THREE.HemisphereLight(C("#CFE2EC"), C("#7A5A44"), 1.2);
    this.scene.add(this.hemi);
    this.sol = new THREE.DirectionalLight(C("#FFF1D6"), 2.4);
    this.sol.shadow.mapSize.set(2048, 2048);
    const s = this.sol.shadow.camera;
    s.left = -8; s.right = 8; s.top = 8; s.bottom = -8; s.near = 1; s.far = 60;
    this.sol.shadow.bias = -0.0006;
    this.sol.shadow.normalBias = 0.02;
    this.scene.add(this.sol, this.sol.target);
    // Luz de luna: de noche la meseta debe seguir viéndose
    this.luna = new THREE.DirectionalLight(C("#AFC4FF"), 0);
    this.luna.position.set(-14, 22, -8);
    this.scene.add(this.luna);
  }

  crearCanon() {
    const geo = new THREE.PlaneGeometry(260, 260, 80, 80);
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
    this.rio = new THREE.Mesh(agua, new THREE.MeshStandardMaterial({ color: C(AGUA), roughness: 0.3, metalness: 0.15, emissive: C("#1E4E63"), emissiveIntensity: 0.2 }));
    this.rio.position.y = -8.6;
    this.scene.add(this.rio);

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

  crearNubes() {
    this.nubes = new THREE.Group();
    const r = azar(21);
    for (let i = 0; i < 9; i++) {
      const nube = crearNube(r);
      const ang = (i / 9) * Math.PI * 2;
      const dist = 16 + r() * 26;
      nube.position.set(Math.cos(ang) * dist, 7 + r() * 8, Math.sin(ang) * dist);
      nube.scale.setScalar(0.9 + r() * 1.2);
      nube.userData.vel = 0.15 + r() * 0.2;
      this.nubes.add(nube);
    }
    this.scene.add(this.nubes);
  }

  crearMesetaJugador() {
    this.meseta = new THREE.Group();
    this.mesetaCuerpo = crearMeseta(5.2, 7.3, 3);
    this.meseta.add(this.mesetaCuerpo);
    this.decoracion = new THREE.Group();
    this.meseta.add(this.decoracion);
    this.scene.add(this.meseta);
    this.fijarRadio(3.4, false);
  }

  fijarRadio(radio, animar = true) {
    const final = radio / 5.2;
    const inicial = this.mesetaCuerpo.scale.x;
    this.radioTope = radio;
    this.decorarBorde(radio);
    if (!animar || this.reducirMovimiento) {
      this.mesetaCuerpo.scale.set(final, 1, final);
      return;
    }
    this.animar(1.2, (t) => {
      const s = inicial + (final - inicial) * salirAtras(t);
      this.mesetaCuerpo.scale.set(s, 1, s);
    });
  }

  decorarBorde(radio) {
    this.decoracion.clear();
    const r = azar(5);
    const n = 10 + Math.round(radio * 2);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + r() * 0.25;
      const d = radio - 0.22 - r() * 0.12;
      const pieza = r() < 0.45 ? crearCardon(r) : crearRoca(r);
      pieza.position.set(Math.cos(ang) * d, 0.09, Math.sin(ang) * d);
      pieza.rotation.y = r() * Math.PI;
      this.decoracion.add(pieza);
    }
  }

  crearFaro() {
    this.faro = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.4, 8), mat("#D9CDB5"));
    base.position.y = 0.7;
    base.castShadow = true;
    this.faro.add(base);
    const anillo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8), mat(TEJA));
    anillo.position.y = 1.42;
    this.faro.add(anillo);
    this.cristalMat = new THREE.MeshStandardMaterial({ color: C("#FFE7A8"), emissive: C(GUAYACAN), emissiveIntensity: 0.2, flatShading: true, roughness: 0.3 });
    this.cristal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), this.cristalMat);
    this.cristal.position.y = 1.78;
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
    this.motas = new THREE.Points(geo, new THREE.PointsMaterial({ color: C("#FFE9B8"), size: 0.06, transparent: true, opacity: 0.5, depthWrite: false }));
    this.scene.add(this.motas);
  }

  crearHerramientas() {
    // Cuadrícula de construcción, cursor de celda y anillo de selección
    this.cuadricula = new THREE.Group();
    this.cuadricula.visible = false;
    this.scene.add(this.cuadricula);
    this.cursor = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8cc49a, transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.cursor.position.y = 0.105;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.anillo = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.72, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: C(GUAYACAN), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })
    );
    this.anillo.position.y = 0.11;
    this.anillo.visible = false;
    this.scene.add(this.anillo);
  }

  crearComposicion() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // ----- estado del juego -----
  setEstado(estado, config) {
    this.config = config ?? this.config;
    this.tamCelda = config?.meseta?.tamano_celda ?? this.tamCelda ?? 1.2;
    const radio = config ? config.meseta.radio_base + config.meseta.radio_por_nivel * (estado.nivel.numero - 1) : 3.4;
    this.fijarRadio(radio, this.nivelActual !== undefined && estado.nivel.numero > this.nivelActual);
    this.nivelActual = estado.nivel.numero;
    this.setRacha(estado.racha);
    this.sincronizarEdificios(estado.construcciones ?? []);
  }

  posicionCelda([i, j]) {
    return new THREE.Vector3(i * this.tamCelda, 0.09, j * this.tamCelda);
  }

  sincronizarEdificios(lista, { animar = null } = {}) {
    const vistos = new Set();
    for (const c of lista) {
      vistos.add(c.id);
      const actual = this.edificiosPorId.get(c.id);
      const clave = `${c.tipo}:${c.nivel}`;
      if (!actual || actual.userData.clave !== clave) {
        if (actual) this.edificios.remove(actual);
        const e = crearEdificio(c.tipo, c.nivel);
        e.userData.clave = clave;
        this.edificios.add(e);
        this.edificiosPorId.set(c.id, e);
        this.ajustarVentana(e);
      }
      const e = this.edificiosPorId.get(c.id);
      e.userData.construccion = c;
      e.position.copy(this.posicionCelda(c.celda));
      e.scale.setScalar(ESCALA);
      e.rotation.y = (c.rotacion ?? 0) * (Math.PI / 2);
    }
    for (const [id, e] of this.edificiosPorId) {
      if (!vistos.has(id)) {
        this.edificios.remove(e);
        this.edificiosPorId.delete(id);
      }
    }
    if (animar) this.efecto(animar.id, animar.tipo);
    if (this.seleccionId !== undefined) this.seleccionar(this.seleccionId);
  }

  efecto(id, tipo) {
    const e = this.edificiosPorId.get(id);
    const pos = e ? e.position.clone() : this.ultimaPosicion?.clone();
    if (!pos) return;
    if (tipo === "demoler") {
      this.polvo(pos, "#B9A27E");
      return;
    }
    if (!e) return;
    if (this.reducirMovimiento) {
      this.polvo(pos, "#D8C7A6");
      return;
    }
    if (tipo === "construir") {
      const alto = new THREE.Box3().setFromObject(e).getSize(new THREE.Vector3()).y;
      e.position.y = 0.09 - alto;
      this.animar(1.0, (t) => { e.position.y = 0.09 - alto * (1 - salirAtras(t)); }, () => this.chispas(pos.clone().setY(1)));
      this.polvo(pos, "#D8C7A6");
    } else {
      this.animar(0.6, (t) => { e.scale.setScalar(ESCALA * (1 + Math.sin(t * Math.PI) * 0.18)); }, () => e.scale.setScalar(ESCALA));
      this.chispas(pos.clone().setY(1.2));
    }
  }

  setRacha(racha) {
    this.racha = racha;
    const k = Math.min(racha, 6) / 6;
    this.cristalMat.emissiveIntensity = 0.15 + k * 1.8;
    this.haz.material.opacity = racha >= 2 ? 0.05 + k * 0.12 : 0;
    this.haz.scale.y = 2 + k * 5;
    this.haz.position.y = 1.9 + this.haz.scale.y / 2;
    this.luzFaro.intensity = racha ? 2 + k * 10 : 0;
  }

  // ----- modos: colocar y seleccionar -----
  modoColocar({ tipo, nivel = 1, rotacion = 0, ocupadas = [], validas = [], onElegir }) {
    this.salirModo();
    this.modo = { tipo: "colocar", ocupadas: new Set(ocupadas.map((c) => c.join(","))), validas: new Set(validas.map((c) => c.join(","))), onElegir, rotacion };
    this.cuadricula.clear();
    const geo = new THREE.PlaneGeometry(1.08, 1.08).rotateX(-Math.PI / 2);
    const libre = new THREE.MeshBasicMaterial({ color: 0xf1ebdf, transparent: true, opacity: 0.16, depthWrite: false });
    const ocupada = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08, depthWrite: false });
    for (const v of validas) {
      const tile = new THREE.Mesh(geo, this.modo.ocupadas.has(v.join(",")) ? ocupada : libre);
      tile.position.copy(this.posicionCelda(v)).setY(0.1);
      this.cuadricula.add(tile);
    }
    this.cuadricula.visible = true;
    this.fantasma = crearEdificio(tipo, nivel);
    this.fantasma.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.6;
        o.castShadow = false;
      }
    });
    this.fantasma.visible = false;
    this.fantasma.scale.setScalar(ESCALA);
    this.fantasma.rotation.y = rotacion * (Math.PI / 2);
    this.scene.add(this.fantasma);
    this.orbitaObjetivo.elevacion = Math.max(this.orbitaObjetivo.elevacion, 0.78);
    this.orbitaObjetivo.distancia = Math.min(this.orbitaObjetivo.distancia, 16 + (this.radioTope - 3.4) * 2.2);
  }

  rotarFantasma() {
    if (!this.modo || this.modo.tipo !== "colocar") return 0;
    this.modo.rotacion = (this.modo.rotacion + 1) % 4;
    this.fantasma.rotation.y = this.modo.rotacion * (Math.PI / 2);
    return this.modo.rotacion;
  }

  salirModo() {
    if (this.fantasma) this.scene.remove(this.fantasma);
    this.fantasma = null;
    this.cuadricula.visible = false;
    this.cursor.visible = false;
    if (this.modo?.tipo === "colocar") {
      this.orbitaObjetivo.elevacion = 0.46;
      this.orbitaObjetivo.distancia = 20;
    }
    this.modo = null;
  }

  seleccionar(id) {
    this.seleccionId = id;
    const e = id !== null && id !== undefined ? this.edificiosPorId.get(id) : null;
    this.anillo.visible = Boolean(e);
    if (e) this.anillo.position.set(e.position.x, 0.11, e.position.z);
  }

  celdaBajoPuntero() {
    this.raycaster.setFromCamera(this.puntero, this.camera);
    const punto = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.planoTope, punto)) return null;
    return [Math.round(punto.x / this.tamCelda), Math.round(punto.z / this.tamCelda)];
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
    this.noche = noche;
    this.sol.intensity = 2.6 * (1 - noche * 0.8) * (0.55 + 0.45 * Math.sin(Math.PI * recorrido));
    this.hemi.intensity = 1.25 - noche * 0.4;
    this.luna.intensity = noche * 1.1;
    this.hemi.color.copy(arriba).lerp(C("#FFFFFF"), 0.35);
    this.estrellas.material.opacity = suavizar(0.93, 1.0, this.fase) * 0.9;
    this.renderer.toneMappingExposure = 1.05 + noche * 0.1;
    this.nubes.children.forEach((n) => n.children.forEach((p) => p.material.color.copy(C("#FFFFFF").lerp(horizonte, 0.35 + noche * 0.3))));
    if (this.bloom) this.bloom.strength = 0.25 + suavizar(0.6, 1, this.fase) * 0.55;
    this.edificios?.children.forEach((e) => this.ajustarVentana(e));
  }

  ajustarVentana(e) {
    const v = e.userData.ventana;
    if (v) v.emissiveIntensity = 0.35 + suavizar(0.6, 1.0, this.fase) * 1.7;
  }

  setDesplazamiento(lado) {
    this.desplazamientoObjetivo = typeof lado === "number" ? lado : lado ? 1 : 0;
  }

  // 1: un panel ocupa la parte de abajo (la meseta sube)
  setDesplazamientoVertical(v) {
    this.desplazamientoVObjetivo = v;
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
    let inicio = null;
    el.addEventListener("pointerdown", (e) => {
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      inicio = { x: e.clientX, y: e.clientY };
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
        this.orbitaObjetivo.azimut -= (e.clientX - previo.x) * 0.006;
        this.orbitaObjetivo.elevacion = Math.min(1.2, Math.max(0.12, this.orbitaObjetivo.elevacion + (e.clientY - previo.y) * 0.004));
      } else if (punteros.size === 2) {
        const [a, b] = [...punteros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (distanciaPinza) this.zoom(distanciaPinza / d);
        distanciaPinza = d;
      }
    });
    const soltar = (e) => {
      const fueClic = inicio && punteros.size === 1 && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 6;
      punteros.delete(e.pointerId);
      if (punteros.size < 2) distanciaPinza = 0;
      if (fueClic && e.type === "pointerup") this.clic();
      inicio = null;
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

  clic() {
    if (this.modo?.tipo === "colocar") {
      const celda = this.celdaBajoPuntero();
      if (celda && this.celdaLibre(celda)) {
        this.ultimaPosicion = this.posicionCelda(celda);
        this.modo.onElegir(celda, this.modo.rotacion);
      }
      return;
    }
    this.raycaster.setFromCamera(this.puntero, this.camera);
    const golpe = this.raycaster.intersectObjects(this.edificios.children, true)[0];
    const e = golpe?.object.userData.edificio;
    this.onSeleccionar(e ? e.userData.construccion : null);
  }

  celdaLibre(celda) {
    const k = celda.join(",");
    return this.modo.validas.has(k) && !this.modo.ocupadas.has(k);
  }

  zoom(factor) {
    this.orbitaObjetivo.distancia = Math.min(32, Math.max(8, this.orbitaObjetivo.distancia * factor));
  }

  enfocar() {
    this.orbitaObjetivo.distancia = 20;
    this.orbitaObjetivo.elevacion = 0.46;
  }

  // ----- efectos -----
  animar(duracion, paso, fin) {
    this.animaciones.push({ inicio: performance.now(), duracion: duracion * 1000, paso, fin });
  }

  particulas(origen, n, colores, velocidad, gravedad, duracion, tam) {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([origen.x, origen.y, origen.z], i * 3);
      const c = C(colores[i % colores.length]);
      col.set([c.r, c.g, c.b], i * 3);
      vel.push(velocidad(i));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const puntos = new THREE.Points(geo, new THREE.PointsMaterial({ size: tam, vertexColors: true, transparent: true, depthWrite: false }));
    this.scene.add(puntos);
    this.animar(duracion, (t, dt) => {
      const p = geo.attributes.position;
      for (let i = 0; i < n; i++) {
        vel[i].y -= gravedad * dt;
        p.setXYZ(i, p.getX(i) + vel[i].x * dt, p.getY(i) + vel[i].y * dt, p.getZ(i) + vel[i].z * dt);
      }
      p.needsUpdate = true;
      puntos.material.opacity = 1 - suavizar(0.5, 1, t);
    }, () => {
      this.scene.remove(puntos);
      geo.dispose();
      puntos.material.dispose();
    });
  }

  polvo(origen, color) {
    const n = this.calidad === "alta" ? 70 : 30;
    this.particulas(origen.clone().setY(0.2), n, [color, "#EFE3CC", "#C9A27A"], () => {
      const a = Math.random() * Math.PI * 2;
      const v = 0.8 + Math.random() * 1.4;
      return new THREE.Vector3(Math.cos(a) * v, 0.4 + Math.random() * 0.8, Math.sin(a) * v);
    }, 1.2, 1.3, 0.16);
  }

  chispas(origen) {
    const n = this.calidad === "alta" ? 120 : 50;
    this.particulas(origen, n, [GUAYACAN, "#8CC49A", "#F4EEE2", "#5FA8D3"], () => {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 2;
      return new THREE.Vector3(Math.cos(a) * v * 0.5, 2.5 + Math.random() * 3, Math.sin(a) * v * 0.5);
    }, 9.8, 1.7, 0.12);
  }

  // ----- bucle -----
  ajustarTamano() {
    const w = this.contenedor.clientWidth || window.innerWidth;
    const h = this.contenedor.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
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

    const quieto = !this.ultimaInteraccion || ahora - this.ultimaInteraccion > 5000;
    if (!this.reducirMovimiento && quieto && !this.modo) this.orbitaObjetivo.azimut += dt * 0.035;
    const suave = Math.min(1, dt * 6);
    for (const k of ["azimut", "elevacion", "distancia"]) this.orbita[k] += (this.orbitaObjetivo[k] - this.orbita[k]) * suave;

    this.desplazamiento += (this.desplazamientoObjetivo - this.desplazamiento) * Math.min(1, dt * 4);
    this.desplazamientoV = (this.desplazamientoV ?? 0) + ((this.desplazamientoVObjetivo ?? 0) - (this.desplazamientoV ?? 0)) * Math.min(1, dt * 4);
    const dx = this.ancho > 760 ? -this.ancho * 0.17 * this.desplazamiento : 0;
    const dy = this.alto * 0.2 * this.desplazamientoV;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      this.camera.setViewOffset(this.ancho, this.alto, dx, dy, this.ancho, this.alto);
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
      this.cristal.position.y = 1.78 + Math.sin(t * 1.6) * 0.05;
      this.nubes.children.forEach((n) => {
        const r = Math.hypot(n.position.x, n.position.z);
        const a = Math.atan2(n.position.z, n.position.x) + (dt * n.userData.vel) / r;
        n.position.x = Math.cos(a) * r;
        n.position.z = Math.sin(a) * r;
      });
      if (this.motas.visible) {
        const p = this.motas.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i) + dt * 0.15;
          if (y > 7) y = -1;
          p.setY(i, y);
        }
        p.needsUpdate = true;
      }
      this.edificios.traverse((o) => {
        if (o.userData.gira) o.rotation.y += dt * 1.5;
        if (o.userData.aspas) o.rotation.z += dt * 1.2;
        if (o.userData.cupula) o.rotation.y = Math.sin(t * 0.2) * 1.2;
        if (o.userData.flota) o.position.y += Math.sin(t * 4) * 0.002;
      });
      this.anillo.material.opacity = 0.6 + Math.sin(t * 4) * 0.3;
    }

    this.actualizarPuntero();
    if (this.calidad === "alta") this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  actualizarPuntero() {
    if (this.puntero.x < -2) {
      this.cursor.visible = false;
      if (this.fantasma) this.fantasma.visible = false;
      if (this.hoverActual) { this.hoverActual = null; this.onHover(null); }
      return;
    }
    if (this.modo?.tipo === "colocar") {
      const celda = this.celdaBajoPuntero();
      const dentro = celda && this.modo.validas.has(celda.join(","));
      this.cursor.visible = Boolean(dentro);
      this.fantasma.visible = Boolean(dentro);
      if (dentro) {
        const pos = this.posicionCelda(celda);
        const libre = this.celdaLibre(celda);
        this.cursor.position.set(pos.x, 0.105, pos.z);
        this.cursor.material.color.set(libre ? 0x8cc49a : 0xe5896a);
        this.fantasma.position.copy(pos);
      }
      this.renderer.domElement.style.cursor = dentro && this.celdaLibre(celda) ? "pointer" : "not-allowed";
      return;
    }
    this.raycaster.setFromCamera(this.puntero, this.camera);
    const golpe = this.raycaster.intersectObjects(this.edificios.children, true)[0];
    const e = golpe?.object.userData.edificio ?? null;
    if (e !== this.hoverActual) {
      this.hoverActual = e;
      if (!e) this.onHover(null);
    }
    if (e && this.posPuntero) this.onHover(e.userData.construccion, this.posPuntero.x, this.posPuntero.y);
    this.renderer.domElement.style.cursor = e ? "pointer" : "grab";
  }
}

// Miniatura (imagen PNG) de un edificio, para las tarjetas del menú de construcción.
let rendererMini = null;
export function miniaturaEdificio(tipo, nivel = 1) {
  try {
    if (!rendererMini) {
      rendererMini = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      rendererMini.setSize(160, 160, false);
      rendererMini.setPixelRatio(1);
      rendererMini.toneMapping = THREE.ACESFilmicToneMapping;
    }
    const escena = new THREE.Scene();
    escena.add(new THREE.HemisphereLight(0xffffff, 0x8a6a50, 1.6));
    const sol = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sol.position.set(3, 5, 4);
    escena.add(sol);
    const e = crearEdificio(tipo, nivel);
    const caja = new THREE.Box3().setFromObject(e);
    const centro = caja.getCenter(new THREE.Vector3());
    const tam = caja.getSize(new THREE.Vector3()).length();
    escena.add(e);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(centro.x + tam * 1.35, centro.y + tam * 1.0, centro.z + tam * 1.55);
    cam.lookAt(centro);
    rendererMini.render(escena, cam);
    return rendererMini.domElement.toDataURL("image/png");
  } catch {
    return null;
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

export { crearEdificio };
