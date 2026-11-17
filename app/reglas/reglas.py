"""Reglas concretas de puntuación. Cada clase es una estrategia intercambiable."""
from .base import ContextoReporte, Regla


class ReglaBase(Regla):
    """Puntos fijos por registrar el avance del día."""

    id = "base"

    def puntos(self, ctx: ContextoReporte) -> int:
        return self.config_puntos["base"]


class ReglaPuntualidad(Regla):
    """Bono por reportar antes de la hora límite."""

    id = "puntualidad"

    def puntos(self, ctx: ContextoReporte) -> int:
        return self.config_puntos["puntualidad"] if ctx.a_tiempo else 0


class ReglaEvidencia(Regla):
    """Bono por adjuntar evidencia (commit, acta, ticket...)."""

    id = "evidencia"

    def puntos(self, ctx: ContextoReporte) -> int:
        return self.config_puntos["evidencia"] if ctx.tiene_evidencia else 0


class ReglaTransparencia(Regla):
    """Bono por contar un bloqueo: premia pedir ayuda a tiempo, no ocultar problemas."""

    id = "transparencia"

    def puntos(self, ctx: ContextoReporte) -> int:
        return self.config_puntos["transparencia"] if ctx.reporto_bloqueo else 0


class ReglaRacha(Regla):
    """Bono creciente por días hábiles seguidos a tiempo, con tope."""

    id = "racha"

    def puntos(self, ctx: ContextoReporte) -> int:
        if not ctx.a_tiempo or ctx.racha < 2:
            return 0
        bono = self.config_puntos["racha_por_dia"] * (ctx.racha - 1)
        return min(bono, self.config_puntos["racha_maximo"])


REGLAS_POR_DEFECTO = (
    ReglaBase,
    ReglaPuntualidad,
    ReglaEvidencia,
    ReglaTransparencia,
    ReglaRacha,
)
