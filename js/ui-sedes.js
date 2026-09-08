// ═══════════════════════════════════════════════════════════════════════════
//  SAM — ABM DE SEDES
// ───────────────────────────────────────────────────────────────────────────
//  Hoy hay una sola sede (SAM), pero se pueden agregar/editar. Todo el sistema
//  usa sedeId, así que sumar una sede no requiere migrar nada.
// ═══════════════════════════════════════════════════════════════════════════

function _referenciasSede(id) {
  const n = Number(id);
  const med = DB.medicos.filter(m => m.sedeId === n).length;
  const prest = DB.prestacionesRealizadas.filter(p => p.sedeId === n).length;
  const caja = DB.cajaMovimientos.filter(m => m.sedeId === n).length;
  return { med, prest, caja, total: med + prest + caja };
}

function renderSedes() {
  const cont = document.getElementById('sedesTabla');
  if (!cont) return;
  const rows = [...DB.sedes].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')).map(s => {
    const inactiva = s.estado === 'Inactiva';
    const activa = s.id === sedeActiva();
    return `<tr class="${inactiva ? 'fila-inactiva' : ''}">
      <td>${escHtml(s.nombre)}${activa ? ' <span class="badge-inactivo" style="background:#dbeafe;color:#1e40af">activa por defecto</span>' : ''}${inactiva ? ' <span class="badge-inactivo">Inactiva</span>' : ''}</td>
      <td class="acc">
        <button onclick="editarSede(${s.id})">Editar</button>
        <button onclick="marcarSedeActiva(${s.id})">Usar por defecto</button>
        <button onclick="toggleEstadoSede(${s.id})">${inactiva ? 'Reactivar' : 'Inactivar'}</button>
        <button class="danger" onclick="eliminarSede(${s.id})">Eliminar</button>
      </td></tr>`;
  }).join('');
  cont.innerHTML = `<table class="tabla"><thead><tr><th>Sede</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function _mostrarModalSede(on) { const m = document.getElementById('modalSede'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalSede() { _mostrarModalSede(false); }

function abrirNuevaSede() {
  document.getElementById('modalSedeTitulo').textContent = 'Nueva sede';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('sede_id', ''); set('sede_nombre', ''); set('sede_estado', 'Activa');
  _mostrarModalSede(true);
}

function editarSede(id) {
  const s = DB.sedes.find(x => x.id === Number(id));
  if (!s) return;
  document.getElementById('modalSedeTitulo').textContent = 'Editar sede';
  const set = (idf, v) => { const el = document.getElementById(idf); if (el) el.value = v == null ? '' : v; };
  set('sede_id', s.id); set('sede_nombre', s.nombre); set('sede_estado', s.estado || 'Activa');
  _mostrarModalSede(true);
}

function guardarSede() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const nombre = val('sede_nombre');
  if (!nombre) { alert('El nombre de la sede es obligatorio.'); return false; }
  const idEdit = val('sede_id') ? Number(val('sede_id')) : null;
  const dup = DB.sedes.find(s => (s.nombre || '').toLowerCase() === nombre.toLowerCase() && s.id !== idEdit);
  if (dup) { alert('Ya existe una sede con ese nombre.'); return false; }

  if (idEdit) {
    const s = DB.sedes.find(x => x.id === idEdit);
    if (!s) return false;
    const antes = JSON.parse(JSON.stringify(s));
    s.nombre = nombre; s.estado = val('sede_estado') || 'Activa';
    registrarAuditoria('edicion', 'sede', s.id, antes, s);
  } else {
    const nueva = { id: nuevoId(), nombre, estado: val('sede_estado') || 'Activa' };
    DB.sedes.push(nueva);
    registrarAuditoria('alta', 'sede', nueva.id, null, nueva);
  }
  marcarCambios('sedes');
  cerrarModalSede();
  if (typeof sincronizarUI === 'function') sincronizarUI();
  return true;
}

function marcarSedeActiva(id) {
  const s = DB.sedes.find(x => x.id === Number(id));
  if (!s || s.estado === 'Inactiva') { alert('La sede debe estar activa.'); return; }
  DB.config.sedeActiva = s.id;
  marcarCambios();
  renderSedes();
}

function toggleEstadoSede(id) {
  const s = DB.sedes.find(x => x.id === Number(id));
  if (!s) return;
  if (s.estado !== 'Inactiva' && DB.sedes.filter(x => x.estado !== 'Inactiva' && x.id !== s.id).length === 0) {
    alert('Debe quedar al menos una sede activa.'); return;
  }
  const antes = JSON.parse(JSON.stringify(s));
  s.estado = (s.estado === 'Inactiva') ? 'Activa' : 'Inactiva';
  if (s.id === sedeActiva() && s.estado === 'Inactiva') {
    const otra = DB.sedes.find(x => x.estado !== 'Inactiva');
    if (otra) DB.config.sedeActiva = otra.id;
  }
  registrarAuditoria('edicion', 'sede', s.id, antes, s);
  marcarCambios('sedes');
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderSedes();
}

function eliminarSede(id) {
  const s = DB.sedes.find(x => x.id === Number(id));
  if (!s) return;
  const ref = _referenciasSede(s.id);
  if (ref.total > 0) { alert(`No se puede eliminar "${s.nombre}": tiene ${ref.med} médico(s), ${ref.prest} prestación(es) y ${ref.caja} movimiento(s) de caja. Inactivala en su lugar.`); return; }
  if (DB.sedes.filter(x => x.id !== s.id).length === 0) { alert('Debe existir al menos una sede.'); return; }
  if (typeof confirm === 'function' && !confirm(`¿Eliminar la sede "${s.nombre}"? Queda en auditoría.`)) return;
  const antes = JSON.parse(JSON.stringify(s));
  DB.sedes = DB.sedes.filter(x => x.id !== s.id);
  if (sedeActiva() === s.id) DB.config.sedeActiva = DB.sedes[0].id;
  registrarAuditoria('baja', 'sede', s.id, antes, null);
  marcarCambios('sedes');
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderSedes();
}
