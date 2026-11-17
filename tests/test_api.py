"""Pruebas de la API (caja negra sobre HTTP)."""
from .conftest import reporte_valido


def entrar(cliente, alias, pin="1234"):
    return cliente.post("/api/sesion", json={"alias": alias, "pin": pin})


def test_salud_y_config(cliente):
    assert cliente.get("/api/salud").get_json() == {"ok": True, "modo": "en_linea"}
    assert cliente.get("/config_juego.json").get_json()["nombre_juego"] == "Sprint Quest"


def test_login_correcto_e_incorrecto(cliente, jugador):
    assert entrar(cliente, "ana", "9999").status_code == 401
    r = entrar(cliente, "ANA")
    assert r.status_code == 200 and r.get_json()["usuario"]["alias"] == "ana"


def test_rutas_protegidas_sin_sesion(cliente):
    assert cliente.get("/api/yo").status_code == 401
    assert cliente.post("/api/reportes", json={}).status_code == 401
    assert cliente.get("/api/admin/indicadores").status_code == 401


def test_flujo_del_jugador(cliente, jugador, reloj):
    entrar(cliente, "ana")
    reloj.fijar("2026-11-09T10:00")
    r = cliente.post("/api/reportes", json=reporte_valido())
    assert r.status_code == 201 and r.get_json()["resultado"]["total"] == 20
    estado = cliente.get("/api/yo").get_json()
    assert estado["puntos"] == 20 and estado["reporto_hoy"] is True
    assert cliente.get("/api/equipo").get_json()["equipos"][0]["porcentaje"] == 100.0
    assert cliente.post("/api/telemetria", json={"vista": "logros"}).status_code == 200
    assert cliente.post("/api/telemetria", json={"vista": "otra"}).status_code == 400
    assert cliente.delete("/api/sesion").get_json() == {"ok": True}
    assert cliente.get("/api/yo").status_code == 401


def test_error_de_validacion_devuelve_400(cliente, jugador):
    entrar(cliente, "ana")
    r = cliente.post("/api/reportes", json=reporte_valido(tarea=""))
    assert r.status_code == 400 and "Escribe" in r.get_json()["error"]


def test_consentimiento(cliente, crear_usuario):
    crear_usuario("beto", consintio=False)
    entrar(cliente, "beto")
    assert cliente.post("/api/reportes", json=reporte_valido()).status_code == 400
    assert cliente.post("/api/consentimiento").status_code == 200
    assert cliente.post("/api/reportes", json=reporte_valido()).status_code == 201


def test_jugador_no_entra_al_panel_admin(cliente, jugador):
    entrar(cliente, "ana")
    assert cliente.get("/api/admin/indicadores").status_code == 403


def test_admin_no_juega(cliente, admin):
    entrar(cliente, "admin")
    assert cliente.get("/api/yo").get_json()["usuario"]["es_admin"] is True
    assert cliente.post("/api/reportes", json=reporte_valido()).status_code == 403


def test_admin_gestiona_jugadores(cliente, admin):
    entrar(cliente, "admin")
    r = cliente.post("/api/admin/jugadores", json={"alias": "carlos.r", "perfil": "consultor", "equipo": "Implementación", "pin": "4321"})
    assert r.status_code == 201
    jid = r.get_json()["jugador"]["id"]
    assert cliente.post("/api/admin/jugadores", json={"alias": "carlos.r", "perfil": "consultor", "pin": "4321"}).status_code == 400
    assert cliente.post("/api/admin/jugadores", json={"alias": "x", "perfil": "consultor", "pin": "4321"}).status_code == 400
    assert cliente.post("/api/admin/jugadores", json={"alias": "nuevo", "perfil": "jefe", "pin": "4321"}).status_code == 400
    assert cliente.post("/api/admin/jugadores", json={"alias": "nuevo", "perfil": "consultor", "pin": "12"}).status_code == 400
    assert cliente.patch(f"/api/admin/jugadores/{jid}", json={"equipo": "Soporte", "pin": "5555", "activo": True}).status_code == 200
    assert cliente.patch(f"/api/admin/jugadores/{jid}", json={"pin": "ab"}).status_code == 400
    assert cliente.patch("/api/admin/jugadores/999", json={}).status_code == 404
    lista = cliente.get("/api/admin/jugadores").get_json()["jugadores"]
    assert lista[0]["equipo"] == "Soporte" and lista[0]["reportes"] == 0


def test_admin_config_e_indicadores(cliente, admin, jugador, reloj):
    reloj.fijar("2026-11-09T10:00")
    cliente.post("/api/sesion", json={"alias": "ana", "pin": "1234"})
    cliente.post("/api/reportes", json=reporte_valido())
    entrar(cliente, "admin")
    assert cliente.put("/api/admin/config", json={"hora_limite": "18:00", "meta_equipo": 70}).get_json() == {"hora_limite": "18:00", "meta_equipo": 70}
    assert cliente.put("/api/admin/config", json={"hora_limite": "tarde"}).status_code == 400
    datos = cliente.get("/api/admin/indicadores?desde=2026-11-09&hasta=2026-11-09").get_json()
    assert datos["jugadores"] == 1 and datos["indicadores"]["tasa_a_tiempo"] == 100.0
    assert cliente.get("/api/admin/indicadores?desde=2026-11-10&hasta=2026-11-01").status_code == 400
    assert cliente.get("/api/admin/indicadores?desde=ayer").status_code == 400
    assert cliente.get("/api/admin/indicadores?desde=2026-01-01&hasta=2026-11-09").status_code == 400
    assert cliente.get("/api/admin/indicadores").status_code == 200
    eventos = cliente.get("/api/admin/eventos?limite=5").get_json()["eventos"]
    assert len(eventos) == 5 and all(e["jugador"] in {"J01", "admin", "-"} for e in eventos)


def test_exportacion_anonimizada(cliente, admin, jugador, reloj):
    cliente.post("/api/sesion", json={"alias": "ana", "pin": "1234"})
    cliente.post("/api/reportes", json=reporte_valido(bloqueo="Necesito ayuda de Pedro"))
    entrar(cliente, "admin")
    reportes = cliente.get("/api/admin/exportar/reportes.csv").get_data(as_text=True)
    eventos = cliente.get("/api/admin/exportar/eventos.csv").get_data(as_text=True)
    assert "J01" in reportes and "ana" not in reportes and "Pedro" not in reportes
    assert "ana" not in eventos and "Pedro" not in eventos
    assert cliente.get("/api/admin/exportar/otra.csv").status_code == 404
