// ═══════════════════════════════════════════════════════════════════════════
//  SAM — PERSISTENCIA (Supabase, almacenamiento genérico)
// ───────────────────────────────────────────────────────────────────────────
//  Mismo modelo que OIP (para poder portar sus defensas anti-pérdida y su motor
//  de pagos/WhatsApp), pero contra un proyecto de Supabase PROPIO y separado:
//    app_data (coleccion, doc_id, data)  — cada documento como fila JSON.
//    app_meta (clave, valor)             — config y nextId.
//
//  API estable (igual que OIP): marcarCambios / cargarDesdeNube / guardarEnNube.
//  El endurecimiento de OIP (carga paginada, candado anti-pisada, backup diario)
//  se porta cuando se conecte el proyecto real; la API ya está preparada.
//
//  Credenciales: se completan al crear el proyecto Supabase de SAM (Etapa 1/10).
//  Vacías = modo local/tests: initSupabase corta y la app trabaja solo en memoria.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL  = '';   // ← completar con el proyecto Supabase de SAM
const SUPABASE_ANON = '';   // ← completar con la anon key de SAM

const OBRAS_SOCIALES_BASE = JSON.parse(JSON.stringify(DB.obrasSociales || []));
const SEDES_BASE          = JSON.parse(JSON.stringify(DB.sedes || []));
const CONSULTORIOS_BASE   = JSON.parse(JSON.stringify(DB.consultorios || []));
const USUARIOS_BASE       = JSON.parse(JSON.stringify(DB.usuarios || []));

let sb = null;                 // cliente Supabase
let datosCargados = false;     // true una vez que se cargó (o sembró) la nube
let autosaveActivo = false;    // habilita el autoguardado con debounce
let autosaveTimer = null;
const cambiosPendientes = { dirty: new Set() };  // colecciones modificadas pendientes de guardar

// ── Indicador visual de guardado (best-effort; no rompe si no existe el nodo) ──
function _setIndicador(estado) {
  const el = (typeof document !== 'undefined') && document.getElementById('indicadorGuardado');
  if (!el) return;
  const map = { guardado: '✓ Guardado', guardando: '… Guardando', pendiente: '● Sin guardar', error: '⚠ Error al guardar' };
  el.textContent = map[estado] || '';
  el.dataset.estado = estado;
}

// ── Respaldo local (localStorage): mantiene los datos aunque todavía no haya nube.
//    Se usa como red de seguridad SIEMPRE; cuando exista Supabase (Etapa 10) la nube
//    es la fuente y esto queda como caché offline. ──
const LS_KEY = 'sam_db_v1';
let _localTimer = null;
let _uiTimer = null;

function guardarLocal() {
  if (typeof localStorage === 'undefined') return;
  try {
    const dump = { nextId: DB.nextId, config: DB.config };
    for (const c of COLECCIONES) dump[c] = DB[c];
    localStorage.setItem(LS_KEY, JSON.stringify(dump));
  } catch (e) { /* cuota llena o modo privado: se ignora */ }
}

function cargarLocal() {
  if (typeof localStorage === 'undefined') return false;
  let raw;
  try { raw = localStorage.getItem(LS_KEY); } catch (e) { return false; }
  if (!raw) return false;
  try {
    const dump = JSON.parse(raw);
    for (const c of COLECCIONES) if (Array.isArray(dump[c])) DB[c] = dump[c];
    if (dump.config) DB.config = dump.config;
    if (dump.nextId) DB.nextId = dump.nextId;
    _asegurarBase('sedes', SEDES_BASE, 'nombre');
    _asegurarBase('consultorios', CONSULTORIOS_BASE, 'nombre');
    _asegurarBase('usuarios', USUARIOS_BASE, 'email');
    _corregirNextId();
    return true;
  } catch (e) { return false; }
}

