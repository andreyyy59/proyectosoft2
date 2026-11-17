"""Motor de reglas de Sprint Quest.

Toda la lógica del juego (puntos, rachas, niveles e insignias) vive aquí, separada
de Flask y de la base de datos, para poder probarla con pruebas unitarias.
"""
from .base import ContextoReporte, Regla
from .config import cargar_config
from .construccion import (
    celda_valida,
    celdas_disponibles,
    costo_mejora,
    estado_item,
    evidencias_por_tipo,
    materiales_disponibles,
    radio_meseta,
    reembolso,
)
from .insignias import calcular_estadisticas, evaluar_insignias
from .motor import LineaPuntos, MotorReglas, ResultadoPuntos
from .niveles import nivel_para
from .rachas import (
    calcular_racha,
    dia_habil_anterior,
    es_dia_habil,
    racha_maxima,
    racha_vigente,
)

__all__ = [
    "ContextoReporte",
    "Regla",
    "LineaPuntos",
    "MotorReglas",
    "ResultadoPuntos",
    "cargar_config",
    "calcular_estadisticas",
    "evaluar_insignias",
    "nivel_para",
    "calcular_racha",
    "dia_habil_anterior",
    "es_dia_habil",
    "racha_maxima",
    "racha_vigente",
    "celda_valida",
    "celdas_disponibles",
    "costo_mejora",
    "estado_item",
    "evidencias_por_tipo",
    "materiales_disponibles",
    "radio_meseta",
    "reembolso",
]
