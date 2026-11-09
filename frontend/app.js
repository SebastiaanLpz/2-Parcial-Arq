/**
 * ============================================================
 *  Fundación Huellas de Esperanza — Frontend SPA
 *  Arquitectura Orientada a Servicios (SOA)
 *
 *  Consume DOS microservicios independientes:
 *    • API Mascotas  (MASCOTAS_API_URL  definida en config.js)
 *    • API Adopciones (ADOPCIONES_API_URL definida en config.js)
 *
 *  Vanilla JS (sin frameworks) + Fetch API + Lucide Icons
 * ============================================================
 */

// ============================================================
// 1. CONFIGURACIÓN DE URLs
//    Las constantes MASCOTAS_API_URL y ADOPCIONES_API_URL se definen
//    en config.js, que se carga antes que este archivo.
// ============================================================

// ============================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ============================================================
let mascotasCache = {};   // { uuid: mascotaObj } — para mostrar nombre en admin
let vistaActual = "catalogo";
let debounceTimer = null;

// ============================================================
// 2.1 UTILIDAD: Escape de HTML para prevenir XSS
//     Se usa en TODOS los datos de la API antes de innerHTML.
// ============================================================
function escaparHTML(texto) {
    if (texto === null || texto === undefined) return "";
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(String(texto)));
    return div.innerHTML;
}

// ============================================================
// 2.2 UTILIDAD: Renderizar iconos Lucide
//     Se llama después de cada inserción dinámica de HTML
//     que contenga elementos <i data-lucide="...">.
// ============================================================
function renderizarIconos() {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
        lucide.createIcons();
    }
}

// ============================================================
// 2.3 UTILIDAD: Obtener icono Lucide según especie
// ============================================================
function obtenerIconoEspecie(especie) {
    // Lucide no tiene iconos específicos de perro/gato/conejo,
    // usamos paw-print para todas las especies.
    return "paw-print";
}

// ============================================================
// 2.4 UTILIDAD: Icono de badge según estado de mascota
// ============================================================
function obtenerIconoBadgeEstado(estado) {
    const map = {
        "disponible": "check-circle",
        "en_proceso": "clock",
        "adoptada":   "heart"
    };
    return map[estado] || "help-circle";
}

// ============================================================
// 2.5 UTILIDAD: Icono de badge según estado de solicitud
// ============================================================
function obtenerIconoBadgeSolicitud(estado) {
    const map = {
        "pendiente":  "clock",
        "aprobada":   "check-circle",
        "rechazada":  "x-circle"
    };
    return map[estado] || "help-circle";
}

// ============================================================
// 2.6 UTILIDAD: Icono y clase de toast según tipo
// ============================================================
function obtenerIconoToast(tipo) {
    const map = {
        "success": "check-circle",
        "error":   "alert-circle",
        "warning": "alert-triangle",
        "info":    "info"
    };
    return map[tipo] || "info";
}

// ============================================================
// 3. INICIALIZACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    renderizarIconos();
    verificarSaludAPIs();
    cargarMascotas();

    // Verificar salud cada 30 segundos
    setInterval(verificarSaludAPIs, 30000);
});

// ============================================================
// 4. VERIFICACIÓN DE SALUD DE LAS APIs
// ============================================================
async function verificarSaludAPIs() {
    const dotMascotas   = document.getElementById("health-mascotas");
    const dotAdopciones = document.getElementById("health-adopciones");

    // API Mascotas
    try {
        const res = await fetch(`${MASCOTAS_API_URL}/health`, { signal: AbortSignal.timeout(3000) });
        dotMascotas.className = res.ok ? "health-dot ok" : "health-dot error";
    } catch {
        dotMascotas.className = "health-dot error";
    }

    // API Adopciones
    try {
        const res = await fetch(`${ADOPCIONES_API_URL}/health`, { signal: AbortSignal.timeout(3000) });
        dotAdopciones.className = res.ok ? "health-dot ok" : "health-dot error";
    } catch {
        dotAdopciones.className = "health-dot error";
    }
}

