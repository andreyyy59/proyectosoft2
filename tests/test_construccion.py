"""Pruebas de la mecánica de construcción (reglas, servicio y API)."""
import pytest

from app.modelos import Construccion, Evento
from app.reglas import (
    celda_valida, celdas_disponibles, cargar_config, costo_mejora, estado_item,
    evidencias_por_tipo, materiales_disponibles, radio_meseta, reembolso,
)
from app.servicios import ErrorNoEncontrado, ErrorValidacion

from .conftest import reporte_valido

CONFIG = cargar_config()
ITEM = {i["id"]: i for i in CONFIG["catalogo"]}


def test_escenarios_compartidos_de_construccion(escenarios):
    for c in escenarios["construccion"]["celdas"]:
        assert celda_valida(c["celda"], c["nivel"], CONFIG) is c["valida"], c
    for c in escenarios["construccion"]["mejoras"]:
        assert costo_mejora(ITEM[c["tipo"]], c["nivel"], CONFIG) == c["costo"], c
    for c in escenarios["construccion"]["celdas_por_nivel"]:
        assert len(celdas_disponibles(c["nivel"], CONFIG)) == c["cantidad"], c


@pytest.mark.parametrize("celda", [None, [1], [1, 2, 3], ["1", 0], [True, 0], [1.5, 0]])
def test_celdas_mal_formadas(celda):
    assert celda_valida(celda, 1, CONFIG) is False


def test_radio_crece_con_el_nivel():
    assert radio_meseta(1, CONFIG) == 3.4
    assert radio_meseta(3, CONFIG) == pytest.approx(4.3)


def test_desbloqueos():
    ev = evidencias_por_tipo([
        {"evidencia_tipo": "commit", "duplicado": False},
        {"evidencia_tipo": "ticket", "duplicado": True},
        {"evidencia_tipo": "ninguna", "duplicado": False},
    ])
    assert ev == {"commit": 1}
    assert estado_item(ITEM["torre"], 1, ev, CONFIG)["desbloqueado"] is True
    silo = estado_item(ITEM["silo"], 1, ev, CONFIG)
    assert silo["desbloqueado"] is False and "ticket" in silo["falta"]
    assert estado_item(ITEM["molino"], 2, ev, CONFIG)["falta"] == "Llega al nivel 3."
    assert estado_item(ITEM["molino"], 3, ev, CONFIG)["desbloqueado"] is True


def test_materiales_y_reembolso():
    assert materiales_disponibles(40, -5, 10, CONFIG) == 40
    assert reembolso(25, CONFIG) == 12


def test_construir_mejorar_mover_demoler(servicio, jugador, reloj):
    reloj.fijar("2026-11-09T10:00")
    servicio.registrar_reporte(jugador, reporte_valido())  # +20 → 35 materiales
    r = servicio.construir(jugador, "torre", [1, 0], rotacion=5)
    assert r["materiales"] == 10 and r["construccion"]["rotacion"] == 1
    cid = r["construccion"]["id"]
    with pytest.raises(ErrorValidacion, match="Te faltan 10"):
        servicio.mejorar(jugador, cid)  # cuesta 20
    servicio.construir(jugador, "casa", [0, 1])
    assert servicio.materiales(jugador) == 0
    with pytest.raises(ErrorValidacion, match="ocupado"):
        servicio.mover(jugador, cid, [0, 1])
    assert servicio.mover(jugador, cid, [-1, 0], rotacion=2)["construccion"]["celda"] == [-1, 0]
    r = servicio.demoler(jugador, cid)
    assert r == {"devuelto": 12, "materiales": 12}
    assert Construccion.query.count() == 1
    tipos = [e.tipo for e in Evento.query.all()]
    assert {"construccion_creada", "construccion_movida", "construccion_demolida"} <= set(tipos)


def test_mejorar_hasta_el_maximo(servicio, jugador):
    jugador.puntos = 200
    cid = servicio.construir(jugador, "casa", [1, 1])["construccion"]["id"]
    assert servicio.mejorar(jugador, cid)["construccion"]["nivel"] == 2
    assert servicio.mejorar(jugador, cid)["construccion"]["nivel"] == 3
    with pytest.raises(ErrorValidacion, match="máximo"):
        servicio.mejorar(jugador, cid)
    assert servicio.materiales(jugador) == 15 + 200 - (10 + 8 + 16)


def test_errores_de_construccion(servicio, jugador, crear_usuario):
    with pytest.raises(ErrorValidacion, match="no existe"):
        servicio.construir(jugador, "castillo", [1, 0])
    with pytest.raises(ErrorValidacion, match="commit"):
        servicio.construir(jugador, "torre", [1, 0])
    with pytest.raises(ErrorValidacion, match="dentro de la meseta"):
        servicio.construir(jugador, "casa", [0, 0])
    with pytest.raises(ErrorValidacion, match="dentro de la meseta"):
        servicio.construir(jugador, "casa", [9, 9])
    otro = crear_usuario("beto")
    cid = servicio.construir(otro, "casa", [1, 0])["construccion"]["id"]
    with pytest.raises(ErrorNoEncontrado):
        servicio.demoler(jugador, cid)


def test_api_de_construccion(cliente, jugador, admin):
    cliente.post("/api/sesion", json={"alias": "ana", "pin": "1234"})
    r = cliente.post("/api/construcciones", json={"tipo": "casa", "celda": [1, 0]})
    assert r.status_code == 201
    cid = r.get_json()["construccion"]["id"]
    estado = cliente.get("/api/yo").get_json()
    assert estado["materiales"] == 5 and estado["construcciones"][0]["tipo"] == "casa"
    assert {e["id"]: e["desbloqueado"] for e in estado["catalogo"]}["guayacan"] is True
    assert cliente.post(f"/api/construcciones/{cid}/mejorar").status_code == 400
    assert cliente.patch(f"/api/construcciones/{cid}", json={"celda": [0, 1]}).status_code == 200
    assert cliente.delete("/api/construcciones/999").status_code == 404
    assert cliente.delete(f"/api/construcciones/{cid}").get_json()["devuelto"] == 5
    cliente.post("/api/sesion", json={"alias": "admin", "pin": "1234"})
    assert cliente.post("/api/construcciones", json={"tipo": "casa", "celda": [1, 0]}).status_code == 400
