"""Servicio del juego: une el motor de reglas con la base de datos y el bus de eventos."""
from datetime import date, datetime, time, timedelta

from .eventos import BusEventos
from .extensiones import db
from .modelos import Construccion, InsigniaObtenida, Parametro, Reporte, Usuario
from .reglas import (
    ContextoReporte,
    MotorReglas,
    calcular_estadisticas,
    calcular_racha,
    celda_valida,
    costo_mejora,
    es_dia_habil,
    estado_item,
    evidencias_por_tipo,
    materiales_disponibles,
    reembolso,
    evaluar_insignias,
    nivel_para,
    racha_maxima,
    racha_vigente,
)


class ErrorValidacion(ValueError):
    """Datos del reporte inválidos. El mensaje se muestra al jugador."""


class ErrorNoEncontrado(LookupError):
    """El recurso no existe o no es del jugador."""


def leer_hora(texto: str) -> time:
    horas, minutos = texto.split(":")
    return time(int(horas), int(minutos))


class ServicioJuego:
    def __init__(self, config: dict, bus: BusEventos, reloj):
        self.config = config
        self.bus = bus
        self.reloj = reloj
        self.motor = MotorReglas.desde_config(config)

    # ---------- Parámetros ----------
    def parametro(self, clave: str, por_defecto: str) -> str:
        fila = db.session.get(Parametro, clave)
        return fila.valor if fila else por_defecto

    def hora_limite(self) -> time:
        return leer_hora(self.parametro("hora_limite", self.config["hora_limite_por_defecto"]))

    def meta_equipo(self) -> int:
        return int(self.parametro("meta_equipo", str(self.config["meta_equipo_por_defecto"])))

    def fijar_parametros(self, hora_limite: str | None = None, meta_equipo: int | None = None) -> None:
        if hora_limite is not None:
            try:
                leer_hora(hora_limite)
            except (ValueError, TypeError):
                raise ErrorValidacion("La hora límite debe tener el formato HH:MM.")
            self._guardar_parametro("hora_limite", hora_limite)
        if meta_equipo is not None:
            if not 1 <= int(meta_equipo) <= 100:
                raise ErrorValidacion("La meta del equipo debe estar entre 1 y 100.")
            self._guardar_parametro("meta_equipo", str(int(meta_equipo)))
        db.session.commit()

    def _guardar_parametro(self, clave: str, valor: str) -> None:
        fila = db.session.get(Parametro, clave)
        if fila:
            fila.valor = valor
        else:
            db.session.add(Parametro(clave=clave, valor=valor))

    # ---------- Eventos ----------
    def registrar_evento(self, tipo: str, usuario: Usuario | None, datos: dict | None = None) -> None:
        self.bus.publicar(tipo, usuario.id if usuario else None, datos or {}, self.reloj())
        db.session.commit()

    def aceptar_consentimiento(self, usuario: Usuario) -> None:
        usuario.consintio = True
        usuario.fecha_consentimiento = self.reloj()
        self.registrar_evento("consentimiento_aceptado", usuario)

    # ---------- Reportes ----------
    def validar(self, usuario: Usuario, datos: dict) -> dict:
        tarea = str(datos.get("tarea", "")).strip()
        if not tarea:
            raise ErrorValidacion("Escribe en qué trabajaste hoy.")
        if len(tarea) > 200:
            raise ErrorValidacion("La tarea no puede superar 200 caracteres.")
        try:
            avance = int(datos.get("avance", 0))
            horas = float(datos.get("horas", 0))
        except (TypeError, ValueError):
            raise ErrorValidacion("El avance y las horas deben ser números.")
        if not 0 <= avance <= 100:
            raise ErrorValidacion("El avance debe estar entre 0 y 100 %.")
        if not 0 < horas <= 24:
            raise ErrorValidacion("Las horas deben estar entre 0 y 24.")
        evidencia_tipo = datos.get("evidencia_tipo") or "ninguna"
        permitidas = self.config["perfiles"].get(usuario.perfil, {}).get("evidencias", [])
        if evidencia_tipo != "ninguna" and evidencia_tipo not in permitidas:
            raise ErrorValidacion("Ese tipo de evidencia no corresponde a tu perfil.")
        evidencia_ref = str(datos.get("evidencia_ref") or "").strip()[:300] or None
        if evidencia_tipo != "ninguna" and not evidencia_ref:
            raise ErrorValidacion("Agrega el enlace o la referencia de tu evidencia.")
        bloqueo = str(datos.get("bloqueo") or "").strip()[:500] or None
        return {
            "tarea": tarea,
            "avance": avance,
            "horas": round(horas, 2),
            "evidencia_tipo": evidencia_tipo,
            "evidencia_ref": evidencia_ref if evidencia_tipo != "ninguna" else None,
            "bloqueo": bloqueo,
        }

    def registrar_reporte(self, usuario: Usuario, datos: dict) -> dict:
        if not usuario.consintio:
            raise ErrorValidacion("Primero debes aceptar el consentimiento informado.")
        limpio = self.validar(usuario, datos)
        momento = self.reloj()
        fecha, hora = momento.date(), momento.time().replace(second=0, microsecond=0)
        limite = self.hora_limite()

        previos = [r.para_reglas() for r in usuario.reportes.all()]
        desbloqueados_antes = self._desbloqueados(usuario, previos)
        es_duplicado = any(r["fecha"] == fecha and not r["duplicado"] for r in previos)
        a_tiempo = hora <= limite and not es_duplicado
        fechas_a_tiempo = {r["fecha"] for r in previos if r["a_tiempo"] and not r["duplicado"]}
        if a_tiempo:
            fechas_a_tiempo.add(fecha)
        racha = calcular_racha(fechas_a_tiempo, fecha) if a_tiempo else 0

        ctx = ContextoReporte(
            fecha=fecha,
            hora=hora,
            hora_limite=limite,
            tiene_evidencia=limpio["evidencia_tipo"] != "ninguna",
            reporto_bloqueo=bool(limpio["bloqueo"]),
            racha=racha,
            es_duplicado=es_duplicado,
        )
        resultado = self.motor.calcular(ctx)
        retraso = 0 if hora <= limite else _minutos_entre(limite, hora)

        nivel_antes = nivel_para(usuario.puntos, self.config["niveles"])
        reporte = Reporte(
            usuario_id=usuario.id,
            fecha=fecha,
            hora=hora,
            a_tiempo=a_tiempo,
            duplicado=es_duplicado,
            minutos_retraso=retraso,
            puntos=resultado.total,
            desglose=resultado.como_dict()["desglose"],
            creado_en=momento,
            **limpio,
        )
        db.session.add(reporte)
        usuario.puntos += resultado.total
        db.session.flush()
        nivel_despues = nivel_para(usuario.puntos, self.config["niveles"])

        nuevas = self._otorgar_insignias(usuario, momento)
        todos = [r.para_reglas() for r in usuario.reportes.all()]
        nuevos_edificios = [i for i in self._desbloqueados(usuario, todos) if i not in desbloqueados_antes]

        self.bus.publicar("reporte_registrado", usuario.id, {
            "reporte_id": reporte.id,
            "a_tiempo": a_tiempo,
            "duplicado": es_duplicado,
            "minutos_retraso": retraso,
            "con_evidencia": ctx.tiene_evidencia,
            "con_bloqueo": ctx.reporto_bloqueo,
            "dia_habil": es_dia_habil(fecha),
        }, momento)
        self.bus.publicar("puntos_otorgados", usuario.id, resultado.como_dict(), momento)
        for codigo in nuevas:
            self.bus.publicar("insignia_obtenida", usuario.id, {"codigo": codigo}, momento)
        for item_id in nuevos_edificios:
            self.bus.publicar("edificio_desbloqueado", usuario.id, {"tipo": item_id}, momento)
        if nivel_despues["numero"] > nivel_antes["numero"]:
            self.bus.publicar("nivel_subido", usuario.id, {
                "de": nivel_antes["numero"], "a": nivel_despues["numero"]
            }, momento)
        db.session.commit()

        return {
            "reporte": reporte.como_dict(),
            "resultado": resultado.como_dict(),
            "racha": racha,
            "nuevas_insignias": nuevas,
            "nuevos_edificios": nuevos_edificios,
            "materiales_ganados": resultado.total,
            "materiales": self.materiales(usuario),
            "nivel_antes": nivel_antes,
            "nivel_despues": nivel_despues,
            "subio_nivel": nivel_despues["numero"] > nivel_antes["numero"],
        }

    def _otorgar_insignias(self, usuario: Usuario, momento: datetime) -> list[str]:
        reportes = [r.para_reglas() for r in usuario.reportes.all()]
        estadisticas = calcular_estadisticas(reportes, usuario.perfil, self.config)
        cumplidas = evaluar_insignias(estadisticas, usuario.perfil, self.config)
        ya = {i.codigo for i in usuario.insignias.all()}
        nuevas = [c for c in cumplidas if c not in ya]
        for codigo in nuevas:
            db.session.add(InsigniaObtenida(usuario_id=usuario.id, codigo=codigo, obtenida_en=momento))
        return nuevas

    # ---------- Consultas ----------
    def estado_jugador(self, usuario: Usuario) -> dict:
        hoy = self.reloj().date()
        reportes = usuario.reportes.order_by(Reporte.fecha.desc(), Reporte.id.desc()).all()
        para_reglas = [r.para_reglas() for r in reportes]
        fechas_a_tiempo = {r["fecha"] for r in para_reglas if r["a_tiempo"] and not r["duplicado"]}
        obtenidas = {i.codigo: i.obtenida_en for i in usuario.insignias.all()}
        insignias = []
        for ins in self.config["insignias"]:
            if ins.get("perfil") and ins["perfil"] != usuario.perfil:
                continue
            fecha = obtenidas.get(ins["codigo"])
            insignias.append({
                "codigo": ins["codigo"],
                "obtenida": fecha is not None,
                "fecha": fecha.isoformat() if fecha else None,
            })
        return {
            "modo": "en_linea",
            "usuario": usuario.resumen(),
            "puntos": usuario.puntos,
            "nivel": nivel_para(usuario.puntos, self.config["niveles"]),
            "racha": racha_vigente(fechas_a_tiempo, hoy),
            "racha_maxima": racha_maxima(fechas_a_tiempo),
            "reporto_hoy": any(r.fecha == hoy and not r.duplicado for r in reportes),
            "hoy": hoy.isoformat(),
            "ahora": self.reloj().strftime("%H:%M"),
            "hora_limite": self.hora_limite().strftime("%H:%M"),
            "insignias": insignias,
            "reportes": [r.como_dict() for r in reportes[:60]],
            "estadisticas": calcular_estadisticas(para_reglas, usuario.perfil, self.config),
            "materiales": self.materiales(usuario),
            "construcciones": [c.como_dict() for c in usuario.construcciones.order_by(Construccion.id).all()],
            "catalogo": self.catalogo(usuario, para_reglas),
        }

    # ---------- Construcción ----------
    def materiales(self, usuario: Usuario) -> int:
        gastado = sum(c.gastado for c in usuario.construcciones.all())
        return materiales_disponibles(usuario.puntos, usuario.materiales_ajuste, gastado, self.config)

    def catalogo(self, usuario: Usuario, reportes: list[dict]) -> list[dict]:
        nivel = nivel_para(usuario.puntos, self.config["niveles"])["numero"]
        evidencias = evidencias_por_tipo(reportes)
        return [estado_item(item, nivel, evidencias, self.config) for item in self.config["catalogo"]]

    def _desbloqueados(self, usuario: Usuario, reportes: list[dict]) -> set[str]:
        return {e["id"] for e in self.catalogo(usuario, reportes) if e["desbloqueado"]}

    def _item(self, tipo: str) -> dict:
        for item in self.config["catalogo"]:
            if item["id"] == tipo:
                return item
        raise ErrorValidacion("Ese edificio no existe.")

    def _propia(self, usuario: Usuario, construccion_id: int) -> Construccion:
        c = db.session.get(Construccion, construccion_id)
        if c is None or c.usuario_id != usuario.id:
            raise ErrorNoEncontrado("Ese edificio no está en tu meseta.")
        return c

    def _validar_celda(self, usuario: Usuario, celda, ignorar_id: int | None = None) -> tuple[int, int]:
        nivel = nivel_para(usuario.puntos, self.config["niveles"])["numero"]
        if not celda_valida(celda, nivel, self.config):
            raise ErrorValidacion("Ahí no se puede construir: elige un lugar dentro de la meseta.")
        ocupada = usuario.construcciones.filter_by(celda_i=celda[0], celda_j=celda[1]).first()
        if ocupada and ocupada.id != ignorar_id:
            raise ErrorValidacion("Ese lugar ya está ocupado.")
        return celda[0], celda[1]

    def _cobrar(self, usuario: Usuario, costo: int) -> None:
        disponibles = self.materiales(usuario)
        if disponibles < costo:
            raise ErrorValidacion(f"Te faltan {costo - disponibles} materiales. Repórtalos con tu avance de hoy.")

    def construir(self, usuario: Usuario, tipo: str, celda, rotacion: int = 0) -> dict:
        item = self._item(tipo)
        reportes = [r.para_reglas() for r in usuario.reportes.all()]
        estado = next(e for e in self.catalogo(usuario, reportes) if e["id"] == tipo)
        if not estado["desbloqueado"]:
            raise ErrorValidacion(estado["falta"])
        i, j = self._validar_celda(usuario, celda)
        self._cobrar(usuario, item["costo"])
        c = Construccion(usuario_id=usuario.id, tipo=tipo, celda_i=i, celda_j=j,
                         rotacion=int(rotacion) % 4, gastado=item["costo"], creado_en=self.reloj())
        db.session.add(c)
        db.session.flush()
        self.bus.publicar("construccion_creada", usuario.id, {"tipo": tipo, "costo": item["costo"]}, self.reloj())
        db.session.commit()
        return {"construccion": c.como_dict(), "materiales": self.materiales(usuario)}

    def mejorar(self, usuario: Usuario, construccion_id: int) -> dict:
        c = self._propia(usuario, construccion_id)
        costo = costo_mejora(self._item(c.tipo), c.nivel, self.config)
        if costo is None:
            raise ErrorValidacion("Este edificio ya está en su nivel máximo.")
        self._cobrar(usuario, costo)
        c.nivel += 1
        c.gastado += costo
        self.bus.publicar("construccion_mejorada", usuario.id, {"tipo": c.tipo, "nivel": c.nivel, "costo": costo}, self.reloj())
        db.session.commit()
        return {"construccion": c.como_dict(), "materiales": self.materiales(usuario)}

    def mover(self, usuario: Usuario, construccion_id: int, celda, rotacion: int | None = None) -> dict:
        c = self._propia(usuario, construccion_id)
        c.celda_i, c.celda_j = self._validar_celda(usuario, celda, ignorar_id=c.id)
        if rotacion is not None:
            c.rotacion = int(rotacion) % 4
        self.bus.publicar("construccion_movida", usuario.id, {"tipo": c.tipo}, self.reloj())
        db.session.commit()
        return {"construccion": c.como_dict(), "materiales": self.materiales(usuario)}

    def demoler(self, usuario: Usuario, construccion_id: int) -> dict:
        c = self._propia(usuario, construccion_id)
        devuelto = reembolso(c.gastado, self.config)
        usuario.materiales_ajuste -= c.gastado - devuelto
        self.bus.publicar("construccion_demolida", usuario.id, {"tipo": c.tipo, "devuelto": devuelto}, self.reloj())
        db.session.delete(c)
        db.session.commit()
        return {"devuelto": devuelto, "materiales": self.materiales(usuario)}

    def progreso_equipos(self) -> dict:
        hoy = self.reloj().date()
        lunes = hoy - timedelta(days=hoy.weekday())
        dias = [lunes + timedelta(days=i) for i in range(5) if lunes + timedelta(days=i) <= hoy]
        jugadores = Usuario.query.filter_by(es_admin=False, activo=True).all()
        equipos: dict[str, dict] = {}
        for j in jugadores:
            datos = equipos.setdefault(j.equipo, {"equipo": j.equipo, "miembros": 0, "a_tiempo": 0, "puntos": 0})
            datos["miembros"] += 1
            datos["puntos"] += j.puntos
            datos["a_tiempo"] += j.reportes.filter(
                Reporte.fecha >= lunes, Reporte.fecha <= hoy,
                Reporte.a_tiempo.is_(True), Reporte.duplicado.is_(False),
            ).count()
        meta = self.meta_equipo()
        lista = []
        for datos in equipos.values():
            esperado = datos["miembros"] * len(dias)
            porcentaje = round(100 * datos["a_tiempo"] / esperado, 1) if esperado else 0.0
            lista.append({**datos, "esperado": esperado, "porcentaje": porcentaje, "cumplida": porcentaje >= meta})
        lista.sort(key=lambda e: e["equipo"])
        return {"semana_desde": lunes.isoformat(), "dias_habiles": len(dias), "meta": meta, "equipos": lista}


def _minutos_entre(desde: time, hasta: time) -> int:
    base = date(2000, 1, 1)
    return int((datetime.combine(base, hasta) - datetime.combine(base, desde)).total_seconds() // 60)
