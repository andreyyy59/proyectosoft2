// Panel del administrador: indicadores del piloto, jugadores, eventos y configuración.
import { esc, fmtFecha, fmtNum, fmtPct } from "./formato.js";
import { icono } from "./iconos.js";
import { aFechaISO, sumarDias } from "./reglas.js";

const SERIES = [
  { clave: "participacion", nombre: "Participación", color: "#3D93CF" },
  { clave: "a_tiempo", nombre: "A tiempo", color: "#C08227" },
];

const TIPOS_EVENTO = {
  sesion_iniciada: "Inició sesión",
  sesion_cerrada: "Cerró sesión",
  consentimiento_aceptado: "Aceptó el consentimiento",
  reporte_registrado: "Registró un reporte",
  puntos_otorgados: "Recibió puntos",
  insignia_obtenida: "Ganó una insignia",
  nivel_subido: "Subió de nivel",
  vista_abierta: "Abrió una vista",
  jugador_creado: "Creó un jugador",
  config_cambiada: "Cambió la configuración",
  datos_exportados: "Exportó datos",
  perfil_creado: "Creó su perfil",
};

export class PanelAdmin {
  constructor({ raiz, almacen, config, local, alSalir }) {
    Object.assign(this, { raiz, almacen, config, local, alSalir });
    this.pestana = "indicadores";
    const hoy = aFechaISO(new Date());
    this.hasta = hoy;
    this.desde = sumarDias(hoy, -6);
  }

