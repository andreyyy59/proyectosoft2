import json
from datetime import datetime
from pathlib import Path

import pytest

from app import create_app
from app.extensiones import db
from app.modelos import Usuario

RAIZ = Path(__file__).resolve().parents[1]


class RelojFalso:
    """Reloj controlable para simular días y horas en las pruebas."""

    def __init__(self, momento: datetime):
        self.momento = momento

    def __call__(self) -> datetime:
        return self.momento

    def fijar(self, texto: str) -> None:
        self.momento = datetime.fromisoformat(texto)


@pytest.fixture
def reloj():
    return RelojFalso(datetime(2026, 11, 9, 10, 0))  # lunes


@pytest.fixture
def app(reloj):
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "pruebas",
        "RELOJ": reloj,
    })
    with app.app_context():
        yield app
        db.session.remove()
        db.drop_all()
        db.engine.dispose()


@pytest.fixture
def servicio(app):
    return app.extensions["servicio_juego"]


@pytest.fixture
def config(app):
    return app.config["JUEGO"]


def _crear(alias, perfil="desarrollador", equipo="Software Factory", es_admin=False, consintio=True):
    u = Usuario(alias=alias, perfil=perfil, equipo=equipo, es_admin=es_admin, consintio=consintio)
    u.fijar_pin("1234")
    db.session.add(u)
    db.session.commit()
    return u


@pytest.fixture
def crear_usuario(app):
    return _crear


@pytest.fixture
def jugador(app):
    return _crear("ana")


@pytest.fixture
def admin(app):
    return _crear("admin", perfil="admin", equipo="Administración", es_admin=True)


@pytest.fixture
def cliente(app):
    return app.test_client()


@pytest.fixture
def escenarios():
    with open(RAIZ / "compartido" / "escenarios_reglas.json", encoding="utf-8") as f:
        return json.load(f)


def reporte_valido(**cambios):
    datos = {
        "tarea": "Endpoint de pedidos",
        "avance": 60,
        "horas": 8,
        "evidencia_tipo": "commit",
        "evidencia_ref": "https://git.example/commit/abc123",
        "bloqueo": "",
    }
    datos.update(cambios)
    return datos
