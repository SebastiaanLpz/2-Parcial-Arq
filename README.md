# 🐾 Fundación Huellas de Esperanza — Plataforma de Adopción de Mascotas

> **Arquitectura Orientada a Servicios (SOA)** — 2° Parcial, Arquitectura de Software

Plataforma web que gestiona el catálogo de mascotas rescatadas y el trámite de solicitudes de adopción, implementada como **dos microservicios independientes** que se comunican exclusivamente por HTTP/REST + JSON.

---

## 📐 Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend (HTML + Tailwind + JS)                  │
│                         Puerto 5500                                 │
└──────────┬────────────────────────────────┬─────────────────────────┘
           │ HTTP/REST + JSON               │ HTTP/REST + JSON
           ▼                                ▼
┌─────────────────────┐          ┌─────────────────────────┐
│  API Mascotas       │◄─────────│  API Adopciones          │
│  Puerto 8001        │  httpx   │  Puerto 8002             │
│  Tabla: mascotas    │  (HTTP)  │  Tabla: solicitudes      │
└────────┬────────────┘          └────────┬────────────────┘
         │ supabase-py                     │ supabase-py
         ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL en la nube)                       │
│         mascotas  │  solicitudes  (SIN foreign key cruzada)        │
└─────────────────────────────────────────────────────────────────────┘
```

> Para diagramas Mermaid detallados (componentes, secuencia de aprobación, ER): ver [`docs/arquitectura.md`](docs/arquitectura.md).

---

## 🏗️ Estructura del Monorepo

```
2 Parcial Arquitectura/
├── api-mascotas/          ← Microservicio 1 (FastAPI, puerto 8001)
│   ├── app/
│   │   ├── database.py        Conexión a Supabase
│   │   ├── schemas.py         Modelos Pydantic v2
│   │   └── routers/
│   │       └── mascotas.py    Endpoints CRUD + SOA
│   ├── main.py                App FastAPI + CORS + /health
│   ├── run.py                 Script de desarrollo
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env                   Variables reales (NO se sube a Git)
│   └── .env.example           Plantilla de variables
│
├── api-adopciones/        ← Microservicio 2 (FastAPI, puerto 8002)
│   ├── app/
│   │   ├── database.py        Conexión a Supabase
│   │   ├── schemas.py         Modelos Pydantic v2
│   │   ├── mascotas_client.py Cliente HTTP hacia api-mascotas (httpx)
│   │   └── routers/
│   │       └── solicitudes.py Endpoints + lógica de aprobación
│   ├── main.py                App FastAPI + CORS + /health
│   ├── run.py                 Script de desarrollo
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env
│   └── .env.example
│
├── frontend/              ← SPA (HTML + Tailwind CDN + JS Vanilla)
│   ├── index.html             Estructura completa (catálogo + admin)
│   ├── config.js              URLs de las APIs (único archivo a cambiar)
│   ├── app.js                 Lógica: fetch, DOM, estado, toasts
│   └── styles.css             Animaciones, badges, responsive
│
├── tests/                 ← Pruebas de integración
│   ├── test_integracion.py    pytest + httpx (7 casos)
│   └── requirements.txt
│
├── docs/                  ← Documentación
│   ├── schema.sql             DDL de las tablas + datos semilla
│   ├── arquitectura.md        Diagramas Mermaid (componentes, secuencia, ER)
│   ├── guia_sustentacion.md   Guion y métodos de prueba para la sustentación
│   └── evidencias/            Capturas del flujo completo (01 a 11)
│       ├── 01_catalogo.png
│       ├── 02_detalle_milo.png
│       ├── ...
│       └── resultado_pruebas_local.txt
│
├── .gitignore
└── README.md              ← Este archivo
```

---

## 🔧 Responsabilidades de Cada Servicio

### API Mascotas (Puerto 8001)
- **Dueña exclusiva** de la tabla `mascotas` en Supabase.
- CRUD completo del inventario de animales rescatados.
- Endpoint `/mascotas/{id}/disponibilidad` para consulta rápida inter-servicio.
- Endpoint `/mascotas/{id}/estado` para actualización de estado (idempotente).

### API Adopciones (Puerto 8002)
- **Dueña exclusiva** de la tabla `solicitudes` en Supabase.
- Gestión de solicitudes de adopción (crear, listar, aprobar, rechazar).
- **Nunca accede a la tabla `mascotas`** directamente.
- Se comunica con API Mascotas vía HTTP (httpx, timeout 5s).
- Implementa **transacción compensatoria (Saga)** en la aprobación.

### Frontend (Puerto 5500)
- SPA con HTML + Tailwind CSS (CDN, sin build) + JavaScript Vanilla.
- Consume ambas APIs por fetch.
- Catálogo con filtros + modal de detalle + formulario de solicitud.
- Panel de administración con aprobación/rechazo.
- Indicadores de salud de las APIs en tiempo real.
- Protección XSS: `escaparHTML()` en todos los datos de API insertados con innerHTML.

---

## 📊 Modelo de Datos

### Tabla `mascotas`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `nombre` | VARCHAR | Nombre del animal |
| `especie` | VARCHAR | Perro, Gato, Conejo |
| `raza` | VARCHAR | Raza o mezcla |
| `edad` | INT | Edad en años |
| `sexo` | VARCHAR | Macho / Hembra |
| `descripcion` | TEXT | Descripción del carácter |
| `foto_url` | VARCHAR | URL pública de foto |
| `estado` | VARCHAR | CHECK: `disponible`, `en_proceso`, `adoptada` |
| `created_at` | TIMESTAMPTZ | `DEFAULT now()` |

### Tabla `solicitudes`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `mascota_id` | UUID | Referencia lógica (**SIN foreign key**) |
| `nombre_solicitante` | VARCHAR | Nombre completo |
| `email` | VARCHAR | Correo de contacto |
| `telefono` | VARCHAR | Teléfono de contacto |
| `motivo` | TEXT | Motivación de la adopción |
| `estado` | VARCHAR | CHECK: `pendiente`, `aprobada`, `rechazada` |
| `created_at` | TIMESTAMPTZ | `DEFAULT now()` |

### Índice único parcial
```sql
CREATE UNIQUE INDEX una_aprobada_por_mascota
ON solicitudes (mascota_id) WHERE estado = 'aprobada';
```
Garantiza a nivel de BD que solo pueda existir **una solicitud aprobada** por mascota.

---

## 🔌 Endpoints

### API Mascotas — `http://localhost:8001`

