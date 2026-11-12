/**
 * ============================================================
 *  Fundación Huellas de Esperanza — Frontend SPA
 *  Arquitectura Orientada a Servicios (SOA)
 *
 *  Consume DOS microservicios independientes:
 *    • API Mascotas   (MASCOTAS_API_URL  definida en config.js)
 *    • API Adopciones (ADOPCIONES_API_URL definida en config.js)
 *
 *  Vanilla JS (sin frameworks) + Fetch API + SVG nativo
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
// 2.2 UTILIDAD: Renderizar iconos Lucide si están presentes
// ============================================================
function renderizarIconos() {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
        lucide.createIcons();
    }
}

// ============================================================
// 2.3 UTILIDAD: Icono y texto de badge según estado de mascota
// ============================================================
function obtenerBadgeEstado(estado) {
    const map = {
        "disponible": {
            svg: '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
            texto: "En adopción",
            clase: "badge-disponible"
        },
        "en_proceso": {
            svg: '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>',
            texto: "En proceso",
            clase: "badge-en_proceso"
        },
        "adoptada": {
            svg: '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
            texto: "Adoptada",
            clase: "badge-adoptada"
        }
    };
    return map[estado] || { svg: '', texto: estado, clase: "badge-disponible" };
}

// ============================================================
// 2.4 UTILIDAD: Icono de badge según estado de solicitud
// ============================================================
function obtenerBadgeSolicitud(estado) {
    const map = {
        "pendiente": {
            svg: '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>',
            texto: "Pendiente",
            clase: "badge-pendiente"
        },
        "aprobada": {
            svg: '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
            texto: "Aprobada",
            clase: "badge-aprobada"
        },
        "rechazada": {
            svg: '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
            texto: "Rechazada",
            clase: "badge-rechazada"
        }
    };
    return map[estado] || { svg: '', texto: estado, clase: "badge-pendiente" };
}

// ============================================================
// 2.5 UTILIDAD: Icono de toast según tipo
// ============================================================
function obtenerIconoToast(tipo) {
    const map = {
        "success": '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
        "error":   '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        "warning": '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
        "info":    '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    return map[tipo] || map["info"];
}

// ============================================================
// 3. INICIALIZACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    renderizarIconos();
    verificarSaludAPIs();
    cargarMascotas();

    setInterval(verificarSaludAPIs, 30000);
});

// ============================================================
// 4. VERIFICACIÓN DE SALUD DE LAS APIs
// ============================================================
async function verificarSaludAPIs() {
    const dotMascotas   = document.getElementById("health-mascotas");
    const dotAdopciones = document.getElementById("health-adopciones");

    let algunError = false;

    // API Mascotas (timeout de 10s para contemplar latencia en la nube)
    try {
        const res = await fetch(`${MASCOTAS_API_URL}/health`, { signal: AbortSignal.timeout(10000) });
        if (dotMascotas) dotMascotas.className = res.ok ? "health-dot ok" : "health-dot error";
        if (!res.ok) algunError = true;
    } catch {
        if (dotMascotas) dotMascotas.className = "health-dot error";
        algunError = true;
    }

    // API Adopciones (timeout de 10s para contemplar latencia en la nube)
    try {
        const res = await fetch(`${ADOPCIONES_API_URL}/health`, { signal: AbortSignal.timeout(10000) });
        if (dotAdopciones) dotAdopciones.className = res.ok ? "health-dot ok" : "health-dot error";
        if (!res.ok) algunError = true;
    } catch {
        if (dotAdopciones) dotAdopciones.className = "health-dot error";
        algunError = true;
    }

    // Si alguno falló (por ejemplo, si Render estaba reactivando la instancia), reintentar automáticamente a los 4s
    if (algunError) {
        setTimeout(async () => {
            try {
                const resM = await fetch(`${MASCOTAS_API_URL}/health`, { signal: AbortSignal.timeout(10000) });
                if (dotMascotas && resM.ok) dotMascotas.className = "health-dot ok";
            } catch {}
            try {
                const resA = await fetch(`${ADOPCIONES_API_URL}/health`, { signal: AbortSignal.timeout(10000) });
                if (dotAdopciones && resA.ok) dotAdopciones.className = "health-dot ok";
            } catch {}
        }, 4000);
    }
}

// ============================================================
// 5. NAVEGACIÓN ENTRE VISTAS
// ============================================================
function navegarA(vista, parametro = null) {
    vistaActual = vista;

    const vistaCat = document.getElementById("vista-catalogo");
    const vistaSeg = document.getElementById("vista-seguimiento");
    const vistaAdm = document.getElementById("vista-admin");
    const navCat   = document.getElementById("nav-catalogo");
    const navSeg   = document.getElementById("nav-seguimiento");
    const navAdm   = document.getElementById("nav-admin");

    if (vistaCat) vistaCat.classList.add("hidden");
    if (vistaSeg) vistaSeg.classList.add("hidden");
    if (vistaAdm) vistaAdm.classList.add("hidden");

    if (navCat) navCat.classList.remove("active");
    if (navSeg) navSeg.classList.remove("active");
    if (navAdm) navAdm.classList.remove("active");

    if (vista === "catalogo") {
        if (vistaCat) vistaCat.classList.remove("hidden");
        if (navCat) navCat.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
        cargarMascotas();
    } else if (vista === "seguimiento") {
        if (vistaSeg) vistaSeg.classList.remove("hidden");
        if (navSeg) navSeg.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
        inicializarVistaSeguimiento(parametro);
    } else if (vista === "admin") {
        if (vistaAdm) vistaAdm.classList.remove("hidden");
        if (navAdm) navAdm.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
        cargarSolicitudes();
    }

    renderizarIconos();
}

// ============================================================
// 6. CATÁLOGO DE MASCOTAS
// ============================================================

/** Carga las mascotas desde api-mascotas con los filtros aplicados */
async function cargarMascotas() {
    const grid        = document.getElementById("grid-mascotas");
    const loading     = document.getElementById("loading-mascotas");
    const vacio       = document.getElementById("estado-vacio-mascotas");
    const contador    = document.getElementById("contador-mascotas");
    const heroCounter = document.getElementById("hero-counter");

    if (!grid) return;

    // Mostrar skeleton
    grid.innerHTML = "";
    if (loading) loading.classList.remove("hidden");
    if (vacio) vacio.classList.add("hidden");

    // Construir query params
    const params = new URLSearchParams();
    const filtroEsp = document.getElementById("filtro-especie");
    const filtroEst = document.getElementById("filtro-estado");
    const filtroNom = document.getElementById("filtro-nombre");

    const especie = filtroEsp ? filtroEsp.value : "";
    const estado  = filtroEst ? filtroEst.value : "";
    const nombre  = filtroNom ? filtroNom.value.trim() : "";

    if (especie) params.set("especie", especie);
    if (estado)  params.set("estado", estado);
    if (nombre)  params.set("nombre", nombre);

    const url = `${MASCOTAS_API_URL}/mascotas${params.toString() ? "?" + params.toString() : ""}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error ${res.status}`);

        const dotMascotas = document.getElementById("health-mascotas");
        if (dotMascotas) dotMascotas.className = "health-dot ok";

        const mascotas = await res.json();
        if (loading) loading.classList.add("hidden");

        // Guardar en caché para panel admin
        mascotas.forEach(m => { mascotasCache[m.id] = m; });

        // Actualizar contador hero (disponibles)
        const disponibles = mascotas.filter(m => m.estado === "disponible").length;
        if (heroCounter) {
            const span = heroCounter.querySelector("span");
            if (span) {
                span.textContent = `${disponibles} peluditos disponibles`;
            }
        }

        if (mascotas.length === 0) {
            if (vacio) vacio.classList.remove("hidden");
            if (contador) contador.textContent = "0 mascotas encontradas";
            return;
        }

        if (contador) {
            contador.textContent = `${mascotas.length} mascota${mascotas.length !== 1 ? "s" : ""} encontrada${mascotas.length !== 1 ? "s" : ""}`;
        }

        // Renderizar tarjetas
        mascotas.forEach(m => {
            grid.appendChild(crearTarjetaMascota(m));
        });

        renderizarIconos();

    } catch (err) {
        if (loading) loading.classList.add("hidden");
        if (contador) contador.textContent = "";
        if (vacio) {
            vacio.classList.remove("hidden");
            const h3 = vacio.querySelector("h3");
            const p  = vacio.querySelector("p");
            if (h3) h3.textContent = "Error de conexión";
            if (p) p.textContent = "No se pudo conectar con la API de Mascotas (puerto 8001).";
        }
        mostrarToast("No se pudo conectar con API Mascotas", "error");
    }
}

