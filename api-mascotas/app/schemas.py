from enum import Enum
from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class EstadoMascotaEnum(str, Enum):
    disponible = "disponible"
    en_proceso = "en_proceso"
    adoptada = "adoptada"

class SexoEnum(str, Enum):
    macho = "Macho"
    hembra = "Hembra"

class MascotaBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100, example="Luna")
    especie: str = Field(..., min_length=1, max_length=50, example="Perro")
    raza: str = Field(..., min_length=1, max_length=100, example="Criollo / Mestizo")
    edad: int = Field(..., ge=0, le=30, example=2)
    sexo: SexoEnum = Field(..., example=SexoEnum.hembra)
    descripcion: str = Field(..., min_length=5, example="Cariñosa, juguetona y sociable.")
    foto_url: Optional[str] = Field(None, example="https://images.unsplash.com/photo-1543466835-00a7907e9de1")

class MascotaCreate(MascotaBase):
    estado: Optional[EstadoMascotaEnum] = EstadoMascotaEnum.disponible

class MascotaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=100)
    especie: Optional[str] = Field(None, min_length=1, max_length=50)
    raza: Optional[str] = Field(None, min_length=1, max_length=100)
    edad: Optional[int] = Field(None, ge=0, le=30)
    sexo: Optional[SexoEnum] = None
    descripcion: Optional[str] = Field(None, min_length=5)
    foto_url: Optional[str] = None
    estado: Optional[EstadoMascotaEnum] = None

class MascotaEstadoUpdate(BaseModel):
    estado: EstadoMascotaEnum = Field(..., example=EstadoMascotaEnum.adoptada)

class MascotaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nombre: str
    especie: str
    raza: str
    edad: int
    sexo: str
    descripcion: str
    foto_url: Optional[str] = None
    estado: EstadoMascotaEnum
    created_at: Optional[datetime] = None

class MascotaDisponibilidadResponse(BaseModel):
    id: UUID
    nombre: str
    especie: str
    estado: str
    disponible: bool
    mensaje: str

