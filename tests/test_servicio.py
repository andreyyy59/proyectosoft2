"""Pruebas del servicio del juego con base de datos en memoria."""
import pytest

from app.modelos import Evento, InsigniaObtenida, Reporte
from app.servicios import ErrorValidacion

from .conftest import reporte_valido


def tipos_eventos():
    return [e.tipo for e in Evento.query.order_by(Evento.id).all()]


def test_primer_reporte_a_tiempo(servicio, jugador, reloj):
    reloj.fijar("2026-11-09T16:45")
    r = servicio.registrar_reporte(jugador, reporte_valido())
    assert r["resultado"]["total"] == 20  # base + puntualidad + evidencia
    assert r["reporte"]["a_tiempo"] is True
    assert r["racha"] == 1
    assert r["nuevas_insignias"] == ["primer_paso"]
    assert jugador.puntos == 20
    assert tipos_eventos() == ["reporte_registrado", "puntos_otorgados", "insignia_obtenida"]


def test_reporte_tarde_guarda_minutos_de_retraso(servicio, jugador, reloj):
    reloj.fijar("2026-11-09T18:05")
    r = servicio.registrar_reporte(jugador, reporte_valido(evidencia_tipo="ninguna"))
    assert r["reporte"]["a_tiempo"] is False
    assert r["reporte"]["minutos_retraso"] == 35
    assert r["resultado"]["total"] == 10


def test_segundo_reporte_del_dia_no_suma(servicio, jugador, reloj):
    reloj.fijar("2026-11-09T09:00")
    servicio.registrar_reporte(jugador, reporte_valido())
    reloj.fijar("2026-11-09T11:00")
    r = servicio.registrar_reporte(jugador, reporte_valido())
    assert r["reporte"]["duplicado"] is True
    assert r["resultado"]["total"] == 0
    assert r["resultado"]["motivo"]
    assert Reporte.query.count() == 2
    assert jugador.puntos == 20


def test_racha_cruza_fin_de_semana_y_otorga_insignias(servicio, jugador, reloj):
    for dia in ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09"]:
        reloj.fijar(f"{dia}T15:00")
        r = servicio.registrar_reporte(jugador, reporte_valido())
    assert r["racha"] == 4
    assert r["resultado"]["desglose"][-1] == {"regla": "racha", "puntos": 6}
    codigos = {i.codigo for i in InsigniaObtenida.query.all()}
    assert {"primer_paso", "puntual_3", "racha_3", "trazabilidad"} <= codigos


def test_sube_de_nivel_y_publica_evento(servicio, jugador, reloj):
    reloj.fijar("2026-11-05T09:00")
    servicio.registrar_reporte(jugador, reporte_valido())
    reloj.fijar("2026-11-06T09:00")
    r = servicio.registrar_reporte(jugador, reporte_valido(bloqueo="Sin acceso al ambiente de pruebas"))
    assert r["subio_nivel"] is True
    assert r["nivel_despues"]["nombre"] == "Junior"
    assert "nivel_subido" in tipos_eventos()


def test_sin_consentimiento_no_puede_reportar(servicio, crear_usuario):
    sin = crear_usuario("beto", consintio=False)
    with pytest.raises(ErrorValidacion, match="consentimiento"):
        servicio.registrar_reporte(sin, reporte_valido())


def test_aceptar_consentimiento(servicio, crear_usuario, reloj):
    u = crear_usuario("beto", consintio=False)
    servicio.aceptar_consentimiento(u)
    assert u.consintio and u.fecha_consentimiento == reloj()
    assert tipos_eventos() == ["consentimiento_aceptado"]


@pytest.mark.parametrize("cambios,mensaje", [
    ({"tarea": "  "}, "Escribe"),
    ({"tarea": "x" * 201}, "200"),
    ({"avance": 120}, "avance"),
    ({"avance": "mucho"}, "números"),
    ({"horas": 0}, "horas"),
    ({"evidencia_tipo": "acta_cliente"}, "perfil"),
    ({"evidencia_ref": ""}, "referencia"),
])
def test_validaciones(servicio, jugador, cambios, mensaje):
    with pytest.raises(ErrorValidacion, match=mensaje):
        servicio.registrar_reporte(jugador, reporte_valido(**cambios))


def test_sin_evidencia_descarta_la_referencia(servicio, jugador):
    r = servicio.registrar_reporte(jugador, reporte_valido(evidencia_tipo="ninguna", evidencia_ref="algo"))
    assert r["reporte"]["evidencia_ref"] is None


def test_estado_del_jugador(servicio, jugador, reloj):
    reloj.fijar("2026-11-06T10:00")
    servicio.registrar_reporte(jugador, reporte_valido())
    reloj.fijar("2026-11-09T08:00")
    estado = servicio.estado_jugador(jugador)
    assert estado["racha"] == 1 and estado["reporto_hoy"] is False
    assert estado["puntos"] == 20 and estado["nivel"]["numero"] == 1
    assert estado["hora_limite"] == "17:30"
    codigos = [i["codigo"] for i in estado["insignias"]]
    assert "trazabilidad" in codigos and "cliente_al_dia" not in codigos
    assert estado["insignias"][0]["obtenida"] is True


def test_parametros_del_administrador(servicio, jugador, reloj):
    servicio.fijar_parametros(hora_limite="12:00", meta_equipo=90)
    assert servicio.hora_limite().hour == 12 and servicio.meta_equipo() == 90
    reloj.fijar("2026-11-09T13:00")
    r = servicio.registrar_reporte(jugador, reporte_valido())
    assert r["reporte"]["a_tiempo"] is False
    servicio.fijar_parametros(hora_limite="12:30")
    assert servicio.hora_limite().minute == 30


@pytest.mark.parametrize("hora,meta", [("mediodía", None), (None, 0), (None, 101)])
def test_parametros_invalidos(servicio, hora, meta):
    with pytest.raises(ErrorValidacion):
        servicio.fijar_parametros(hora_limite=hora, meta_equipo=meta)


def test_progreso_de_equipos(servicio, crear_usuario, reloj):
    a = crear_usuario("ana")
    b = crear_usuario("bea")
    c = crear_usuario("caro", perfil="consultor", equipo="Implementación")
    reloj.fijar("2026-11-09T09:00")
    servicio.registrar_reporte(a, reporte_valido())
    servicio.registrar_reporte(b, reporte_valido())
    reloj.fijar("2026-11-10T09:00")
    servicio.registrar_reporte(a, reporte_valido())
    servicio.registrar_reporte(c, reporte_valido(evidencia_tipo="ticket"))
    datos = servicio.progreso_equipos()
    equipos = {e["equipo"]: e for e in datos["equipos"]}
    assert datos["dias_habiles"] == 2 and datos["meta"] == 80
    assert equipos["Software Factory"]["porcentaje"] == 75.0
    assert equipos["Implementación"]["porcentaje"] == 50.0
    assert not equipos["Software Factory"]["cumplida"]
