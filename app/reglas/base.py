"""Tipos base del motor de reglas (patrón Strategy)."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, time


@dataclass(frozen=True)
class ContextoReporte:
    """Todo lo que una regla necesita saber sobre un reporte para calcular puntos.

    `racha` es la racha de días hábiles a tiempo *incluyendo* el día del reporte
    (0 si el reporte llegó tarde o es fin de semana).
    """

    fecha: date
    hora: time
    hora_limite: time
    tiene_evidencia: bool
    reporto_bloqueo: bool
    racha: int = 0
    es_duplicado: bool = False

    @property
    def a_tiempo(self) -> bool:
        return self.hora <= self.hora_limite


class Regla(ABC):
    """Estrategia de puntuación: cada regla decide cuántos puntos aporta."""

    id: str = ""

    def __init__(self, puntos: dict):
        self.config_puntos = puntos

    @abstractmethod
    def puntos(self, ctx: ContextoReporte) -> int:
        """Puntos que aporta esta regla para el contexto dado (0 si no aplica)."""