/** Debounce para el filtro de nombre */
function debounceCargarMascotas() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(cargarMascotas, 400);
}

/** Limpia todos los filtros y recarga */
function limpiarFiltros() {
    const filtroEsp = document.getElementById("filtro-especie");
    const filtroEst = document.getElementById("filtro-estado");
    const filtroNom = document.getElementById("filtro-nombre");

    if (filtroEsp) filtroEsp.value = "";
    if (filtroEst) filtroEst.value = "";
    if (filtroNom) filtroNom.value = "";
    cargarMascotas();
}

/** Crea el elemento HTML de una tarjeta de mascota */
function crearTarjetaMascota(m) {
    const div = document.createElement("div");
    div.className = "card-mascota";
    div.onclick = () => abrirModalMascota(m);

    const badgeInfo = obtenerBadgeEstado(m.estado);
    const edadTexto = m.edad === 1 ? "1 año" : `${m.edad} años`;
    const sexoIcono = m.sexo === "Macho" ? "♂" : "♀";

    // Escapar todos los datos de la API antes de insertar en innerHTML
    const nombre      = escaparHTML(m.nombre);
    const especie     = escaparHTML(m.especie);
    const raza        = escaparHTML(m.raza);
    const descripcion = escaparHTML(m.descripcion);
    const estado      = escaparHTML(m.estado);
    const fotoUrl     = escaparHTML(m.foto_url || "https://placehold.co/400x300/f4eee3/264d39?text=Sin+Foto");

    div.innerHTML = `
        <div class="card-img">
            <img src="${fotoUrl}"
                 alt="Foto de ${nombre}"
                 onerror="this.src='https://placehold.co/400x300/f4eee3/264d39?text=Sin+Foto'">
            <div class="badge-status ${badgeInfo.clase}">
                ${badgeInfo.svg}
                <span>${badgeInfo.texto}</span>
            </div>
        </div>
        <div class="p-4 flex-1 flex flex-col justify-between">
            <div>
                <div class="flex items-center justify-between mb-1">
                    <h3 class="text-base font-extrabold text-forest-900 flex items-center gap-1.5">
                        ${nombre}
                        <span class="text-xs font-bold text-forest-600">${sexoIcono}</span>
                    </h3>
                    <button class="text-gray-300 hover:text-rose-500 transition" onclick="event.stopPropagation(); toggleFavorito(this);" title="Guardar en favoritos" aria-label="Guardar ${nombre} en favoritos">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                    </button>
                </div>
                <p class="text-xs text-forest-800/70 font-semibold mb-2">${edadTexto} · ${especie} · ${raza}</p>
                <p class="text-xs text-forest-800/80 line-clamp-2 leading-relaxed mb-3">${descripcion}</p>
            </div>
            <div class="pt-2 border-t border-cream-200/80 flex items-center justify-between">
                <span class="text-[11px] font-bold text-forest-600 uppercase tracking-wider">${especie}</span>
                ${m.estado === "disponible"
                    ? '<span class="text-xs font-bold text-forest-800 flex items-center gap-1 hover:underline">Quiero adoptar <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg></span>'
                    : '<span class="text-xs font-semibold text-gray-400 capitalize">' + estado + '</span>'}
            </div>
        </div>
    `;

    return div;
}

