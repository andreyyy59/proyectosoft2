"""Cálculo de rachas sobre días hábiles (lunes a viernes)."""
from datetime import date, timedelta


def es_dia_habil(dia: date) -> bool:
    return dia.weekday() < 5


def dia_habil_anterior(dia: date) -> date:
    anterior = dia - timedelta(days=1)
    while not es_dia_habil(anterior):
        anterior -= timedelta(days=1)
    return anterior


def calcular_racha(fechas_a_tiempo: set[date], hasta: date) -> int:
    """Días hábiles seguidos con reporte a tiempo, contando hacia atrás desde `hasta`."""
    if not es_dia_habil(hasta) or hasta not in fechas_a_tiempo:
        return 0
    racha = 0
    dia = hasta
    while dia in fechas_a_tiempo:
        racha += 1
        dia = dia_habil_anterior(dia)
    return racha


def racha_vigente(fechas_a_tiempo: set[date], hoy: date) -> int:
    """Racha que ve el jugador hoy: si aún no reporta hoy, la racha de ayer sigue viva."""
    if es_dia_habil(hoy) and hoy in fechas_a_tiempo:
        return calcular_racha(fechas_a_tiempo, hoy)
    return calcular_racha(fechas_a_tiempo, dia_habil_anterior(hoy))


def racha_maxima(fechas_a_tiempo: set[date]) -> int:
    """La racha más larga que el jugador ha logrado."""
    mejor = 0
    for dia in fechas_a_tiempo:
        if es_dia_habil(dia) and dia_habil_anterior(dia) not in fechas_a_tiempo:
            mejor = max(mejor, _contar_hacia_adelante(fechas_a_tiempo, dia))
    return mejor


def _contar_hacia_adelante(fechas: set[date], inicio: date) -> int:
    cuenta = 0
    dia = inicio
    while dia in fechas:
        cuenta += 1
        dia = _siguiente_habil(dia)
    return cuenta


def _siguiente_habil(dia: date) -> date:
    siguiente = dia + timedelta(days=1)
    while not es_dia_habil(siguiente):
        siguiente += timedelta(days=1)
    return siguiente
