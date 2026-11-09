"""
================================================================================
 PRUEBAS DE INTEGRACIÓN — Plataforma de Adopción de Mascotas (SOA)
 
 Verifica la comunicación inter-servicio entre API Mascotas (8001)
 y API Adopciones (8002) usando peticiones HTTP reales.

 Configuración:
   MASCOTAS_URL   = URL de api-mascotas  (default: http://localhost:8001)
   ADOPCIONES_URL = URL de api-adopciones (default: http://localhost:8002)

 Ejecución:
   pytest test_integracion.py -v
================================================================================
"""
import os
import uuid
import pytest
import httpx

# ---------------------------------------------------------------------------
# CONFIGURACIÓN
# ---------------------------------------------------------------------------
MASCOTAS_URL   = os.getenv("MASCOTAS_URL",   "http://localhost:8001")
ADOPCIONES_URL = os.getenv("ADOPCIONES_URL", "http://localhost:8002")
TIMEOUT        = 15.0  # segundos

client = httpx.Client(timeout=TIMEOUT)

# ---------------------------------------------------------------------------
# UTILIDADES (crear/limpiar datos de prueba)
# ---------------------------------------------------------------------------
def crear_mascota_prueba(nombre="TestPet"):
    """Crea una mascota de prueba y retorna su dict completo."""
    payload = {
        "nombre": nombre,
        "especie": "Perro",
        "raza": "Test Breed",
        "edad": 2,
        "sexo": "Macho",
        "descripcion": "Mascota de prueba creada por test de integración.",
        "foto_url": "https://placehold.co/400x300/e5e7eb/9ca3af?text=Test"
    }
    r = client.post(f"{MASCOTAS_URL}/mascotas", json=payload)
    assert r.status_code == 201, f"No se pudo crear mascota de prueba: {r.text}"
    return r.json()


def crear_solicitud_prueba(mascota_id, nombre_sol="Test Solicitante"):
    """Crea una solicitud de prueba y retorna su dict completo."""
    payload = {
        "mascota_id": str(mascota_id),
        "nombre_solicitante": nombre_sol,
        "email": "test@integracion.com",
        "telefono": "+57 300 0000000",
        "motivo": "Solicitud creada automáticamente por test de integración."
    }
    r = client.post(f"{ADOPCIONES_URL}/solicitudes", json=payload)
    return r


def limpiar_solicitudes_mascota(mascota_id):
    """Elimina todas las solicitudes asociadas a una mascota (por filtro)."""
    r = client.get(f"{ADOPCIONES_URL}/solicitudes", params={"mascota_id": str(mascota_id)})
    if r.status_code == 200:
        for sol in r.json():
            # No hay DELETE endpoint, así que dejamos las rechazadas/aprobadas
            # y solo nos aseguramos de que la mascota vuelva a disponible
            pass


def resetear_mascota(mascota_id):
    """Devuelve la mascota a estado 'disponible'."""
    client.patch(
        f"{MASCOTAS_URL}/mascotas/{mascota_id}/estado",
        json={"estado": "disponible"}
    )


def eliminar_mascota_prueba(mascota_id):
    """Resetea la mascota a disponible (no hay DELETE endpoint)."""
    resetear_mascota(mascota_id)


# ---------------------------------------------------------------------------
# FIXTURES
# ---------------------------------------------------------------------------
@pytest.fixture
def mascota():
    """Crea una mascota de prueba y la limpia al terminar."""
    m = crear_mascota_prueba(f"TestPet-{uuid.uuid4().hex[:6]}")
    yield m
    resetear_mascota(m["id"])


@pytest.fixture
def mascota_adoptada():
    """Crea una mascota y la marca como adoptada."""
    m = crear_mascota_prueba(f"TestAdoptada-{uuid.uuid4().hex[:6]}")
    client.patch(
        f"{MASCOTAS_URL}/mascotas/{m['id']}/estado",
        json={"estado": "adoptada"}
    )
    yield m
    resetear_mascota(m["id"])


