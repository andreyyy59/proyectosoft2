"""API REST del juego (JSON). El cliente 3D la usa en el modo en línea."""
import csv
import io
import re
from datetime import date, timedelta
from functools import wraps

from flask import Blueprint, Response, current_app, jsonify, request, session

from .extensiones import db
from .indicadores import calcular_indicadores
from .modelos import Evento, Reporte, Usuario
from .servicios import ErrorValidacion

api = Blueprint("api", __name__, url_prefix="/api")

PATRON_ALIAS = re.compile(r"^[A-Za-z0-9_.-]{3,40}$")
PATRON_PIN = re.compile(r"^\d{4,8}$")
VISTAS_TELEMETRIA = {"menu", "base", "logros", "equipo", "historial", "como_jugar", "ajustes", "admin"}


def servicio():
    return current_app.extensions["servicio_juego"]


def usuario_actual() -> Usuario | None:
    uid = session.get("uid")
    if uid is None:
        return None
    usuario = db.session.get(Usuario, uid)
    return usuario if usuario and usuario.activo else None


def requiere_sesion(vista):
    @wraps(vista)
    def envoltura(*args, **kwargs):
        usuario = usuario_actual()
        if usuario is None:
            return jsonify(error="Inicia sesión para continuar."), 401
        return vista(usuario, *args, **kwargs)
    return envoltura


def requiere_admin(vista):
    @wraps(vista)
    def envoltura(*args, **kwargs):
        usuario = usuario_actual()
        if usuario is None:
            return jsonify(error="Inicia sesión para continuar."), 401
        if not usuario.es_admin:
            return jsonify(error="Solo el administrador puede ver esto."), 403
        return vista(usuario, *args, **kwargs)
    return envoltura


@api.errorhandler(ErrorValidacion)
def _error_validacion(error):
    return jsonify(error=str(error)), 400


# ---------- Público ----------
@api.get("/salud")
def salud():
    return jsonify(ok=True, modo="en_linea")


@api.post("/sesion")
def iniciar_sesion():
    datos = request.get_json(silent=True) or {}
    alias = str(datos.get("alias", "")).strip()
    pin = str(datos.get("pin", "")).strip()
    usuario = Usuario.query.filter(db.func.lower(Usuario.alias) == alias.lower()).first()
    if not usuario or not usuario.activo or not usuario.pin_valido(pin):
        return jsonify(error="Alias o PIN incorrectos."), 401
    session.clear()
    session["uid"] = usuario.id
    session.permanent = True
    servicio().registrar_evento("sesion_iniciada", usuario)
    return jsonify(usuario=usuario.resumen())


@api.delete("/sesion")
def cerrar_sesion():
    usuario = usuario_actual()
    if usuario:
        servicio().registrar_evento("sesion_cerrada", usuario)
    session.clear()
    return jsonify(ok=True)


# ---------- Jugador ----------
@api.get("/yo")
@requiere_sesion
def yo(usuario):
    if usuario.es_admin:
        return jsonify(modo="en_linea", usuario=usuario.resumen())
    return jsonify(servicio().estado_jugador(usuario))


@api.post("/consentimiento")
@requiere_sesion
def consentimiento(usuario):
    servicio().aceptar_consentimiento(usuario)
    return jsonify(ok=True)


@api.post("/reportes")
@requiere_sesion
def crear_reporte(usuario):
    if usuario.es_admin:
        return jsonify(error="El administrador no juega."), 403
    resultado = servicio().registrar_reporte(usuario, request.get_json(silent=True) or {})
    return jsonify(resultado), 201


@api.get("/equipo")
@requiere_sesion
def equipo(usuario):
    return jsonify(servicio().progreso_equipos())


@api.post("/telemetria")
@requiere_sesion
def telemetria(usuario):
    datos = request.get_json(silent=True) or {}
    vista = datos.get("vista")
    if vista not in VISTAS_TELEMETRIA:
        return jsonify(error="Vista desconocida."), 400
    servicio().registrar_evento("vista_abierta", usuario, {"vista": vista})
    return jsonify(ok=True)


# ---------- Administrador ----------
@api.get("/admin/indicadores")
@requiere_admin
def indicadores(admin):
    hoy = servicio().reloj().date()
    try:
        hasta = date.fromisoformat(request.args.get("hasta", hoy.isoformat()))
        desde = date.fromisoformat(request.args.get("desde", (hasta - timedelta(days=6)).isoformat()))
    except ValueError:
        return jsonify(error="Fechas inválidas: usa AAAA-MM-DD."), 400
    if desde > hasta:
        return jsonify(error="La fecha inicial es posterior a la final."), 400
    if (hasta - desde).days > 120:
        return jsonify(error="El periodo máximo es de 120 días."), 400
    datos = calcular_indicadores(desde, hasta)
    datos["equipos"] = servicio().progreso_equipos()
    return jsonify(datos)


@api.get("/admin/jugadores")
@requiere_admin
def listar_jugadores(admin):
    jugadores = Usuario.query.filter_by(es_admin=False).order_by(Usuario.alias).all()
    return jsonify(jugadores=[
        {**j.resumen(), "puntos": j.puntos,
         "reportes": j.reportes.filter(Reporte.duplicado.is_(False)).count()}
        for j in jugadores
    ])


