# ==============================================================================
# DOCKERFILE - SERVICIO API-ADOPCIONES (Puerto 8002)
# ==============================================================================
FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY . .

# Exponer puerto del microservicio
EXPOSE 8002

# Comando de ejecución (usa $PORT para compatibilidad con Render/Railway)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8002}

