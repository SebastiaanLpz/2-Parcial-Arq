# Arquitectura del Sistema — Fundación Huellas de Esperanza

## 1. Diagrama de Componentes (SOA)

```mermaid
flowchart LR
    subgraph "Frontend (HTML + Tailwind + JS Vanilla)"
        FE["🌐 index.html<br/>Puerto 5500"]
    end

    subgraph "Microservicio 1 — API Mascotas"
        M_API["🐾 FastAPI<br/>Puerto 8001"]
    end

    subgraph "Microservicio 2 — API Adopciones"
        A_API["📋 FastAPI<br/>Puerto 8002"]
    end

    subgraph "Base de Datos (Supabase / PostgreSQL)"
        T_MASCOTAS[("mascotas")]
        T_SOLICITUDES[("solicitudes")]
    end

    FE -- "GET/POST<br/>HTTP/REST + JSON" --> M_API
    FE -- "GET/POST/PATCH<br/>HTTP/REST + JSON" --> A_API

    M_API -- "CRUD exclusivo<br/>(supabase-py)" --> T_MASCOTAS
    A_API -- "CRUD exclusivo<br/>(supabase-py)" --> T_SOLICITUDES

    A_API -- "httpx (HTTP/REST)<br/>GET /mascotas/{id}<br/>GET /mascotas/{id}/disponibilidad<br/>PATCH /mascotas/{id}/estado" --> M_API

    style FE fill:#fef3e2,stroke:#d6821a,color:#000
    style M_API fill:#e8f5e9,stroke:#388e3c,color:#000
    style A_API fill:#e3f2fd,stroke:#1565c0,color:#000
    style T_MASCOTAS fill:#f3e8ff,stroke:#6b21a8,color:#000
    style T_SOLICITUDES fill:#f3e8ff,stroke:#6b21a8,color:#000
```

> **Principio clave:** cada microservicio accede **únicamente** a su propia tabla.  
> API Adopciones **nunca** consulta la tabla `mascotas` directamente; toda la información de mascotas llega por HTTP a través de API Mascotas.

---

## 2. Diagrama de Secuencia — Flujo de Aprobación

```mermaid
sequenceDiagram
    actor Admin as Administrador (Frontend)
    participant AA as API Adopciones<br/>(Puerto 8002)
    participant AM as API Mascotas<br/>(Puerto 8001)
    participant DB_S as Supabase<br/>(solicitudes)
    participant DB_M as Supabase<br/>(mascotas)

    Admin->>AA: PATCH /solicitudes/{id}/aprobar

    Note over AA: 1. Verificar que la solicitud<br/>esté en estado 'pendiente'

    AA->>DB_S: SELECT * FROM solicitudes WHERE id = ?
    DB_S-->>AA: solicitud (estado: 'pendiente')

    Note over AA: 2. Consultar estado de la<br/>mascota vía HTTP

    AA->>AM: GET /mascotas/{mascota_id}
    AM->>DB_M: SELECT * FROM mascotas WHERE id = ?
    DB_M-->>AM: mascota (estado: 'disponible')
    AM-->>AA: 200 OK — mascota disponible

    Note over AA: 3. Marcar solicitud como<br/>'aprobada' en la BD

    AA->>DB_S: UPDATE solicitudes SET estado='aprobada'

    alt Índice único rechaza (código 23505)
        DB_S-->>AA: ERROR 23505 — violación de unicidad
        AA-->>Admin: 409 Conflict — Ya existe una solicitud aprobada
    else UPDATE exitoso
        DB_S-->>AA: OK — solicitud actualizada

        Note over AA: 4. Actualizar estado de<br/>mascota vía HTTP

        AA->>AM: PATCH /mascotas/{mascota_id}/estado {"estado": "adoptada"}
        AM->>DB_M: UPDATE mascotas SET estado='adoptada'

        alt API Mascotas falla (timeout, error, caída)
            AM-->>AA: Error / Timeout / 5xx

            Note over AA,DB_S: 5. COMPENSACIÓN: Revertir<br/>solicitud a 'pendiente'

            AA->>DB_S: UPDATE solicitudes SET estado='pendiente'
            DB_S-->>AA: OK — revertida
            AA-->>Admin: 503 Service Unavailable
        else Actualización exitosa
            DB_M-->>AM: OK — mascota adoptada
            AM-->>AA: 200 OK — mascota actualizada

            Note over AA: 6. Rechazar automáticamente<br/>las demás solicitudes pendientes

            AA->>DB_S: UPDATE solicitudes SET estado='rechazada'<br/>WHERE mascota_id=? AND estado='pendiente'
            DB_S-->>AA: OK

            AA-->>Admin: 200 OK — Solicitud aprobada,<br/>mascota adoptada
        end
    end
```