// ── Marcado de cambios + autoguardado con debounce (misma semántica que OIP) ──
function marcarCambios(coleccion) {
  if (coleccion) cambiosPendientes.dirty.add(coleccion);
  _setIndicador('pendiente');
  // Respaldo local: funciona aún sin nube conectada.
  if (_localTimer) clearTimeout(_localTimer);
  _localTimer = setTimeout(() => { guardarLocal(); if (!sb) _setIndicador('guardado'); }, 400);
  // Refresco global de la UI: que la info viaje entre todas las partes sin recargar.
  if (typeof sincronizarUI === 'function') {
    if (_uiTimer) clearTimeout(_uiTimer);
    _uiTimer = setTimeout(() => { try { sincronizarUI(); } catch (e) {} }, 150);
  }
  if (!autosaveActivo) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { guardarEnNube(true); }, 800);
}

// ── Cliente Supabase ──
function initSupabase() {
  if (sb) return true;
  if (!SUPABASE_URL || !SUPABASE_ANON) return false;               // sin credenciales → modo local
  if (typeof supabase === 'undefined' || !supabase.createClient) return false;  // SDK no cargado (p.ej. jsdom)
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  return true;
}

// ── Carga inicial desde la nube (o siembra si está vacía) ──
async function cargarDesdeNube() {
  if (!sb && !initSupabase()) return false;

  const { data: filas, error } = await sb.from('app_data').select('coleccion, doc_id, data');
  if (error) { console.error('cargarDesdeNube:', error); return false; }

  if (!filas || filas.length === 0) {
    await sembrarInicial();
  } else {
    // Reconstruir cada colección conocida desde las filas.
    const porColeccion = {};
    for (const c of COLECCIONES) porColeccion[c] = [];
    for (const f of filas) { if (porColeccion[f.coleccion]) porColeccion[f.coleccion].push(f.data); }
    for (const c of COLECCIONES) DB[c] = porColeccion[c];

    // Migraciones no destructivas: garantizar sede/usuario base sin pisar lo existente.
    _asegurarBase('sedes', SEDES_BASE, 'nombre');
    _asegurarBase('consultorios', CONSULTORIOS_BASE, 'nombre');
    _asegurarBase('usuarios', USUARIOS_BASE, 'email');

    // config / nextId desde app_meta.
    const { data: meta } = await sb.from('app_meta').select('clave, valor');
    for (const m of (meta || [])) {
      if (m.clave === 'config') DB.config = m.valor;
      if (m.clave === 'nextId') DB.nextId = m.valor;
    }
    _corregirNextId();
  }

  datosCargados = true;
  autosaveActivo = true;
  _setIndicador('guardado');
  return true;
}

// Agrega los registros base que falten (por clave natural) sin duplicar ni pisar.
function _asegurarBase(coleccion, base, claveNatural) {
  const existentes = new Set((DB[coleccion] || []).map(x => String(x[claveNatural])));
  let agregó = false;
  for (const b of base) {
    if (!existentes.has(String(b[claveNatural]))) { DB[coleccion].push(JSON.parse(JSON.stringify(b))); agregó = true; }
  }
  if (agregó) marcarCambios(coleccion);
}

// nextId nunca debe chocar con un id ya usado.
function _corregirNextId() {
  let max = 0;
  for (const c of COLECCIONES) for (const x of (DB[c] || [])) if (Number(x.id) > max) max = Number(x.id);
  if (DB.nextId <= max) DB.nextId = max + 1;
}

// Siembra el estado inicial (semilla mínima: sedes + usuario admin). Sin precios inventados.
async function sembrarInicial() {
  const filas = [];
  for (const c of COLECCIONES) for (const x of (DB[c] || [])) filas.push({ coleccion: c, doc_id: String(x.id), data: x });
  if (filas.length) await sb.from('app_data').upsert(filas, { onConflict: 'coleccion,doc_id' });
  await sb.from('app_meta').upsert([{ clave: 'config', valor: DB.config }, { clave: 'nextId', valor: DB.nextId }], { onConflict: 'clave' });
}

