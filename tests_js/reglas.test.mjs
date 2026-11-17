// Pruebas del motor JavaScript (modo solitario). Ejecutar: node --test tests_js/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  calcularEstadisticas,
  calcularPuntos,
  calcularRacha,
  evaluarInsignias,
  nivelPara,
  rachaMaxima,
  rachaVigente,
  validarReporte,
} from "../app/static/js/reglas.js";

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
const config = leer("../compartido/config_juego.json");
const escenarios = leer("../compartido/escenarios_reglas.json");

test("puntos: escenarios compartidos con Python", () => {
  for (const caso of escenarios.puntos) {
    const r = calcularPuntos(caso.contexto, config);
    assert.equal(r.total, caso.esperado.total, caso.nombre);
    assert.deepEqual(Object.fromEntries(r.desglose.map((l) => [l.regla, l.puntos])), caso.esperado.reglas, caso.nombre);
  }
});

test("rachas: escenarios compartidos", () => {
  for (const c of escenarios.rachas) assert.equal(calcularRacha(c.fechas, c.hasta), c.esperado, c.nombre);
  for (const c of escenarios.rachas_vigentes) assert.equal(rachaVigente(c.fechas, c.hoy), c.esperado, c.nombre);
  for (const c of escenarios.rachas_maximas) assert.equal(rachaMaxima(c.fechas), c.esperado, c.nombre);
});

test("niveles: escenarios compartidos", () => {
  for (const c of escenarios.niveles) {
    const n = nivelPara(c.puntos, config.niveles);
    assert.equal(n.numero, c.numero);
    assert.ok(Math.abs(n.progreso - c.progreso) < 1e-4, `progreso ${c.puntos}`);
  }
});

test("insignias por perfil", () => {
  const reportes = [
    { fecha: "2026-11-02", a_tiempo: true, evidencia_tipo: "ticket", bloqueo: null, duplicado: false },
    { fecha: "2026-11-03", a_tiempo: true, evidencia_tipo: "acta_cliente", bloqueo: "x", duplicado: false },
    { fecha: "2026-11-04", a_tiempo: true, evidencia_tipo: "capacitacion", bloqueo: "y", duplicado: false },
    { fecha: "2026-11-04", a_tiempo: true, evidencia_tipo: "ticket", bloqueo: null, duplicado: true },
  ];
  const est = calcularEstadisticas(reportes, "consultor", config);
  assert.deepEqual(est, {
    total_reportes: 3, reportes_a_tiempo: 3, racha_maxima: 3,
    reportes_con_evidencia: 3, bloqueos_reportados: 2, evidencias_clave: 3,
  });
  const codigos = evaluarInsignias(est, "consultor", config);
  assert.ok(codigos.includes("cliente_al_dia") && !codigos.includes("trazabilidad"));
  assert.ok(codigos.includes("racha_3") && !codigos.includes("racha_5"));
});

test("validación con los mismos mensajes que el servidor", () => {
  const base = { tarea: "API", avance: 50, horas: 8, evidencia_tipo: "commit", evidencia_ref: "abc" };
  assert.equal(validarReporte("desarrollador", base, config).evidencia_ref, "abc");
  assert.throws(() => validarReporte("desarrollador", { ...base, tarea: " " }, config), /Escribe/);
  assert.throws(() => validarReporte("desarrollador", { ...base, avance: 101 }, config), /avance/);
  assert.throws(() => validarReporte("desarrollador", { ...base, horas: 0 }, config), /horas/);
  assert.throws(() => validarReporte("desarrollador", { ...base, evidencia_tipo: "ticket" }, config), /perfil/);
  assert.throws(() => validarReporte("desarrollador", { ...base, evidencia_ref: "" }, config), /referencia/);
});
