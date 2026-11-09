import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import supabase
from app.routers.mascotas import router as mascotas_router

app = FastAPI(
    title="API 1 — Microservicio de Mascotas (Inventario)",
    version="1.0.0",
    description=(
        "Servicio responsable de la gestión, catálogo y control de estado del inventario "
        "de animales en la Fundación Huellas de Esperanza. Acceso exclusivo a la tabla 'mascotas' en Supabase."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configuración de CORS (orígenes desde variable de entorno)
cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
cors_origins = [o.strip() for o in cors_origins_raw.split(",")] if cors_origins_raw != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoint de Salud
@app.get("/health", tags=["Health"])
def health_check():
    """Verifica el estado operativo del servicio y la conectividad con Supabase."""
    try:
        supabase.table("mascotas").select("id").limit(1).execute()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "service": "api-mascotas",
        "port": int(os.getenv("PORT", 8001)),
        "version": "1.0.0",
        "database": db_status
    }

# Incluir routers por capas
app.include_router(mascotas_router)
