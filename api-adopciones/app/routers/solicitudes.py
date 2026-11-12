import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from postgrest.exceptions import APIError

from app.database import supabase
from app.schemas import (
    SolicitudCreate,
    SolicitudResponse,
    SolicitudAccionResponse,
    EstadoSolicitudEnum
)
from app.mascotas_client import (
    consultar_disponibilidad,
    obtener_mascota,
    actualizar_estado
)

logger = logging.getLogger("api-adopciones.router")

router = APIRouter(prefix="/solicitudes", tags=["Solicitudes de Adopción"])

# ==============================================================================
# 1. CREACIÓN DE SOLICITUD (INTEGRACIÓN HTTP + VALIDACIÓN DISPONIBILIDAD)
# ==============================================================================
@router.post(
    "",
    response_model=SolicitudResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear solicitud de adopción",
    description=(
        "Valida el body, consulta vía HTTP la disponibilidad en api-mascotas y, "
        "si está disponible, registra la solicitud en estado 'pendiente'."
    ),
    responses={
        404: {"description": "La mascota indicada no existe en api-mascotas."},
        409: {"description": "La mascota no está disponible para adopción."},
        503: {"description": "Fallo de conexión o timeout con api-mascotas."}
    }
)
def crear_solicitud(payload: SolicitudCreate):
    # Paso 1: Consultar disponibilidad en api-mascotas (Lanza 404 o 503 si falla)
    disp = consultar_disponibilidad(payload.mascota_id)

    # Paso 2: Si no está disponible, responder 409
    if not disp.get("disponible", False):
        estado_actual = disp.get("estado", "no disponible")
        nombre_pet = disp.get("nombre", "solicitada")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La mascota '{nombre_pet}' no está disponible (Estado actual: '{estado_actual}')."
        )

    # Paso 3: Registrar la solicitud en Supabase en estado 'pendiente'
    data_insert = {
        "mascota_id": str(payload.mascota_id),
        "nombre_solicitante": payload.nombre_solicitante.strip(),
        "email": payload.email.strip().lower(),
        "telefono": payload.telefono.strip(),
        "motivo": payload.motivo.strip(),
        "estado": EstadoSolicitudEnum.pendiente.value
    }

    try:
        res = supabase.table("solicitudes").insert(data_insert).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo registrar la solicitud en la base de datos."
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error guardando solicitud en Supabase: {str(e)}"
        )

# ==============================================================================
# 2. LISTADO Y DETALLE DE SOLICITUDES
# ==============================================================================
@router.get(
    "",
    response_model=List[SolicitudResponse],
    summary="Listar solicitudes de adopción",
    description="Retorna todas las solicitudes registradas con filtros opcionales por estado, mascota_id y email."
)
def listar_solicitudes(
    estado: Optional[EstadoSolicitudEnum] = Query(None, description="Filtrar por estado: pendiente, aprobada, rechazada"),
    mascota_id: Optional[UUID] = Query(None, description="Filtrar por ID de la mascota"),
    email: Optional[str] = Query(None, description="Filtrar por email del solicitante")
):
    try:
        query = supabase.table("solicitudes").select("*")
        if estado:
            query = query.eq("estado", estado.value)
        if mascota_id:
            query = query.eq("mascota_id", str(mascota_id))
        if email:
            query = query.ilike("email", email.strip().lower())

        res = query.order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error consultando solicitudes en Supabase: {str(e)}"
        )

