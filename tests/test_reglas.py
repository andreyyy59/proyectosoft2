"""Pruebas unitarias del motor de reglas (caja blanca)."""
from datetime import date, time

import pytest

from app.reglas import ContextoReporte, MotorReglas, cargar_config
from app.reglas.base import Regla
from app.reglas.motor import MOTIVO_DUPLICADO
from app.reglas.reglas import ReglaBase, ReglaRacha

CONFIG = cargar_config()


def ctx(**cambios):
    valores = dict(fecha=date(2026, 11, 9), hora=time(16, 0), hora_limite=time(17, 30),
                   tiene_evidencia=False, reporto_bloqueo=False, racha=1, es_duplicado=False)
    valores.update(cambios)
    return ContextoReporte(**valores)


def leer(texto):
    h, m = texto.split(":")
    return time(int(h), int(m))


def test_escenarios_compartidos(escenarios):
    motor = MotorReglas.desde_config(CONFIG)
    for caso in escenarios["puntos"]:
        c = caso["contexto"]
        resultado = motor.calcular(ContextoReporte(
            fecha=date.fromisoformat(c["fecha"]), hora=leer(c["hora"]), hora_limite=leer(c["hora_limite"]),
            tiene_evidencia=c["tiene_evidencia"], reporto_bloqueo=c["reporto_bloqueo"],
            racha=c["racha"], es_duplicado=c["es_duplicado"],
        ))
        assert resultado.total == caso["esperado"]["total"], caso["nombre"]
        assert {l.regla: l.puntos for l in resultado.desglose} == caso["esperado"]["reglas"], caso["nombre"]


def test_a_tiempo_incluye_la_hora_limite_exacta():
    assert ctx(hora=time(17, 30)).a_tiempo
    assert not ctx(hora=time(17, 31)).a_tiempo


def test_duplicado_no_suma_y_explica_el_motivo():
    resultado = MotorReglas.desde_config(CONFIG).calcular(ctx(es_duplicado=True, tiene_evidencia=True))
    assert resultado.total == 0
    assert resultado.desglose == []
    assert resultado.motivo == MOTIVO_DUPLICADO


@pytest.mark.parametrize("racha,esperado", [(0, 0), (1, 0), (2, 2), (3, 4), (6, 10), (20, 10)])
def test_bono_de_racha_crece_y_tiene_tope(racha, esperado):
    assert ReglaRacha(CONFIG["puntos"]).puntos(ctx(racha=racha)) == esperado


def test_las_reglas_en_cero_no_aparecen_en_el_desglose():
    resultado = MotorReglas.desde_config(CONFIG).calcular(ctx(hora=time(19, 0), racha=0))
    assert [l.regla for l in resultado.desglose] == ["base"]


def test_el_motor_acepta_reglas_nuevas_sin_cambiar_su_codigo():
    class ReglaViernes(Regla):
        id = "viernes"

        def puntos(self, c):
            return 7 if c.fecha.weekday() == 4 else 0

    motor = MotorReglas([ReglaBase(CONFIG["puntos"]), ReglaViernes(CONFIG["puntos"])])
    assert motor.calcular(ctx(fecha=date(2026, 11, 13))).total == 17
    assert motor.calcular(ctx(fecha=date(2026, 11, 12))).total == 10


def test_resultado_como_dict():
    datos = MotorReglas.desde_config(CONFIG).calcular(ctx(tiene_evidencia=True)).como_dict()
    assert datos == {
        "total": 20,
        "desglose": [{"regla": "base", "puntos": 10}, {"regla": "puntualidad", "puntos": 5},
                     {"regla": "evidencia", "puntos": 5}],
        "motivo": None,
    }


def test_las_reglas_del_motor_coinciden_con_las_de_la_config():
    ids_motor = [r.id for r in MotorReglas.desde_config(CONFIG).reglas]
    assert ids_motor == [r["id"] for r in CONFIG["reglas"]]
