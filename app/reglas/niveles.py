"""Niveles de progreso a partir de los puntos acumulados."""


def nivel_para(puntos: int, niveles: list[dict]) -> dict:
    """Devuelve el nivel actual, el umbral del siguiente y el progreso (0 a 1) hacia él."""
    ordenados = sorted(niveles, key=lambda n: n["min"])
    actual = ordenados[0]
    siguiente = None
    for i, nivel in enumerate(ordenados):
        if puntos >= nivel["min"]:
            actual = nivel
            siguiente = ordenados[i + 1] if i + 1 < len(ordenados) else None
    if siguiente is None:
        progreso = 1.0
    else:
        tramo = siguiente["min"] - actual["min"]
        progreso = (puntos - actual["min"]) / tramo
    return {
        "numero": actual["numero"],
        "nombre": actual["nombre"],
        "min": actual["min"],
        "siguiente_min": siguiente["min"] if siguiente else None,
        "siguiente_nombre": siguiente["nombre"] if siguiente else None,
        "progreso": round(progreso, 4),
    }
