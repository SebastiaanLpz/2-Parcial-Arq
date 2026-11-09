from enum import Enum
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class EstadoSolicitudEnum(str, Enum):
    pendiente = "pendiente"
    aprobada = "aprobada"
    rechazada = "rechazada"

class SolicitudCreate(BaseModel):
    mascota_id: UUID = Field(..., example="a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d", description="UUID de la mascota a adoptar")
    nombre_solicitante: str = Field(..., min_length=2, max_length=150, example="Carlos Mendoza")
    email: str = Field(..., min_length=5, max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", example="carlos.mendoza@email.com")
    telefono: str = Field(..., min_length=5, max_length=50, example="+57 300 1234567")
    motivo: str = Field(..., min_length=5, example="Cuento con espacio, tiempo y amor para brindarle un hogar responsable.")

class SolicitudResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mascota_id: UUID
    nombre_solicitante: str
    email: str
    telefono: str
    motivo: str
    estado: EstadoSolicitudEnum
    created_at: Optional[datetime] = None

class SolicitudAccionResponse(BaseModel):
    mensaje: str
    solicitud: SolicitudResponse
    mascota_actualizada: Optional[Dict[str, Any]] = None