function toggleFavorito(btn) {
    if (btn.classList.contains("text-rose-500")) {
        btn.classList.remove("text-rose-500");
        btn.classList.add("text-gray-300");
    } else {
        btn.classList.remove("text-gray-300");
        btn.classList.add("text-rose-500");
    }
}

// ============================================================
// 7. MODAL DE DETALLE DE MASCOTA + FORMULARIO
// ============================================================

/** Abre el modal con el detalle de la mascota */
function abrirModalMascota(m) {
    const modal = document.getElementById("modal-mascota");

    const fotoEl = document.getElementById("modal-foto");
    fotoEl.src = m.foto_url || "https://placehold.co/600x400/f4eee3/264d39?text=Sin+Foto";
    fotoEl.onerror = function() { this.src = "https://placehold.co/600x400/f4eee3/264d39?text=Sin+Foto"; };

    document.getElementById("modal-nombre").textContent = m.nombre;
    document.getElementById("modal-especie-raza").textContent = `${m.especie} · ${m.raza}`;
    document.getElementById("modal-edad").textContent = m.edad === 1 ? "1 año" : `${m.edad} años`;
    document.getElementById("modal-sexo").textContent = m.sexo;
    document.getElementById("modal-especie").textContent = m.especie;
    document.getElementById("modal-estado").textContent = m.estado;
    document.getElementById("modal-descripcion").textContent = m.descripcion;

    // Badge
    const badgeInfo = obtenerBadgeEstado(m.estado);
    document.getElementById("modal-badge-estado").innerHTML = `
        <span class="badge-status ${badgeInfo.clase}">
            ${badgeInfo.svg}
            <span>${badgeInfo.texto}</span>
        </span>
    `;

    // Formulario según disponibilidad
    const formContainer   = document.getElementById("form-solicitud-container");
    const msgNoDisponible = document.getElementById("msg-no-disponible");

    if (m.estado === "disponible") {
        formContainer.classList.remove("hidden");
        msgNoDisponible.classList.add("hidden");
        document.getElementById("form-mascota-id").value = m.id;

        document.getElementById("form-solicitud").reset();
        document.getElementById("form-error").classList.add("hidden");
        document.getElementById("form-success").classList.add("hidden");
        const btnEnv = document.getElementById("btn-enviar-solicitud");
        btnEnv.disabled = false;
        btnEnv.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> <span>Enviar solicitud de adopción</span>';
    } else {
        formContainer.classList.add("hidden");
        msgNoDisponible.classList.remove("hidden");
    }

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    renderizarIconos();
}

/** Cierra el modal de mascota */
function cerrarModal() {
    const modal = document.getElementById("modal-mascota");
    if (modal) modal.classList.add("hidden");
    document.body.style.overflow = "";
}

/** Cierra el modal solo si se hace clic en el overlay */
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

    errDiv.classList.add("hidden");
    succDiv.classList.add("hidden");
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0110 10" stroke-linecap="round"></path></svg> <span>Enviando...</span>';
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
            const petNombre = (document.getElementById("modal-nombre") ? document.getElementById("modal-nombre").textContent : "").trim() || "tu mascota";
            guardarSolicitudEnHistorial(data, petNombre);

            succDiv.innerHTML = `
                <div class="space-y-3 p-3.5 bg-emerald-50 rounded-2xl border border-emerald-300">
                    <div class="flex items-center gap-2 text-emerald-950 font-extrabold text-sm sm:text-base">
                        <svg class="w-5 h-5 flex-shrink-0 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        <span>¡Solicitud radicada con éxito!</span>
                    </div>
                    <p class="text-xs text-emerald-900/90 leading-relaxed font-medium">
                        Tu solicitud para <strong>${escaparHTML(petNombre)}</strong> ha sido recibida en API-Adopciones y se encuentra en estado <strong>Pendiente de revisión</strong>.
                    </p>
                    <div class="bg-white/95 p-2.5 rounded-xl border border-emerald-300 text-xs">
                        <span class="text-forest-800 font-bold block mb-0.5">Código de seguimiento (Radicado UUID):</span>
                        <code class="font-mono text-emerald-950 font-bold select-all break-all">${escaparHTML(data.id)}</code>
                    </div>
                    <div class="pt-1">
                        <button type="button" onclick="cerrarModal(); navegarA('seguimiento', '${escaparHTML(data.id)}');"
                            class="btn-dark text-xs py-2.5 px-4 w-full justify-center shadow-md hover:scale-[1.02] transition cursor-pointer">
                            <svg class="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            <span>Consultar estado de mi solicitud en tiempo real &rarr;</span>
                        </button>
                    </div>
                </div>
            `;
            succDiv.classList.remove("hidden");
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> <span>Solicitud radicada</span>';
            renderizarIconos();
            mostrarToast("¡Solicitud radicada! Puedes consultar su estado en cualquier momento.", "success");
        } else if (res.status === 404) {
            errDiv.innerHTML = '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <span>La mascota no fue encontrada.</span>';
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> <span>Enviar solicitud de adopción</span>';
            renderizarIconos();
        } else if (res.status === 409) {
            errDiv.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> <span>${escaparHTML(data.detail || "La mascota no está disponible para adopción.")}</span>`;
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> <span>Enviar solicitud de adopción</span>';
            renderizarIconos();
        } else if (res.status === 503) {
            errDiv.innerHTML = '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> <span>El servicio de mascotas no está disponible. Intenta más tarde.</span>';
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> <span>Enviar solicitud de adopción</span>';
            renderizarIconos();
        } else {
            errDiv.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <span>Error: ${escaparHTML(data.detail || "Error desconocido")}</span>`;
            errDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> <span>Enviar solicitud de adopción</span>';
            renderizarIconos();
        }

    } catch (err) {
        errDiv.innerHTML = '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <span>No se pudo conectar con el servidor de adopciones.</span>';
        errDiv.classList.remove("hidden");
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> <span>Enviar solicitud de adopción</span>';
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

    if (!tbody) return;

    tbody.innerHTML = "";
    if (loading) loading.classList.remove("hidden");
    if (vacio) vacio.classList.add("hidden");

    const params = new URLSearchParams();
    const filtroEst = document.getElementById("filtro-solicitud-estado");
    const estado = filtroEst ? filtroEst.value : "";
    if (estado) params.set("estado", estado);

    const url = `${ADOPCIONES_API_URL}/solicitudes${params.toString() ? "?" + params.toString() : ""}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error ${res.status}`);

        const dotAdopciones = document.getElementById("health-adopciones");
        if (dotAdopciones) dotAdopciones.className = "health-dot ok";

        const solicitudes = await res.json();
        if (loading) loading.classList.add("hidden");

        if (solicitudes.length === 0) {
            if (vacio) vacio.classList.remove("hidden");
            if (contador) contador.textContent = "0 solicitudes encontradas";
            return;
        }

        if (contador) {
            contador.textContent = `${solicitudes.length} solicitud${solicitudes.length !== 1 ? "es" : ""} encontrada${solicitudes.length !== 1 ? "s" : ""}`;
        }

        // Cargar nombres de mascotas faltantes en caché
        await cargarNombresMascotas(solicitudes);

        // Renderizar filas
        solicitudes.forEach(s => {
            tbody.appendChild(crearFilaSolicitud(s));
        });

        renderizarIconos();

    } catch (err) {
        if (loading) loading.classList.add("hidden");
        if (vacio) vacio.classList.remove("hidden");
        mostrarToast("No se pudo conectar con API Adopciones", "error");
    }
}