---

## 3. Diagrama Entidad–Relación

```mermaid
erDiagram
    MASCOTAS {
        uuid id PK "gen_random_uuid()"
        varchar nombre
        varchar especie
        varchar raza
        int edad
        varchar sexo
        text descripcion
        varchar foto_url
        varchar estado "CHECK: disponible | en_proceso | adoptada"
        timestamptz created_at "DEFAULT now()"
    }

    SOLICITUDES {
        uuid id PK "gen_random_uuid()"
        uuid mascota_id "SIN foreign key (SOA)"
        varchar nombre_solicitante
        varchar email
        varchar telefono
        text motivo
        varchar estado "CHECK: pendiente | aprobada | rechazada"
        timestamptz created_at "DEFAULT now()"
    }

    MASCOTAS ||--o{ SOLICITUDES : "mascota_id referencia lógica (sin FK)"
```

> **Nota importante:** `solicitudes.mascota_id` **no tiene FOREIGN KEY** hacia `mascotas.id`.  
> Esto es intencional en SOA: cada servicio es dueño exclusivo de su tabla y no se crean dependencias cruzadas a nivel de base de datos. La validación de existencia se hace por HTTP en tiempo de ejecución.
>
> Un **índice único parcial** `uq_solicitudes_aprobadas_por_mascota` en `solicitudes(mascota_id) WHERE estado = 'aprobada'` garantiza a nivel de base de datos que solo pueda existir una solicitud aprobada por mascota, retornando error PostgreSQL `23505` que la API traduce a `409 Conflict`.

---

## 4. Despliegue en la Nube (Producción en Render)

El sistema opera en producción bajo una topología de 3 servicios desacoplados:

| Componente | Tipo de Despliegue | URL Pública |
|---|---|---|
| **Frontend Web** | Static Site | [`https://huellas-de-esperanza-jytk.onrender.com`](https://huellas-de-esperanza-jytk.onrender.com) |
| **API Mascotas** | Web Service (Docker / Python) | [`https://api-mascotas-d63k.onrender.com/docs`](https://api-mascotas-d63k.onrender.com/docs) |
| **API Adopciones** | Web Service (Docker / Python) | [`https://api-adopciones-ldy0.onrender.com/docs`](https://api-adopciones-ldy0.onrender.com/docs) |
| **Base de Datos** | PostgreSQL Gestionado | `hekscpryhwnjjhjcyfjt.supabase.co` |

---

## 5. Garantías de Consistencia y Tolerancia a Fallos

1. **Aislamiento de Microservicios:** Ningún microservicio conoce las credenciales ni la tabla del otro. La única vía de integración es el protocolo HTTP/REST.
2. **Transacción Compensatoria (Saga Básico):** Si durante la aprobación de una solicitud `api-mascotas` deja de responder o devuelve error, `api-adopciones` ejecuta de inmediato una compensación revirtiendo la solicitud a `pendiente` y respondiendo con código HTTP `503 Service Unavailable`.
3. **Idempotencia de Estados:** Las actualizaciones de estado en `/mascotas/{id}/estado` son idempotentes; múltiples solicitudes con el mismo estado producen el mismo resultado sin efectos colaterales.
4. **Validaciones en Tiempo Real:** Antes de aceptar una solicitud de adopción, `api-adopciones` valida que la mascota exista y esté en estado `disponible` llamando a `api-mascotas`. Si no está disponible, responde `400 Bad Request`.