// ============================================================
// 5. NAVEGACIÓN ENTRE VISTAS
// ============================================================
function navegarA(vista) {
    vistaActual = vista;

    // Ocultar todas las secciones
    document.getElementById("vista-catalogo").classList.add("hidden");
    document.getElementById("vista-admin").classList.add("hidden");

    // Mostrar la seleccionada
    document.getElementById(`vista-${vista}`).classList.remove("hidden");

    // Actualizar botones de navegación
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`nav-${vista}`).classList.add("active");

    // Cargar datos según la vista
    if (vista === "catalogo") {
        cargarMascotas();
    } else if (vista === "admin") {
        cargarSolicitudes();
    }
}

// ============================================================
// 6. CATÁLOGO DE MASCOTAS
// ============================================================

/** Carga las mascotas desde api-mascotas con los filtros aplicados */
async function cargarMascotas() {
    const grid     = document.getElementById("grid-mascotas");
    const loading  = document.getElementById("loading-mascotas");
    const vacio    = document.getElementById("estado-vacio-mascotas");
    const contador = document.getElementById("contador-mascotas");
    const heroCounter = document.getElementById("hero-counter");

    // Mostrar loading
    grid.innerHTML = "";
    loading.classList.remove("hidden");
    vacio.classList.add("hidden");

    // Construir query params
    const params = new URLSearchParams();
    const especie = document.getElementById("filtro-especie").value;
    const estado  = document.getElementById("filtro-estado").value;
    const nombre  = document.getElementById("filtro-nombre").value.trim();

    if (especie) params.set("especie", especie);
    if (estado)  params.set("estado", estado);
    if (nombre)  params.set("nombre", nombre);

    const url = `${MASCOTAS_API_URL}/mascotas${params.toString() ? "?" + params.toString() : ""}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error ${res.status}`);

        const mascotas = await res.json();
        loading.classList.add("hidden");

        // Guardar en caché para usarlos en admin
        mascotas.forEach(m => { mascotasCache[m.id] = m; });

        // Actualizar hero counter (mascotas disponibles)
        const disponibles = mascotas.filter(m => m.estado === "disponible").length;
        if (heroCounter) {
            const span = heroCounter.querySelector("span");
            if (span) {
                span.textContent = `${disponibles} mascota${disponibles !== 1 ? "s" : ""} esperando un hogar`;
            }
        }

        if (mascotas.length === 0) {
            vacio.classList.remove("hidden");
            contador.textContent = "0 mascotas encontradas";
            // Restaurar texto del estado vacío por si fue cambiado por un error previo
            const h3 = document.querySelector("#estado-vacio-mascotas h3");
            const p = document.querySelector("#estado-vacio-mascotas p");
            if (h3) h3.textContent = "No se encontraron mascotas";
            if (p) p.textContent = "Intenta con otros filtros de búsqueda.";
            return;
        }

        contador.textContent = `${mascotas.length} mascota${mascotas.length !== 1 ? "s" : ""} encontrada${mascotas.length !== 1 ? "s" : ""}`;

        // Renderizar tarjetas
        mascotas.forEach(m => {
            grid.appendChild(crearTarjetaMascota(m));
        });

        // Renderizar iconos Lucide en las tarjetas recién insertadas
        renderizarIconos();

    } catch (err) {
        loading.classList.add("hidden");
        contador.textContent = "";
        vacio.classList.remove("hidden");
        document.querySelector("#estado-vacio-mascotas h3").textContent = "Error de conexión";
        document.querySelector("#estado-vacio-mascotas p").textContent = "No se pudo conectar con la API de Mascotas. Verifica que esté corriendo en el puerto 8001.";
        mostrarToast("No se pudo conectar con API Mascotas", "error");
    }
}

/** Debounce para el filtro de nombre (espera 400ms después de dejar de escribir) */
function debounceCargarMascotas() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(cargarMascotas, 400);
}

/** Limpia todos los filtros y recarga */
function limpiarFiltros() {
    document.getElementById("filtro-especie").value = "";
    document.getElementById("filtro-estado").value = "";
    document.getElementById("filtro-nombre").value = "";
    cargarMascotas();
}