/** Carga los nombres de mascotas que no estén en caché */
async function cargarNombresMascotas(solicitudes) {
    const idsUnicos = [...new Set(solicitudes.map(s => s.mascota_id))];
    const idsNuevos = idsUnicos.filter(id => !mascotasCache[id]);

    for (const id of idsNuevos) {
        try {
            const res = await fetch(`${MASCOTAS_API_URL}/mascotas/${id}`);
            if (res.ok) {
                const mascota = await res.json();
                mascotasCache[id] = mascota;
            }
        } catch {
            // Silencioso
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

    const badgeInfo = obtenerBadgeSolicitud(s.estado);

    let acciones = "";
    if (s.estado === "pendiente") {
        acciones = `
            <button onclick="confirmarAccion('aprobar', '${idEsc}', '${nombreSolicitante}')"
                class="btn-approve"
                title="Aprobar solicitud" aria-label="Aprobar solicitud de ${nombreSolicitante}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                <span>Aprobar</span>
            </button>
            <button onclick="confirmarAccion('rechazar', '${idEsc}', '${nombreSolicitante}')"
                class="btn-reject"
                title="Rechazar solicitud" aria-label="Rechazar solicitud de ${nombreSolicitante}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                <span>Rechazar</span>
            </button>
        `;
    } else {
        acciones = `<span class="text-xs text-gray-400 font-semibold">—</span>`;
    }

    tr.innerHTML = `
        <td class="px-4 py-3.5 font-bold text-forest-900" data-label="Solicitante">
            <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-forest-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                ${nombreSolicitante}
            </span>
        </td>
        <td class="px-4 py-3.5 text-forest-800" data-label="Mascota">
            <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-forest-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8.5 3.5C7.67 3.5 7 4.56 7 5.86s.67 2.36 1.5 2.36S10 7.16 10 5.86 9.33 3.5 8.5 3.5zm7 0c-.83 0-1.5 1.06-1.5 2.36s.67 2.36 1.5 2.36S17 7.16 17 5.86 16.33 3.5 15.5 3.5zM4.5 7C3.67 7 3 8.06 3 9.36s.67 2.36 1.5 2.36S6 10.66 6 9.36 5.33 7 4.5 7zm15 0c-.83 0-1.5 1.06-1.5 2.36s.67 2.36 1.5 2.36S21 10.66 21 9.36 20.33 7 19.5 7zM12 10c-3.1 0-5.5 2.1-5.5 5 0 2.2 1.9 4 4.5 4 .4 0 .7-.1 1-.2.3.1.6.2 1 .2 2.6 0 4.5-1.8 4.5-4 0-2.9-2.4-5-5.5-5z"/></svg>
                ${nombreMascota}
            </span>
        </td>
        <td class="px-4 py-3.5 text-forest-800/80" data-label="Email">
            <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                ${email}
            </span>
        </td>
        <td class="px-4 py-3.5 text-forest-800/80" data-label="Teléfono">
            <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                ${telefono}
            </span>
        </td>
        <td class="px-4 py-3.5 text-forest-800 max-w-[200px] truncate" data-label="Motivo" title="${motivo}">${motivo}</td>
        <td class="px-4 py-3.5 text-center" data-label="Estado">
            <span class="badge-status ${badgeInfo.clase} !static !shadow-none">
                ${badgeInfo.svg}
                <span>${badgeInfo.texto}</span>
            </span>
        </td>
        <td class="px-4 py-3.5 text-forest-800/60 text-xs" data-label="Fecha">
            <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${fecha}
            </span>
        </td>
        <td class="px-4 py-3.5 text-center" data-label="Acciones">
            <div class="flex items-center justify-center gap-2">${acciones}</div>
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
        titulo.innerHTML = '<span class="flex items-center gap-2 text-forest-800"><svg class="w-5 h-5 text-forest-600" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Confirmar aprobación</span>';
        mensaje.textContent = `¿Estás seguro de aprobar la solicitud de "${nombreSolicitante}"? Esto marcará la mascota como adoptada y rechazará automáticamente las demás solicitudes pendientes.`;
        btnConf.className = "btn-confirm-approve text-xs";
        btnConf.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> <span>Sí, aprobar</span>';
        btnConf.onclick = () => ejecutarAccion("aprobar", solicitudId);
    } else {
        titulo.innerHTML = '<span class="flex items-center gap-2 text-red-700"><svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> Confirmar rechazo</span>';
        mensaje.textContent = `¿Estás seguro de rechazar la solicitud de "${nombreSolicitante}"?`;
        btnConf.className = "btn-confirm-reject text-xs";
        btnConf.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> <span>Sí, rechazar</span>';
        btnConf.onclick = () => ejecutarAccion("rechazar", solicitudId);
    }

    modal.classList.remove("hidden");
    renderizarIconos();
}

/** Ejecuta la acción de aprobar o rechazar */
async function ejecutarAccion(accion, solicitudId) {
    const btn      = document.getElementById("btn-confirmar-accion");
    const errorDiv = document.getElementById("confirmar-error");

    btn.disabled = true;
    btn.innerHTML = accion === "aprobar"
        ? '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0110 10" stroke-linecap="round"></path></svg> <span>Aprobando...</span>'
        : '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0110 10" stroke-linecap="round"></path></svg> <span>Rechazando...</span>';
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
            cargarMascotasParaCache();
        } else if (res.status === 409) {
            errorDiv.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> <span>${escaparHTML(data.detail || "Conflicto al procesar la solicitud.")}</span>`;
            errorDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = accion === "aprobar"
                ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> <span>Sí, aprobar</span>'
                : '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> <span>Sí, rechazar</span>';
            renderizarIconos();
        } else if (res.status === 503) {
            errorDiv.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> <span>${escaparHTML(data.detail || "El servicio de mascotas no está disponible.")}</span>`;
            errorDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = accion === "aprobar"
                ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> <span>Sí, aprobar</span>'
                : '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> <span>Sí, rechazar</span>';
            renderizarIconos();
        } else {
            errorDiv.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <span>${escaparHTML(data.detail || "Error procesando la solicitud.")}</span>`;
            errorDiv.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = accion === "aprobar"
                ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> <span>Sí, aprobar</span>'
                : '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> <span>Sí, rechazar</span>';
            renderizarIconos();
        }

    } catch (err) {
        errorDiv.innerHTML = '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <span>No se pudo conectar con el servidor.</span>';
        errorDiv.classList.remove("hidden");
        btn.disabled = false;
        btn.innerHTML = accion === "aprobar"
            ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> <span>Sí, aprobar</span>'
            : '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> <span>Sí, rechazar</span>';
        renderizarIconos();
        mostrarToast("Error de conexión con API Adopciones", "error");
    }
}

