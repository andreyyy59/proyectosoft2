"""Indicadores del piloto, calculados a partir de los reportes y del registro de eventos.

Fórmulas (deben coincidir con las acordadas con la entidad):

* Tasa de reporte a tiempo (TRT) =
    días-jugador hábiles con reporte a tiempo / (jugadores × días hábiles del periodo) × 100
* Tasa de evidencia = reportes válidos con evidencia / reportes válidos × 100
* Retraso promedio = promedio de minutos de retraso de los reportes tardíos
* Participación diaria = jugadores con al menos un reporte ese día / jugadores × 100
"""
from datetime import date, datetime, timedelta

from .modelos import Evento, Reporte, Usuario
from .reglas import es_dia_habil


def _dias(desde: date, hasta: date) -> list[date]:
    return [desde + timedelta(days=i) for i in range((hasta - desde).days + 1)]


def calcular_indicadores(desde: date, hasta: date) -> dict:
    jugadores = Usuario.query.filter_by(es_admin=False, activo=True, consintio=True).all()
    ids = [j.id for j in jugadores]
    n = len(ids)
    dias = _dias(desde, hasta)
    habiles = [d for d in dias if es_dia_habil(d)]

    reportes = []
    if ids:
        reportes = Reporte.query.filter(
            Reporte.usuario_id.in_(ids), Reporte.fecha >= desde, Reporte.fecha <= hasta,
            Reporte.duplicado.is_(False),
        ).all()

    a_tiempo_habil = {(r.usuario_id, r.fecha) for r in reportes if r.a_tiempo and es_dia_habil(r.fecha)}
    esperado = n * len(habiles)
    trt = round(100 * len(a_tiempo_habil) / esperado, 1) if esperado else None

    con_evidencia = sum(1 for r in reportes if r.evidencia_tipo != "ninguna")
    tasa_evidencia = round(100 * con_evidencia / len(reportes), 1) if reportes else None

    tardios = [r.minutos_retraso for r in reportes if not r.a_tiempo]
    retraso = round(sum(tardios) / len(tardios), 1) if tardios else None

    serie = []
    for d in dias:
        del_dia = [r for r in reportes if r.fecha == d]
        participantes = {r.usuario_id for r in del_dia}
        a_tiempo = {r.usuario_id for r in del_dia if r.a_tiempo}
        serie.append({
            "fecha": d.isoformat(),
            "habil": es_dia_habil(d),
            "participacion": round(100 * len(participantes) / n, 1) if n else 0.0,
            "a_tiempo": round(100 * len(a_tiempo) / n, 1) if n else 0.0,
            "reportes": len(del_dia),
        })

    eventos = 0
    if ids:
        eventos = Evento.query.filter(
            Evento.usuario_id.in_(ids),
            Evento.creado_en >= _inicio(desde), Evento.creado_en < _inicio(hasta + timedelta(days=1)),
        ).count()

    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "jugadores": n,
        "dias_habiles": len(habiles),
        "reportes": len(reportes),
        "eventos": eventos,
        "hay_demo": any(j.es_demo for j in jugadores),
        "indicadores": {
            "tasa_a_tiempo": trt,
            "tasa_evidencia": tasa_evidencia,
            "retraso_promedio_min": retraso,
        },
        "serie": serie,
    }


def _inicio(d: date) -> datetime:
    return datetime(d.year, d.month, d.day)
