# Sprint Quest

Juego para que el equipo de **Tiresia Soluciones Tecnológicas** registre su avance diario, con evidencia, antes de la hora límite de la jornada. Cada reporte da puntos y **materiales**; con los materiales cada jugador construye su propia meseta 3D, inspirada en el cañón del Chicamocha. Los edificios especiales se desbloquean con el trabajo real reportado (la torre de código con un commit, la casa del cliente con un acta). El cielo sigue la hora real y atardece al acercarse el cierre.

Proyecto de aula de Ingeniería de Software 2.

## Qué incluye

| Requisito del proyecto | Dónde está |
| --- | --- |
| Dos perfiles de jugador y un administrador | `desarrollador`, `consultor` y la cuenta `admin` (`compartido/config_juego.json`, `app/api.py`) |
| Ciclo completo: acción, retroalimentación, recompensa y progreso | Registrar avance → desglose de puntos animado → puntos e insignias → niveles, racha y meseta que crece |
| Tres o más elementos de juego | Puntos, materiales y construcción, desbloqueos por evidencia, rachas, insignias, niveles, meta cooperativa por equipo |
| Registro de eventos en base de datos | Tabla `eventos` (`app/eventos.py`, patrón Observer) |
| Vista con dos o más indicadores | Panel del administrador: reportes a tiempo, reportes con evidencia, retraso promedio, serie diaria y meta por equipo |
| Pruebas unitarias con cobertura ≥ 60 % de las reglas | `tests/`: 75 pruebas en Python y 6 en JavaScript; `app/reglas` tiene 100 % de cobertura |
| Patrón de diseño justificado | **Strategy** (reglas de puntos), **Observer** (eventos), **Adapter** (almacén en línea o solitario) |
| Consentimiento informado y datos anonimizados | Pantalla de consentimiento obligatoria; exportación CSV con códigos J01, J02… y sin texto libre |

## Dos modos

- **En línea** (el del piloto): servidor Flask + base de datos. Los reportes, puntos y eventos quedan en el servidor y el administrador ve los indicadores.
- **Solitario** (respaldo): si el servidor no responde, el juego funciona igual, pero guarda todo en el navegador (localStorage). No cuenta para el piloto. `npm run vista-previa` genera `dist/sprintquest_solitario.html`, un solo archivo que se abre sin servidor.

Para probar la escena a otra hora en modo solitario, agreguen `?simular=2026-11-10T16:20` a la URL.

## Ejecutar en su computador

Requisitos: Python 3.10 o superior.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

flask --app wsgi crear-admin --alias admin     # pide un PIN de 4 a 8 dígitos
# Si venían de la versión anterior, borren instance/sprintquest.db: la base de datos cambió.
flask --app wsgi run --debug                    # abre http://127.0.0.1:5000
```

Desde el panel del administrador (pestaña **Jugadores**) se crean los participantes con alias, perfil, equipo y PIN.

Datos de prueba (ficticios, quedan marcados como demo):

```bash
flask --app wsgi datos-demo --jugadores 12 --dias 7   # PIN de todos: 1234
flask --app wsgi borrar-demo                          # bórrenlos antes del piloto
```

## Pruebas

```bash
pytest --cov                 # Python: motor de reglas, servicio, API e indicadores
npm install && npm test      # JavaScript: el motor del modo solitario contra los mismos escenarios
```

Los dos motores (Python y JavaScript) se prueban contra `compartido/escenarios_reglas.json`, así que calculan exactamente lo mismo.

## Publicarlo en internet

### Opción A: PythonAnywhere (gratis, recomendada)

La base de datos SQLite se conserva entre reinicios, así que no necesitan otro servicio.

1. Creen una cuenta en pythonanywhere.com y suban el código (lo más fácil: `git clone` del repositorio desde una consola Bash de PythonAnywhere).
2. En la consola:
   ```bash
   cd sprintquest
   python3.10 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Pestaña **Web** → *Add a new web app* → *Manual configuration* → la misma versión de Python.
4. En *Virtualenv* pongan la ruta `/home/SU_USUARIO/sprintquest/.venv`.
5. Editen el archivo *WSGI configuration* y dejen solo esto:
   ```python
   import os, sys
   sys.path.insert(0, "/home/SU_USUARIO/sprintquest")
   os.environ["SECRET_KEY"] = "una-clave-larga-y-aleatoria"
   from wsgi import app as application
   ```
6. En *Static files* agreguen: URL `/static/` → carpeta `/home/SU_USUARIO/sprintquest/app/static`.
7. En la consola, creen el administrador: `flask --app wsgi crear-admin --alias admin`.
8. Botón **Reload**. El juego queda en `https://SU_USUARIO.pythonanywhere.com`.

### Opción B: Render + PostgreSQL