function cerrarModalConfirmar() {
    const modal = document.getElementById("modal-confirmar");
    if (modal) modal.classList.add("hidden");
}

async function cargarMascotasParaCache() {
    try {
        const res = await fetch(`${MASCOTAS_API_URL}/mascotas`);
        if (res.ok) {
            const mascotas = await res.json();
            mascotas.forEach(m => { mascotasCache[m.id] = m; });
        }
    } catch {
        // Silencioso
    }
}

// ============================================================
// 11. SISTEMA DE TOAST / NOTIFICACIONES
// ============================================================

/** Muestra un toast temporal en la esquina inferior derecha */
function mostrarToast(mensaje, tipo = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;

    const iconoToast = obtenerIconoToast(tipo);
    toast.innerHTML = `${iconoToast} <span>${escaparHTML(mensaje)}</span>`;
    container.appendChild(toast);

    renderizarIconos();

    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
}

// ============================================================
// 12. PORTAL DE SEGUIMIENTO DE SOLICITUDES (PARA ADOPTANTES)
// ============================================================

const STORAGE_KEY_SOLICITUDES = "huellas_mis_solicitudes_v1";

/** Obtiene el historial local de solicitudes guardadas */
function obtenerHistorialSolicitudes() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SOLICITUDES);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/** Guarda una solicitud en el historial local del navegador */
function guardarSolicitudEnHistorial(solicitud, nombreMascota = "") {
    try {
        const historial = obtenerHistorialSolicitudes();
        const existe = historial.find(item => item.id === solicitud.id);
        if (!existe) {
            historial.unshift({
                id: solicitud.id,
                email: solicitud.email,
                nombre: solicitud.nombre_solicitante,
                mascota_id: solicitud.mascota_id,
                mascota_nombre: nombreMascota,
                fecha: new Date().toISOString()
            });
            localStorage.setItem(STORAGE_KEY_SOLICITUDES, JSON.stringify(historial.slice(0, 15)));
        }
    } catch (e) {
        console.warn("No se pudo guardar en localStorage:", e);
    }
}

/** Inicializa la vista de seguimiento cuando se abre */
function inicializarVistaSeguimiento(parametro = null) {
    cargarChipsSolicitudesRecientes();
    const input = document.getElementById("input-criterio-seguimiento");

    if (parametro) {
        if (input) input.value = parametro;
        ejecutarConsultaSeguimiento(parametro);
        return;
    }

    // Si ya hay un valor en el input, re-consultar
    if (input && input.value.trim()) {
        ejecutarConsultaSeguimiento(input.value.trim());
        return;
    }

    // Si no, autollenar con el correo más reciente si existe
    const historial = obtenerHistorialSolicitudes();
    if (historial.length > 0 && historial[0].email) {
        if (input) input.value = historial[0].email;
        ejecutarConsultaSeguimiento(historial[0].email);
    } else {
        const cont = document.getElementById("contenedor-resultados-seguimiento");
        if (cont) cont.innerHTML = "";
        const ini = document.getElementById("estado-inicial-seguimiento");
        if (ini) ini.classList.remove("hidden");
    }
}