/** Crea el elemento HTML de una tarjeta de mascota */
function crearTarjetaMascota(m) {
    const div = document.createElement("div");
    div.className = "card-mascota";
    div.onclick = () => abrirModalMascota(m);

    const iconoEspecie = obtenerIconoEspecie(m.especie);
    const iconoBadge   = obtenerIconoBadgeEstado(m.estado);
    const edadTexto    = m.edad === 1 ? "1 año" : `${m.edad} años`;
    const sexoIcono    = m.sexo === "Macho" ? "arrow-up-circle" : "arrow-down-circle";

    // Escapar todos los datos de la API antes de insertar en innerHTML
    const nombre      = escaparHTML(m.nombre);
    const especie     = escaparHTML(m.especie);
    const raza        = escaparHTML(m.raza);
    const descripcion = escaparHTML(m.descripcion);
    const estado      = escaparHTML(m.estado);
    const fotoUrl     = escaparHTML(m.foto_url || "https://placehold.co/400x300/e5e7eb/9ca3af?text=Sin+Foto");

    div.innerHTML = `
        <div class="card-img">
            <img src="${fotoUrl}"
                 alt="Foto de ${nombre}"
                 onerror="this.src='https://placehold.co/400x300/e5e7eb/9ca3af?text=Sin+Foto'">
            <div class="absolute top-3 right-3">
                <span class="badge badge-${estado}">
                    <i data-lucide="${iconoBadge}" class="w-3 h-3"></i>
                    ${estado}
                </span>
            </div>
        </div>
        <div class="p-4">
            <div class="flex items-center justify-between mb-1">
                <h3 class="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                    <i data-lucide="${iconoEspecie}" class="w-4 h-4 text-brand-500"></i>
                    ${nombre}
                </h3>
                <span class="text-gray-400" title="${escaparHTML(m.sexo)}">
                    <i data-lucide="${sexoIcono}" class="w-4 h-4"></i>
                </span>
            </div>
            <p class="text-sm text-gray-500 mb-2">${especie} · ${raza}</p>
            <p class="text-sm text-gray-600 line-clamp-2 mb-3">${descripcion}</p>
            <div class="flex items-center justify-between">
                <span class="text-xs text-gray-400 flex items-center gap-1">
                    <i data-lucide="calendar" class="w-3 h-3"></i>
                    ${edadTexto}
                </span>
                ${m.estado === "disponible"
                    ? '<span class="text-xs text-brand-600 font-semibold flex items-center gap-1"><i data-lucide="heart" class="w-3 h-3"></i> Adoptar</span>'
                    : ''}
            </div>
        </div>
    `;

    return div;
}

// ============================================================
// 7. MODAL DE DETALLE DE MASCOTA + FORMULARIO
// ============================================================

/** Abre el modal con el detalle de la mascota */
function abrirModalMascota(m) {
    const modal = document.getElementById("modal-mascota");

    // Rellenar datos
    const fotoEl = document.getElementById("modal-foto");
    fotoEl.src = m.foto_url || "https://placehold.co/600x400/e5e7eb/9ca3af?text=Sin+Foto";
    fotoEl.onerror = function() { this.src = "https://placehold.co/600x400/e5e7eb/9ca3af?text=Sin+Foto"; };

    document.getElementById("modal-nombre").textContent = m.nombre;
    document.getElementById("modal-especie-raza").textContent = `${m.especie} · ${m.raza}`;
    document.getElementById("modal-edad").textContent = m.edad === 1 ? "1 año" : `${m.edad} años`;
    document.getElementById("modal-sexo").textContent = m.sexo;
    document.getElementById("modal-especie").textContent = m.especie;
    document.getElementById("modal-estado").textContent = m.estado;
    document.getElementById("modal-descripcion").textContent = m.descripcion;

    // Badge de estado (escapar valor de la API)
    const estadoEsc = escaparHTML(m.estado);
    const iconoBadge = obtenerIconoBadgeEstado(m.estado);
    document.getElementById("modal-badge-estado").innerHTML = `<span class="badge badge-${estadoEsc}"><i data-lucide="${iconoBadge}" class="w-3 h-3"></i> ${estadoEsc}</span>`;

    // Mostrar/ocultar formulario según disponibilidad
    const formContainer = document.getElementById("form-solicitud-container");
    const msgNoDisponible = document.getElementById("msg-no-disponible");

    if (m.estado === "disponible") {
        formContainer.classList.remove("hidden");
        msgNoDisponible.classList.add("hidden");
        document.getElementById("form-mascota-id").value = m.id;
        // Limpiar formulario
        document.getElementById("form-solicitud").reset();
        document.getElementById("form-error").classList.add("hidden");
        document.getElementById("form-success").classList.add("hidden");
        document.getElementById("btn-enviar-solicitud").disabled = false;
        document.getElementById("btn-enviar-solicitud").innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar solicitud de adopción';
    } else {
        formContainer.classList.add("hidden");
        msgNoDisponible.classList.remove("hidden");
    }

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    // Renderizar iconos Lucide del modal
    renderizarIconos();
}

