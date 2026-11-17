"""Reglas de construcción: materiales, desbloqueos y dónde se puede construir en la meseta.

Los reportes dan materiales (los mismos puntos que suman). Con ellos el jugador construye
edificios en su meseta. Los edificios especiales se desbloquean al reportar cierto tipo de
evidencia, así lo que se construye refleja el trabajo real que se reporta.
"""
import math


def radio_meseta(nivel: int, config: dict) -> float:
    m = config["meseta"]
    return m["radio_base"] + m["radio_por_nivel"] * (nivel - 1)


def celda_valida(celda, nivel: int, config: dict) -> bool:
    """La celda (i, j) cabe en la meseta y no es el centro (ahí está el faro)."""
    if not isinstance(celda, (list, tuple)) or len(celda) != 2:
        return False
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in celda):
        return False
    i, j = celda
    if i == 0 and j == 0:
        return False
    m = config["meseta"]
    return math.hypot(i, j) * m["tamano_celda"] <= radio_meseta(nivel, config) - m["margen"]


def celdas_disponibles(nivel: int, config: dict) -> list[tuple[int, int]]:
    m = config["meseta"]
    alcance = int(radio_meseta(nivel, config) // m["tamano_celda"]) + 1
    return [(i, j) for i in range(-alcance, alcance + 1) for j in range(-alcance, alcance + 1)
            if celda_valida([i, j], nivel, config)]


def evidencias_por_tipo(reportes: list[dict]) -> dict[str, int]:
    conteo: dict[str, int] = {}
    for r in reportes:
        if not r.get("duplicado") and r["evidencia_tipo"] != "ninguna":
            conteo[r["evidencia_tipo"]] = conteo.get(r["evidencia_tipo"], 0) + 1
    return conteo


def estado_item(item: dict, nivel: int, evidencias: dict[str, int], config: dict) -> dict:
    """¿Está desbloqueado? Si no, qué falta."""
    req = item["requisito"]
    if req["tipo"] == "nivel":
        ok = nivel >= req["valor"]
        falta = None if ok else f"Llega al nivel {req['valor']}."
    else:
        ok = any(evidencias.get(t, 0) > 0 for t in req["valor"])
        nombres = " o ".join(config["evidencias"][t].lower() for t in req["valor"])
        falta = None if ok else f"Reporta un avance con evidencia: {nombres}."
    return {"id": item["id"], "desbloqueado": ok, "falta": falta}


def costo_mejora(item: dict, nivel_actual: int, config: dict) -> int | None:
    """Costo de subir el edificio un nivel; None si ya está al máximo."""
    c = config["construccion"]
    if nivel_actual >= c["nivel_maximo"]:
        return None
    return round(item["costo"] * c["factor_mejora"] * nivel_actual)


def reembolso(gastado: int, config: dict) -> int:
    return math.floor(gastado * config["construccion"]["reembolso"])


def materiales_disponibles(puntos: int, ajuste: int, gastado_en_pie: int, config: dict) -> int:
    """Iniciales + puntos ganados + ajustes por demoliciones − lo invertido en lo que sigue en pie."""
    return config["materiales_iniciales"] + puntos + ajuste - gastado_en_pie