  montar() {
    const pestanas = [["indicadores", "Indicadores"], ["jugadores", "Jugadores"], ["eventos", "Eventos"], ["configuracion", "Configuración"]];
    this.raiz.innerHTML = `
      <div class="admin">
        <header class="admin-cabecera">
          <div>
            <h1>Panel del administrador</h1>
            <p>${this.local ? "Vista de prueba con tus datos del modo solitario." : "Datos del piloto en el servidor."}</p>
          </div>
          <button class="boton boton-secundario" data-salir>${this.local ? "Volver al juego" : "Cerrar sesión"}</button>
        </header>
        <div class="pestanas" role="tablist">
          ${pestanas.map(([id, t]) => `<button role="tab" data-pestana="${id}" aria-selected="${id === this.pestana}">${t}</button>`).join("")}
        </div>
        <div class="admin-cuerpo" role="tabpanel"></div>
      </div>`;
    this.cuerpo = this.raiz.querySelector(".admin-cuerpo");
    this.raiz.querySelector("[data-salir]").addEventListener("click", () => this.alSalir());
    this.raiz.querySelectorAll("[data-pestana]").forEach((b) => b.addEventListener("click", () => {
      this.pestana = b.dataset.pestana;
      this.raiz.querySelectorAll("[data-pestana]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      this.pintar();
    }));
    this.pintar();
  }

  async pintar() {
    this.cuerpo.innerHTML = `<p class="carga">Cargando…</p>`;
    try {
      if (this.pestana === "indicadores") await this.pintarIndicadores();
      if (this.pestana === "jugadores") await this.pintarJugadores();
      if (this.pestana === "eventos") await this.pintarEventos();
      if (this.pestana === "configuracion") await this.pintarConfiguracion();
    } catch (err) {
      this.cuerpo.innerHTML = `<p class="error-form">${esc(err.message)}</p>`;
    }
  }

  // ---------- Indicadores ----------
  async pintarIndicadores() {
    const d = await this.almacen.indicadores(this.desde, this.hasta);
    const ind = d.indicadores;
    const pct = (v) => (v === null ? "Sin datos" : fmtPct(v));
    this.cuerpo.innerHTML = `
      <form class="periodo">
        <label class="campo"><span>Desde</span><input type="date" name="desde" value="${d.desde}"></label>
        <label class="campo"><span>Hasta</span><input type="date" name="hasta" value="${d.hasta}"></label>
        <button class="boton boton-secundario" type="submit">Actualizar</button>
      </form>
      ${d.hay_demo ? `<p class="aviso-suave">Hay jugadores de demostración en la base de datos. Estas cifras no son resultados del piloto; bórralos con <code>flask --app wsgi borrar-demo</code>.</p>` : ""}
      <p class="contexto">${d.jugadores} ${d.jugadores === 1 ? "jugador" : "jugadores"} con consentimiento, ${d.dias_habiles} días hábiles, ${d.reportes} reportes válidos y ${d.eventos} eventos registrados.</p>
      <div class="kpis">
        <article class="kpi">
          <h2>Reportes a tiempo</h2>
          <p class="valor">${pct(ind.tasa_a_tiempo)}</p>
          <p class="formula">Días-jugador con reporte antes del cierre ÷ (jugadores × días hábiles)</p>
        </article>
        <article class="kpi">
          <h2>Reportes con evidencia</h2>
          <p class="valor">${pct(ind.tasa_evidencia)}</p>
          <p class="formula">Reportes con enlace o referencia ÷ reportes válidos</p>
        </article>
        <article class="kpi">
          <h2>Retraso de los tardíos</h2>
          <p class="valor">${ind.retraso_promedio_min === null ? "Sin tardíos" : `${fmtNum(ind.retraso_promedio_min)} min`}</p>
          <p class="formula">Promedio de minutos después del cierre</p>
        </article>
      </div>
      <section class="grafico-bloque">
        <div class="grafico-cabecera">
          <h2>Participación y reportes a tiempo por día</h2>
          <ul class="leyenda">${SERIES.map((s) => `<li><i style="background:${s.color}"></i>${s.nombre}</li>`).join("")}</ul>
        </div>
        <p class="formula">Porcentaje de jugadores que reportaron ese día y de los que lo hicieron antes del cierre. Las franjas marcan fines de semana; si nadie reportó, no se dibujan.</p>
        <div class="grafico" data-grafico></div>
        <details class="tabla-datos"><summary>Ver los datos como tabla</summary>
          <table class="tabla"><thead><tr><th>Día</th><th class="num">Participación</th><th class="num">A tiempo</th><th class="num">Reportes</th></tr></thead>
          <tbody>${d.serie.map((s) => `<tr><td>${fmtFecha(s.fecha)}</td><td class="num">${fmtPct(s.participacion)}</td><td class="num">${fmtPct(s.a_tiempo)}</td><td class="num">${s.reportes}</td></tr>`).join("")}</tbody></table>
        </details>
      </section>
      <section class="grafico-bloque">
        <h2>Meta semanal por equipo</h2>
        <p class="formula">Reportes a tiempo de la semana ÷ (personas × días hábiles transcurridos). La línea marca la meta del ${d.equipos.meta} %.</p>
        <ul class="lista-equipos">
          ${d.equipos.equipos.length ? d.equipos.equipos.map((eq) => `
            <li>
              <div class="fila-equipo"><h3>${esc(eq.equipo)}</h3><b>${fmtPct(eq.porcentaje)}</b></div>
              <div class="barra barra-meta" style="--meta:${d.equipos.meta}%"><i style="width:${Math.min(eq.porcentaje, 100)}%"></i></div>
              <p class="detalle-equipo">${eq.a_tiempo} de ${eq.esperado} reportes a tiempo, ${eq.miembros} ${eq.miembros === 1 ? "persona" : "personas"}</p>
            </li>`).join("") : `<li class="vacio">Aún no hay jugadores activos.</li>`}
        </ul>
      </section>`;
    this.cuerpo.querySelector(".periodo").addEventListener("submit", (e) => {
      e.preventDefault();
      this.desde = e.target.desde.value;
      this.hasta = e.target.hasta.value;
      this.pintar();
    });
    this.dibujarLineas(this.cuerpo.querySelector("[data-grafico]"), d.serie);
  }

  dibujarLineas(caja, serie) {
    const W = Math.max(520, Math.round(caja.clientWidth || 680)), H = 280, m = { izq: 48, der: 150, arr: 16, aba: 34 };
    const n = serie.length;
    const x = (i) => m.izq + (n === 1 ? (W - m.izq - m.der) / 2 : (i * (W - m.izq - m.der)) / (n - 1));
    const y = (v) => m.arr + (1 - v / 100) * (H - m.arr - m.aba);
    const paso = n > 1 ? (W - m.izq - m.der) / (n - 1) : 80;
    const cuadricula = [0, 25, 50, 75, 100].map((v) => `
      <line x1="${m.izq}" x2="${W - m.der}" y1="${y(v)}" y2="${y(v)}" class="linea-guia"/>
      <text x="${m.izq - 8}" y="${y(v) + 4}" text-anchor="end" class="eje">${v} %</text>`).join("");
    const findes = serie.map((s, i) => (s.habil ? "" : `<rect x="${x(i) - paso / 2}" y="${m.arr}" width="${paso}" height="${H - m.arr - m.aba}" class="franja"/>`)).join("");
    const cadaCuanto = Math.ceil(n / 8);
    const etiquetasX = serie.map((s, i) => (i % cadaCuanto ? "" : `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="eje">${fmtFecha(s.fecha)}</text>`)).join("");
    // Los fines de semana sin reportes no se dibujan: nadie tenía que reportar.
    const visibles = serie.map((s, i) => ({ s, i })).filter(({ s }) => s.habil || s.reportes > 0);
    const lineas = SERIES.map((sr) => {
      if (!visibles.length) return "";
      const puntos = visibles.map(({ s, i }) => `${x(i)},${y(s[sr.clave])}`).join(" ");
      const ultimo = visibles[visibles.length - 1];
      return `
        <polyline points="${puntos}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${visibles.map(({ s, i }) => `<circle cx="${x(i)}" cy="${y(s[sr.clave])}" r="4" fill="${sr.color}" stroke="var(--superficie)" stroke-width="2"/>`).join("")}
        <text x="${x(ultimo.i) + 10}" y="${y(ultimo.s[sr.clave]) + 4}" class="etiqueta-serie">${sr.nombre} ${fmtPct(ultimo.s[sr.clave])}</text>`;
    });
    // Separar etiquetas finales si se superponen
    caja.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Participación y reportes a tiempo por día">
        ${findes}${cuadricula}${etiquetasX}
        <line class="cursor" y1="${m.arr}" y2="${H - m.aba}" x1="0" x2="0" style="opacity:0"/>
        ${lineas.join("")}
        ${serie.map((s, i) => `<rect class="zona" data-i="${i}" x="${x(i) - paso / 2}" y="${m.arr}" width="${paso}" height="${H - m.arr - m.aba}" fill="transparent"/>`).join("")}
      </svg>
      <div class="tooltip-grafico" hidden></div>`;
    const etiquetas = caja.querySelectorAll(".etiqueta-serie");
    if (etiquetas.length === 2) {
      const [a, b] = [...etiquetas];
      const ya = Number(a.getAttribute("y"));
      const yb = Number(b.getAttribute("y"));
      if (Math.abs(ya - yb) < 14) {
        const medio = (ya + yb) / 2;
        a.setAttribute("y", medio - (ya <= yb ? 8 : -8));
        b.setAttribute("y", medio + (ya <= yb ? 8 : -8));
      }
    }
    const svg = caja.querySelector("svg");
    const cursor = caja.querySelector(".cursor");
    const tip = caja.querySelector(".tooltip-grafico");
    caja.querySelectorAll(".zona").forEach((z) => {
      z.addEventListener("pointerenter", () => {
        const i = Number(z.dataset.i);
        const s = serie[i];
        cursor.setAttribute("x1", x(i));
        cursor.setAttribute("x2", x(i));
        cursor.style.opacity = 1;
        tip.hidden = false;
        tip.innerHTML = `<b>${fmtFecha(s.fecha)}${s.habil ? "" : " (fin de semana)"}</b>
          ${SERIES.map((sr) => `<span><i style="background:${sr.color}"></i>${sr.nombre}: ${fmtPct(s[sr.clave])}</span>`).join("")}
          <span>${s.reportes} ${s.reportes === 1 ? "reporte" : "reportes"}</span>`;
        const escala = svg.getBoundingClientRect().width / W;
        const izquierda = x(i) * escala;
        tip.style.left = `${Math.min(izquierda + 12, svg.getBoundingClientRect().width - tip.offsetWidth - 4)}px`;
      });
    });
    svg.addEventListener("pointerleave", () => {
      tip.hidden = true;
      cursor.style.opacity = 0;
    });
  }

  // ---------- Jugadores ----------
  async pintarJugadores() {
    if (this.local) {
      this.cuerpo.innerHTML = `<p class="contexto">En modo solitario solo existes tú. En el servidor, aquí creas las cuentas de los participantes del piloto.</p>`;
      return;
    }
    const jugadores = await this.almacen.jugadores();
    const perfiles = Object.entries(this.config.perfiles);
    this.cuerpo.innerHTML = `
      <form class="form-jugador" novalidate>
        <h2>Agregar participante</h2>
        <div class="fila-campos">
          <label class="campo"><span>Alias</span><input name="alias" required maxlength="40" autocapitalize="off" spellcheck="false"></label>
          <label class="campo"><span>Perfil</span><select name="perfil">${perfiles.map(([id, p]) => `<option value="${id}">${esc(p.nombre)}</option>`).join("")}</select></label>
          <label class="campo"><span>Equipo</span><input name="equipo" maxlength="60" placeholder="Software Factory"></label>
          <label class="campo"><span>PIN inicial</span><input name="pin" inputmode="numeric" maxlength="8" placeholder="4 a 8 dígitos"></label>
          <button class="boton boton-principal" type="submit">Crear participante</button>
        </div>
        <p class="error-form" role="alert"></p>
      </form>
      <div class="tabla-desplazable">
      <table class="tabla">
        <thead><tr><th>Alias</th><th>Perfil</th><th>Equipo</th><th class="num">Puntos</th><th class="num">Reportes</th><th>Consentimiento</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${jugadores.map((j) => `
            <tr class="${j.activo ? "" : "inactivo"}">
              <td>${esc(j.alias)}${j.es_demo ? ' <span class="etiqueta-demo">demo</span>' : ""}</td>
              <td>${esc(this.config.perfiles[j.perfil]?.nombre ?? j.perfil)}</td>
              <td>${esc(j.equipo)}</td>
              <td class="num">${j.puntos}</td>
              <td class="num">${j.reportes}</td>
              <td>${j.consintio ? "Aceptado" : "Pendiente"}</td>
              <td>${j.activo ? "Activo" : "Inactivo"}</td>
              <td class="acciones-fila">
                <button class="boton boton-texto" data-activo="${j.id}" data-valor="${!j.activo}">${j.activo ? "Desactivar" : "Activar"}</button>
                <button class="boton boton-texto" data-pin="${j.id}">Nuevo PIN</button>
              </td>
            </tr>`).join("") || `<tr><td colspan="8" class="vacio">Aún no hay participantes. Crea el primero arriba.</td></tr>`}
        </tbody>
      </table></div>`;
    const form = this.cuerpo.querySelector(".form-jugador");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await this.almacen.crearJugador({ alias: form.alias.value, perfil: form.perfil.value, equipo: form.equipo.value, pin: form.pin.value });
        this.pintar();
      } catch (err) {
        form.querySelector(".error-form").textContent = err.message;
      }
    });
    this.cuerpo.querySelectorAll("[data-activo]").forEach((b) => b.addEventListener("click", async () => {
      await this.almacen.editarJugador(b.dataset.activo, { activo: b.dataset.valor === "true" });
      this.pintar();
    }));
    this.cuerpo.querySelectorAll("[data-pin]").forEach((b) => b.addEventListener("click", async () => {
      const celda = b.closest("td");
      celda.innerHTML = `<form class="pin-en-linea"><input name="pin" inputmode="numeric" maxlength="8" placeholder="PIN nuevo" aria-label="PIN nuevo"><button class="boton boton-texto">Guardar</button></form>`;
      const f = celda.querySelector("form");
      f.pin.focus();
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await this.almacen.editarJugador(b.dataset.pin, { pin: f.pin.value });
          this.pintar();
        } catch (err) {
          f.pin.setCustomValidity(err.message);
          f.pin.reportValidity();
        }
      });
    }));
  }

  // ---------- Eventos ----------
  async pintarEventos() {
    const eventos = this.local
      ? [...(this.almacen.datos()?.eventos ?? [])].reverse().slice(0, 40).map((e) => ({ ...e, jugador: "J01" }))
      : await this.almacen.eventos(40);
    this.cuerpo.innerHTML = `
      <p class="contexto">Los últimos 40 eventos. Cada acción del juego queda registrada y alimenta los indicadores.</p>
      <ol class="eventos">
        ${eventos.map((e) => `
          <li>
            <span class="hora-evento">${esc(e.creado_en.replace("T", " ").slice(0, 16))}</span>
            <span class="jugador-evento">${esc(e.jugador)}</span>
            <span>${esc(TIPOS_EVENTO[e.tipo] ?? e.tipo)}${this.detalleEvento(e)}</span>
          </li>`).join("") || `<li class="vacio">Aún no hay eventos.</li>`}
      </ol>`;
  }

  detalleEvento(e) {
    const d = e.datos || {};
    if (e.tipo === "reporte_registrado") return d.duplicado ? " (duplicado)" : d.a_tiempo ? " (a tiempo)" : ` (tarde, ${d.minutos_retraso} min)`;
    if (e.tipo === "puntos_otorgados") return `: +${d.total}`;
    if (e.tipo === "insignia_obtenida") return `: ${esc(this.config.insignias.find((i) => i.codigo === d.codigo)?.nombre ?? d.codigo)}`;
    if (e.tipo === "nivel_subido") return `: ${d.de} a ${d.a}`;
    if (e.tipo === "vista_abierta") return `: ${esc(d.vista)}`;
    return "";
  }

  // ---------- Configuración ----------
  async pintarConfiguracion() {
    const c = this.local
      ? this.almacen.datos().parametros
      : await this.almacen.configuracion();
    this.cuerpo.innerHTML = `
      <form class="form-config" novalidate>
        <h2>Reglas del piloto</h2>
        <div class="fila-campos">
          <label class="campo"><span>Hora límite del reporte</span><input type="time" name="hora_limite" value="${esc(c.hora_limite)}"></label>
          <label class="campo"><span>Meta semanal del equipo (%)</span><input type="number" name="meta_equipo" min="1" max="100" value="${c.meta_equipo}"></label>
          <button class="boton boton-principal" type="submit">Guardar cambios</button>
        </div>
        <p class="error-form" role="alert"></p>
        <p class="nota">Acuerden estos valores con Tiresia antes del piloto y no los cambien mientras corre: cambiarían la fórmula de los indicadores.</p>
      </form>
      <section class="exportar">
        <h2>Exportar datos anonimizados</h2>
        <p class="formula">Los alias se reemplazan por códigos (J01, J02…) y se omite el texto libre de los reportes.</p>
        <div class="fila-botones">
          <button class="boton boton-secundario" data-exportar="reportes">${icono("descarga")}Descargar reportes (CSV)</button>
          <button class="boton boton-secundario" data-exportar="eventos">${icono("descarga")}Descargar eventos (CSV)</button>
        </div>
      </section>`;
    const form = this.cuerpo.querySelector(".form-config");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const datos = { hora_limite: form.hora_limite.value, meta_equipo: Number(form.meta_equipo.value) };
      try {
        if (this.local) {
          const d = this.almacen.datos();
          d.parametros = datos;
          this.almacen.guardar(d);
        } else {
          await this.almacen.cambiarConfiguracion(datos);
        }
        form.querySelector(".error-form").textContent = "";
        form.querySelector("[type=submit]").textContent = "Cambios guardados";
      } catch (err) {
        form.querySelector(".error-form").textContent = err.message;
      }
    });
    this.cuerpo.querySelectorAll("[data-exportar]").forEach((b) => b.addEventListener("click", () => this.almacen.descargar(b.dataset.exportar)));
  }
}