/** Cierra el modal de mascota */
function cerrarModal() {
    document.getElementById("modal-mascota").classList.add("hidden");
    document.body.style.overflow = "";
}

/** Cierra el modal solo si se hizo clic en el overlay (no en el contenido) */
function cerrarModalSiOverlay(event) {
    if (event.target.classList.contains("modal-overlay")) {
        cerrarModal();
        cerrarModalConfirmar();
    }
}

// ============================================================
// 8. ENVÍO DE SOLICITUD DE ADOPCIÓN
// ============================================================

/** Maneja el envío del formulario de solicitud */
async function enviarSolicitud(event) {
    event.preventDefault();

    const btn     = document.getElementById("btn-enviar-solicitud");
    const errDiv  = document.getElementById("form-error");
    const succDiv = document.getElementById("form-success");

    // Reset mensajes
    errDiv.classList.add("hidden");
    succDiv.classList.add("hidden");
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Enviando...';
    renderizarIconos();

    const body = {
        mascota_id:         document.getElementById("form-mascota-id").value,
        nombre_solicitante: document.getElementById("form-nombre").value.trim(),
        email:              document.getElementById("form-email").value.trim(),
        telefono:           document.getElementById("form-telefono").value.trim(),
        motivo:             document.getElementById("form-motivo").value.trim()
    };

    try {
        const res = await fetch(`${ADOPCIONES_API_URL}/solicitudes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (res.status === 201) {
            succDiv.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> ¡Solicitud enviada exitosamente! Nos pondremos en contacto contigo pronto.';
            succDiv.classList.remove("hidden");
            btn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Solicitud enviada';
            renderizarIconos();
            mostrarToast("Solicitud de adopción creada correctamente", "success");
        } else if (res.status === 404) {
            errDiv.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4"></i> La mascota no fue encontrada.';
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar solicitud de adopción';
            renderizarIconos();
        } else if (res.status === 409) {
            errDiv.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4"></i> ${escaparHTML(data.detail || "La mascota no está disponible para adopción.")}`;
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar solicitud de adopción';
            renderizarIconos();
        } else if (res.status === 503) {
            errDiv.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4"></i> El servicio de mascotas no está disponible. Intenta más tarde.';
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar solicitud de adopción';
            renderizarIconos();
        } else {
            errDiv.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4"></i> Error: ${escaparHTML(data.detail || "Error desconocido")}`;
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar solicitud de adopción';
            renderizarIconos();
        }

    } catch (err) {
        errDiv.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4"></i> No se pudo conectar con el servidor de adopciones. Verifica que esté corriendo.';
        errDiv.classList.remove("hidden");
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar solicitud de adopción';
        renderizarIconos();
        mostrarToast("Error de conexión con API Adopciones", "error");
    }
}

// ============================================================
// 9. PANEL DE ADMINISTRACIÓN — SOLICITUDES
// ============================================================

