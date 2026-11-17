"""Motor que combina las reglas (estrategias) y produce el desglose de puntos."""
from dataclasses import dataclass, field

from .base import ContextoReporte, Regla
from .reglas import REGLAS_POR_DEFECTO

MOTIVO_DUPLICADO = "Ya registraste tu avance de hoy: este reporte se guarda, pero no suma puntos."


@dataclass(frozen=True)
class LineaPuntos:
    regla: str
    puntos: int


@dataclass
class ResultadoPuntos:
    total: int
    desglose: list = field(default_factory=list)
    motivo: str | None = None

    def como_dict(self) -> dict:
        return {
            "total": self.total,
            "desglose": [{"regla": l.regla, "puntos": l.puntos} for l in self.desglose],
            "motivo": self.motivo,
        }


class MotorReglas:
    def __init__(self, reglas: list[Regla]):
        self.reglas = list(reglas)

    @classmethod
    def desde_config(cls, config: dict) -> "MotorReglas":
        puntos = config["puntos"]
        return cls([Clase(puntos) for Clase in REGLAS_POR_DEFECTO])

    def calcular(self, ctx: ContextoReporte) -> ResultadoPuntos:
        if ctx.es_duplicado:
            return ResultadoPuntos(total=0, desglose=[], motivo=MOTIVO_DUPLICADO)
        desglose = []
        for regla in self.reglas:
            valor = regla.puntos(ctx)
            if valor:
                desglose.append(LineaPuntos(regla.id, valor))
        return ResultadoPuntos(total=sum(l.puntos for l in desglose), desglose=desglose)
