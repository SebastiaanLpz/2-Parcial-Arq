from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query, status

from app.database import supabase
from app.schemas import (
    MascotaCreate,
    MascotaUpdate,
    MascotaEstadoUpdate,
    MascotaResponse,
    MascotaDisponibilidadResponse,
    EstadoMascotaEnum
)

router = APIRouter(prefix="/mascotas", tags=["Mascotas"])

@router.get("", response_model=List[MascotaResponse])
def listar_mascotas(
    especie: Optional[str] = Query(None, description="Filtrar por especie (ej: Perro, Gato, Conejo)"),
    estado: Optional[EstadoMascotaEnum] = Query(None, description="Filtrar por estado (disponible, en_proceso, adoptada)"),
    nombre: Optional[str] = Query(None, description="Filtrar por nombre de la mascota")
):
    """Lista las mascotas del inventario con filtros opcionales."""
    try:
        query = supabase.table("mascotas").select("*")
        if especie:
            query = query.ilike("especie", f"%{especie.strip()}%")
        if estado:
            query = query.eq("estado", estado.value)
        if nombre:
            query = query.ilike("nombre", f"%{nombre.strip()}%")

        res = query.order("created_at", desc=False).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error consultando inventario en Supabase: {str(e)}"
        )

@router.get("/{mascota_id}", response_model=MascotaResponse)
def obtener_mascota(mascota_id: UUID):
    """Obtiene el detalle completo de una mascota por su identificador UUID."""
    try:
        res = supabase.table("mascotas").select("*").eq("id", str(mascota_id)).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mascota con ID '{mascota_id}' no fue encontrada."
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error consultando mascota: {str(e)}"
        )

@router.post("", response_model=MascotaResponse, status_code=status.HTTP_201_CREATED)
def crear_mascota(datos: MascotaCreate):
    """Registra una nueva mascota en el inventario."""
    try:
        payload = datos.model_dump()
        payload["estado"] = datos.estado.value if datos.estado else EstadoMascotaEnum.disponible.value
        payload["sexo"] = datos.sexo.value

        res = supabase.table("mascotas").insert(payload).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo registrar la mascota en la base de datos."
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error insertando mascota en Supabase: {str(e)}"
        )

@router.put("/{mascota_id}", response_model=MascotaResponse)
def actualizar_mascota(mascota_id: UUID, datos: MascotaUpdate):
    """Actualiza los datos informativos de una mascota."""
    try:
        payload = datos.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se enviaron campos para actualizar."
            )

        if "estado" in payload and payload["estado"]:
            payload["estado"] = payload["estado"].value
        if "sexo" in payload and payload["sexo"]:
            payload["sexo"] = payload["sexo"].value

        res = supabase.table("mascotas").update(payload).eq("id", str(mascota_id)).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mascota con ID '{mascota_id}' no encontrada para actualizar."
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error actualizando mascota: {str(e)}"
        )

@router.get("/{mascota_id}/disponibilidad", response_model=MascotaDisponibilidadResponse, tags=["Integración SOA"])
def consultar_disponibilidad(mascota_id: UUID):
    """
    ENDPOINT DE CONSULTA RÁPIDA DE DISPONIBILIDAD:
    Consumido por el microservicio de adopciones para verificar en tiempo real si una
    mascota existe y está disponible para iniciar un trámite de adopción.
    """
    try:
        res = supabase.table("mascotas").select("id, nombre, especie, estado").eq("id", str(mascota_id)).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mascota con ID '{mascota_id}' no existe en el inventario."
            )

        item = res.data[0]
        estado_actual = item.get("estado", "")
        esta_disponible = (estado_actual == EstadoMascotaEnum.disponible.value)

        mensaje = (
            f"La mascota '{item.get('nombre')}' está disponible para adopción."
            if esta_disponible
            else f"La mascota '{item.get('nombre')}' no está disponible. Estado actual: '{estado_actual}'."
        )

        return {
            "id": item["id"],
            "nombre": item["nombre"],
            "especie": item["especie"],
            "estado": estado_actual,
            "disponible": esta_disponible,
            "mensaje": mensaje
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error verificando disponibilidad: {str(e)}"
        )

@router.patch("/{mascota_id}/estado", response_model=MascotaResponse, tags=["Integración SOA"])
def actualizar_estado(mascota_id: UUID, payload: MascotaEstadoUpdate):
    """
    ENDPOINT DE ACTUALIZACIÓN DE ESTADO (Idempotente):
    Permite al microservicio de adopciones cambiar el estado de una mascota.
    - Idempotencia: Si el nuevo estado es idéntico al actual, responde 200 sin error (ideal para reintentos de red).
    - Conflicto: Si la mascota ya estaba adoptada y se pretende cambiar a otro estado, devuelve 409 Conflict.
    """
    try:
        # 1. Comprobar existencia y estado previo
        res_prev = supabase.table("mascotas").select("*").eq("id", str(mascota_id)).execute()
        if not res_prev.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mascota con ID '{mascota_id}' no encontrada en inventario."
            )

        mascota_actual = res_prev.data[0]
        estado_anterior = mascota_actual["estado"]
        nuevo_estado = payload.estado.value

        # REGLA 1: IDEMPOTENCIA
        # Si el estado nuevo es exactamente el mismo que ya tiene, responder 200 OK inmediatamente
        if estado_anterior == nuevo_estado:
            return mascota_actual

        # REGLA 2: Si ya estaba adoptada y se pretende revertir o cambiar a otro estado sin trámite especial
        if estado_anterior == EstadoMascotaEnum.adoptada.value and nuevo_estado != EstadoMascotaEnum.adoptada.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Conflicto: La mascota '{mascota_actual['nombre']}' ya fue adoptada "
                    f"y no puede ser cambiada al estado '{nuevo_estado}'."
                )
            )

        # 2. Persistir nuevo estado en Supabase
        res_upd = supabase.table("mascotas").update({"estado": nuevo_estado}).eq("id", str(mascota_id)).execute()
        if not res_upd.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Fallo al persistir el nuevo estado en la base de datos."
            )

        return res_upd.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en actualización de estado: {str(e)}"
        )