/** Carga las solicitudes desde api-adopciones */
async function cargarSolicitudes() {
    const tbody    = document.getElementById("tbody-solicitudes");
    const loading  = document.getElementById("loading-solicitudes");
    const vacio    = document.getElementById("estado-vacio-solicitudes");
    const contador = document.getElementById("contador-solicitudes");

    tbody.innerHTML = "";
    loading.classList.remove("hidden");
    vacio.classList.add("hidden");

    // Filtro de estado
    const params = new URLSearchParams();
    const estado = document.getElementById("filtro-solicitud-estado").value;
    if (estado) params.set("estado", estado);

    const url = `${ADOPCIONES_API_URL}/solicitudes${params.toString() ? "?" + params.toString() : ""}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error ${res.status}`);

        const solicitudes = await res.json();
        loading.classList.add("hidden");

        if (solicitudes.length === 0) {
            vacio.classList.remove("hidden");
            contador.textContent = "0 solicitudes encontradas";
            // Restaurar texto por si fue cambiado por un error previo
            const h3 = document.querySelector("#estado-vacio-solicitudes h3");
            const p = document.querySelector("#estado-vacio-solicitudes p");
            if (h3) h3.textContent = "No hay solicitudes";
            if (p) p.textContent = "Aún no se han registrado solicitudes con ese filtro.";
            return;
        }

        contador.textContent = `${solicitudes.length} solicitud${solicitudes.length !== 1 ? "es" : ""} encontrada${solicitudes.length !== 1 ? "s" : ""}`;

        // Cargar nombres de mascotas (si no están en caché)
        await cargarNombresMascotas(solicitudes);

        // Renderizar filas
        solicitudes.forEach(s => {
            tbody.appendChild(crearFilaSolicitud(s));
        });

        // Renderizar iconos Lucide en las filas recién insertadas
        renderizarIconos();

    } catch (err) {
        loading.classList.add("hidden");
        vacio.classList.remove("hidden");
        document.querySelector("#estado-vacio-solicitudes h3").textContent = "Error de conexión";
        document.querySelector("#estado-vacio-solicitudes p").textContent = "No se pudo conectar con la API de Adopciones.";
        mostrarToast("No se pudo conectar con API Adopciones", "error");
    }
}

/** Carga los nombres de mascotas que no estén en caché */
async function cargarNombresMascotas(solicitudes) {
    const idsUnicos = [...new Set(solicitudes.map(s => s.mascota_id))];
    const idsNuevos = idsUnicos.filter(id => !mascotasCache[id]);

    // Consultar solo los que faltan
    for (const id of idsNuevos) {
        try {
            const res = await fetch(`${MASCOTAS_API_URL}/mascotas/${id}`);
            if (res.ok) {
                const mascota = await res.json();
                mascotasCache[id] = mascota;
            }
        } catch {
            // Si falla, dejamos sin nombre
        }
    }
}