/** Carga chips con los correos usados recientemente */
function cargarChipsSolicitudesRecientes() {
    const contenedor = document.getElementById("chips-solicitudes-recientes");
    if (!contenedor) return;

    const historial = obtenerHistorialSolicitudes();
    if (!historial || historial.length === 0) {
        contenedor.innerHTML = "";
        return;
    }

    const emails = [...new Set(historial.map(s => s.email).filter(Boolean))];
    let html = `<span class="font-bold text-forest-900 text-xs mr-1">Consultas rápidas:</span>`;
    emails.slice(0, 3).forEach(email => {
        html += `
            <button type="button" onclick="consultarChipRapido('${escaparHTML(email)}')"
                class="inline-flex items-center gap-1.5 bg-cream-100 hover:bg-cream-200 text-forest-800 px-3 py-1 rounded-full border border-cream-200 transition text-xs font-semibold cursor-pointer">
                <svg class="w-3.5 h-3.5 text-forest-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"/></svg>
                <span>${escaparHTML(email)}</span>
            </button>
        `;
    });

    contenedor.innerHTML = html;
}

function consultarChipRapido(valor) {
    const input = document.getElementById("input-criterio-seguimiento");
    if (input) input.value = valor;
    ejecutarConsultaSeguimiento(valor);
}

/** Maneja el submit del formulario de consulta */
function consultarEstadoAdoptante(event) {
    if (event) event.preventDefault();
    const input = document.getElementById("input-criterio-seguimiento");
    if (!input) return;
    const criterio = input.value.trim();
    if (!criterio) return;
    ejecutarConsultaSeguimiento(criterio);
}

/** Obtiene datos de una mascota desde la API o caché */
async function obtenerMascotaParaSeguimiento(mascotaId) {
    if (mascotasCache[mascotaId]) return mascotasCache[mascotaId];
    try {
        const res = await fetch(`${MASCOTAS_API_URL}/mascotas/${mascotaId}`);
        if (res.ok) {
            const data = await res.json();
            mascotasCache[mascotaId] = data;
            return data;
        }
    } catch {
        // Silencioso
    }
    return null;
}

/** Ejecuta la consulta HTTP hacia api-adopciones */
async function ejecutarConsultaSeguimiento(criterio) {
    const loading    = document.getElementById("loading-seguimiento");
    const contenedor = document.getElementById("contenedor-resultados-seguimiento");
    const ini        = document.getElementById("estado-inicial-seguimiento");
    const btn        = document.getElementById("btn-buscar-seguimiento");

    if (ini) ini.classList.add("hidden");
    if (contenedor) contenedor.innerHTML = "";
    if (loading) loading.classList.remove("hidden");
    if (btn) btn.disabled = true;

    try {
        let solicitudes = [];

        // 1. Intentar el endpoint dedicado de consulta /solicitudes/consultar/{criterio}
        try {
            const resDedicated = await fetch(`${ADOPCIONES_API_URL}/solicitudes/consultar/${encodeURIComponent(criterio)}`);
            if (resDedicated.ok) {
                solicitudes = await resDedicated.json();
            }
        } catch {
            // Continúa al fallback
        }

        // 2. Si no retornó o falló, usar los endpoints estándar
        if (!solicitudes || solicitudes.length === 0) {
            const esUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(criterio);
            if (esUUID) {
                const resId = await fetch(`${ADOPCIONES_API_URL}/solicitudes/${encodeURIComponent(criterio)}`);
                if (resId.ok) {
                    const sol = await resId.json();
                    solicitudes = [sol];
                }
            } else {
                const resEmail = await fetch(`${ADOPCIONES_API_URL}/solicitudes?email=${encodeURIComponent(criterio)}`);
                if (resEmail.ok) {
                    solicitudes = await resEmail.json();
                }
            }
        }

        // Renderizar los resultados
        if (!solicitudes || solicitudes.length === 0) {
            contenedor.innerHTML = `
                <div class="text-center py-14 bg-white rounded-3xl border border-cream-200 p-8 max-w-xl mx-auto shadow-sm">
                    <div class="w-16 h-16 mx-auto bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mb-4 border border-amber-200">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <h3 class="text-lg font-bold text-forest-900 mb-1">No se encontraron solicitudes</h3>
                    <p class="text-sm text-forest-800/70 max-w-md mx-auto mb-4">
                        No hay trámites registrados con el correo o código <strong>"${escaparHTML(criterio)}"</strong>. Revisa la ortografía o radica tu solicitud en el catálogo.
                    </p>
                    <button onclick="navegarA('catalogo')" class="btn-dark text-xs py-2 px-5">
                        Ver mascotas disponibles &rarr;
                    </button>
                </div>
            `;
        } else {
            // Renderizar cada solicitud con sus detalles
            await renderizarResultadosSeguimiento(solicitudes, contenedor);
        }

    } catch (err) {
        contenedor.innerHTML = `
            <div class="text-center py-12 bg-white rounded-3xl border border-rose-200 p-8 max-w-xl mx-auto shadow-sm">
                <div class="w-16 h-16 mx-auto bg-rose-50 text-rose-700 rounded-full flex items-center justify-center mb-4 border border-rose-200">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <h3 class="text-lg font-bold text-forest-900 mb-1">Error de conexión</h3>
                <p class="text-sm text-forest-800/70 max-w-md mx-auto mb-4">
                    No se pudo consultar el servidor de adopciones. Por favor verifica tu conexión a internet o intenta más tarde.
                </p>
                <button onclick="ejecutarConsultaSeguimiento('${escaparHTML(criterio)}')" class="btn-outline-dark text-xs py-2 px-5">
                    Reintentar consulta
                </button>
            </div>
        `;
    } finally {
        if (loading) loading.classList.add("hidden");
        if (btn) btn.disabled = false;
        renderizarIconos();
    }
}