@api.post("/admin/jugadores")
@requiere_admin
def crear_jugador(admin):
    datos = request.get_json(silent=True) or {}
    alias = str(datos.get("alias", "")).strip()
    perfil = datos.get("perfil")
    equipo = str(datos.get("equipo", "")).strip() or "General"
    pin = str(datos.get("pin", "")).strip()
    if not PATRON_ALIAS.match(alias):
        raise ErrorValidacion("El alias debe tener de 3 a 40 letras, números, punto, guion o guion bajo.")
    if perfil not in current_app.config["JUEGO"]["perfiles"]:
        raise ErrorValidacion("El perfil debe ser desarrollador o consultor.")
    if not PATRON_PIN.match(pin):
        raise ErrorValidacion("El PIN debe tener de 4 a 8 dígitos.")
    if len(equipo) > 60:
        raise ErrorValidacion("El nombre del equipo es demasiado largo.")
    if Usuario.query.filter(db.func.lower(Usuario.alias) == alias.lower()).first():
        raise ErrorValidacion("Ya existe un jugador con ese alias.")
    jugador = Usuario(alias=alias, perfil=perfil, equipo=equipo)
    jugador.fijar_pin(pin)
    db.session.add(jugador)
    db.session.flush()
    servicio().registrar_evento("jugador_creado", admin, {"jugador_id": jugador.id, "perfil": perfil})
    return jsonify(jugador=jugador.resumen()), 201


@api.patch("/admin/jugadores/<int:jugador_id>")
@requiere_admin
def editar_jugador(admin, jugador_id):
    jugador = db.session.get(Usuario, jugador_id)
    if not jugador or jugador.es_admin:
        return jsonify(error="Jugador no encontrado."), 404
    datos = request.get_json(silent=True) or {}
    if "activo" in datos:
        jugador.activo = bool(datos["activo"])
    if "equipo" in datos:
        equipo = str(datos["equipo"]).strip()
        if not equipo or len(equipo) > 60:
            raise ErrorValidacion("Nombre de equipo inválido.")
        jugador.equipo = equipo
    if "pin" in datos:
        if not PATRON_PIN.match(str(datos["pin"])):
            raise ErrorValidacion("El PIN debe tener de 4 a 8 dígitos.")
        jugador.fijar_pin(str(datos["pin"]))
    db.session.commit()
    return jsonify(jugador=jugador.resumen())


@api.get("/admin/config")
@requiere_admin
def leer_config(admin):
    s = servicio()
    return jsonify(hora_limite=s.hora_limite().strftime("%H:%M"), meta_equipo=s.meta_equipo())


@api.put("/admin/config")
@requiere_admin
def cambiar_config(admin):
    datos = request.get_json(silent=True) or {}
    s = servicio()
    s.fijar_parametros(datos.get("hora_limite"), datos.get("meta_equipo"))
    s.registrar_evento("config_cambiada", admin, datos)
    return jsonify(hora_limite=s.hora_limite().strftime("%H:%M"), meta_equipo=s.meta_equipo())


@api.get("/admin/eventos")
@requiere_admin
def ultimos_eventos(admin):
    limite = min(int(request.args.get("limite", 50)), 500)
    codigos = _codigos_anonimos()
    eventos = Evento.query.order_by(Evento.id.desc()).limit(limite).all()
    return jsonify(eventos=[{
        "id": e.id,
        "tipo": e.tipo,
        "jugador": codigos.get(e.usuario_id, "admin" if e.usuario_id else "-"),
        "datos": e.datos,
        "creado_en": e.creado_en.isoformat(timespec="seconds"),
    } for e in eventos])


@api.get("/admin/exportar/<nombre>.csv")
@requiere_admin
def exportar(admin, nombre):
    """Exporta datos anonimizados: el alias se reemplaza por un código J01, J02..."""
    codigos = _codigos_anonimos()
    salida = io.StringIO()
    escritor = csv.writer(salida)
    if nombre == "reportes":
        escritor.writerow(["jugador", "perfil", "equipo", "es_demo", "fecha", "hora", "a_tiempo",
                           "duplicado", "minutos_retraso", "evidencia_tipo", "con_bloqueo", "avance",
                           "horas", "puntos"])
        for r in Reporte.query.order_by(Reporte.fecha, Reporte.hora).all():
            u = r.usuario
            escritor.writerow([codigos.get(u.id, "admin"), u.perfil, u.equipo, int(u.es_demo),
                               r.fecha.isoformat(), r.hora.strftime("%H:%M"), int(r.a_tiempo),
                               int(r.duplicado), r.minutos_retraso, r.evidencia_tipo,
                               int(bool(r.bloqueo)), r.avance, r.horas, r.puntos])
    elif nombre == "eventos":
        escritor.writerow(["id", "jugador", "tipo", "creado_en", "datos"])
        for e in Evento.query.order_by(Evento.id).all():
            escritor.writerow([e.id, codigos.get(e.usuario_id, "admin" if e.usuario_id else "-"),
                               e.tipo, e.creado_en.isoformat(timespec="seconds"), _sin_texto_libre(e.datos)])
    else:
        return jsonify(error="Exportación desconocida."), 404
    servicio().registrar_evento("datos_exportados", admin, {"archivo": nombre})
    return Response(
        "﻿" + salida.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=sprintquest_{nombre}.csv"},
    )


def _codigos_anonimos() -> dict[int, str]:
    jugadores = Usuario.query.filter_by(es_admin=False).order_by(Usuario.id).all()
    return {j.id: f"J{i:02d}" for i, j in enumerate(jugadores, start=1)}


def _sin_texto_libre(datos: dict) -> str:
    """Quita del CSV cualquier campo de texto libre que pudiera identificar a alguien."""
    seguros = {k: v for k, v in (datos or {}).items() if not isinstance(v, str) or k in {"vista", "codigo", "perfil", "archivo"}}
    return str(seguros)