/** Crea una fila de tabla para una solicitud */
function crearFilaSolicitud(s) {
    const tr = document.createElement("tr");
    const mascota = mascotasCache[s.mascota_id];
    const nombreMascotaRaw = mascota ? mascota.nombre : s.mascota_id.substring(0, 8) + "...";
    const fecha = new Date(s.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

    // Escapar todos los datos de la API
    const nombreSolicitante = escaparHTML(s.nombre_solicitante);
    const nombreMascota     = escaparHTML(nombreMascotaRaw);
    const email             = escaparHTML(s.email);
    const telefono          = escaparHTML(s.telefono);
    const motivo            = escaparHTML(s.motivo);
    const estado            = escaparHTML(s.estado);
    const idEsc             = escaparHTML(s.id);

    const iconoBadge   = obtenerIconoBadgeSolicitud(s.estado);
    const iconoEspecie = mascota ? obtenerIconoEspecie(mascota.especie) : "paw-print";

    let acciones = "";
    if (s.estado === "pendiente") {
        acciones = `
            <button onclick="confirmarAccion('aprobar', '${idEsc}', '${nombreSolicitante}')"
                class="btn-approve"
                title="Aprobar solicitud" aria-label="Aprobar solicitud de ${nombreSolicitante}">
                <i data-lucide="check" class="w-3 h-3"></i>
                Aprobar
            </button>
            <button onclick="confirmarAccion('rechazar', '${idEsc}', '${nombreSolicitante}')"
                class="btn-reject"
                title="Rechazar solicitud" aria-label="Rechazar solicitud de ${nombreSolicitante}">
                <i data-lucide="x" class="w-3 h-3"></i>
                Rechazar
            </button>
        `;
    } else {
        acciones = `<span class="text-xs text-gray-400">—</span>`;
    }

    tr.innerHTML = `
        <td class="px-4 py-3 font-medium text-gray-900" data-label="Solicitante">
            <span class="flex items-center gap-1.5">
                <i data-lucide="user" class="w-3.5 h-3.5 text-gray-400"></i>
                ${nombreSolicitante}
            </span>
        </td>
        <td class="px-4 py-3 text-gray-700" data-label="Mascota">
            <span class="flex items-center gap-1.5">
                <i data-lucide="${iconoEspecie}" class="w-3.5 h-3.5 text-brand-500"></i>
                ${nombreMascota}
            </span>
        </td>
        <td class="px-4 py-3 text-gray-600" data-label="Email">
            <span class="flex items-center gap-1.5">
                <i data-lucide="mail" class="w-3.5 h-3.5 text-gray-400"></i>
                ${email}
            </span>
        </td>
        <td class="px-4 py-3 text-gray-600" data-label="Teléfono">
            <span class="flex items-center gap-1.5">
                <i data-lucide="phone" class="w-3.5 h-3.5 text-gray-400"></i>
                ${telefono}
            </span>
        </td>
        <td class="px-4 py-3 text-gray-600 max-w-[200px] truncate" data-label="Motivo" title="${motivo}">${motivo}</td>
        <td class="px-4 py-3 text-center" data-label="Estado">
            <span class="badge badge-${estado}">
                <i data-lucide="${iconoBadge}" class="w-3 h-3"></i>
                ${estado}
            </span>
        </td>
        <td class="px-4 py-3 text-gray-500 text-xs" data-label="Fecha">
            <span class="flex items-center gap-1.5">
                <i data-lucide="calendar" class="w-3 h-3 text-gray-400"></i>
                ${fecha}
            </span>
        </td>
        <td class="px-4 py-3 text-center" data-label="Acciones">
            <div class="flex items-center justify-center gap-1.5">${acciones}</div>
        </td>
    `;

    return tr;
}

// ============================================================
// 10. MODAL DE CONFIRMACIÓN (aprobar/rechazar)
// ============================================================

/** Muestra el modal de confirmación para una acción */
function confirmarAccion(accion, solicitudId, nombreSolicitante) {
    const modal    = document.getElementById("modal-confirmar");
    const titulo   = document.getElementById("confirmar-titulo");
    const mensaje  = document.getElementById("confirmar-mensaje");
    const btnConf  = document.getElementById("btn-confirmar-accion");
    const errorDiv = document.getElementById("confirmar-error");

    errorDiv.classList.add("hidden");

    if (accion === "aprobar") {
        titulo.innerHTML = '<span class="flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i> Confirmar aprobación</span>';
        mensaje.textContent = `¿Estás seguro de aprobar la solicitud de "${nombreSolicitante}"? Esto marcará la mascota como adoptada y rechazará las demás solicitudes pendientes.`;
        btnConf.className = "btn-confirm-approve text-sm";
        btnConf.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Sí, aprobar';
        btnConf.onclick = () => ejecutarAccion("aprobar", solicitudId);
    } else {
        titulo.innerHTML = '<span class="flex items-center gap-2"><i data-lucide="x-circle" class="w-5 h-5 text-red-600"></i> Confirmar rechazo</span>';
        mensaje.textContent = `¿Estás seguro de rechazar la solicitud de "${nombreSolicitante}"?`;
        btnConf.className = "btn-confirm-reject text-sm";
        btnConf.innerHTML = '<i data-lucide="x" class="w-4 h-4"></i> Sí, rechazar';
        btnConf.onclick = () => ejecutarAccion("rechazar", solicitudId);
    }

    modal.classList.remove("hidden");

    // Renderizar iconos Lucide del modal de confirmación
    renderizarIconos();
}

/** Ejecuta la acción de aprobar o rechazar */
async function ejecutarAccion(accion, solicitudId) {
    const btn      = document.getElementById("btn-confirmar-accion");
    const errorDiv = document.getElementById("confirmar-error");

    btn.disabled = true;
    btn.innerHTML = accion === "aprobar"
        ? '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Aprobando...'
        : '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Rechazando...';
    errorDiv.classList.add("hidden");
    renderizarIconos();

    const url = `${ADOPCIONES_API_URL}/solicitudes/${solicitudId}/${accion}`;

    try {
        const res = await fetch(url, { method: "PATCH" });
        const data = await res.json();

        if (res.ok) {
            cerrarModalConfirmar();
            mostrarToast(data.mensaje || `Solicitud ${accion === "aprobar" ? "aprobada" : "rechazada"} exitosamente.`, "success");
            cargarSolicitudes();
            // Refrescar caché de mascotas (por si cambió el estado)
            cargarMascotasParaCache();
        } else if (res.status === 409) {
            errorDiv.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4"></i> ${escaparHTML(data.detail || "Conflicto al procesar la solicitud.")}`;
            errorDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = accion === "aprobar"
                ? '<i data-lucide="check" class="w-4 h-4"></i> Sí, aprobar'
                : '<i data-lucide="x" class="w-4 h-4"></i> Sí, rechazar';
            btn.className = accion === "aprobar" ? "btn-confirm-approve text-sm" : "btn-confirm-reject text-sm";
            renderizarIconos();
        } else if (res.status === 503) {
            errorDiv.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4"></i> ${escaparHTML(data.detail || "El servicio de mascotas no está disponible.")}`;
            errorDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = accion === "aprobar"
                ? '<i data-lucide="check" class="w-4 h-4"></i> Sí, aprobar'
                : '<i data-lucide="x" class="w-4 h-4"></i> Sí, rechazar';
            btn.className = accion === "aprobar" ? "btn-confirm-approve text-sm" : "btn-confirm-reject text-sm";
            renderizarIconos();
        } else {
            errorDiv.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4"></i> ${escaparHTML(data.detail || "Error procesando la solicitud.")}`;
            errorDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = accion === "aprobar"
                ? '<i data-lucide="check" class="w-4 h-4"></i> Sí, aprobar'
                : '<i data-lucide="x" class="w-4 h-4"></i> Sí, rechazar';
            btn.className = accion === "aprobar" ? "btn-confirm-approve text-sm" : "btn-confirm-reject text-sm";
            renderizarIconos();
        }

    } catch (err) {
        errorDiv.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4"></i> No se pudo conectar con el servidor. Verifica que esté corriendo.';
        errorDiv.classList.remove("hidden");
        btn.disabled = false;
        btn.innerHTML = accion === "aprobar"
            ? '<i data-lucide="check" class="w-4 h-4"></i> Sí, aprobar'
            : '<i data-lucide="x" class="w-4 h-4"></i> Sí, rechazar';
        btn.className = accion === "aprobar" ? "btn-confirm-approve text-sm" : "btn-confirm-reject text-sm";
        renderizarIconos();
        mostrarToast("Error de conexión con API Adopciones", "error");
    }
}

/** Cierra el modal de confirmación */
function cerrarModalConfirmar() {
    document.getElementById("modal-confirmar").classList.add("hidden");
}

/** Recarga la caché de mascotas (después de una aprobación) */
async function cargarMascotasParaCache() {
    try {
        const res = await fetch(`${MASCOTAS_API_URL}/mascotas`);
        if (res.ok) {
            const mascotas = await res.json();
            mascotas.forEach(m => { mascotasCache[m.id] = m; });
        }
    } catch {
        // Silencioso — la caché puede estar desactualizada, no es crítico
    }
}

// ============================================================
// 11. SISTEMA DE TOAST / NOTIFICACIONES
// ============================================================

/** Muestra un toast temporal en la esquina inferior derecha */
function mostrarToast(mensaje, tipo = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;

    const iconoToast = obtenerIconoToast(tipo);
    toast.innerHTML = `<i data-lucide="${iconoToast}" class="w-4 h-4"></i> ${escaparHTML(mensaje)}`;
    container.appendChild(toast);

    // Renderizar iconos del toast
    renderizarIconos();

    // Auto-remover después de 4 segundos
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
}
