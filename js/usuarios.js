// ═══════════════════════════════════════════════════════════════════════════
//  SAM — USUARIOS, ROLES Y PERMISOS (Etapa 8)
// ───────────────────────────────────────────────────────────────────────────
//  Solo entran secretarias (con niveles) o el admin. Los médicos NO tienen cuenta.
//  Sin login todavía (Etapa 10): "actuando como" simula la sesión para probar
//  permisos y para que la auditoría atribuya cada cambio a la persona correcta.
//
//  Roles → secciones permitidas. Las zonas sensibles (caja, liquidaciones, admin)
//  son solo del admin. La config de % ya vive en Admin (admin-only).
// ═══════════════════════════════════════════════════════════════════════════

const ROL_LABEL = { admin: 'Administrador', secretaria_1: 'Secretaria (nivel 1)', secretaria_2: 'Secretaria (nivel 2)' };

const PERMISOS_SECCIONES = {
  admin: ['*'],
  secretaria_1: ['section-prestaciones'],
  secretaria_2: ['section-prestaciones'],
};

function rolActual() { return (usuarioActual() || {}).rol || 'admin'; }
function puedeVerSeccion(secId) {
  const perms = PERMISOS_SECCIONES[rolActual()] || [];
  return perms.includes('*') || perms.includes(secId);
}
function primeraSeccionPermitida() {
  const btns = document.querySelectorAll('#navTabs button');
  for (const b of btns) if (puedeVerSeccion(b.dataset.sec)) return b.dataset.sec;
  return null;
}

function setUsuarioActual(id) {
  DB.config.usuarioActualId = (id != null && id !== '') ? Number(id) : null;
  if (typeof marcarCambios === 'function') marcarCambios();
}

// ── ABM de usuarios ──
function _referenciasUsuario(id) {
  // Cuántas acciones de auditoría hizo (no se borra si tiene historial).
  return DB.auditoria.filter(a => a.usuarioId === Number(id)).length;
}

function guardarUsuarioDatos(datos, idEdit) {
  const nombre = (datos.nombre || '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio.');
  const email = (datos.email || '').trim();
  const rol = datos.rol || 'secretaria_2';
  if (!ROLES.includes(rol)) throw new Error('Rol inválido.');
  const dup = DB.usuarios.find(u => email && (u.email || '').toLowerCase() === email.toLowerCase() && u.id !== idEdit);
  if (dup) throw new Error('Ya existe un usuario con ese email.');

  if (idEdit) {
    const u = DB.usuarios.find(x => x.id === idEdit);
    if (!u) return false;
    // No dejar sin ningún admin activo.
    if (u.rol === 'admin' && rol !== 'admin' && DB.usuarios.filter(x => x.rol === 'admin' && x.estado !== 'Inactivo' && x.id !== u.id).length === 0) {
      throw new Error('Debe quedar al menos un administrador activo.');
    }
    const antes = JSON.parse(JSON.stringify(u));
    Object.assign(u, { nombre, email, rol, estado: datos.estado || u.estado || 'Activo' });
    registrarAuditoria('edicion', 'usuario', u.id, antes, u);
    marcarCambios('usuarios');
    return u;
  }
  const nuevo = { id: nuevoId(), nombre, email, rol, estado: 'Activo', creadoEn: new Date().toISOString() };
  DB.usuarios.push(nuevo);
  registrarAuditoria('alta', 'usuario', nuevo.id, null, nuevo);
  marcarCambios('usuarios');
  return nuevo;
}

function toggleEstadoUsuario(id) {
  const u = DB.usuarios.find(x => x.id === Number(id));
  if (!u) return false;
  if (u.rol === 'admin' && u.estado !== 'Inactivo' && DB.usuarios.filter(x => x.rol === 'admin' && x.estado !== 'Inactivo' && x.id !== u.id).length === 0) {
    throw new Error('Debe quedar al menos un administrador activo.');
  }
  const antes = JSON.parse(JSON.stringify(u));
  u.estado = (u.estado === 'Inactivo') ? 'Activo' : 'Inactivo';
  registrarAuditoria('edicion', 'usuario', u.id, antes, u);
  marcarCambios('usuarios');
  return u;
}

function eliminarUsuario(id) {
  const u = DB.usuarios.find(x => x.id === Number(id));
  if (!u) return { ok: false };
  if (u.rol === 'admin' && DB.usuarios.filter(x => x.rol === 'admin' && x.id !== u.id).length === 0) {
    return { ok: false, motivo: 'Debe quedar al menos un administrador.' };
  }
  if (_referenciasUsuario(u.id) > 0) return { ok: false, motivo: 'Tiene historial en auditoría; inactivalo en su lugar.' };
  const antes = JSON.parse(JSON.stringify(u));
  DB.usuarios = DB.usuarios.filter(x => x.id !== u.id);
  registrarAuditoria('baja', 'usuario', u.id, antes, null);
  marcarCambios('usuarios');
  return { ok: true };
}

// ── Consulta de auditoría con filtros ──
function listarAuditoria({ entidad = '', accion = '', usuarioId = '', texto = '' } = {}) {
  const t = (texto || '').trim().toLowerCase();
  return DB.auditoria
    .filter(a => (!entidad || a.entidad === entidad))
    .filter(a => (!accion || a.accion === accion))
    .filter(a => (!usuarioId || String(a.usuarioId) === String(usuarioId)))
    .filter(a => (!t || (a.entidad + ' ' + (a.usuario || '')).toLowerCase().includes(t)))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}