El disco de Render (plan gratis) se borra en cada reinicio, así que allí se necesita PostgreSQL (Neon, Supabase o la base de datos de Render).

1. Descomenten `psycopg[binary]` en `requirements.txt`.
2. Nuevo *Web Service* desde el repositorio. Build: `pip install -r requirements.txt`. Start: `gunicorn wsgi:app`.
3. Variables de entorno: `DATABASE_URL` (la de PostgreSQL) y `SECRET_KEY`.
4. En la *Shell* de Render: `flask --app wsgi crear-admin --alias admin`.

## Arquitectura

```
Navegador (Three.js + menús)                        Servidor (Flask)
┌──────────────────────────────┐                ┌───────────────────────────────┐
│ ui.js  menús, HUD, hojas     │                │ api.py      rutas REST        │
│ escena.js  meseta 3D         │   JSON/HTTP    │ servicios.py ServicioJuego    │
│ almacen-api.js ──────────────┼──────────────► │ reglas/     motor (Strategy)  │
│ almacen-local.js (solitario) │                │ eventos.py  bus (Observer)    │
│ reglas.js  motor en JS       │                │ modelos.py  SQLAlchemy        │
└──────────────────────────────┘                └──────────────┬────────────────┘
                                                               │
                                                     SQLite o PostgreSQL
```

- **Capas en el servidor:** rutas (`api.py`) → servicio (`servicios.py`) → reglas puras (`reglas/`) y modelos (`modelos.py`). Las reglas no dependen de Flask ni de la base de datos, por eso se prueban solas.
- **Reglas de construcción** (`app/reglas/construccion.py` y su copia en `reglas.js`): materiales, desbloqueos, celdas válidas y costos de mejora, probadas contra los mismos escenarios en Python y JavaScript.
- **Strategy:** cada regla de puntos es una clase (`ReglaBase`, `ReglaPuntualidad`, `ReglaEvidencia`, `ReglaTransparencia`, `ReglaRacha`). El `MotorReglas` las suma sin conocerlas; agregar una regla nueva no cambia el motor (hay una prueba que lo demuestra).
- **Observer:** el servicio publica eventos (`reporte_registrado`, `insignia_obtenida`…) en un `BusEventos`; un suscriptor los guarda en la tabla `eventos`. Los indicadores salen de ahí.
- **Adapter:** la interfaz habla con un "almacén" que tiene la misma forma en línea (`AlmacenApi`) y en solitario (`AlmacenLocal`).
- **Configuración compartida:** puntos, niveles, insignias y perfiles viven en `compartido/config_juego.json`, que leen el servidor y el navegador.

## Reglas del juego

| Regla | Puntos |
| --- | --- |
| Reporte del día (solo el primero de cada día) | +10 |
| A tiempo (antes de la hora límite, 17:30 por defecto) | +5 |
| Con evidencia (commit, PR, prueba, acta, ticket…) | +5 |
| Transparencia (contar un bloqueo) | +3 |
| Racha de días hábiles a tiempo | +2 por día desde el segundo, hasta +10 |

Niveles: Practicante (0), Junior (40), Semi-senior (100), Senior (180), Líder técnico (280), Arquitecto (400). Cada nivel ensancha la meseta.

## Construir la meseta

- Cada reporte da tantos **materiales** como puntos. Se empieza con 15.
- En **Construir** se elige un edificio y se toca un lugar libre de la meseta (`R` gira, `Esc` cancela).
- Tocando un edificio se puede **mejorar** (hasta nivel 3), **mover o girar**, o **demoler** (devuelve la mitad de lo invertido).
- Desbloqueos: guayacán y casa desde el inicio; plaza en nivel 2; molino en nivel 3; observatorio en nivel 4. Torre de código (commit o PR), laboratorio (prueba), archivo (documento), casa del cliente (acta), silo (ticket) y aula (capacitación) se desbloquean al reportar esa evidencia. Así cada perfil construye una meseta distinta.
- El servidor valida todo (materiales, lugar, desbloqueo) y registra cada construcción como evento.

## Indicadores (fórmulas)

- **Reportes a tiempo** = días-jugador hábiles con reporte antes del cierre ÷ (jugadores con consentimiento × días hábiles del periodo) × 100
- **Reportes con evidencia** = reportes válidos con evidencia ÷ reportes válidos × 100
- **Retraso promedio** = promedio de minutos después del cierre de los reportes tardíos
- **Participación diaria** = jugadores con reporte ese día ÷ jugadores × 100

Acuerden la hora límite y la meta con Tiresia antes del piloto y no las cambien mientras corre.

## Uso de inteligencia artificial

Parte de este código y de esta documentación se generó con ayuda de una herramienta de IA generativa (Claude). El enunciado exige declararlo en un anexo del informe y que cada integrante pueda explicar cualquier parte en la sustentación.