| Método | Ruta | Descripción | Códigos |
|---|---|---|---|
| GET | `/health` | Estado del servicio | 200 |
| GET | `/mascotas` | Listar (filtros: especie, estado, nombre) | 200 |
| GET | `/mascotas/{id}` | Detalle de una mascota | 200, 404 |
| POST | `/mascotas` | Crear nueva mascota | 201 |
| PUT | `/mascotas/{id}` | Actualizar datos informativos | 200, 404 |
| PATCH | `/mascotas/{id}/estado` | Cambiar estado (idempotente) | 200, 404, 409 |
| GET | `/mascotas/{id}/disponibilidad` | Consulta rápida SOA | 200, 404 |

### API Adopciones — `http://localhost:8002`

| Método | Ruta | Descripción | Códigos |
|---|---|---|---|
| GET | `/health` | Estado del servicio | 200 |
| POST | `/solicitudes` | Crear solicitud | 201, 404, 409, 503 |
| GET | `/solicitudes` | Listar (filtros: estado, mascota_id) | 200 |
| GET | `/solicitudes/{id}` | Detalle de solicitud | 200, 404 |
| PATCH | `/solicitudes/{id}/aprobar` | Aprobar solicitud (flujo SOA) | 200, 404, 409, 503 |
| PATCH | `/solicitudes/{id}/rechazar` | Rechazar solicitud | 200, 404, 409 |

> 📖 **Documentación Swagger / OpenAPI**:
> - **API Mascotas (Local)**: http://localhost:8001/docs
> - **API Adopciones (Local)**: http://localhost:8002/docs
> - **API Mascotas (Producción Render)**: https://api-mascotas-d63k.onrender.com/docs
> - **API Adopciones (Producción Render)**: https://api-adopciones-ldy0.onrender.com/docs

---

## 🌐 Despliegue en la Nube (Producción)

Los servicios se encuentran desplegados y comunicándose en vivo en **Render.com**:

