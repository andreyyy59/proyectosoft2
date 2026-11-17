"""Comandos de consola: flask --app wsgi <comando>."""
import random
from datetime import datetime, time, timedelta

import click
from flask import current_app

from .extensiones import db
from .modelos import Evento, InsigniaObtenida, Reporte, Usuario


def registrar_comandos(app):
    @app.cli.command("crear-admin")
    @click.option("--alias", default="admin", show_default=True)
    @click.option("--pin", prompt=True, hide_input=True, confirmation_prompt=True, help="PIN de 4 a 8 dígitos")
    def crear_admin(alias, pin):
        """Crea (o actualiza el PIN de) la cuenta de administrador."""
        if not pin.isdigit() or not 4 <= len(pin) <= 8:
            raise click.BadParameter("El PIN debe tener de 4 a 8 dígitos.")
        admin = Usuario.query.filter_by(alias=alias).first()
        if admin is None:
            admin = Usuario(alias=alias, perfil="admin", equipo="Administración", es_admin=True, consintio=True)
            db.session.add(admin)
        admin.fijar_pin(pin)
        db.session.commit()
        click.echo(f"Administrador '{alias}' listo.")

    @app.cli.command("datos-demo")
    @click.option("--jugadores", default=12, show_default=True)
    @click.option("--dias", default=7, show_default=True, help="Días hacia atrás desde hoy")
    def datos_demo(jugadores, dias):
        """Crea jugadores y reportes FICTICIOS para probar la interfaz.

        Nunca los presenten como datos del piloto: quedan marcados como demo.
        """
        servicio = current_app.extensions["servicio_juego"]
        reloj_original = servicio.reloj
        azar = random.Random(42)
        hoy = reloj_original().date()
        equipos = ["Software Factory", "Implementación"]
        creados = []
        for i in range(1, jugadores + 1):
            alias = f"demo{i:02d}"
            if Usuario.query.filter_by(alias=alias).first():
                continue
            perfil = "desarrollador" if i % 2 else "consultor"
            u = Usuario(alias=alias, perfil=perfil, equipo=equipos[0] if perfil == "desarrollador" else equipos[1],
                        es_demo=True, consintio=True, fecha_consentimiento=datetime.now())
            u.fijar_pin("1234")
            db.session.add(u)
            creados.append(u)
        db.session.commit()

        evidencias = current_app.config["JUEGO"]["perfiles"]
        try:
            for offset in range(dias, -1, -1):
                dia = hoy - timedelta(days=offset)
                if dia.weekday() >= 5:
                    continue
                for u in creados:
                    disciplina = 0.45 + 0.5 * (int(u.alias[-2:]) / jugadores)
                    if azar.random() > disciplina + 0.15:
                        continue
                    a_tiempo = azar.random() < disciplina
                    hora = time(azar.randint(14, 17), azar.randint(0, 29)) if a_tiempo else time(18, azar.randint(0, 59))
                    servicio.reloj = lambda d=dia, h=hora: datetime.combine(d, h)
                    tipo = azar.choice(evidencias[u.perfil]["evidencias"] + ["ninguna"])
                    servicio.registrar_reporte(u, {
                        "tarea": "Tarea de demostración",
                        "avance": azar.randint(10, 100),
                        "horas": azar.choice([4, 6, 7.5, 8]),
                        "evidencia_tipo": tipo,
                        "evidencia_ref": "DEMO-123" if tipo != "ninguna" else "",
                        "bloqueo": "Bloqueo de ejemplo" if azar.random() < 0.15 else "",
                    })
        finally:
            servicio.reloj = reloj_original
        click.echo(f"{len(creados)} jugadores demo creados (PIN 1234). Están marcados como demo.")

    @app.cli.command("borrar-demo")
    def borrar_demo():
        """Elimina todos los jugadores demo y sus datos."""
        ids = [u.id for u in Usuario.query.filter_by(es_demo=True).all()]
        if ids:
            Evento.query.filter(Evento.usuario_id.in_(ids)).delete(synchronize_session=False)
            InsigniaObtenida.query.filter(InsigniaObtenida.usuario_id.in_(ids)).delete(synchronize_session=False)
            Reporte.query.filter(Reporte.usuario_id.in_(ids)).delete(synchronize_session=False)
            Usuario.query.filter(Usuario.id.in_(ids)).delete(synchronize_session=False)
            db.session.commit()
        click.echo(f"{len(ids)} jugadores demo eliminados.")