# ---------------------------------------------------------------------------
# HEALTH CHECKS
# ---------------------------------------------------------------------------
class TestHealthChecks:
    """Verifica que ambas APIs estén operativas."""

    def test_health_mascotas(self):
        r = client.get(f"{MASCOTAS_URL}/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        print(f"  API Mascotas: {data}")

    def test_health_adopciones(self):
        r = client.get(f"{ADOPCIONES_URL}/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        print(f"  API Adopciones: {data}")


# ---------------------------------------------------------------------------
# TEST 1: POST /solicitudes sobre mascota disponible → 201
# ---------------------------------------------------------------------------
class TestCrearSolicitud:
    
    def test_solicitud_mascota_disponible_201(self, mascota):
        """Crear solicitud sobre mascota disponible debe retornar 201."""
        r = crear_solicitud_prueba(mascota["id"])
        assert r.status_code == 201, f"Esperado 201, obtenido {r.status_code}: {r.text}"
        data = r.json()
        assert data["estado"] == "pendiente"
        assert data["mascota_id"] == mascota["id"]
        print(f"  Solicitud creada: {data['id']}")

    def test_solicitud_mascota_adoptada_409(self, mascota_adoptada):
        """Crear solicitud sobre mascota adoptada debe retornar 409."""
        r = crear_solicitud_prueba(mascota_adoptada["id"])
        assert r.status_code == 409, f"Esperado 409, obtenido {r.status_code}: {r.text}"
        print(f"  409 correcto: {r.json()['detail']}")

    def test_solicitud_mascota_inexistente_404(self):
        """Crear solicitud con UUID válido pero inexistente debe retornar 404."""
        fake_id = "00000000-0000-4000-a000-000000000000"
        r = crear_solicitud_prueba(fake_id)
        assert r.status_code == 404, f"Esperado 404, obtenido {r.status_code}: {r.text}"
        print(f"  404 correcto: {r.json()['detail']}")


# ---------------------------------------------------------------------------
# TEST 2: Flujo de aprobación completo
# ---------------------------------------------------------------------------
class TestAprobacion:

    def test_aprobar_solicitud_200_y_mascota_adoptada(self, mascota):
        """Aprobar solicitud → 200, mascota queda 'adoptada'."""
        # Crear solicitud
        r_sol = crear_solicitud_prueba(mascota["id"])
        assert r_sol.status_code == 201
        sol_id = r_sol.json()["id"]

        # Aprobar
        r_apro = client.patch(f"{ADOPCIONES_URL}/solicitudes/{sol_id}/aprobar")
        assert r_apro.status_code == 200, f"Esperado 200, obtenido {r_apro.status_code}: {r_apro.text}"
        data = r_apro.json()
        assert data["solicitud"]["estado"] == "aprobada"
        print(f"  Aprobada: {data['mensaje']}")

        # Verificar que la mascota quedó adoptada en api-mascotas
        r_pet = client.get(f"{MASCOTAS_URL}/mascotas/{mascota['id']}")
        assert r_pet.status_code == 200
        assert r_pet.json()["estado"] == "adoptada", \
            f"La mascota debería estar 'adoptada' pero está '{r_pet.json()['estado']}'"
        print(f"  Mascota verificada: estado={r_pet.json()['estado']}")

    def test_segunda_aprobacion_misma_mascota_409(self, mascota):
        """Aprobar segunda solicitud de la misma mascota → 409."""
        # Crear dos solicitudes
        r1 = crear_solicitud_prueba(mascota["id"], "Solicitante A")
        assert r1.status_code == 201
        sol1_id = r1.json()["id"]

        r2 = crear_solicitud_prueba(mascota["id"], "Solicitante B")
        assert r2.status_code == 201
        sol2_id = r2.json()["id"]

        # Aprobar la primera
        r_apro1 = client.patch(f"{ADOPCIONES_URL}/solicitudes/{sol1_id}/aprobar")
        assert r_apro1.status_code == 200
        print(f"  Primera aprobada OK")

        # Intentar aprobar la segunda → debe fallar
        r_apro2 = client.patch(f"{ADOPCIONES_URL}/solicitudes/{sol2_id}/aprobar")
        assert r_apro2.status_code == 409, \
            f"Esperado 409, obtenido {r_apro2.status_code}: {r_apro2.text}"
        print(f"  Segunda rechazada 409: {r_apro2.json()['detail']}")


# ---------------------------------------------------------------------------
# TEST 3: Rechazo de solicitud
# ---------------------------------------------------------------------------
class TestRechazo:

    def test_rechazar_pendiente_200(self, mascota):
        """Rechazar solicitud pendiente → 200."""
        r_sol = crear_solicitud_prueba(mascota["id"])
        assert r_sol.status_code == 201
        sol_id = r_sol.json()["id"]

        r_rech = client.patch(f"{ADOPCIONES_URL}/solicitudes/{sol_id}/rechazar")
        assert r_rech.status_code == 200, f"Esperado 200, obtenido {r_rech.status_code}: {r_rech.text}"
        assert r_rech.json()["solicitud"]["estado"] == "rechazada"
        print(f"  Rechazada OK: {r_rech.json()['mensaje']}")

    def test_rechazar_ya_rechazada_409(self, mascota):
        """Rechazar solicitud ya rechazada → 409."""
        r_sol = crear_solicitud_prueba(mascota["id"])
        assert r_sol.status_code == 201
        sol_id = r_sol.json()["id"]

        # Rechazar primera vez
        r1 = client.patch(f"{ADOPCIONES_URL}/solicitudes/{sol_id}/rechazar")
        assert r1.status_code == 200

        # Rechazar segunda vez → 409
        r2 = client.patch(f"{ADOPCIONES_URL}/solicitudes/{sol_id}/rechazar")
        assert r2.status_code == 409, f"Esperado 409, obtenido {r2.status_code}: {r2.text}"
        print(f"  Segunda vez 409: {r2.json()['detail']}")


# ---------------------------------------------------------------------------
# TEST 4: Idempotencia de PATCH /mascotas/{id}/estado
# ---------------------------------------------------------------------------
class TestIdempotencia:

    def test_mismo_estado_200(self, mascota):
        """PATCH con el mismo estado actual → 200 (idempotente, sin error)."""
        # La mascota ya está en 'disponible'
        r = client.patch(
            f"{MASCOTAS_URL}/mascotas/{mascota['id']}/estado",
            json={"estado": "disponible"}
        )
        assert r.status_code == 200, f"Esperado 200, obtenido {r.status_code}: {r.text}"
        assert r.json()["estado"] == "disponible"
        print(f"  Idempotente OK: estado sigue '{r.json()['estado']}'")

