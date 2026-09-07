// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de USUARIOS / PERMISOS / AUDITORÍA (Etapa 8)
// ═══════════════════════════════════════════════════════════════════════════

// ── "Actuando como" (simula la sesión hasta la Etapa 10) ──
function poblarActuandoComo() {
  const sel = document.getElementById('actuandoComo');
  if (!sel) return;
  const activos = DB.usuarios.filter(u => u.estado !== 'Inactivo');
  const actual = usuarioActual();
  sel.innerHTML = activos.map(u => `<option value="${u.id}"${u.id === actual.id ? ' selected' : ''}>${escHtml(u.nombre)} · ${escHtml(ROL_LABEL[u.rol] || u.rol)}</option>`).join('');
}

function cambiarActuandoComo() {
  const sel = document.getElementById('actuandoComo');
  if (!sel) return;
  setUsuarioActual(sel.value);
  aplicarPermisos();
}

// ── Permisos: oculta las secciones no permitidas y redirige si hace falta ──
function aplicarPermisos() {
  document.querySelectorAll('#navTabs button').forEach(b => {
    b.hidden = !puedeVerSeccion(b.dataset.sec);
  });
  const activa = document.querySelector('.section.active');
  if (!activa || !puedeVerSeccion(activa.id)) {
    const dest = primeraSeccionPermitida();
    if (dest) showSection(dest);
  }
}

// ── ABM de usuarios ──
function renderUsuarios() {
  const cont = document.getElementById('usuariosTabla');
  if (!cont) return;
  const rows = DB.usuarios.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')).map(u => {
    const inactivo = u.estado === 'Inactivo';
    return `<tr class="${inactivo ? 'fila-inactiva' : ''}">
      <td>${escHtml(u.nombre)}${inactivo ? ' <span class="badge-inactivo">Inactivo</span>' : ''}</td>
      <td>${escHtml(u.email || '—')}</td>
      <td>${escHtml(ROL_LABEL[u.rol] || u.rol)}</td>
      <td class="acc">
        <button onclick="editarUsuarioUI(${u.id})">Editar</button>
        <button onclick="toggleEstadoUsuarioUI(${u.id})">${inactivo ? 'Reactivar' : 'Inactivar'}</button>
        <button class="danger" onclick="eliminarUsuarioUI(${u.id})">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Acciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _mostrarModalUsuario(on) { const m = document.getElementById('modalUsuario'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalUsuario() { _mostrarModalUsuario(false); }

function _opcionesRol(sel) { return ROLES.map(r => `<option value="${r}"${r === sel ? ' selected' : ''}>${escHtml(ROL_LABEL[r] || r)}</option>`).join(''); }

function abrirNuevoUsuario() {
  document.getElementById('modalUsuarioTitulo').textContent = 'Nuevo usuario';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('usr_id', ''); set('usr_nombre', ''); set('usr_email', '');
  document.getElementById('usr_rol').innerHTML = _opcionesRol('secretaria_2');
  set('usr_estado', 'Activo');
  _mostrarModalUsuario(true);
}

function editarUsuarioUI(id) {
  const u = DB.usuarios.find(x => x.id === Number(id));
  if (!u) return;
  document.getElementById('modalUsuarioTitulo').textContent = 'Editar usuario';
  const set = (idf, v) => { const el = document.getElementById(idf); if (el) el.value = v == null ? '' : v; };
  set('usr_id', u.id); set('usr_nombre', u.nombre); set('usr_email', u.email);
  document.getElementById('usr_rol').innerHTML = _opcionesRol(u.rol);
  set('usr_estado', u.estado || 'Activo');
  _mostrarModalUsuario(true);
}

function guardarUsuario() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const idEdit = val('usr_id') ? Number(val('usr_id')) : null;
  try {
    guardarUsuarioDatos({ nombre: val('usr_nombre'), email: val('usr_email'), rol: val('usr_rol'), estado: val('usr_estado') }, idEdit);
  } catch (e) { alert(e.message); return false; }
  cerrarModalUsuario();
  renderUsuarios(); poblarActuandoComo();
  return true;
}

function toggleEstadoUsuarioUI(id) {
  try { toggleEstadoUsuario(id); } catch (e) { alert(e.message); return; }
  renderUsuarios(); poblarActuandoComo(); aplicarPermisos();
}

function eliminarUsuarioUI(id) {
  if (typeof confirm === 'function' && !confirm('¿Eliminar este usuario? Queda registrado en auditoría.')) return;
  const r = eliminarUsuario(id);
  if (!r.ok) { alert('No se puede eliminar: ' + (r.motivo || '')); return; }
  renderUsuarios(); poblarActuandoComo();
}

// ── Visor de auditoría ──
function _diffResumen(a) {
  if (a.accion === 'alta') return 'creado';
  if (a.accion === 'baja') return 'eliminado';
  if (a.accion === 'anulacion') return 'anulado';
  if (!a.antes || !a.despues) return '';
  const campos = new Set([...Object.keys(a.antes), ...Object.keys(a.despues)]);
  const cambios = [];
  campos.forEach(k => {
    if (k === 'id') return;
    const av = JSON.stringify(a.antes[k]); const dv = JSON.stringify(a.despues[k]);
    if (av !== dv && cambios.length < 6) cambios.push(`${k}: ${_corto(a.antes[k])} → ${_corto(a.despues[k])}`);
  });
  return cambios.join(' · ') || 'sin cambios de campos';
}
function _corto(v) {
  if (v == null) return '∅';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 24 ? s.slice(0, 22) + '…' : s;
}

function renderAuditoria() {
  const cont = document.getElementById('auditoriaTabla');
  if (!cont) return;
  const gv = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const lista = listarAuditoria({ entidad: gv('audEntidad'), accion: gv('audAccion'), texto: gv('audBuscar') }).slice(0, 200);

  // Poblar el filtro de entidad una vez.
  const selEnt = document.getElementById('audEntidad');
  if (selEnt && !selEnt.dataset.listo) {
    const entidades = [...new Set(DB.auditoria.map(a => a.entidad))].sort();
    selEnt.innerHTML = '<option value="">Toda entidad</option>' + entidades.map(e => `<option value="${e}">${escHtml(e)}</option>`).join('');
    selEnt.dataset.listo = '1';
  }

  if (lista.length === 0) { cont.innerHTML = '<p class="vacio">Sin registros de auditoría para este filtro.</p>'; return; }
  const rows = lista.map(a => `
    <tr>
      <td>${escHtml(new Date(a.fecha).toLocaleString('es-AR'))}</td>
      <td>${escHtml(a.usuario || '')}</td>
      <td>${escHtml(a.accion)}</td>
      <td>${escHtml(a.entidad)} <span class="muted">#${escHtml(String(a.entidadId))}</span></td>
      <td class="muted">${escHtml(_diffResumen(a))}</td>
    </tr>`).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Cambios</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderUsuariosYAuditoria() {
  poblarActuandoComo();
  renderUsuarios();
  renderAuditoria();
  aplicarPermisos();
}
