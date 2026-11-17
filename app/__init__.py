"""Fábrica de la aplicación Flask de Sprint Quest."""
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import Flask, send_from_directory

from .api import api
from .comandos import registrar_comandos
from .eventos import crear_bus
from .extensiones import db
from .reglas import cargar_config
from .reglas.config import RUTA_CONFIG
from .servicios import ServicioJuego


def _url_base_datos() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///sprintquest.db")
    # Render y Heroku entregan "postgres://", SQLAlchemy necesita "postgresql+psycopg://"
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", static_url_path="/static", instance_relative_config=True)
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "cambia-esta-clave-en-produccion"),
        SQLALCHEMY_DATABASE_URI=_url_base_datos(),
        ZONA_HORARIA=os.environ.get("ZONA_HORARIA", "America/Bogota"),
        PERMANENT_SESSION_LIFETIME=timedelta(days=14),
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_HTTPONLY=True,
        JUEGO=cargar_config(),
        RELOJ=None,
    )
    if config:
        app.config.update(config)
    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)

    zona = ZoneInfo(app.config["ZONA_HORARIA"])
    reloj = app.config["RELOJ"] or (lambda: datetime.now(zona).replace(tzinfo=None))
    app.extensions["servicio_juego"] = ServicioJuego(app.config["JUEGO"], crear_bus(), reloj)

    app.register_blueprint(api)
    registrar_comandos(app)

    @app.get("/")
    @app.get("/admin")
    def inicio():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/config_juego.json")
    def config_juego():
        return send_from_directory(RUTA_CONFIG.parent, RUTA_CONFIG.name)

    with app.app_context():
        db.create_all()

    return app
