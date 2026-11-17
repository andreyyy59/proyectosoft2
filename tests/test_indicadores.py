"""Pruebas de las fórmulas de los indicadores del piloto."""
from datetime import date

from app.indicadores import calcular_indicadores

from .conftest import reporte_valido


def test_sin_jugadores(app):
    datos = calcular_indicadores(date(2026, 11, 2), date(2026, 11, 6))
    assert datos["jugadores"] == 0
    assert datos["indicadores"] == {"tasa_a_tiempo": None, "tasa_evidencia": None, "retraso_promedio_min": None}


def test_formulas(servicio, crear_usuario, reloj):
    a = crear_usuario("ana")
    b = crear_usuario("bea")
    crear_usuario("sin_consentimiento", consintio=False)  # no cuenta en el denominador
    # Lunes: ana a tiempo con evidencia, bea tarde (20 min) sin evidencia
    reloj.fijar("2026-11-09T09:00")
    servicio.registrar_reporte(a, reporte_valido())
    reloj.fijar("2026-11-09T17:50")
    servicio.registrar_reporte(b, reporte_valido(evidencia_tipo="ninguna"))
    servicio.registrar_reporte(b, reporte_valido())  # duplicado: no cuenta
    # Martes: solo ana, tarde 40 min
    reloj.fijar("2026-11-10T18:10")
    servicio.registrar_reporte(a, reporte_valido())

    datos = calcular_indicadores(date(2026, 11, 9), date(2026, 11, 10))
    ind = datos["indicadores"]
    assert datos["jugadores"] == 2 and datos["dias_habiles"] == 2 and datos["reportes"] == 3
    assert ind["tasa_a_tiempo"] == 25.0          # 1 a tiempo / (2 jugadores × 2 días)
    assert ind["tasa_evidencia"] == 66.7          # 2 de 3 reportes válidos
    assert ind["retraso_promedio_min"] == 30.0    # (20 + 40) / 2
    lunes, martes = datos["serie"]
    assert lunes == {"fecha": "2026-11-09", "habil": True, "participacion": 100.0, "a_tiempo": 50.0, "reportes": 2}
    assert martes["participacion"] == 50.0 and martes["a_tiempo"] == 0.0
    assert datos["eventos"] > 0 and datos["hay_demo"] is False


def test_fin_de_semana_no_entra_en_el_denominador(servicio, crear_usuario, reloj):
    a = crear_usuario("ana")
    reloj.fijar("2026-11-06T09:00")
    servicio.registrar_reporte(a, reporte_valido())
    reloj.fijar("2026-11-07T09:00")
    servicio.registrar_reporte(a, reporte_valido())
    datos = calcular_indicadores(date(2026, 11, 6), date(2026, 11, 8))
    assert datos["dias_habiles"] == 1
    assert datos["indicadores"]["tasa_a_tiempo"] == 100.0
