"""Bus de eventos (patrón Observer).

El servicio del juego publica lo que pasa ("reporte_registrado", "insignia_obtenida"...)
sin saber quién escucha. Un suscriptor guarda cada evento en la base de datos; otros
(por ejemplo, notificaciones futuras) se pueden agregar sin tocar el servicio.
"""
from collections.abc import Callable
from datetime import datetime

from .extensiones import db
from .modelos import Evento

Suscriptor = Callable[[str, int | None, dict, datetime], None]


class BusEventos:
    def __init__(self):
        self._suscriptores: list[Suscriptor] = []

    def suscribir(self, suscriptor: Suscriptor) -> None:
        self._suscriptores.append(suscriptor)

    def publicar(self, tipo: str, usuario_id: int | None, datos: dict, momento: datetime) -> None:
        for suscriptor in self._suscriptores:
            suscriptor(tipo, usuario_id, datos, momento)


def registrar_en_bd(tipo: str, usuario_id: int | None, datos: dict, momento: datetime) -> None:
    """Suscriptor que persiste el evento en la tabla `eventos`."""
    db.session.add(Evento(tipo=tipo, usuario_id=usuario_id, datos=datos, creado_en=momento))


def crear_bus() -> BusEventos:
    bus = BusEventos()
    bus.suscribir(registrar_en_bd)
    return bus
