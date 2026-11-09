import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import supabase
from app.routers.solicitudes import router as solicitudes_router

app = FastAPI(
    title="API 2 — Microservicio de Adopciones (Trámites)",
    version="1.0.0",
    description=(
        "Servicio responsable de la gestión de solicitudes de adopción, validaciones "
        "inter-servicio de disponibilidad y control de concurrencia. "
        "Se comunica exclusivamente vía HTTP/REST con el servicio de Mascotas."
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
        supabase.table("solicitudes").select("id").limit(1).execute()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    mascotas_target = os.getenv("MASCOTAS_API_URL") or os.getenv("API_MASCOTAS_URL") or "http://localhost:8001"

    return {
        "status": "healthy",
        "service": "api-adopciones",
        "port": int(os.getenv("PORT", 8002)),
        "version": "1.0.0",
        "database": db_status,
        "mascotas_api_target": mascotas_target
    }

# Incluir routers
app.include_router(solicitudes_router)

