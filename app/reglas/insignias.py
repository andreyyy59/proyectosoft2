"""Insignias definidas por datos: cada una exige un mínimo en una estadística."""
from .rachas import racha_maxima


def calcular_estadisticas(reportes: list[dict], perfil: str, config: dict) -> dict:
    """Resume los reportes válidos (no duplicados) de un jugador.

    Cada reporte es un dict con: fecha (date), a_tiempo, duplicado, evidencia_tipo, bloqueo.
    """
    validos = [r for r in reportes if not r.get("duplicado")]
    clave = set(config["perfiles"].get(perfil, {}).get("evidencias_clave", []))
    fechas_a_tiempo = {r["fecha"] for r in validos if r["a_tiempo"]}
    return {
        "total_reportes": len(validos),
        "reportes_a_tiempo": len(fechas_a_tiempo),
        "racha_maxima": racha_maxima(fechas_a_tiempo),
        "reportes_con_evidencia": sum(1 for r in validos if r["evidencia_tipo"] != "ninguna"),
        "bloqueos_reportados": sum(1 for r in validos if r.get("bloqueo")),
        "evidencias_clave": sum(1 for r in validos if r["evidencia_tipo"] in clave),
    }


def evaluar_insignias(estadisticas: dict, perfil: str, config: dict) -> list[str]:
    """Códigos de todas las insignias cuyas condiciones se cumplen para este perfil."""
    cumplidas = []
    for insignia in config["insignias"]:
        if insignia.get("perfil") and insignia["perfil"] != perfil:
            continue
        if estadisticas.get(insignia["estadistica"], 0) >= insignia["minimo"]:
            cumplidas.append(insignia["codigo"])
    return cumplidas
