"""Punto de entrada para el servidor (PythonAnywhere, Render, gunicorn)."""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
