# 🎓 Guía Rápida de Sustentación — 2° Parcial Arquitectura de Software
> **Fundación Huellas de Esperanza — Plataforma SOA de Adopción de Mascotas**  
> *Ten este documento abierto durante tu sustentación para responder y hacer demostraciones con total seguridad.*

---

## 🌐 Enlaces Clave en Vivo (Para tener abiertos en pestañas)

| Recurso | Enlace en Producción (Render) | Enlace en Local |
|---|---|---|
| 🌐 **Frontend Web** | [huellas-de-esperanza-jytk.onrender.com](https://huellas-de-esperanza-jytk.onrender.com) | `http://localhost:5500` |
| 🐶 **API Mascotas (Swagger)** | [api-mascotas-d63k.onrender.com/docs](https://api-mascotas-d63k.onrender.com/docs) | `http://localhost:8001/docs` |
| 📋 **API Adopciones (Swagger)** | [api-adopciones-ldy0.onrender.com/docs](https://api-adopciones-ldy0.onrender.com/docs) | `http://localhost:8002/docs` |
| 🐙 **Repositorio GitHub** | [github.com/SebastiaanLpz/2-Parcial-Arq](https://github.com/SebastiaanLpz/2-Parcial-Arq) | — |

---

## ⏱️ Estructura Cronometrada de la Presentación (Máximo 7 minutos)

```
0:00 ── 1:00  Contexto de Negocio y Problema Resuelto
1:00 ── 2:30  Arquitectura SOA y Desacoplamiento (Sin FK)
2:30 ── 5:00  Demostración Práctica en Vivo (Flujo completo)
5:00 ── 6:30  Decisiones de Resiliencia (Compensación 503 + Índice 409)
6:30 ── 7:00  Conclusión y Ronda de Preguntas
```

---

## 🧪 Cómo Probarle al Profesor que Están las 2 APIs y Funcionan

### Método 1: Demostración en Swagger (La más clara y técnica)
Ten abiertas dos pestañas con los Swagger:
- **Pestaña 1**: `https://api-mascotas-d63k.onrender.com/docs`
- **Pestaña 2**: `https://api-adopciones-ldy0.onrender.com/docs`

#### Secuencia de prueba:
1. **Mostrar independencia**:
   - Señala que cada API tiene su propio título, versión y puerto/URL distinta.
2. **Listar mascotas (API Mascotas)**:
   - Despliega `GET /mascotas` > **Try it out** > **Execute**.
   - Muestra la lista y copia el `id` de **Milo** (`b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e`).
3. **Crear solicitud (API Adopciones validando vía HTTP)**:
   - Ve a **API Adopciones**, abre `POST /solicitudes` > **Try it out**.
   - Pega el `id` de Milo en `mascota_id` y pon datos de prueba:
     ```json
     {
       "mascota_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
       "nombre_solicitante": "Carlos Mendoza",
       "email": "carlos@ejemplo.com",
       "telefono": "+57 300 1234567",
       "motivo": "Casa amplia con jardín para darle cariño."
     }
     ```
   - Dale a **Execute** > responde **`201 Created`**.
   - Diles: *"API Adopciones llamó internamente a `GET /mascotas/{id}/disponibilidad` por HTTP para verificar que Milo existe y está disponible antes de guardar la solicitud."*
   - Copia el `id` de la solicitud que devolvió el JSON.
4. **Aprobar solicitud (Flujo SOA Inter-servicio)**:
   - En **API Adopciones**, abre `PATCH /solicitudes/{id}/aprobar` > pega el `id` de la solicitud > **Execute**.
   - Responde **`200 OK`**.
   - Vuelve a la pestaña de **API Mascotas**, ejecuta `GET /mascotas/{id}` de Milo:
   - **¡Milo ahora aparece con `"estado": "adoptada"`!**
   - Diles: *"API Adopciones le ordenó a API Mascotas por HTTP cambiar el estado, sin tocar su tabla en base de datos."*
5. **Demostrar prevención de doble adopción (409 Conflict)**:
   - En **API Adopciones**, dale clic de nuevo a **Execute** en `PATCH /solicitudes/{id}/aprobar`:
   - Responde **`409 Conflict`** con el detalle: *"Ya existe una solicitud aprobada para esta mascota"*.
   - Explica: *"El índice único parcial de PostgreSQL bloquea la duplicidad (`error 23505`) y la API lo transforma en un 409 limpio."*

---

### Método 2: Demostración en el Frontend Web + DevTools

1. Abre la aplicación: [`https://huellas-de-esperanza-jytk.onrender.com`](https://huellas-de-esperanza-jytk.onrender.com).
2. Presiona `F12` y ve a la pestaña **Network (Red)**, filtrando por **Fetch/XHR**.
3. Recarga con `Ctrl + F5`:
   - Muéstrale que el navegador consume dos dominios de API distintos:
     - `https://api-mascotas-d63k.onrender.com/mascotas`
     - `https://api-adopciones-ldy0.onrender.com/health`
4. Muestra los indicadores en la barra superior:
   - Las pastillas **Mascotas** y **Adopciones** están ambas con puntos verdes (`ok`), comprobando la salud independiente de cada microservicio en tiempo real.

---

### Método 3: Demostración en el Código Fuente

Si el profesor pide ver el código en el editor (VS Code) o en GitHub:

| Concepto a demostrar | Archivo a abrir | Líneas / Código clave a mostrar |
|---|---|---|
| **Aislamiento de Monorepo** | Raíz del proyecto | Carpetas `api-mascotas/` y `api-adopciones/` con sus propios `main.py` y `.env` |
| **Cliente HTTP entre servicios** | `api-adopciones/app/mascotas_client.py` | Clase `MascotasClient` usando `httpx.AsyncClient` |
| **Transacción Compensatoria (Saga)** | `api-adopciones/app/routers/solicitudes.py` | Bloque `try...except` en `/aprobar`: si `api-mascotas` falla, revierte la solicitud a `pendiente` y lanza `HTTP 503` |
| **Sin Foreign Key cruzada** | `docs/schema.sql` | `solicitudes.mascota_id UUID NOT NULL` (sin cláusula `REFERENCES`) |
| **Índice Único Parcial** | `docs/schema.sql` | `CREATE UNIQUE INDEX uq_solicitudes_aprobadas_por_mascota ON solicitudes(mascota_id) WHERE estado = 'aprobada';` |

---

### Método 4: Ejecución de Tests Automatizados en Vivo

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
pytest tests/test_integracion.py -v
```

Verás cómo pasan **10 de 10 pruebas automatizadas** en segundos:
- `test_01_listar_mascotas`
- `test_02_crear_y_obtener_mascota`
- `test_03_crear_solicitud_valida`
- `test_04_rechazar_solicitud_mascota_inexistente`
- `test_05_flujo_completo_aprobacion_soa`
- `test_06_prevenir_doble_adopcion_409`
- `test_07_compensacion_falla_mascotas_503`

*(También puedes mostrar el archivo [`docs/evidencias/resultado_pruebas_produccion.txt`](evidencias/resultado_pruebas_produccion.txt) que demuestra que las 10 pruebas pasaron contra Render en la nube).*

---

## 🛡️ Banco de Respuestas Rápidas para el Docente

#### P1: "¿Por qué no usaron una Foreign Key en la base de datos?"
> **Respuesta:** *"Porque en una Arquitectura Orientada a Servicios (SOA), cada microservicio debe tener **Database per Service** (dueño exclusivo de su esquema). Una foreign key crearía un acoplamiento físico en la base de datos que impediría separar las bases de datos en servidores distintos en el futuro. Por eso la validación de existencia se realiza vía HTTP en tiempo de ejecución."*

#### P2: "¿Cómo evitan que dos personas adopten la misma mascota al mismo tiempo?"
> **Respuesta:** *"Lo garantizamos en dos niveles:  
> 1. A nivel lógico, la API valida que la mascota esté disponible.  
> 2. A nivel de concurrencia en base de datos, tenemos un **índice único parcial en PostgreSQL**: `CREATE UNIQUE INDEX ... ON solicitudes (mascota_id) WHERE estado = 'aprobada'`. Si ocurren dos transacciones simultáneas, la base de datos rechaza la segunda con error `23505 (Unique Violation)` y la API responde un `409 Conflict`."*

#### P3: "¿Qué sucede si la API de adopciones aprueba pero la de mascotas no responde?"
> **Respuesta:** *"Implementamos una **transacción compensatoria**: si la llamada HTTP a `api-mascotas` genera timeout o error, `api-adopciones` captura la excepción, revierte la solicitud de vuelta a estado `'pendiente'` en la base de datos y responde al usuario con un `HTTP 503 Service Unavailable`, evitando estados huérfanos."*

#### P4: "¿Por qué usaron Vanilla JS en lugar de React/Angular?"
> **Respuesta:** *"Para evitar sobrecarga de dependencias (node_modules), garantizar carga instantánea como Single Page Application (SPA), tener control estricto sobre la prevención de XSS con sanitización nativa y desplegarlo limpiamente como Static Site en Render sin requerir un build de Node en el servidor."*
