// ═══════════════════════════════════════════════════════════════════════════
//  OFTA — AUTENTICACIÓN (login con Google + email/contraseña) y ROLES por email
// ───────────────────────────────────────────────────────────────────────────
//  La app solo entra tras un login válido cuando hay un proyecto Supabase
//  configurado (SUPABASE_URL/ANON en persistencia.js). Sin credenciales
//  (tests / modo local) NO se pide login y todo sigue como antes.
//
//  Quién puede entrar y con qué permisos se define en ACCESOS: un email → un rol.
//    · 'admin'         → ve TODO (todos los permisos)
//    · 'secretaria_1'  → solo Carga diaria
//    · 'secretaria_2'  → solo Carga diaria
//  Para dar de alta a alguien: agregá una línea con su email (en minúsculas) y su
//  rol. Un email que no esté en la lista NO puede entrar, aunque tenga Google.
// ═══════════════════════════════════════════════════════════════════════════

const ACCESOS = {
  // ── Administradores (todos los permisos) ──
  'niropol@gmail.com': 'admin',
  // 'admin2@gmail.com': 'admin',
  // 'admin3@gmail.com': 'admin',

  // ── Secretarías (solo Carga diaria) ──
  // 'secretaria1@gmail.com': 'secretaria_1',
  // 'secretaria2@gmail.com': 'secretaria_1',
};

// ¿Hay que pedir login? Solo cuando hay proyecto Supabase configurado.
function loginActivo() {
  return typeof SUPABASE_URL !== 'undefined' && !!SUPABASE_URL && !!SUPABASE_ANON;
}

// Resuelve el rol autorizado para un email (o null si no está en la lista).
function resolverRolPorEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  const rol = ACCESOS[e];
  return (rol && (typeof ROLES === 'undefined' || ROLES.includes(rol))) ? rol : null;
}

// ── Pantalla de login (mostrar / ocultar / mensajes) ──
function mostrarPantallaLogin() {
  const s = document.getElementById('login-screen'); if (s) s.style.display = 'flex';
  const app = document.getElementById('app-root'); if (app) app.style.display = 'none';
}
function ocultarPantallaLogin() {
  const s = document.getElementById('login-screen'); if (s) s.style.display = 'none';
  const app = document.getElementById('app-root'); if (app) app.style.display = '';
}
function loginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
}
function loginLoading(on) {
  const l = document.getElementById('login-loading'); if (l) l.style.display = on ? 'block' : 'none';
  ['login-btn', 'login-google'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !!on; });
}

// ── Arranque de autenticación (lo llama persistencia.js/arranque cuando hay nube) ──
async function iniciarAuth() {
  if (!initSupabase()) { mostrarPantallaLogin(); return; }
  // ¿Ya hay sesión abierta (o volvemos del redirect de Google)?
  try {
    const { data } = await sb.auth.getSession();
    if (data && data.session) { await onLoginOk(); return; }
  } catch (e) { /* sin sesión */ }
  mostrarPantallaLogin();
}

// ── Login con email + contraseña ──
async function loginEmail() {
  const email = (document.getElementById('login-email') || {}).value || '';
  const pass = (document.getElementById('login-pass') || {}).value || '';
  if (!email.trim() || !pass) { loginError('Completá email y contraseña.'); return; }
  if (!initSupabase()) { loginError('No hay conexión configurada.'); return; }
  loginLoading(true); loginError('');
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (error) { loginError('Email o contraseña incorrectos.'); loginLoading(false); return; }
    await onLoginOk();
  } catch (e) { loginError('Error de conexión. Probá de nuevo.'); loginLoading(false); }
}

// ── Login con Google ──
async function loginGoogle() {
  if (!initSupabase()) { loginError('No hay conexión configurada.'); return; }
  loginError('');
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) loginError('No se pudo iniciar con Google.');
  } catch (e) { loginError('Error de conexión con Google.'); }
}

async function logout() {
  try { if (sb) await sb.auth.signOut(); } catch (e) {}
  window.location.reload();
}

// Busca (o crea) el registro de usuario para ese email y lo deja como el actual,
// con el rol autorizado. Así la auditoría atribuye cada cambio a la persona real.
function _usuarioParaEmail(email, rol, nombreGoogle) {
  const e = String(email || '').toLowerCase().trim();
  let u = (DB.usuarios || []).find(x => String(x.email || '').toLowerCase().trim() === e);
  if (u) {
    if (u.rol !== rol) { u.rol = rol; marcarCambios('usuarios'); }        // el rol lo manda ACCESOS
    if (u.estado !== 'Activo') { u.estado = 'Activo'; marcarCambios('usuarios'); }
  } else {
    u = { id: nuevoId(), nombre: nombreGoogle || e.split('@')[0] || e, email: e, rol, estado: 'Activo' };
    DB.usuarios.push(u);
    if (typeof registrarAuditoria === 'function') registrarAuditoria('alta', 'usuario', u.id, null, u);
    marcarCambios('usuarios');
  }
  DB.config.usuarioActualId = u.id;
  return u;
}

// ── Tras un login válido: verifica el email, carga la nube y arranca la app ──
async function onLoginOk() {
  loginLoading(true);
  let email = '', nombre = '';
  try {
    const { data } = await sb.auth.getUser();
    email = ((data && data.user && data.user.email) || '').toLowerCase().trim();
    nombre = (data && data.user && data.user.user_metadata && data.user.user_metadata.full_name) || '';
  } catch (e) {}

  const rol = resolverRolPorEmail(email);
  if (!rol) {
    try { await sb.auth.signOut(); } catch (e) {}
    loginLoading(false);
    loginError('Tu cuenta (' + (email || 'sin email') + ') no está autorizada. Pedile al administrador que te agregue.');
    mostrarPantallaLogin();
    return;
  }

  // Cargar los datos de la nube ANTES de tocar nada. Si falla, no arrancamos
  // (evita que un guardado posterior pise la nube con datos incompletos).
  try {
    await cargarDesdeNube();
  } catch (e) {
    console.error('cargarDesdeNube:', e);
    datosCargados = false; loginLoading(false);
    loginError('No se pudieron cargar los datos. Revisá tu conexión y volvé a entrar. (No se modificó nada.)');
    mostrarPantallaLogin();
    return;
  }

  _usuarioParaEmail(email, rol, nombre);   // deja al usuario actual con su rol
  ocultarPantallaLogin();
  const bs = document.getElementById('btnSalir'); if (bs) bs.style.display = '';   // botón Salir
  loginLoading(false);
  if (typeof init === 'function') { try { init(); } catch (e) {} }
}
