-- ==============================================================================
-- PLATAFORMA DE ADOPCIÓN DE MASCOTAS - FUNDACIÓN HUELLAS DE ESPERANZA
-- Arquitectura Orientada a Servicios (SOA) - Esquema de Base de Datos (Supabase)
-- ==============================================================================
-- Justificación Arquitectónica SOA:
-- 1. Desacoplamiento de Datos: Cada microservicio gestiona su propio agregado de datos.
-- 2. Sin Llave Foránea Directa: La tabla 'solicitudes' NO define FOREIGN KEY hacia 'mascotas'.
--    La integridad referencial y de estado es responsabilidad de la capa de servicio (HTTP/REST).
-- 3. Concurrencia ACID: Se añade un índice único condicional que impide a nivel de base de datos
--    que una misma mascota tenga dos adopciones aprobadas simultáneamente (evitando race conditions).
-- ==============================================================================

-- Asegurar extensión para UUID (habilitada por defecto en PostgreSQL 13+ y Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. TABLA: MASCOTAS (Gestionada exclusivamente por API-Mascotas)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mascotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    especie VARCHAR(50) NOT NULL,
    raza VARCHAR(100) NOT NULL,
    edad INT NOT NULL CHECK (edad >= 0),
    sexo VARCHAR(20) NOT NULL CHECK (sexo IN ('Macho', 'Hembra')),
    descripcion TEXT NOT NULL,
    foto_url TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible', 'en_proceso', 'adoptada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta para optimizar filtros de API-Mascotas
CREATE INDEX IF NOT EXISTS idx_mascotas_estado ON mascotas(estado);
CREATE INDEX IF NOT EXISTS idx_mascotas_especie ON mascotas(especie);

-- ------------------------------------------------------------------------------
-- 2. TABLA: SOLICITUDES (Gestionada exclusivamente por API-Adopciones)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitudes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mascota_id UUID NOT NULL, -- SIN Foreign Key física para preservar la autonomía del servicio
    nombre_solicitante VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    telefono VARCHAR(50) NOT NULL,
    motivo TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de búsqueda para API-Adopciones
CREATE INDEX IF NOT EXISTS idx_solicitudes_mascota_id ON solicitudes(mascota_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado);

-- ------------------------------------------------------------------------------
-- 3. ÍNDICE ÚNICO PARCIAL: CONTROL DE CONCURRENCIA DE NEGOCIO
-- ------------------------------------------------------------------------------
-- Garantiza que NUNCA exista más de una solicitud 'aprobada' para la misma mascota.
CREATE UNIQUE INDEX IF NOT EXISTS una_aprobada_por_mascota 
ON solicitudes (mascota_id) 
WHERE estado = 'aprobada';

-- ------------------------------------------------------------------------------
-- 4. DATOS SEMILLA (6 MASCOTAS DE EJEMPLO)
-- ------------------------------------------------------------------------------
INSERT INTO mascotas (id, nombre, especie, raza, edad, sexo, descripcion, foto_url, estado)
VALUES
    (
        'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        'Luna',
        'Perro',
        'Criollo / Mestizo',
        2,
        'Hembra',
        'Perrita muy cariñosa, juguetona y sociable con niños y otros perros. Esterilizada y con vacunas al día.',
        'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&auto=format&fit=crop&q=80',
        'disponible'
    ),
    (
        'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
        'Milo',
        'Gato',
        'Común Europeo',
        1,
        'Macho',
        'Gatito curioso de ojos verdes, tranquilo y ronroneador. Ideal para vivir en apartamento.',
        'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&auto=format&fit=crop&q=80',
        'disponible'
    ),
    (
        'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
        'Rocky',
        'Perro',
        'Pastor Alemán Mix',
        4,
        'Macho',
        'Perro leal, activo y obediente. Le encanta correr y aprender trucos. Busca una familia activa.',
        'https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?w=800&auto=format&fit=crop&q=80',
        'disponible'
    ),
    (
        'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a',
        'Simba',
        'Gato',
        'Atigrado Naranja',
        3,
        'Macho',
        'Gato dulce y dormilón. Le fascina tomar siestas al sol y recibir caricias en la barbilla.',
        'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=800&auto=format&fit=crop&q=80',
        'disponible'
    ),
    (
        'e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b',
        'Bella',
        'Perro',
        'Golden Retriever Mix',
        5,
        'Hembra',
        'Extremadamente dócil y paciente. Excelente para terapia familiar o convivencia con adultos mayores.',
        'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&auto=format&fit=crop&q=80',
        'disponible'
    ),
    (
        'f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c',
        'Tambor',
        'Conejo',
        'Belier Enano',
        1,
        'Macho',
        'Conejito blanco muy tranquilo, come heno fresco y le gusta convivir en espacios interiores silenciosos.',
        'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=800&auto=format&fit=crop&q=80',
        'disponible'
    )
ON CONFLICT (id) DO NOTHING;