@router.get(
    "/consultar/{criterio}",
    response_model=List[SolicitudResponse],
    summary="Consultar solicitudes por correo o por ID para adoptantes",
    description="Permite al adoptante consultar el estado de sus solicitudes ingresando su correo o UUID de radicado."
)
def consultar_solicitudes_adoptante(criterio: str):
    criterio_limpio = criterio.strip()
    try:
        # 1. Si es UUID válido, buscar por ID de solicitud
        try:
            val_uuid = str(UUID(criterio_limpio))
            res_id = supabase.table("solicitudes").select("*").eq("id", val_uuid).execute()
            if res_id.data:
                return res_id.data
        except ValueError:
            pass

        # 2. Si no es UUID o no se encontró por ID, buscar por correo (case-insensitive)
        res_email = (
            supabase.table("solicitudes")
            .select("*")
            .ilike("email", criterio_limpio.lower())
            .order("created_at", desc=True)
            .execute()
        )
        return res_email.data or []
    except Exception as e:
        logger.error(f"Error consultando solicitudes del adoptante: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error consultando solicitudes del adoptante: {str(e)}"
        )

@router.get(
    "/{solicitud_id}",
    response_model=SolicitudResponse,
    summary="Obtener detalle de solicitud",
    responses={404: {"description": "Solicitud no encontrada."}}
)
def obtener_solicitud(solicitud_id: UUID):
    try:
        res = supabase.table("solicitudes").select("*").eq("id", str(solicitud_id)).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"La solicitud con ID '{solicitud_id}' no existe."
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error consultando solicitud: {str(e)}"
        )

# ==============================================================================
# 3. APROBACIÓN DE SOLICITUD (TRANSACCIÓN COMPENSATORIA & CONCURRENCIA)
# ==============================================================================
@router.patch(
    "/{solicitud_id}/aprobar",
    response_model=SolicitudAccionResponse,
    summary="Aprobar solicitud de adopción",
    description=(
        "Flujo crítico SOA:\n"
        "1. Verifica que la solicitud esté 'pendiente' (si no, 409).\n"
        "2. Consulta vía HTTP que la mascota esté 'disponible' o 'en_proceso' (si no, 409).\n"
        "3. Marca la solicitud como 'aprobada' (el índice único de BD previene duplicados con 409).\n"
        "4. Llama a PATCH /mascotas/{id}/estado con 'adoptada'.\n"
        "5. Si el paso 4 falla, revierte la solicitud a 'pendiente' y responde 503.\n"
        "6. Rechaza automáticamente las demás solicitudes pendientes para esa mascota."
    ),
    responses={
        404: {"description": "Solicitud o mascota no encontrada."},
        409: {"description": "Conflicto de estado o mascota ya aprobada (índice único)."},
        503: {"description": "Fallo en API-Mascotas; operación compensada y revertida a 'pendiente'."}
    }
)
def aprobar_solicitud(solicitud_id: UUID):
    # 1. Obtener la solicitud local
    res_sol = supabase.table("solicitudes").select("*").eq("id", str(solicitud_id)).execute()
    if not res_sol.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Solicitud con ID '{solicitud_id}' no encontrada."
        )

    solicitud = res_sol.data[0]
    mascota_id_str = solicitud["mascota_id"]
    mascota_uuid = UUID(mascota_id_str)

    # 1. La solicitud debe estar 'pendiente' (si no, 409)
    if solicitud["estado"] != EstadoSolicitudEnum.pendiente.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La solicitud #{solicitud_id} no está en estado 'pendiente' (Estado actual: '{solicitud['estado']}')."
        )

    # 2. Consulta la mascota por HTTP; debe estar 'disponible' o 'en_proceso'
    pet = obtener_mascota(mascota_uuid)
    if pet.get("estado") not in ["disponible", "en_proceso"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La mascota '{pet.get('nombre')}' ya no está disponible (Estado en inventario: '{pet.get('estado')}')."
        )

    # 3. Marca la solicitud como 'aprobada'. Si el índice único lo rechaza (23505), responde 409
    try:
        res_aprob = supabase.table("solicitudes").update(
            {"estado": EstadoSolicitudEnum.aprobada.value}
        ).eq("id", str(solicitud_id)).execute()

        if not res_aprob.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo actualizar el estado de la solicitud en la base de datos."
            )
    except APIError as db_err:
        # Validación precisa: solo el código 23505 de PostgreSQL es violación de unicidad
        if getattr(db_err, "code", None) == "23505":
            logger.warning(f"Violación de índice único al aprobar solicitud {solicitud_id}: {db_err}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Conflicto de concurrencia: Ya existe una solicitud aprobada para la mascota ID '{mascota_id_str}'."
            )
        # Cualquier otro error de base de datos se registra y responde 500
        logger.error(f"Error de base de datos (PostgREST APIError {getattr(db_err, 'code', 'desconocido')}): {db_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno de base de datos al procesar la aprobación."
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inesperado al marcar solicitud como aprobada: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error inesperado del servidor al procesar la aprobación."
        )

    # 4. Llama a PATCH /mascotas/{id}/estado con 'adoptada'
    try:
        mascota_actualizada = actualizar_estado(mascota_uuid, "adoptada")
    except Exception as err_api:
        # 5. SI EL PASO 4 FALLA: Revertir la solicitud a 'pendiente' y responder 503 (Transacción Compensatoria Saga)
        logger.critical(f"Fallo en API-Mascotas tras aprobar solicitud {solicitud_id}. Revertiendo a 'pendiente': {err_api}")
        try:
            supabase.table("solicitudes").update(
                {"estado": EstadoSolicitudEnum.pendiente.value}
            ).eq("id", str(solicitud_id)).execute()
        except Exception as rev_err:
            logger.error(f"Error crítico durante compensación de estado: {rev_err}")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Fallo en la comunicación con API-Mascotas al registrar la adopción. "
                "La solicitud ha sido revertida a estado 'pendiente' para mantener la consistencia."
            )
        )

    # 6. Rechazar automáticamente las demás solicitudes pendientes de esa mascota
    try:
        supabase.table("solicitudes").update(
            {"estado": EstadoSolicitudEnum.rechazada.value}
        ).eq("mascota_id", mascota_id_str).eq("estado", EstadoSolicitudEnum.pendiente.value).neq("id", str(solicitud_id)).execute()
        logger.info(f"Otras solicitudes pendientes de la mascota {mascota_id_str} rechazadas automáticamente.")
    except Exception as e:
        logger.warning(f"Aviso: No se pudieron descartar solicitudes concurrentes: {e}")

    # Retornar respuesta enriquecida
    solicitud_actualizada = res_aprob.data[0]
    return {
        "mensaje": f"¡Solicitud #{solicitud_id} APROBADA exitosamente! Mascota '{mascota_actualizada.get('nombre')}' marcada como adoptada.",
        "solicitud": solicitud_actualizada,
        "mascota_actualizada": mascota_actualizada
    }