/** Renderiza la lista de tarjetas de seguimiento de adopción */
async function renderizarResultadosSeguimiento(solicitudes, contenedor) {
    let cardsHtml = `
        <div class="flex items-center justify-between pb-2">
            <h3 class="text-lg font-bold text-forest-900 flex items-center gap-2">
                <svg class="w-5 h-5 text-forest-700" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                <span>Solicitudes encontradas (${solicitudes.length})</span>
            </h3>
            <button onclick="ejecutarConsultaSeguimiento(document.getElementById('input-criterio-seguimiento').value)"
                class="btn-outline-dark text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                <span>Actualizar estado</span>
            </button>
        </div>
    `;

    for (const sol of solicitudes) {
        const pet = await obtenerMascotaParaSeguimiento(sol.mascota_id);
        const petNombre = pet ? pet.nombre : "Mascota";
        const petFoto = pet && pet.foto_url ? pet.foto_url : "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80";
        const petEspecie = pet ? pet.especie : "Rescatado";
        const petEdad = pet ? `${pet.edad} ${pet.edad === 1 ? "año" : "años"}` : "";
        const fechaFormateada = sol.created_at ? new Date(sol.created_at).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Fecha no disponible";

        const estado = sol.estado || "pendiente";

        let bloqueEstadoHtml = "";

        if (estado === "aprobada") {
            bloqueEstadoHtml = `
                <!-- TARJETA ESTADO APROBADA -->
                <div class="bg-gradient-to-br from-emerald-50 to-green-50/80 rounded-2xl p-5 sm:p-6 border-2 border-emerald-400 shadow-sm">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
                            <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        </div>
                        <div class="flex-1">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                <span class="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-extrabold text-xs uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                    ¡Solicitud Aprobada!
                                </span>
                                <span class="text-xs text-emerald-800 font-bold">¡Adopción Exitosa!</span>
                            </div>
                            <h4 class="text-lg sm:text-xl font-extrabold text-emerald-950 mt-1">
                                ¡Felicidades, ${escaparHTML(sol.nombre_solicitante)}! 🎉
                            </h4>
                            <p class="text-sm text-emerald-900/90 mt-2 leading-relaxed font-medium">
                                Tu solicitud para adoptar a <strong>${escaparHTML(petNombre)}</strong> ha sido <strong class="text-emerald-700">APROBADA</strong> por la junta de Huellas de Esperanza.
                                La mascota ya ha sido marcada como <span class="underline decoration-emerald-500 font-bold">adoptada</span> en nuestro inventario y reservada exclusivamente para ti.
                            </p>

                            <!-- Próximos pasos -->
                            <div class="mt-4 bg-white/90 backdrop-blur-sm p-4 rounded-xl border border-emerald-300/80 text-xs text-emerald-950 space-y-2">
                                <p class="font-bold text-forest-900 flex items-center gap-2 text-sm">
                                    <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    Próximos pasos para recibir a ${escaparHTML(petNombre)}:
                                </p>
                                <ul class="space-y-1.5 pl-5 list-disc text-forest-800/90 font-medium">
                                    <li>Un coordinador de adopciones se comunicará al teléfono <strong>${escaparHTML(sol.telefono)}</strong> o al correo <strong>${escaparHTML(sol.email)}</strong>.</li>
                                    <li>Coordinaremos la fecha de entrega o visita al refugio para la firma del acta de adopción responsable.</li>
                                    <li>Te entregaremos el carnet de vacunación al día y las recomendaciones de adaptación para su nuevo hogar.</li>
                                </ul>
                            </div>

                            <!-- Stepper Aprobado -->
                            <div class="mt-4 pt-3 border-t border-emerald-200/80 flex items-center gap-2 text-xs font-bold text-emerald-800">
                                <span class="flex items-center gap-1 text-emerald-700"><span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">✓</span> Radicada</span>
                                <span class="text-emerald-400">→</span>
                                <span class="flex items-center gap-1 text-emerald-700"><span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">✓</span> Evaluación</span>
                                <span class="text-emerald-400">→</span>
                                <span class="flex items-center gap-1 text-emerald-900 bg-emerald-200/80 px-2.5 py-0.5 rounded-full"><span class="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px]">✓</span> Aprobada</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (estado === "rechazada") {
            bloqueEstadoHtml = `
                <!-- TARJETA ESTADO RECHAZADA -->
                <div class="bg-gradient-to-br from-rose-50 to-pink-50/70 rounded-2xl p-5 sm:p-6 border-2 border-rose-300 shadow-sm">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
                            <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </div>
                        <div class="flex-1">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                <span class="inline-flex items-center gap-1.5 bg-rose-600 text-white font-extrabold text-xs uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                    Solicitud No Aprobada
                                </span>
                                <span class="text-xs text-rose-800 font-bold">Proceso Finalizado</span>
                            </div>
                            <h4 class="text-lg sm:text-xl font-extrabold text-rose-950 mt-1">
                                Estimado(a) ${escaparHTML(sol.nombre_solicitante)}
                            </h4>
                            <p class="text-sm text-rose-900/90 mt-2 leading-relaxed font-medium">
                                Te informamos que tu solicitud para la mascota <strong>${escaparHTML(petNombre)}</strong> ha sido <strong class="text-rose-700">RECHAZADA</strong> o cerrada.
                            </p>
                            <p class="text-xs text-rose-800/80 mt-1 leading-relaxed">
                                En nuestro sistema SOA, esto sucede comúnmente porque <strong>otro adoptante fue aprobado previamente para el mismo animal</strong> (el sistema impide la doble adopción) o porque el perfil habitacional no coincidió con las necesidades específicas de esta mascota.
                            </p>

                            <div class="mt-4 pt-3 border-t border-rose-200/80 flex flex-wrap items-center justify-between gap-3">
                                <div class="flex items-center gap-2 text-xs font-bold text-rose-800">
                                    <span class="flex items-center gap-1 text-emerald-700"><span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">✓</span> Radicada</span>
                                    <span class="text-rose-400">→</span>
                                    <span class="flex items-center gap-1 text-rose-800 bg-rose-200/80 px-2.5 py-0.5 rounded-full"><span class="w-5 h-5 rounded-full bg-rose-700 text-white flex items-center justify-center text-[10px]">✕</span> Rechazada</span>
                                </div>
                                <button onclick="navegarA('catalogo')" class="btn-dark text-xs py-2 px-4 shadow-sm cursor-pointer">
                                    Ver otros peluditos disponibles &rarr;
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Estado Pendiente
            bloqueEstadoHtml = `
                <!-- TARJETA ESTADO PENDIENTE -->
                <div class="bg-gradient-to-br from-amber-50 to-yellow-50/70 rounded-2xl p-5 sm:p-6 border-2 border-amber-300 shadow-sm">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-md">
                            <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
                        </div>
                        <div class="flex-1">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                <span class="inline-flex items-center gap-1.5 bg-amber-500 text-white font-extrabold text-xs uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
                                    En Evaluación · Pendiente
                                </span>
                                <span class="text-xs text-amber-800 font-bold">Revisión en curso</span>
                            </div>
                            <h4 class="text-lg sm:text-xl font-extrabold text-amber-950 mt-1">
                                ¡Hola, ${escaparHTML(sol.nombre_solicitante)}! Tu trámite está activo
                            </h4>
                            <p class="text-sm text-amber-900/90 mt-2 leading-relaxed font-medium">
                                Tu solicitud para adoptar a <strong>${escaparHTML(petNombre)}</strong> fue recibida correctamente y está siendo evaluada por el equipo de adopciones.
                                Estamos verificando la disponibilidad del animal y tus motivos para asegurar el mejor bienestar mutuo.
                            </p>
                            <p class="text-xs text-amber-800/80 mt-1 leading-relaxed">
                                Mantente atento a tu teléfono <strong>${escaparHTML(sol.telefono)}</strong> y correo <strong>${escaparHTML(sol.email)}</strong>. En cuanto el administrador tome una decisión, el estado aquí cambiará a <strong>Aprobada</strong> o <strong>Rechazada</strong>.
                            </p>

                            <!-- Stepper Pendiente -->
                            <div class="mt-4 pt-3 border-t border-amber-200/80 flex items-center gap-2 text-xs font-bold text-amber-800">
                                <span class="flex items-center gap-1 text-emerald-700"><span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">✓</span> Radicada</span>
                                <span class="text-amber-400">→</span>
                                <span class="flex items-center gap-1 text-amber-900 bg-amber-200/90 px-2.5 py-0.5 rounded-full animate-pulse"><span class="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">●</span> En Evaluación</span>
                                <span class="text-amber-300">→</span>
                                <span class="text-amber-600/60">Decisión Final</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        cardsHtml += `
            <div class="bg-white rounded-3xl shadow-sm border border-cream-200 overflow-hidden hover:shadow-md transition">
                <!-- Barra superior de la tarjeta con radicado y fecha -->
                <div class="bg-cream-100/70 px-6 py-3 border-b border-cream-200 flex flex-wrap items-center justify-between gap-2 text-xs text-forest-800">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-forest-900">Radicado:</span>
                        <code class="font-mono bg-white px-2 py-0.5 rounded border border-cream-300 font-bold select-all text-forest-900">${escaparHTML(sol.id)}</code>
                    </div>
                    <div class="flex items-center gap-1.5 text-forest-700">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
                        <span>${escaparHTML(fechaFormateada)}</span>
                    </div>
                </div>

                <div class="p-6 space-y-6">
                    <!-- Resumen Mascota + Solicitante -->
                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-cream-100">
                        <!-- Mini tarjeta mascota -->
                        <div class="flex items-center gap-3">
                            <img src="${escaparHTML(petFoto)}" alt="${escaparHTML(petNombre)}"
                                class="w-16 h-16 rounded-2xl object-cover border-2 border-cream-200 shadow-sm flex-shrink-0"
                                onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=200&auto=format&fit=crop&q=80';">
                            <div>
                                <span class="text-[11px] font-bold uppercase tracking-wider text-forest-600">${escaparHTML(petEspecie)} ${escaparHTML(petEdad ? "· " + petEdad : "")}</span>
                                <h4 class="text-xl font-extrabold text-forest-900 leading-tight">${escaparHTML(petNombre)}</h4>
                                <p class="text-xs text-forest-700/80 mt-0.5">ID Mascota: <span class="font-mono">${escaparHTML(sol.mascota_id.substring(0, 8))}...</span></p>
                            </div>
                        </div>

                        <!-- Datos del solicitante -->
                        <div class="bg-cream-50 px-4 py-2.5 rounded-2xl border border-cream-200 text-xs space-y-1 w-full sm:w-auto">
                            <div class="flex items-center gap-1.5 text-forest-900 font-bold">
                                <svg class="w-3.5 h-3.5 text-forest-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                <span>${escaparHTML(sol.nombre_solicitante)}</span>
                            </div>
                            <div class="text-forest-700 flex items-center gap-1.5">
                                <svg class="w-3.5 h-3.5 text-forest-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                                <span>${escaparHTML(sol.email)}</span>
                            </div>
                            <div class="text-forest-700 flex items-center gap-1.5">
                                <svg class="w-3.5 h-3.5 text-forest-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                                <span>${escaparHTML(sol.telefono)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Bloque Dinámico del Estado (Aprobada / Rechazada / Pendiente) -->
                    ${bloqueEstadoHtml}

                    <!-- Motivo manifestado -->
                    <div class="text-xs bg-cream-50/70 p-3 rounded-xl border border-cream-200/80">
                        <span class="font-bold text-forest-900 block mb-0.5">Motivo de adopción registrado:</span>
                        <p class="text-forest-800 italic">"${escaparHTML(sol.motivo)}"</p>
                    </div>
                </div>
            </div>
        `;
    }

    contenedor.innerHTML = cardsHtml;
}
