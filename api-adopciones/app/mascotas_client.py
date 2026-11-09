import os
import logging
from uuid import UUID
from typing import Dict, Any
import httpx
from fastapi import HTTPException, status
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("api-adopciones.client")

# URL base de API-Mascotas
MASCOTAS_API_URL = (
    os.getenv("MASCOTAS_API_URL") or 
    os.getenv("API_MASCOTAS_URL") or 
    "http://localhost:8001"
).rstrip("/")

TIMEOUT_SECONDS = float(os.getenv("HTTP_TIMEOUT_SECONDS", "5.0"))

def _handle_connection_error(e: Exception, action_desc: str):
    """Convierte errores de conexión y timeout en un HTTP 503 claro y estandarizado."""
    logger.critical(f"[SOA ERROR 503] Fallo de comunicación con API-Mascotas ({MASCOTAS_API_URL}) durante '{action_desc}': {e}")
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            f"El servicio de Mascotas (API-Mascotas en {MASCOTAS_API_URL}) no está disponible "
            f"o excedió el tiempo límite de espera ({TIMEOUT_SECONDS}s). No se pudo completar: {action_desc}."
        )
    )

def obtener_mascota(mascota_id: UUID) -> Dict[str, Any]:
    """
    Consulta los detalles completos de una mascota en API-Mascotas.
    Manejo: 404 si no existe, 503 si hay timeout/caída.
    """
    url = f"{MASCOTAS_API_URL}/mascotas/{mascota_id}"
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.get(url)

        if resp.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"La mascota con ID '{mascota_id}' no existe en el inventario de API-Mascotas."
            )

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Error inesperado devuelto por API-Mascotas: {resp.text}"
            )

        return resp.json()

    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
        _handle_connection_error(e, f"obtener detalle de mascota {mascota_id}")

def consultar_disponibilidad(mascota_id: UUID) -> Dict[str, Any]:
    """
    Consulta la disponibilidad de una mascota en API-Mascotas.
    Manejo: 404 si no existe, 503 si hay timeout/caída.
    Retorna: {'id': ..., 'nombre': ..., 'estado': ..., 'disponible': bool, 'mensaje': ...}
    """
    url = f"{MASCOTAS_API_URL}/mascotas/{mascota_id}/disponibilidad"
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.get(url)

        if resp.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"La mascota con ID '{mascota_id}' no existe en el sistema."
            )

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Respuesta anómala de API-Mascotas ({resp.status_code}): {resp.text}"
            )

        return resp.json()

    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
        _handle_connection_error(e, f"consultar disponibilidad de mascota {mascota_id}")

def actualizar_estado(mascota_id: UUID, nuevo_estado: str) -> Dict[str, Any]:
    """
    Actualiza el estado de la mascota en API-Mascotas (ej: a 'adoptada').
    Manejo: 404 si no existe, 409 si hay conflicto, 503 si hay timeout o caída del servicio.
    """
    url = f"{MASCOTAS_API_URL}/mascotas/{mascota_id}/estado"
    payload = {"estado": nuevo_estado}
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.patch(url, json=payload)

        if resp.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mascota con ID '{mascota_id}' no encontrada en API-Mascotas."
            )

        if resp.status_code == 409:
            detail_msg = resp.json().get("detail", "Conflicto al actualizar estado de la mascota.")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Conflicto en API-Mascotas: {detail_msg}"
            )

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Error devuelto por API-Mascotas al actualizar estado: {resp.text}"
            )

        return resp.json()

    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
        _handle_connection_error(e, f"actualizar estado a '{nuevo_estado}' de mascota {mascota_id}")