// ── Guardado real: upsert de todo lo local + borrado de lo que ya no está ──
async function guardarEnNube(automatico = false) {
  if (!sb && !initSupabase()) { _setIndicador('pendiente'); return false; }
  if (!datosCargados) return false;
  _setIndicador('guardando');

  try {
    // 1) Upsert de todos los items con id (en lotes).
    const filas = [];
    for (const c of COLECCIONES) for (const x of (DB[c] || [])) if (x && x.id != null) filas.push({ coleccion: c, doc_id: String(x.id), data: x });
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await sb.from('app_data').upsert(filas.slice(i, i + 500), { onConflict: 'coleccion,doc_id' });
      if (error) throw error;
    }

    // 2) Borrar del remoto lo que ya no existe local (por colección).
    const { data: remoto } = await sb.from('app_data').select('coleccion, doc_id');
    const localSet = new Set(filas.map(f => f.coleccion + ':' + f.doc_id));
    const aBorrar = (remoto || []).filter(r => !localSet.has(r.coleccion + ':' + r.doc_id));
    for (const r of aBorrar) await sb.from('app_data').delete().match({ coleccion: r.coleccion, doc_id: r.doc_id });

    // 3) Meta (config/nextId).
    await sb.from('app_meta').upsert([{ clave: 'config', valor: DB.config }, { clave: 'nextId', valor: DB.nextId }], { onConflict: 'clave' });

    cambiosPendientes.dirty.clear();
    _setIndicador('guardado');
    return true;
  } catch (e) {
    console.error('guardarEnNube:', e);
    _setIndicador('error');
    if (automatico) { if (autosaveTimer) clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => guardarEnNube(true), 10000); }
    return false;
  }
}

// ── Botón "Actualizar" del header: guarda YA y refresca toda la UI ──
//    En modo local persiste en localStorage; con nube conectada, hace upsert.
function actualizarApp() {
  const btn = (typeof document !== 'undefined') && document.querySelector('.btn-actualizar');
  try {
    guardarLocal();                                   // respaldo local inmediato
    if (typeof sincronizarUI === 'function') sincronizarUI();  // que la info viaje a todas las vistas
    if (sb || initSupabase()) { guardarEnNube(false); }        // nube (si está)
    else { _setIndicador('guardado'); }
    if (btn) { btn.classList.add('ok'); btn.textContent = '✓ Actualizado'; setTimeout(() => { btn.classList.remove('ok'); btn.textContent = '↻ Actualizar'; }, 1400); }
  } catch (e) {
    console.error('actualizarApp:', e);
    if (btn) { btn.textContent = '⚠ Error'; setTimeout(() => { btn.textContent = '↻ Actualizar'; }, 1600); }
  }
}

// ── Diagnóstico de nube (para el botón "Verificar nube" del Admin) ──
function estadoNube() {
  return {
    hayCredenciales: !!SUPABASE_URL && !!SUPABASE_ANON,
    conectado: !!sb,
    datosCargados,
    dirty: [...cambiosPendientes.dirty],
  };
}

// Guarda todo y re-lee de la nube para confirmar que cada colección está completa.
async function verificarNube() {
  if (!sb && !initSupabase()) return { conectado: false };
  const guardado = await guardarEnNube(false);
  const { data: remoto, error } = await sb.from('app_data').select('coleccion, doc_id');
  if (error) return { conectado: true, guardado, error: error.message };
  const nubeCount = {};
  (remoto || []).forEach(r => { nubeCount[r.coleccion] = (nubeCount[r.coleccion] || 0) + 1; });
  const detalle = COLECCIONES.map(c => {
    const local = (DB[c] || []).filter(x => x && x.id != null).length;
    const nube = nubeCount[c] || 0;
    return { coleccion: c, local, nube, ok: local === nube };
  });
  return { conectado: true, guardado, detalle, todoOk: detalle.every(d => d.ok) };
}

// ── Arranque de la app ──
//  Fuera de un navegador con Supabase (p. ej. jsdom en los tests, o sin credenciales)
//  corta temprano y deja la app trabajando en memoria, sin tocar nada.
async function arranque() {
  if (!initSupabase()) {
    // Modo local/tests: no hay nube. Restaurar el respaldo local si existe y
    // dejar la UI utilizable; los cambios se guardan en localStorage.
    cargarLocal();
    datosCargados = true;
    if (typeof init === 'function') { try { init(); } catch (e) {} }
    _setIndicador('guardado');
    return;
  }
  await cargarDesdeNube();
  if (typeof init === 'function') { try { init(); } catch (e) {} }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => { arranque(); });
}
