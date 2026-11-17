"""Modelo de datos. Todas las fechas y horas se guardan en la hora local de la organización."""
from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from .extensiones import db


class Usuario(db.Model):
    __tablename__ = "usuarios"

    id = db.Column(db.Integer, primary_key=True)
    alias = db.Column(db.String(40), unique=True, nullable=False)
    perfil = db.Column(db.String(20), nullable=False)  # desarrollador | consultor | admin
    equipo = db.Column(db.String(60), nullable=False, default="General")
    pin_hash = db.Column(db.String(255), nullable=False)
    es_admin = db.Column(db.Boolean, nullable=False, default=False)
    activo = db.Column(db.Boolean, nullable=False, default=True)
    es_demo = db.Column(db.Boolean, nullable=False, default=False)
    consintio = db.Column(db.Boolean, nullable=False, default=False)
    fecha_consentimiento = db.Column(db.DateTime)
    puntos = db.Column(db.Integer, nullable=False, default=0)
    creado_en = db.Column(db.DateTime, nullable=False, default=datetime.now)

    reportes = db.relationship("Reporte", back_populates="usuario", lazy="dynamic")
    insignias = db.relationship("InsigniaObtenida", back_populates="usuario", lazy="dynamic")

    def fijar_pin(self, pin: str) -> None:
        self.pin_hash = generate_password_hash(pin)

    def pin_valido(self, pin: str) -> bool:
        return check_password_hash(self.pin_hash, pin)

    def resumen(self) -> dict:
        return {
            "id": self.id,
            "alias": self.alias,
            "perfil": self.perfil,
            "equipo": self.equipo,
            "es_admin": self.es_admin,
            "consintio": self.consintio,
            "activo": self.activo,
            "es_demo": self.es_demo,
        }


class Reporte(db.Model):
    __tablename__ = "reportes"

    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False, index=True)
    fecha = db.Column(db.Date, nullable=False, index=True)
    hora = db.Column(db.Time, nullable=False)
    tarea = db.Column(db.String(200), nullable=False)
    avance = db.Column(db.Integer, nullable=False)
    horas = db.Column(db.Float, nullable=False)
    evidencia_tipo = db.Column(db.String(30), nullable=False, default="ninguna")
    evidencia_ref = db.Column(db.String(300))
    bloqueo = db.Column(db.String(500))
    a_tiempo = db.Column(db.Boolean, nullable=False)
    duplicado = db.Column(db.Boolean, nullable=False, default=False)
    minutos_retraso = db.Column(db.Integer, nullable=False, default=0)
    puntos = db.Column(db.Integer, nullable=False, default=0)
    desglose = db.Column(db.JSON, nullable=False, default=list)
    creado_en = db.Column(db.DateTime, nullable=False, default=datetime.now)

    usuario = db.relationship("Usuario", back_populates="reportes")

    def como_dict(self) -> dict:
        return {
            "id": self.id,
            "fecha": self.fecha.isoformat(),
            "hora": self.hora.strftime("%H:%M"),
            "tarea": self.tarea,
            "avance": self.avance,
            "horas": self.horas,
            "evidencia_tipo": self.evidencia_tipo,
            "evidencia_ref": self.evidencia_ref,
            "bloqueo": self.bloqueo,
            "a_tiempo": self.a_tiempo,
            "duplicado": self.duplicado,
            "minutos_retraso": self.minutos_retraso,
            "puntos": self.puntos,
            "desglose": self.desglose,
        }

    def para_reglas(self) -> dict:
        return {
            "fecha": self.fecha,
            "a_tiempo": self.a_tiempo,
            "duplicado": self.duplicado,
            "evidencia_tipo": self.evidencia_tipo,
            "bloqueo": self.bloqueo,
        }


class InsigniaObtenida(db.Model):
    __tablename__ = "insignias_obtenidas"
    __table_args__ = (db.UniqueConstraint("usuario_id", "codigo"),)

    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    codigo = db.Column(db.String(40), nullable=False)
    obtenida_en = db.Column(db.DateTime, nullable=False, default=datetime.now)

    usuario = db.relationship("Usuario", back_populates="insignias")


class Evento(db.Model):
    """Registro de eventos: la fuente de datos de los indicadores del piloto."""

    __tablename__ = "eventos"

    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), index=True)
    tipo = db.Column(db.String(40), nullable=False, index=True)
    datos = db.Column(db.JSON, nullable=False, default=dict)
    creado_en = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)


class Parametro(db.Model):
    """Parámetros que el administrador puede cambiar (hora límite, meta del equipo)."""

    __tablename__ = "parametros"

    clave = db.Column(db.String(40), primary_key=True)
    valor = db.Column(db.String(200), nullable=False)