# ==============================================================================
# 4. RECHAZO DE SOLICITUD
# ==============================================================================
@router.patch(
    "/{solicitud_id}/rechazar",
    response_model=SolicitudAccionResponse,
    summary="Rechazar solicitud de adopción",
    description="Solo se permite rechazar si la solicitud se encuentra en estado 'pendiente'.",
    responses={
        404: {"description": "Solicitud no encontrada."},
        409: {"description": "La solicitud no se encuentra en estado 'pendiente'."}
    }
)
def rechazar_solicitud(solicitud_id: UUID):
    res_sol = supabase.table("solicitudes").select("*").eq("id", str(solicitud_id)).execute()
    if not res_sol.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Solicitud con ID '{solicitud_id}' no encontrada."
        )

    solicitud = res_sol.data[0]
    if solicitud["estado"] != EstadoSolicitudEnum.pendiente.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede rechazar la solicitud #{solicitud_id} porque su estado actual es '{solicitud['estado']}' (solo se pueden rechazar solicitudes 'pendiente')."
        )

    res_upd = supabase.table("solicitudes").update(
        {"estado": EstadoSolicitudEnum.rechazada.value}
    ).eq("id", str(solicitud_id)).execute()

    return {
        "mensaje": f"La solicitud #{solicitud_id} ha sido rechazada.",
        "solicitud": res_upd.data[0],
        "mascota_actualizada": None
    }

