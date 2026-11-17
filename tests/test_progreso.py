"""Pruebas de rachas, niveles e insignias."""
from datetime import date

import pytest

from app.reglas import (
    calcular_estadisticas,
    calcular_racha,
    cargar_config,
    dia_habil_anterior,
    es_dia_habil,
    evaluar_insignias,
    nivel_para,
    racha_maxima,
    racha_vigente,
)

CONFIG = cargar_config()


def fechas(lista):
    return {date.fromisoformat(f) for f in lista}


def test_rachas_compartidas(escenarios):
    for caso in escenarios["rachas"]:
        assert calcular_racha(fechas(caso["fechas"]), date.fromisoformat(caso["hasta"])) == caso["esperado"], caso["nombre"]


def test_rachas_vigentes_compartidas(escenarios):
    for caso in escenarios["rachas_vigentes"]:
        assert racha_vigente(fechas(caso["fechas"]), date.fromisoformat(caso["hoy"])) == caso["esperado"], caso["nombre"]


def test_rachas_maximas_compartidas(escenarios):
    for caso in escenarios["rachas_maximas"]:
        assert racha_maxima(fechas(caso["fechas"])) == caso["esperado"], caso["nombre"]


def test_niveles_compartidos(escenarios):
    for caso in escenarios["niveles"]:
        nivel = nivel_para(caso["puntos"], CONFIG["niveles"])
        assert nivel["numero"] == caso["numero"], caso
        assert nivel["progreso"] == pytest.approx(caso["progreso"], abs=1e-4), caso


def test_ultimo_nivel_no_tiene_siguiente():
    nivel = nivel_para(1000, CONFIG["niveles"])
    assert nivel["siguiente_min"] is None and nivel["siguiente_nombre"] is None


@pytest.mark.parametrize("dia,habil", [("2026-11-06", True), ("2026-11-07", False), ("2026-11-08", False), ("2026-11-09", True)])
def test_dias_habiles(dia, habil):
    assert es_dia_habil(date.fromisoformat(dia)) is habil


def test_dia_habil_anterior_salta_el_fin_de_semana():
    assert dia_habil_anterior(date(2026, 11, 9)) == date(2026, 11, 6)
    assert dia_habil_anterior(date(2026, 11, 10)) == date(2026, 11, 9)


def reporte(fecha, a_tiempo=True, evidencia="ninguna", bloqueo=None, duplicado=False):
    return {"fecha": date.fromisoformat(fecha), "a_tiempo": a_tiempo, "evidencia_tipo": evidencia,
            "bloqueo": bloqueo, "duplicado": duplicado}


def test_estadisticas_ignoran_duplicados():
    reportes = [
        reporte("2026-11-02", evidencia="commit"),
        reporte("2026-11-02", evidencia="commit", duplicado=True),
        reporte("2026-11-03", evidencia="documento", bloqueo="Espero acceso a la VPN"),
        reporte("2026-11-04", a_tiempo=False),
    ]
    est = calcular_estadisticas(reportes, "desarrollador", CONFIG)
    assert est == {
        "total_reportes": 3,
        "reportes_a_tiempo": 2,
        "racha_maxima": 2,
        "reportes_con_evidencia": 2,
        "bloqueos_reportados": 1,
        "evidencias_clave": 1,
    }


def test_insignias_por_perfil():
    est = {"total_reportes": 5, "reportes_a_tiempo": 5, "racha_maxima": 5, "reportes_con_evidencia": 5,
           "bloqueos_reportados": 2, "evidencias_clave": 3}
    dev = evaluar_insignias(est, "desarrollador", CONFIG)
    con = evaluar_insignias(est, "consultor", CONFIG)
    assert "trazabilidad" in dev and "cliente_al_dia" not in dev
    assert "cliente_al_dia" in con and "trazabilidad" not in con
    assert {"primer_paso", "puntual_3", "racha_3", "racha_5", "evidencia_5", "transparente"} <= set(dev)


def test_sin_reportes_no_hay_insignias():
    est = calcular_estadisticas([], "consultor", CONFIG)
    assert evaluar_insignias(est, "consultor", CONFIG) == []
