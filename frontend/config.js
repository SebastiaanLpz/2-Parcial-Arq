/**
 * ============================================================
 *  Configuración centralizada del Frontend
 *  Detección automática de entorno (Local vs. Producción Render)
 * ============================================================
 */
const IS_LOCAL = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const MASCOTAS_API_URL   = IS_LOCAL ? "http://localhost:8001" : "https://api-mascotas-d63k.onrender.com";
const ADOPCIONES_API_URL = IS_LOCAL ? "http://localhost:8002" : "https://api-adopciones-ldy0.onrender.com";
