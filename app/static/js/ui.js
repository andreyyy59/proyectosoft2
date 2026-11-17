// Interfaz del juego: pantallas de inicio, menú principal, HUD y hojas (paneles).
// No sabe si está en línea o en solitario: habla con un "almacén" con la misma interfaz.
import { PanelAdmin } from "./admin.js";
import { faseDelDia, miniaturaEdificio } from "./escena.js";
import { esc, fmtDuracion, fmtFecha, fmtFechaLarga, fmtPct, plural } from "./formato.js";
import { icono } from "./iconos.js";
import { calcularPuntos, calcularRacha, celdasDisponibles, costoMejora, esDiaHabil, minutos, reembolso } from "./reglas.js";
import { fijarSonido, sonar } from "./sonido.js";

const ITEMS_MENU = [
  { accion: "reportar", texto: "Registrar avance de hoy" },
  { accion: "construir", texto: "Construir" },
  { accion: "meseta", texto: "Ver mi meseta", ayuda: "Gira la meseta arrastrando. Toca un edificio para mejorarlo, moverlo o demolerlo." },
  { accion: "logros", texto: "Logros", ayuda: "Insignias que has ganado y lo que falta para las siguientes." },
  { accion: "equipo", texto: "Equipo", ayuda: "La meta de esta semana se cumple entre todos." },
  { accion: "historial", texto: "Historial", ayuda: "Tus reportes y los puntos de cada uno." },
  { accion: "como_jugar", texto: "Cómo se juega", ayuda: "Reglas, puntos, niveles y qué hacemos con tus datos." },
  { accion: "ajustes", texto: "Ajustes", ayuda: "Sonido, calidad gráfica y movimiento." },
  { accion: "salir", texto: "Salir", ayuda: "Cierra tu sesión en este dispositivo." },
];

export class Interfaz {
  constructor({ raiz, config, escena, ajustes, guardarAjustes, comprobarServidor, crearAlmacenApi, crearAlmacenLocal }) {
    Object.assign(this, { raiz, config, escena, ajustes, guardarAjustes, comprobarServidor, crearAlmacenApi, crearAlmacenLocal });
    this.tooltip = document.getElementById("tooltip");
    this.avisos = document.getElementById("avisos");
    this.velo = document.getElementById("velo");
    this.nombreRegla = Object.fromEntries(config.reglas.map((r) => [r.id, r.nombre]));
    this.insigniaPorCodigo = Object.fromEntries(config.insignias.map((i) => [i.codigo, i]));
    fijarSonido(ajustes.sonido);
    document.addEventListener("keydown", (e) => this.teclado(e));
    this.itemPorId = Object.fromEntries((config.catalogo ?? []).map((i) => [i.id, i]));
    this.miniaturas = new Map();
    if (escena) {
      escena.onHover = (c, x, y) => this.mostrarTooltip(c, x, y);
      escena.onSeleccionar = (c) => this.seleccionarEdificio(c);
    }
  }

  // =============== Arranque ===============
  async iniciar(forzarSolitario = false) {
    this.soloSolitario = forzarSolitario;
    this.pantallaCarga("Buscando el servidor del juego…");
    const enLinea = !forzarSolitario && (await this.comprobarServidor());
    this.servidorOk = enLinea;
    if (enLinea) {
      this.almacen = this.crearAlmacenApi();
      try {
        const usuario = await this.almacen.sesionActual();
        if (usuario) return this.entrarAlJuego(usuario);
      } catch {
        /* se muestra el inicio */
      }
    }
    this.pantallaInicio();
  }

  fijarVelo(tipo) {
    this.velo.dataset.tipo = tipo;
  }

  pantallaCarga(texto) {
    this.fijarVelo("inicio");
    this.raiz.innerHTML = `<div class="pantalla pantalla-centro"><p class="carga">${esc(texto)}</p></div>`;
  }