| Servicio | URL de Producción | Documentación / Enlace |
|---|---|---|
| **Frontend Web** | [`https://huellas-de-esperanza-jytk.onrender.com`](https://huellas-de-esperanza-jytk.onrender.com) | [Abrir Aplicación Web](https://huellas-de-esperanza-jytk.onrender.com) |
| **API Mascotas** | `https://api-mascotas-d63k.onrender.com` | [`/docs`](https://api-mascotas-d63k.onrender.com/docs) |
| **API Adopciones** | `https://api-adopciones-ldy0.onrender.com` | [`/docs`](https://api-adopciones-ldy0.onrender.com/docs) |

*Nota sobre el plan gratuito de Render:* Los servicios se suspenden tras inactividad y tardan ~50 segundos en reactivarse con la primera petición HTTP.

---

## 🧠 Decisiones Técnicas

### 1. Servicios independientes sin FK cruzada
`solicitudes.mascota_id` **no tiene FOREIGN KEY** hacia `mascotas.id`. En SOA cada servicio es dueño de su tabla; la validación de existencia se hace por HTTP en tiempo real.

### 2. Índice único parcial (23505 → 409)
El índice `una_aprobada_por_mascota` previene a nivel de PostgreSQL que se aprueben dos solicitudes para la misma mascota. El código captura específicamente el error `23505` (violación de unicidad) y responde 409, mientras que otros errores de BD responden 500.

### 3. Transacción compensatoria (Saga → 503)
Al aprobar una solicitud:
1. Se marca como `aprobada` en la BD local.
2. Se llama a `PATCH /mascotas/{id}/estado` con `adoptada`.
3. **Si el paso 2 falla** (timeout, error, caída de API Mascotas), se **revierte** la solicitud a `pendiente` y se responde **503** con un mensaje claro.

### 4. Idempotencia en PATCH /estado
Si el estado nuevo es igual al actual, se responde 200 sin error. Esto permite reintentos seguros por parte del cliente. El 409 solo aplica para cambios no permitidos desde `adoptada`.

### 5. Validación de disponibilidad por HTTP
Antes de crear una solicitud, API Adopciones consulta `GET /mascotas/{id}/disponibilidad` para verificar que la mascota exista y esté disponible. Si API Mascotas está caída, responde 503 y **no crea** la solicitud.

### 6. CORS configurable
Los orígenes permitidos se leen de la variable `CORS_ORIGINS` (separada por comas). Por defecto `"*"` para desarrollo. En producción: `CORS_ORIGINS=https://mi-frontend.com`.

### 7. Escape de HTML en el frontend
La función `escaparHTML()` sanitiza todos los datos de la API antes de insertarlos con `innerHTML`, previniendo ataques XSS.

---

## 🚀 Ejecución Local (paso a paso)

### Prerrequisitos
- Python 3.11+
- Cuenta en [Supabase](https://supabase.com)

### 1. Crear las tablas en Supabase
Ejecuta el contenido de [`docs/schema.sql`](docs/schema.sql) en el **SQL Editor** de tu proyecto Supabase.

### 2. Crear entorno virtual e instalar dependencias
```bash
python -m venv venv

# Windows
.\venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r api-mascotas/requirements.txt
pip install -r api-adopciones/requirements.txt
```

### 3. Configurar variables de entorno
Copia `.env.example` a `.env` en cada API y completa con tus claves de Supabase:

```bash
# api-mascotas/.env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu_service_role_key

# api-adopciones/.env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu_service_role_key
MASCOTAS_API_URL=http://localhost:8001
```

### 4. Levantar los servicios
```bash
# Terminal 1: API Mascotas
cd api-mascotas
python run.py
# → http://localhost:8001/docs

# Terminal 2: API Adopciones
cd api-adopciones
python run.py
# → http://localhost:8002/docs

# Terminal 3: Frontend
cd frontend
python -m http.server 5500
# → http://localhost:5500
```

### 5. Verificar
Abre http://localhost:5500 — deberías ver el catálogo con 6 mascotas y los indicadores de salud en verde.

---

## 🔑 Variables de Entorno

### api-mascotas
| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servicio | `8001` |
| `SUPABASE_URL` | URL del proyecto Supabase | — |
| `SUPABASE_KEY` | Service role key de Supabase | — |
| `CORS_ORIGINS` | Orígenes CORS (coma-separados) | `*` |

### api-adopciones
| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servicio | `8002` |
| `SUPABASE_URL` | URL del proyecto Supabase | — |
| `SUPABASE_KEY` | Service role key de Supabase | — |
| `MASCOTAS_API_URL` | URL de api-mascotas | `http://localhost:8001` |
| `HTTP_TIMEOUT_SECONDS` | Timeout para llamadas inter-servicio | `5.0` |
| `CORS_ORIGINS` | Orígenes CORS (coma-separados) | `*` |

---

## 🧪 Pruebas de Integración

```bash
# Instalar dependencias de pruebas
pip install -r tests/requirements.txt

# Ejecutar contra localhost (ambas APIs deben estar corriendo)
pytest tests/test_integracion.py -v

# Ejecutar contra producción (URLs personalizadas)
MASCOTAS_URL=https://api-mascotas.onrender.com ADOPCIONES_URL=https://api-adopciones.onrender.com pytest tests/test_integracion.py -v
```

Los tests crean sus propios datos y los limpian al terminar. No dependen entre sí.

Resultados detallados:
- **Pruebas en Local (10/10 pasadas)**: [`docs/evidencias/resultado_pruebas_local.txt`](docs/evidencias/resultado_pruebas_local.txt)
- **Pruebas en Nube Render (10/10 pasadas)**: [`docs/evidencias/resultado_pruebas_produccion.txt`](docs/evidencias/resultado_pruebas_produccion.txt)

---

## 📸 Evidencias del Flujo (Nueva Interfaz)

| Paso | Captura | Descripción de la Evidencia |
|---|---|---|
| 01 | [`01_catalogo.png`](docs/evidencias/01_catalogo.png) | Catálogo principal con diseño bosque/crema, pilares con iconos nítidos y health dots en verde |
| 02 | [`02_detalle_milo.png`](docs/evidencias/02_detalle_milo.png) | Modal rediseñado con cabecera fotográfica, botón frosted glass, badge flotante y atributos |
| 03 | [`03_formulario_llenado.png`](docs/evidencias/03_formulario_llenado.png) | Formulario de adopción estilizado con validaciones y datos de contacto del solicitante |
| 04 | [`04_solicitud_enviada.png`](docs/evidencias/04_solicitud_enviada.png) | Confirmación con toast verde de creación exitosa de la solicitud (`201 Created`) |
| 05 | [`05_admin_pendiente.png`](docs/evidencias/05_admin_pendiente.png) | Panel de administración con la solicitud en estado `Pendiente` y acciones seguras |
| 06 | [`06_confirmar_aprobacion.png`](docs/evidencias/06_confirmar_aprobacion.png) | Modal de confirmación para evitar aprobaciones accidentales |
| 07 | [`07_aprobacion_exitosa.png`](docs/evidencias/07_aprobacion_exitosa.png) | Flujo SOA completado: solicitud marcada como `Aprobada` y toast de confirmación |
| 08 | [`08_catalogo_milo_adoptada.png`](docs/evidencias/08_catalogo_milo_adoptada.png) | Catálogo con Milo actualizada a `Adoptada` vía comunicación inter-servicio |
| 09 | [`09_detalle_milo_adoptada.png`](docs/evidencias/09_detalle_milo_adoptada.png) | Modal de mascota adoptada con banner protegido ("¡Esta mascota ya encontró un hogar!") |
| 10 | [`10_vista_movil.png`](docs/evidencias/10_vista_movil.png) | Diseño 100% responsivo en dispositivos móviles (viewport 390x844) |
| 11 | [`11_swagger_docs.png`](docs/evidencias/11_swagger_docs.png) | Documentación interactiva Swagger / OpenAPI OAS 3.1 desplegada en Render |

---

## ⚠️ Limitaciones Conocidas

1. **Sin autenticación en el panel admin:** cualquier usuario puede aprobar o rechazar solicitudes. En producción se requiere proteger con Supabase Auth / JWT.
2. **Render free tier:** los servicios se duermen tras 15 minutos de inactividad. La primera petición puede tardar ~50 segundos.
3. **Sin DELETE para solicitudes/mascotas:** la limpieza de datos de prueba requiere acceso directo a Supabase.
4. **Compensación simple (Saga):** si la reversión falla durante la compensación, queda un estado inconsistente que requiere intervención manual (registrado en logs).

---

## 🔮 Mejoras Futuras

- **Autenticación y autorización:** integrar Supabase Auth con JWT para proteger el panel admin y las rutas de escritura.
- **Mensajería asíncrona:** reemplazar las llamadas HTTP síncronas por un bus de eventos (ej: Supabase Realtime, RabbitMQ) para desacoplar mejor los servicios.
- **Transacciones distribuidas más robustas:** implementar el patrón Saga completo con outbox table y reintentos automáticos.
- **Notificaciones:** enviar email al solicitante cuando su solicitud cambie de estado.
- **Paginación:** agregar paginación en los listados para soportar grandes volúmenes.
- **CI/CD:** pipeline con GitHub Actions para ejecutar los tests automáticamente en cada push.

---

## 👨‍💻 Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.11, FastAPI, Pydantic v2 |
| Base de datos | Supabase (PostgreSQL) vía `supabase-py` |
| Comunicación inter-servicio | httpx (HTTP/REST + JSON) |
| Frontend | HTML5, Tailwind CSS (CDN), JavaScript Vanilla |
| Pruebas | pytest, httpx |
| Contenedores | Docker |

---

*Desarrollado como proyecto académico para el 2° Parcial de Arquitectura de Software.*

