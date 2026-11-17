"""Carga la configuración del juego compartida con el cliente JavaScript."""
import json
from functools import lru_cache
from pathlib import Path

RUTA_CONFIG = Path(__file__).resolve().parents[2] / "compartido" / "config_juego.json"


@lru_cache(maxsize=1)
def cargar_config() -> dict:
    """Devuelve el contenido de compartido/config_juego.json (se lee una sola vez)."""
    with open(RUTA_CONFIG, encoding="utf-8") as archivo:
        return json.load(archivo)