  async pantallaInicio() {
    this.fijarVelo("inicio");
    this.escena?.setDesplazamiento(1);
    const local = this.crearAlmacenLocal();
    const perfilLocal = await local.sesionActual();
    const enLinea = this.servidorOk;
    this.raiz.innerHTML = `
      <div class="pantalla pantalla-inicio">
        <div class="portada">
          <h1 class="titulo-juego">Sprint<br>Quest</h1>
          <p class="bajada">Cada día que reportas tu avance antes del cierre, tu meseta crece.</p>
          <p class="firma">Un juego para el equipo de Tiresia Soluciones Tecnológicas.</p>
          <div class="acciones-inicio">
            ${enLinea
              ? `<button class="boton boton-principal" data-ir="entrar">Entrar con mi alias</button>
                 <button class="boton boton-secundario" data-ir="solitario">${perfilLocal ? `Seguir en solitario como ${esc(perfilLocal.alias)}` : "Jugar en solitario"}</button>
                 <p class="nota">En solitario tus datos quedan solo en este navegador y no cuentan para el piloto.</p>`
              : `<div class="aviso-modo">${icono("sinNube")}<p>${this.soloSolitario
                    ? "Versión solitario: tus datos se guardan solo en este navegador."
                    : "No encontramos el servidor del juego. Puedes jugar en solitario: tus datos se guardan solo en este navegador."}</p></div>
                 <button class="boton boton-principal" data-ir="solitario">${perfilLocal ? `Seguir como ${esc(perfilLocal.alias)}` : "Jugar en solitario"}</button>
                 ${this.soloSolitario ? "" : `<button class="boton boton-secundario" data-ir="reintentar">Buscar el servidor otra vez</button>`}`}
          </div>
        </div>
      </div>`;
    this.raiz.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", async () => {
      sonar.abrir();
      const ir = b.dataset.ir;
      if (ir === "entrar") this.pantallaEntrar();
      if (ir === "reintentar") this.iniciar();
      if (ir === "solitario") {
        this.almacen = local;
        if (perfilLocal) this.entrarAlJuego(perfilLocal);
        else this.pantallaCrearPerfil();
      }
    }));
  }

  pantallaEntrar() {
    this.raiz.innerHTML = `
      <div class="pantalla pantalla-centro">
        <form class="tarjeta-form" novalidate>
          <button type="button" class="boton-icono volver" aria-label="Volver">${icono("volver")}</button>
          <h2>Entrar</h2>
          <p class="ayuda-form">Usa el alias y el PIN que te dio el administrador del juego.</p>
          <label class="campo"><span>Alias</span><input name="alias" autocomplete="username" required autocapitalize="off" spellcheck="false"></label>
          <label class="campo"><span>PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>
          <p class="error-form" role="alert"></p>
          <button class="boton boton-principal" type="submit">Entrar</button>
        </form>
      </div>`;
    const form = this.raiz.querySelector("form");
    form.alias.focus();
    form.querySelector(".volver").addEventListener("click", () => this.pantallaInicio());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const error = form.querySelector(".error-form");
      error.textContent = "";
      try {
        const usuario = await this.almacen.entrar(form.alias.value, form.pin.value);
        sonar.abrir();
        this.entrarAlJuego(usuario);
      } catch (err) {
        sonar.error();
        error.textContent = err.message;
        form.pin.select();
      }
    });
  }

  pantallaCrearPerfil() {
    const perfiles = Object.entries(this.config.perfiles);
    this.raiz.innerHTML = `
      <div class="pantalla pantalla-centro">
        <form class="tarjeta-form" novalidate>
          <button type="button" class="boton-icono volver" aria-label="Volver">${icono("volver")}</button>
          <h2>Crea tu meseta</h2>
          <p class="ayuda-form">Modo solitario: todo queda guardado en este navegador.</p>
          <label class="campo"><span>Alias</span><input name="alias" required maxlength="40" autocapitalize="off" spellcheck="false" placeholder="por ejemplo, ana.dev"></label>
          <fieldset class="campo">
            <legend>¿Qué haces en Tiresia?</legend>
            <div class="opciones-perfil">
              ${perfiles.map(([id, p], i) => `
                <label class="opcion-perfil">
                  <input type="radio" name="perfil" value="${id}" ${i === 0 ? "checked" : ""}>
                  <span class="nombre">${esc(p.nombre)}</span>
                  <span class="desc">${esc(p.descripcion)}</span>
                </label>`).join("")}
            </div>
          </fieldset>
          <label class="campo"><span>Equipo</span><input name="equipo" maxlength="60" placeholder="por ejemplo, Software Factory"></label>
          <p class="error-form" role="alert"></p>
          <button class="boton boton-principal" type="submit">Crear mi meseta</button>
        </form>
      </div>`;
    const form = this.raiz.querySelector("form");
    form.alias.focus();
    form.querySelector(".volver").addEventListener("click", () => this.pantallaInicio());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const usuario = await this.almacen.crearPerfil({ alias: form.alias.value, perfil: form.perfil.value, equipo: form.equipo.value });
        sonar.abrir();
        this.entrarAlJuego(usuario);
      } catch (err) {
        sonar.error();
        form.querySelector(".error-form").textContent = err.message;
      }
    });
  }

  pantallaConsentimiento(usuario) {
    this.fijarVelo("inicio");
    this.raiz.innerHTML = `
      <div class="pantalla pantalla-centro">
        <form class="tarjeta-form tarjeta-ancha" novalidate>
          <h2>Antes de empezar</h2>
          <div class="texto-consentimiento">
            <p>Sprint Quest es parte de un proyecto de aula de Ingeniería de Software 2 con Tiresia. El piloto mide si un juego ayuda a registrar el avance diario a tiempo.</p>
            <p><strong>Qué guardamos:</strong> tu alias, tu perfil y equipo, la fecha y hora de cada reporte, lo que escribes en él y las pantallas del juego que abres.</p>
            <p><strong>Para qué:</strong> calcular los indicadores del piloto. Los datos se analizan con códigos (J01, J02…), nunca con tu nombre.</p>
            <p><strong>Lo que no hacemos:</strong> estos datos no se usan para evaluar tu desempeño y no hay posiciones individuales.</p>
            <p>Participar es voluntario. Puedes dejar de jugar cuando quieras y pedir que borren tus datos.</p>
          </div>
          <label class="casilla"><input type="checkbox" name="acepto"> <span>Leí la información y acepto participar.</span></label>
          <p class="error-form" role="alert"></p>
          <div class="fila-botones">
            <button class="boton boton-principal" type="submit">Aceptar y empezar</button>
            <button class="boton boton-texto" type="button" data-no>No quiero participar</button>
          </div>
        </form>
      </div>`;
    const form = this.raiz.querySelector("form");
    form.acepto.focus();
    form.querySelector("[data-no]").addEventListener("click", async () => {
      await this.almacen.salir().catch(() => {});
      this.pantallaInicio();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.acepto.checked) {
        sonar.error();
        form.querySelector(".error-form").textContent = "Marca la casilla para continuar.";
        return;
      }
      await this.almacen.aceptarConsentimiento();
      sonar.logro();
      this.entrarAlJuego({ ...usuario, consintio: true });
    });
  }

  async entrarAlJuego(usuario) {
    if (usuario.es_admin) return this.abrirAdmin();
    if (!usuario.consintio) return this.pantallaConsentimiento(usuario);
    await this.refrescarEstado();
    this.montarJuego();
  }

  async refrescarEstado() {
    this.estado = await this.almacen.estado();
    const ahoraCliente = new Date();
    this.desfaseMin = minutos(this.estado.ahora) - (ahoraCliente.getHours() * 60 + ahoraCliente.getMinutes());
    this.escena?.setEstado(this.estado, this.config);
    this.actualizarCielo();
  }

  horaActual() {
    if (this.almacen?.simulado) return this.estado.ahora;
    const d = new Date();
    let m = d.getHours() * 60 + d.getMinutes() + (this.desfaseMin || 0);
    m = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  actualizarCielo() {
    if (!this.estado) return;
    this.escena?.aplicarFase(faseDelDia(this.horaActual(), this.estado.hora_limite));
  }

  // =============== Juego ===============
  montarJuego() {
    this.fijarVelo("menu");
    this.raiz.innerHTML = `
      <header class="hud"></header>
      <nav class="menu" aria-label="Menú principal">
        <ul class="lista-menu">
          ${ITEMS_MENU.map((it, i) => `<li><button class="item-menu" data-accion="${it.accion}" data-i="${i}">${esc(it.texto)}</button></li>`).join("")}
        </ul>
        <p class="ayuda-menu" aria-live="polite"></p>
      </nav>
      <button class="boton-flotante" data-volver-menu hidden>${icono("menu")}<span>Menú</span></button>
      <aside class="cierre" aria-live="polite"></aside>
      <section class="hoja" hidden role="dialog" aria-modal="true" aria-labelledby="titulo-hoja"></section>
      <section class="dock" hidden aria-label="Construir"></section>
      <aside class="panel-edificio" hidden aria-live="polite"></aside>
      <p class="pista" hidden aria-live="polite"></p>
      ${this.almacen.modo === "solitario" ? `<p class="marca-modo">${icono("sinNube")} Modo solitario</p>` : ""}`;
    this.hoja = this.raiz.querySelector(".hoja");
    this.menu = this.raiz.querySelector(".menu");
    this.pintarHud();
    this.pintarCierre();
    const ayuda = this.raiz.querySelector(".ayuda-menu");
    this.raiz.querySelectorAll(".item-menu").forEach((b) => {
      const mostrarAyuda = () => {
        const it = ITEMS_MENU[b.dataset.i];
        ayuda.textContent = it.accion === "reportar" ? this.ayudaReportar()
          : it.accion === "construir" ? `Tienes ${this.estado.materiales} materiales. Elige qué construir y dónde ponerlo.` : it.ayuda;
        this.raiz.querySelectorAll(".item-menu").forEach((x) => x.classList.toggle("activo", x === b));
      };
      b.addEventListener("focus", () => { mostrarAyuda(); sonar.mover(); });
      b.addEventListener("mouseenter", () => b.focus({ preventScroll: true }));
      b.addEventListener("click", () => this.accion(b.dataset.accion));
    });
    this.raiz.querySelector("[data-volver-menu]").addEventListener("click", () => this.mostrarMenu());
    this.mostrarMenu();
    clearInterval(this.intervalo);
    this.intervalo = setInterval(() => { this.pintarCierre(); this.actualizarCielo(); }, 30000);
  }

  ayudaReportar() {
    if (this.estado.reporto_hoy) return "Ya reportaste hoy. Un segundo reporte se guarda, pero no suma puntos.";
    return `Cuenta en qué trabajaste. Antes de las ${this.estado.hora_limite} ganas el bono de puntualidad.`;
  }

  pintarHud() {
    const e = this.estado;
    const n = e.nivel;
    const perfil = this.config.perfiles[e.usuario.perfil]?.nombre ?? e.usuario.perfil;
    const progreso = n.siguiente_min ? `${e.puntos - n.min} de ${n.siguiente_min - n.min} puntos para ${esc(n.siguiente_nombre)}` : "Nivel máximo";
    this.raiz.querySelector(".hud").innerHTML = `
      <div class="hud-id">
        <p class="alias">${esc(e.usuario.alias)}</p>
        <p class="perfil">${esc(perfil)}, ${esc(e.usuario.equipo)}</p>
        <div class="nivel" title="${progreso}">
          <p class="nombre-nivel"><span class="numero-nivel">${n.numero}</span>${esc(n.nombre)}</p>
          <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(n.progreso * 100)}" aria-label="Progreso de nivel"><i style="width:${n.progreso * 100}%"></i></div>
          <p class="xp">${progreso}</p>
        </div>
      </div>
      <div class="hud-stats">
        <div class="stat stat-racha ${e.racha ? "encendida" : ""}">${icono("llama")}<b>${e.racha}</b><span>${e.racha === 1 ? "día de racha" : "días de racha"}</span></div>
        <div class="stat stat-materiales" title="Materiales para construir">${icono("bloque")}<b>${e.materiales}</b><span>materiales</span></div>
        <div class="stat"><b>${e.puntos}</b><span>puntos</span></div>
        <button class="boton-icono" data-sonido aria-label="${this.ajustes.sonido ? "Silenciar" : "Activar sonido"}">${icono(this.ajustes.sonido ? "sonido" : "silencio")}</button>
      </div>`;
    this.raiz.querySelector("[data-sonido]").addEventListener("click", () => {
      this.ajustes.sonido = !this.ajustes.sonido;
      fijarSonido(this.ajustes.sonido);
      this.guardarAjustes(this.ajustes);
      this.pintarHud();
    });
  }

  pintarCierre() {
    const caja = this.raiz.querySelector(".cierre");
    if (!caja || !this.estado) return;
    const e = this.estado;
    const ahora = minutos(this.horaActual());
    const limite = minutos(e.hora_limite);
    let texto;
    let clase = "";
    if (e.reporto_hoy) {
      texto = "Ya reportaste hoy. Vuelve mañana para seguir la racha.";
      clase = "listo";
    } else if (!esDiaHabil(e.hoy)) {
      texto = "Hoy es fin de semana: la racha no se pierde.";
    } else if (ahora <= limite) {
      texto = `Cierre a las ${e.hora_limite}. Faltan ${fmtDuracion(limite - ahora)}.`;
      clase = limite - ahora <= 60 ? "urgente" : "";
    } else {
      texto = `El cierre fue a las ${e.hora_limite}. Aún puedes reportar, sin bono de puntualidad.`;
      clase = "tarde";
    }
    caja.className = `cierre ${clase}`;
    caja.innerHTML = `${icono("reloj")}<span>${texto}</span>`;
  }

  mostrarMenu() {
    this.cerrarHoja(false);
    this.cerrarConstruccion();
    this.menu.hidden = false;
    this.raiz.querySelector("[data-volver-menu]").hidden = true;
    this.raiz.querySelector(".cierre").hidden = false;
    this.fijarVelo("menu");
    this.escena?.setDesplazamiento(true);
    (this.raiz.querySelector(".item-menu.activo") || this.raiz.querySelector(".item-menu")).focus({ preventScroll: true });
  }

  explorar() {
    this.cerrarConstruccion();
    this.menu.hidden = true;
    this.raiz.querySelector(".cierre").hidden = true;
    this.raiz.querySelector("[data-volver-menu]").hidden = false;
    this.fijarVelo("explorar");
    this.escena?.setDesplazamiento(false);
    this.raiz.querySelector("[data-volver-menu]").focus();
    this.almacen.telemetria("base");
  }

  accion(accion) {
    sonar.abrir();
    if (accion === "meseta") return this.explorar();
    if (accion === "construir") return this.modoConstruir();
    if (accion === "salir") return this.salir();
    const vistas = {
      reportar: () => this.vistaReportar(),
      logros: () => this.vistaLogros(),
      equipo: () => this.vistaEquipo(),
      historial: () => this.vistaHistorial(),
      como_jugar: () => this.vistaComoJugar(),
      ajustes: () => this.vistaAjustes(),
    };
    if (accion !== "reportar") this.almacen.telemetria(accion);
    vistas[accion]?.();
  }

  async salir() {
    clearInterval(this.intervalo);
    await this.almacen.salir().catch(() => {});
    this.estado = null;
    this.escena?.setEstado({ nivel: { numero: 1 }, racha: 0, reportes: [] }, this.config);
    this.pantallaInicio();
  }

  // =============== Hojas ===============
  abrirHoja(titulo, contenido, { ancha = false } = {}) {
    this.menu.hidden = true;
    this.raiz.querySelector(".cierre").hidden = true;
    this.fijarVelo("hoja");
    this.escena?.setDesplazamiento(-1);
    this.hoja.hidden = false;
    this.hoja.classList.toggle("ancha", ancha);
    this.hoja.innerHTML = `
      <header class="cabecera-hoja">
        <h2 id="titulo-hoja">${esc(titulo)}</h2>
        <button class="boton-icono" data-cerrar aria-label="Cerrar">${icono("cerrar")}</button>
      </header>
      <div class="cuerpo-hoja">${contenido}</div>`;
    this.hoja.querySelector("[data-cerrar]").addEventListener("click", () => { sonar.cerrar(); this.mostrarMenu(); });
    requestAnimationFrame(() => this.hoja.classList.add("abierta"));
    return this.hoja.querySelector(".cuerpo-hoja");
  }

  cerrarHoja() {
    if (!this.hoja) return;
    this.hoja.classList.remove("abierta");
    this.hoja.hidden = true;
    this.hoja.innerHTML = "";
  }

  // ----- Registrar avance -----
  vistaReportar() {
    const perfil = this.config.perfiles[this.estado.usuario.perfil];
    const tipos = [...perfil.evidencias, "ninguna"];
    const aviso = this.estado.reporto_hoy
      ? `<p class="aviso-suave">Ya registraste tu avance de hoy. Puedes enviar otro para dejar constancia, pero no sumará puntos.</p>`
      : "";
    const cuerpo = this.abrirHoja("Registrar avance de hoy", `
      ${aviso}
      <form class="form-reporte" novalidate>
        <label class="campo"><span>¿En qué trabajaste hoy?</span>
          <input name="tarea" maxlength="200" required placeholder="por ejemplo, endpoint de pedidos para Logista Sales"></label>
        <div class="campo-doble">
          <label class="campo"><span>Avance de la tarea <output name="salidaAvance">50 %</output></span>
            <input type="range" name="avance" min="0" max="100" step="5" value="50"></label>
          <label class="campo"><span>Horas dedicadas</span>
            <input type="number" name="horas" min="0.5" max="24" step="0.5" value="8" inputmode="decimal"></label>
        </div>
        <fieldset class="campo">
          <legend>Evidencia</legend>
          <div class="chips">
            ${tipos.map((t, i) => `<label class="chip"><input type="radio" name="evidencia_tipo" value="${t}" ${i === 0 ? "checked" : ""}><span>${esc(this.config.evidencias[t])}</span></label>`).join("")}
          </div>
        </fieldset>
        <label class="campo" data-ref><span>Enlace o referencia</span>
          <input name="evidencia_ref" maxlength="300" placeholder="URL del commit, número de ticket o nombre del acta"></label>
        <label class="casilla"><input type="checkbox" name="hayBloqueo"> <span>Algo me está bloqueando</span></label>
        <label class="campo" data-bloqueo hidden><span>¿Qué te bloquea? Tu equipo lo verá para ayudarte.</span>
          <textarea name="bloqueo" maxlength="500" rows="2"></textarea></label>
        <div class="vista-previa" aria-live="polite"></div>
        <p class="error-form" role="alert"></p>
        <button class="boton boton-principal boton-grande" type="submit">Registrar avance</button>
      </form>`);
    const form = cuerpo.querySelector("form");
    const actualizar = () => {
      form.salidaAvance.value = `${form.avance.value} %`;
      const tipo = form.evidencia_tipo.value;
      cuerpo.querySelector("[data-ref]").hidden = tipo === "ninguna";
      cuerpo.querySelector("[data-bloqueo]").hidden = !form.hayBloqueo.checked;
      this.pintarVistaPrevia(cuerpo.querySelector(".vista-previa"), tipo !== "ninguna", form.hayBloqueo.checked && form.bloqueo.value.trim());
    };
    form.addEventListener("input", actualizar);
    form.addEventListener("change", actualizar);
    actualizar();
    form.tarea.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const boton = form.querySelector("[type=submit]");
      boton.disabled = true;
      try {
        const resultado = await this.almacen.registrarReporte({
          tarea: form.tarea.value,
          avance: Number(form.avance.value),
          horas: Number(form.horas.value),
          evidencia_tipo: form.evidencia_tipo.value,
          evidencia_ref: form.evidencia_ref.value,
          bloqueo: form.hayBloqueo.checked ? form.bloqueo.value : "",
        });
        await this.refrescarTrasReporte(resultado);
      } catch (err) {
        sonar.error();
        form.querySelector(".error-form").textContent = err.message;
        boton.disabled = false;
      }
    });
  }

  pintarVistaPrevia(caja, conEvidencia, conBloqueo) {
    const e = this.estado;
    const hora = this.horaActual();
    const fechas = new Set(e.reportes.filter((r) => r.a_tiempo && !r.duplicado).map((r) => r.fecha));
    const aTiempo = minutos(hora) <= minutos(e.hora_limite) && !e.reporto_hoy;
    if (aTiempo) fechas.add(e.hoy);
    const r = calcularPuntos({
      fecha: e.hoy, hora, hora_limite: e.hora_limite, tiene_evidencia: conEvidencia,
      reporto_bloqueo: Boolean(conBloqueo), racha: aTiempo ? calcularRacha(fechas, e.hoy) : 0, es_duplicado: e.reporto_hoy,
    }, this.config);
    caja.innerHTML = r.total
      ? `<p class="total-previo">Si lo registras ahora: <b>+${r.total}</b> puntos</p>
         <p class="desglose-previo">${r.desglose.map((l) => `${esc(this.nombreRegla[l.regla])} +${l.puntos}`).join(", ")}</p>`
      : `<p class="total-previo">Este reporte se guardará sin sumar puntos.</p>`;
  }

  async refrescarTrasReporte(resultado) {
    this.estado = await this.almacen.estado();
    this.escena?.setEstado(this.estado, this.config);
    this.pintarHud();
    this.pintarCierre();
    this.vistaResultado(resultado);
  }

  vistaResultado(r) {
    const total = r.resultado.total;
    const lineas = r.resultado.desglose;
    const nivel = r.nivel_despues;
    const cuerpo = this.abrirHoja(total ? "Avance registrado" : "Reporte guardado", `
      <div class="resultado">
        <p class="puntos-ganados"><span class="signo">+</span><span data-contador>0</span><span class="unidad">puntos</span></p>
        ${total ? `<p class="materiales-ganados">${icono("bloque")}<span>+${r.materiales_ganados} materiales para construir. Tienes ${r.materiales}.</span></p>` : ""}
        ${r.resultado.motivo ? `<p class="aviso-suave">${esc(r.resultado.motivo)}</p>` : ""}
        <ul class="desglose">
          ${lineas.map((l) => `<li><span>${esc(this.nombreRegla[l.regla])}${l.regla === "racha" ? ` (${plural(r.racha, "día", "días")})` : ""}</span><b>+${l.puntos}</b></li>`).join("")}
        </ul>
        ${!r.reporte.a_tiempo && !r.reporte.duplicado ? `<p class="nota">Llegó ${fmtDuracion(r.reporte.minutos_retraso)} después del cierre. Mañana, antes de las ${esc(this.estado.hora_limite)}, recuperas el bono.</p>` : ""}
        <div class="nivel-resultado ${r.subio_nivel ? "subio" : ""}">
          <p>${r.subio_nivel ? `Subiste a nivel ${nivel.numero}: ${esc(nivel.nombre)}` : `Nivel ${nivel.numero}: ${esc(nivel.nombre)}`}</p>
          <div class="barra"><i style="width:${r.subio_nivel ? 0 : r.nivel_antes.progreso * 100}%"></i></div>
        </div>
        ${r.nuevas_insignias.length ? `<div class="nuevas-insignias">${r.nuevas_insignias.map((c) => this.tarjetaInsignia(this.insigniaPorCodigo[c], true)).join("")}</div>` : ""}
        ${(r.nuevos_edificios ?? []).length ? `<div class="desbloqueos"><h3>Nuevo edificio disponible</h3>${r.nuevos_edificios.map((t) => `
          <div class="desbloqueo"><img src="${this.miniatura(t)}" alt=""><div><b>${esc(this.itemPorId[t].nombre)}</b><span class="nota">${this.itemPorId[t].costo} materiales</span></div></div>`).join("")}</div>` : ""}
        <div class="fila-botones">
          <button class="boton boton-principal" data-construir>${icono("martillo")}Construir</button>
          <button class="boton boton-secundario" data-ver>Ver mi meseta</button>
          <button class="boton boton-secundario" data-menu>Volver al menú</button>
        </div>
      </div>`);
    const lis = [...cuerpo.querySelectorAll(".desglose li")];
    const contador = cuerpo.querySelector("[data-contador]");
    const rapido = this.ajustes.movimientoReducido;
    lis.forEach((li, i) => {
      if (rapido) return li.classList.add("visible");
      setTimeout(() => { li.classList.add("visible"); sonar.punto(i); }, 350 + i * 260);
    });
    const duracion = rapido ? 0 : 350 + lis.length * 260;
    const inicio = performance.now();
    const paso = (ahora) => {
      const k = duracion ? Math.min(1, (ahora - inicio) / duracion) : 1;
      contador.textContent = Math.round(total * k);
      if (k < 1) requestAnimationFrame(paso);
      else {
        cuerpo.querySelector(".nivel-resultado .barra i").style.width = `${nivel.progreso * 100}%`;
        if (r.nuevas_insignias.length || r.subio_nivel) sonar.logro();
      }
    };
    requestAnimationFrame(paso);
    cuerpo.querySelector("[data-ver]").addEventListener("click", () => { this.cerrarHoja(); this.explorar(); });
    cuerpo.querySelector("[data-construir]").addEventListener("click", () => { this.cerrarHoja(); this.modoConstruir(); });
    cuerpo.querySelector("[data-menu]").addEventListener("click", () => this.mostrarMenu());
    cuerpo.querySelector("[data-construir]").focus();
  }

  // ----- Logros -----
  tarjetaInsignia(ins, obtenida, extra = "") {
    return `
      <article class="insignia ${obtenida ? "obtenida" : "bloqueada"}">
        <div class="medalla">${icono(obtenida ? ins.icono : "candado")}</div>
        <div>
          <h3>${esc(ins.nombre)}</h3>
          <p>${esc(ins.descripcion)}</p>
          ${extra}
        </div>
      </article>`;
  }

  vistaLogros() {
    const est = this.estado.estadisticas;
    const ganadas = this.estado.insignias.filter((i) => i.obtenida).length;
    this.abrirHoja("Logros", `
      <p class="lead-hoja">${ganadas} de ${this.estado.insignias.length} insignias. Tu racha más larga: ${plural(this.estado.racha_maxima, "día", "días")}.</p>
      <div class="rejilla-insignias">
        ${this.estado.insignias.map((i) => {
          const def = this.insigniaPorCodigo[i.codigo];
          const valor = Math.min(est[def.estadistica] ?? 0, def.minimo);
          const extra = i.obtenida
            ? `<p class="fecha-insignia">Obtenida el ${fmtFecha(i.fecha)}</p>`
            : `<div class="barra barra-fina"><i style="width:${(valor / def.minimo) * 100}%"></i></div><p class="fecha-insignia">${valor} de ${def.minimo}</p>`;
          return this.tarjetaInsignia(def, i.obtenida, extra);
        }).join("")}
      </div>`);
  }

  // ----- Equipo -----
  async vistaEquipo() {
    const cuerpo = this.abrirHoja("Equipo", `<p class="carga">Cargando…</p>`);
    try {
      const d = await this.almacen.equipo();
      cuerpo.innerHTML = `
        <p class="lead-hoja">Meta de esta semana: que el ${d.meta} % de los reportes de cada equipo lleguen a tiempo. Llevamos ${plural(d.dias_habiles, "día hábil", "días hábiles")}.</p>
        <ul class="lista-equipos">
          ${d.equipos.map((eq) => `
            <li class="${eq.equipo === this.estado.usuario.equipo ? "mi-equipo" : ""}">
              <div class="fila-equipo"><h3>${esc(eq.equipo)}</h3><b>${fmtPct(eq.porcentaje)}</b></div>
              <div class="barra barra-meta" style="--meta:${d.meta}%"><i style="width:${Math.min(eq.porcentaje, 100)}%"></i></div>
              <p class="detalle-equipo">${eq.a_tiempo} de ${eq.esperado} reportes a tiempo, ${plural(eq.miembros, "persona", "personas")}${eq.cumplida ? ". Meta cumplida." : ""}</p>
            </li>`).join("")}
        </ul>
        <p class="nota">No mostramos posiciones individuales: aquí se gana en equipo.</p>`;
    } catch (err) {
      cuerpo.innerHTML = `<p class="error-form">${esc(err.message)}</p>`;
    }
  }

  // ----- Historial -----
  vistaHistorial() {
    const reps = this.estado.reportes;
    this.abrirHoja("Historial", reps.length
      ? `<ol class="historial">
          ${reps.map((r) => `
            <li class="${r.duplicado ? "duplicado" : r.a_tiempo ? "a-tiempo" : "tarde"}">
              <div class="fila-hist">
                <p class="fecha-hist">${fmtFecha(r.fecha)}, ${esc(r.hora)}</p>
                <p class="puntos-hist">+${r.puntos}</p>
              </div>
              <p class="tarea-hist">${esc(r.tarea)}</p>
              <p class="meta-hist">${r.duplicado ? "Segundo reporte del día" : r.a_tiempo ? "A tiempo" : `Tarde por ${fmtDuracion(r.minutos_retraso)}`}. ${esc(this.config.evidencias[r.evidencia_tipo])}. Avance ${r.avance} %, ${r.horas} h.${r.bloqueo ? " Reportó un bloqueo." : ""}</p>
            </li>`).join("")}
        </ol>`
      : `<div class="vacio"><p>Aún no tienes reportes.</p><button class="boton boton-principal" data-reportar>Registrar el primero</button></div>`);
    this.hoja.querySelector("[data-reportar]")?.addEventListener("click", () => this.accion("reportar"));
  }

  // ----- Cómo se juega -----
  vistaComoJugar() {
    const p = this.config.puntos;
    const puntos = { base: p.base, puntualidad: p.puntualidad, evidencia: p.evidencia, transparencia: p.transparencia, racha: `+${p.racha_por_dia} por día, hasta ${p.racha_maximo}` };
    this.abrirHoja("Cómo se juega", `
      <p class="lead-hoja">${esc(this.config.conducta_objetivo)} Cada día que lo haces, tu meseta suma un módulo.</p>
      <h3 class="subtitulo">Puntos por reporte</h3>
      <table class="tabla">
        <tbody>${this.config.reglas.map((r) => `<tr><th scope="row">${esc(r.nombre)}</th><td>${esc(r.descripcion)}</td><td class="num">${typeof puntos[r.id] === "number" ? `+${puntos[r.id]}` : esc(puntos[r.id])}</td></tr>`).join("")}</tbody>
      </table>
      <p class="nota">Solo el primer reporte de cada día suma puntos. La racha cuenta días hábiles: el fin de semana no la rompe. La hora límite es ${esc(this.estado.hora_limite)}.</p>
      <h3 class="subtitulo">Niveles</h3>
      <ol class="niveles">${this.config.niveles.map((n) => `<li class="${n.numero === this.estado.nivel.numero ? "actual" : ""}"><span>${esc(n.nombre)}</span><span class="num">${n.min} puntos</span></li>`).join("")}</ol>
      <h3 class="subtitulo">Tu meseta</h3>
      <p>Cada reporte te da tantos materiales como puntos gana. Con ellos construyes en tu meseta lo que quieras y donde quieras, mejoras los edificios hasta el nivel ${this.config.construccion.nivel_maximo} o los mueves. Si demueles algo, recuperas la mitad de lo invertido.</p>
      <p>Los edificios especiales se desbloquean con tu trabajo: la torre de código al reportar un commit, el laboratorio con una prueba, la casa del cliente con un acta. El faro del centro brilla más mientras más larga es tu racha, y la meseta se ensancha cuando subes de nivel.</p>
      <table class="tabla"><tbody>${this.catalogoDelPerfil().map((i) => `<tr><th scope="row">${esc(i.nombre)}</th><td>${esc(i.requisito.tipo === "nivel" ? (i.requisito.valor === 1 ? "Disponible desde el inicio" : `Nivel ${i.requisito.valor}`) : i.descripcion)}</td><td class="num">${i.costo}</td></tr>`).join("")}</tbody></table>
      <h3 class="subtitulo">Tus datos</h3>
      <p>Los indicadores del piloto se calculan con códigos anónimos. El juego no muestra posiciones individuales y los datos no se usan para evaluar tu desempeño.</p>`);
  }

  // ----- Ajustes -----
  vistaAjustes() {
    const a = this.ajustes;
    const cuerpo = this.abrirHoja("Ajustes", `
      <div class="ajustes">
        <label class="interruptor"><span>Sonido</span><input type="checkbox" name="sonido" ${a.sonido ? "checked" : ""}></label>
        <label class="interruptor"><span>Reducir movimiento</span><input type="checkbox" name="movimientoReducido" ${a.movimientoReducido ? "checked" : ""}></label>
        <fieldset class="campo">
          <legend>Calidad gráfica</legend>
          <div class="chips">
            <label class="chip"><input type="radio" name="calidad" value="alta" ${a.calidad === "alta" ? "checked" : ""}><span>Alta, con sombras</span></label>
            <label class="chip"><input type="radio" name="calidad" value="baja" ${a.calidad === "baja" ? "checked" : ""}><span>Baja, para equipos lentos</span></label>
          </div>
        </fieldset>
        <p class="nota">Modo: ${this.almacen.modo === "en_linea" ? "en línea. Tus reportes se guardan en el servidor del piloto." : "solitario. Tus reportes se guardan solo en este navegador."}</p>
        ${this.almacen.modo === "solitario" ? `
          <div class="fila-botones">
            <button class="boton boton-secundario" data-admin>Ver indicadores con mis datos</button>
            <button class="boton boton-peligro" data-borrar>Borrar mis datos de este navegador</button>
          </div>` : ""}
      </div>`);
    cuerpo.addEventListener("change", (e) => {
      const t = e.target;
      if (t.name === "sonido") { a.sonido = t.checked; fijarSonido(a.sonido); this.pintarHud(); }
      if (t.name === "movimientoReducido") { a.movimientoReducido = t.checked; this.escena?.setMovimientoReducido(t.checked); document.documentElement.classList.toggle("sin-movimiento", t.checked); }
      if (t.name === "calidad") { a.calidad = t.value; this.escena?.setCalidad(t.value); }
      this.guardarAjustes(a);
    });
    cuerpo.querySelector("[data-admin]")?.addEventListener("click", () => this.abrirAdmin(true));
    cuerpo.querySelector("[data-borrar]")?.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirmar) {
        b.dataset.confirmar = "1";
        b.textContent = "Confirmar: borrar todo";
        return;
      }
      await this.almacen.borrarTodo();
      clearInterval(this.intervalo);
      this.escena?.setEstado({ nivel: { numero: 1 }, racha: 0, reportes: [] }, this.config);
      this.pantallaInicio();
    });
  }

  // =============== Administrador ===============
  abrirAdmin(desdeSolitario = false) {
    clearInterval(this.intervalo);
    this.fijarVelo("admin");
    this.escena?.setDesplazamiento(false);
    const panel = new PanelAdmin({
      raiz: this.raiz,
      almacen: this.almacen,
      config: this.config,
      local: desdeSolitario,
      alSalir: async () => {
        if (desdeSolitario) return this.montarJuego();
        await this.almacen.salir().catch(() => {});
        this.pantallaInicio();
      },
    });
    panel.montar();
  }

  // =============== Construcción ===============
  miniatura(tipo, nivel = 1) {
    const clave = `${tipo}:${nivel}`;
    if (!this.miniaturas.has(clave)) this.miniaturas.set(clave, (this.escena && miniaturaEdificio(tipo, nivel)) || "");
    return this.miniaturas.get(clave);
  }

  get dock() {
    return this.raiz.querySelector(".dock");
  }

  get panel() {
    return this.raiz.querySelector(".panel-edificio");
  }

  get pista() {
    return this.raiz.querySelector(".pista");
  }

  // Edificios que este perfil puede llegar a desbloquear
  catalogoDelPerfil() {
    const permitidas = new Set(this.config.perfiles[this.estado.usuario.perfil].evidencias);
    return this.config.catalogo.filter((i) => i.requisito.tipo !== "evidencia" || i.requisito.valor.some((t) => permitidas.has(t)));
  }

  modoConstruir() {
    this.cerrarHoja();
    this.menu.hidden = true;
    this.raiz.querySelector(".cierre").hidden = true;
    this.raiz.querySelector("[data-volver-menu]").hidden = true;
    this.fijarVelo("explorar");
    this.escena?.setDesplazamiento(false);
    this.escena?.setDesplazamientoVertical(1);
    this.dock.hidden = false;
    this.pintarDock();
    this.almacen.telemetria("construir");
    this.dock.querySelector(".tarjeta-edificio:not([aria-disabled=true])")?.focus();
  }

  pintarDock(seleccionado = null) {
    const estados = Object.fromEntries((this.estado.catalogo ?? []).map((e) => [e.id, e]));
    const mats = this.estado.materiales;
    this.dock.innerHTML = `
      <header class="dock-cabecera">
        <div>
          <h2>Construir</h2>
          <p class="nota">${icono("bloque")}<span>Tienes <b>${mats}</b> materiales. Cada reporte te da tantos como puntos gane.</span></p>
        </div>
        <button class="boton boton-secundario" data-listo>Listo</button>
      </header>
      <ul class="tarjetas-edificio">
        ${this.catalogoDelPerfil().map((item) => {
          const est = estados[item.id] ?? { desbloqueado: false, falta: "" };
          const falta = Math.max(0, item.costo - mats);
          const usable = est.desbloqueado && !falta;
          const detalle = !est.desbloqueado ? est.falta : falta ? `Te faltan ${falta} materiales.` : item.descripcion;
          return `<li><button class="tarjeta-edificio ${est.desbloqueado ? "" : "bloqueada"} ${seleccionado === item.id ? "elegida" : ""}" data-tipo="${item.id}" aria-disabled="${!usable}">
            <span class="miniatura">${est.desbloqueado ? `<img src="${this.miniatura(item.id)}" alt="">` : icono("candado")}</span>
            <span class="nombre">${esc(item.nombre)}</span>
            <span class="costo ${falta ? "corto" : ""}">${icono("bloque")}${item.costo}</span>
            <span class="detalle">${esc(detalle)}</span>
          </button></li>`;
        }).join("")}
      </ul>`;
    this.dock.querySelector("[data-listo]").addEventListener("click", () => { sonar.cerrar(); this.mostrarMenu(); });
    this.dock.querySelectorAll(".tarjeta-edificio").forEach((b) => b.addEventListener("click", () => {
      if (b.getAttribute("aria-disabled") === "true") {
        sonar.error();
        this.aviso(b.querySelector(".detalle").textContent);
        return;
      }
      sonar.abrir();
      this.colocar(b.dataset.tipo);
    }));
  }

  celdasLibres(ignorarId = null) {
    return {
      ocupadas: this.estado.construcciones.filter((c) => c.id !== ignorarId).map((c) => c.celda),
      validas: celdasDisponibles(this.estado.nivel.numero, this.config),
    };
  }

  colocar(tipo) {
    if (!this.escena) return this.aviso("Este navegador no muestra 3D: no se puede construir aquí.");
    this.seleccionarEdificio(null);
    this.pintarDock(tipo);
    const { ocupadas, validas } = this.celdasLibres();
    if (validas.length <= ocupadas.length) return this.aviso("Tu meseta está llena. Sube de nivel para que crezca, o demuele algo.");
    this.mostrarPista(`Toca un lugar libre de la meseta para poner: ${this.itemPorId[tipo].nombre}.`);
    this.escena.modoColocar({
      tipo, ocupadas, validas,
      onElegir: (celda, rotacion) => this.confirmarConstruccion(tipo, celda, rotacion),
    });
  }

  mostrarPista(texto) {
    this.pista.hidden = false;
    this.pista.innerHTML = `<span>${esc(texto)}</span><span class="teclas"><kbd>R</kbd> girar <kbd>Esc</kbd> cancelar</span>`;
  }

  cancelarColocacion() {
    this.escena?.salirModo();
    this.pista.hidden = true;
    if (!this.dock.hidden) this.pintarDock();
    sonar.cerrar();
  }

  async confirmarConstruccion(tipo, celda, rotacion) {
    this.escena.salirModo();
    this.pista.hidden = true;
    try {
      const r = await this.almacen.construir(tipo, celda, rotacion);
      await this.trasCambioEdificio({ id: r.construccion.id, tipo: "construir" });
      sonar.logro();
      this.aviso(`Construiste: ${this.itemPorId[tipo].nombre}.`);
    } catch (err) {
      sonar.error();
      this.aviso(err.message);
    }
    if (!this.dock.hidden) this.pintarDock();
  }

  async trasCambioEdificio(animar) {
    this.estado = await this.almacen.estado();
    this.escena?.sincronizarEdificios(this.estado.construcciones, { animar });
    this.pintarHud();
  }

  cerrarConstruccion() {
    this.escena?.setDesplazamientoVertical(0);
    this.escena?.salirModo();
    this.escena?.seleccionar(null);
    if (this.raiz.querySelector(".dock")) {
      this.dock.hidden = true;
      this.panel.hidden = true;
      this.pista.hidden = true;
    }
  }

  seleccionarEdificio(c) {
    const disponible = this.menu && this.menu.hidden && this.hoja.hidden;
    if (!c || !disponible) {
      this.escena?.seleccionar(null);
      if (this.raiz.querySelector(".panel-edificio")) this.panel.hidden = true;
      return;
    }
    sonar.mover();
    this.escena.seleccionar(c.id);
    const item = this.itemPorId[c.tipo];
    const maximo = this.config.construccion.nivel_maximo;
    const costo = costoMejora(item, c.nivel, this.config);
    const devuelve = reembolso(c.gastado, this.config);
    const alcanza = costo !== null && this.estado.materiales >= costo;
    this.panel.hidden = false;
    this.panel.innerHTML = `
      <button class="boton-icono cerrar-panel" data-cerrar aria-label="Cerrar">${icono("cerrar")}</button>
      <img src="${this.miniatura(c.tipo, c.nivel)}" alt="">
      <h3>${esc(item.nombre)}</h3>
      <div class="niveles-edificio" aria-label="Nivel ${c.nivel} de ${maximo}">${Array.from({ length: maximo }, (_, i) => `<i class="${i < c.nivel ? "lleno" : ""}"></i>`).join("")}</div>
      <div class="acciones-edificio">
        <button class="boton boton-principal" data-mejorar ${alcanza ? "" : "disabled"}>${icono("mejorar")}${costo === null ? "Nivel máximo" : `Mejorar (${costo})`}</button>
        <button class="boton boton-secundario" data-mover>${icono("mover")}Mover o girar</button>
        <button class="boton boton-texto" data-demoler>Demoler (te devuelve ${devuelve})</button>
      </div>
      ${costo !== null && !alcanza ? `<p class="nota">Te faltan ${costo - this.estado.materiales} materiales para mejorarlo.</p>` : ""}`;
    this.panel.querySelector("[data-cerrar]").addEventListener("click", () => this.seleccionarEdificio(null));
    this.panel.querySelector("[data-mejorar]").addEventListener("click", async () => {
      try {
        await this.almacen.mejorar(c.id);
        await this.trasCambioEdificio({ id: c.id, tipo: "mejorar" });
        sonar.logro();
        this.seleccionarEdificio(this.estado.construcciones.find((x) => x.id === c.id));
        if (!this.dock.hidden) this.pintarDock();
      } catch (err) {
        sonar.error();
        this.aviso(err.message);
      }
    });
    this.panel.querySelector("[data-mover]").addEventListener("click", () => {
      this.panel.hidden = true;
      const { ocupadas, validas } = this.celdasLibres(c.id);
      this.mostrarPista(`Elige el nuevo lugar para ${item.nombre}.`);
      this.escena.modoColocar({
        tipo: c.tipo, nivel: c.nivel, rotacion: c.rotacion, ocupadas, validas,
        onElegir: async (celda, rotacion) => {
          this.escena.salirModo();
          this.pista.hidden = true;
          try {
            await this.almacen.mover(c.id, celda, rotacion);
            await this.trasCambioEdificio({ id: c.id, tipo: "mejorar" });
            sonar.abrir();
          } catch (err) {
            sonar.error();
            this.aviso(err.message);
          }
        },
      });
    });
    const demoler = this.panel.querySelector("[data-demoler]");
    demoler.addEventListener("click", async () => {
      if (!demoler.dataset.confirmar) {
        demoler.dataset.confirmar = "1";
        demoler.textContent = "Confirmar: demoler";
        demoler.classList.add("peligro");
        return;
      }
      try {
        const r = await this.almacen.demoler(c.id);
        this.panel.hidden = true;
        this.escena.seleccionar(null);
        await this.trasCambioEdificio({ id: c.id, tipo: "demoler" });
        sonar.cerrar();
        this.aviso(`Demolido. Recuperaste ${r.devuelto} materiales.`);
        if (!this.dock.hidden) this.pintarDock();
      } catch (err) {
        sonar.error();
        this.aviso(err.message);
      }
    });
  }

  // =============== Varios ===============
  mostrarTooltip(c, x, y) {
    if (!c || !this.menu || !this.menu.hidden || !this.hoja.hidden) {
      this.tooltip.hidden = true;
      return;
    }
    const item = this.itemPorId[c.tipo];
    this.tooltip.hidden = false;
    this.tooltip.innerHTML = `<b>${esc(item?.nombre ?? c.tipo)}</b><span>Nivel ${c.nivel} de ${this.config.construccion.nivel_maximo}. Tócalo para ver opciones.</span>`;
    const w = this.tooltip.offsetWidth;
    this.tooltip.style.left = `${Math.min(x + 14, window.innerWidth - w - 12)}px`;
    this.tooltip.style.top = `${y + 16}px`;
  }

  aviso(texto) {
    const p = document.createElement("p");
    p.className = "toast";
    p.textContent = texto;
    this.avisos.append(p);
    setTimeout(() => p.remove(), 4200);
  }

  teclado(e) {
    if (!this.menu || !this.raiz.contains(this.menu)) return;
    if (this.escena?.modo?.tipo === "colocar") {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        this.escena.rotarFantasma();
        sonar.mover();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelarColocacion();
      }
      return;
    }
    if (e.key === "Escape" && !this.panel.hidden) {
      e.preventDefault();
      this.seleccionarEdificio(null);
      return;
    }
    if (e.key === "Escape") {
      if (!this.hoja.hidden || this.menu.hidden) {
        e.preventDefault();
        sonar.cerrar();
        this.mostrarMenu();
      }
      return;
    }
    if (this.menu.hidden || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const items = [...this.raiz.querySelectorAll(".item-menu")];
    const i = items.indexOf(document.activeElement);
    const siguiente = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    e.preventDefault();
    items[siguiente].focus();
  }
}
