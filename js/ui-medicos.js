// ═══════════════════════════════════════════════════════════════════════════
//  SAM — ABM DE MÉDICOS  (Etapa 1)
// ───────────────────────────────────────────────────────────────────────────
//  Alta / edición / baja de médicos. Cada operación queda en auditoría.
//  Regla "sin huérfanos": no se puede borrar un médico con prestaciones,
//  reglas de reparto o liquidaciones asociadas → se ofrece inactivarlo.
//  Los médicos NO tienen cuenta en el sistema (no entran); son solo datos.
// ═══════════════════════════════════════════════════════════════════════════

const PALETA_MEDICOS = ['#2d5a8e', '#1d6a4a', '#7c3aed', '#b45309', '#be185d',
  '#0e7490', '#4d7c0f', '#9f1239', '#5b21b6', '#065f46', '#a16207', '#155e75'];

function _colorMedicoNuevo() {
  const usados = new Set(DB.medicos.map(m => m.color));
  return PALETA_MEDICOS.find(c => !usados.has(c)) || PALETA_MEDICOS[DB.medicos.length % PALETA_MEDICOS.length];
}

// Cuántos registros dependen de un médico (para bloquear el borrado con huérfanos).
function _referenciasMedico(id) {
  const n = Number(id);
  const prest = DB.prestacionesRealizadas.filter(p => p.medicoRealizadorId === n || p.medicoDerivadorId === n).length;
  const reglas = DB.reglasReparto.filter(r => r.medicoId === n).length;
  const liq = DB.pagosMedicos.filter(l => l.medicoId === n).length;
  return { prest, reglas, liq, total: prest + reglas + liq };
}

// ── Render de la grilla de médicos ──
function renderMedicos() {
  const cont = document.getElementById('medicosGrid');
  if (!cont) return;
  const meds = [...DB.medicos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

  if (meds.length === 0) {
    cont.innerHTML = '<p class="vacio">No hay médicos cargados todavía. Usá «+ Nuevo médico» para agregar el primero.</p>';
    return;
  }

  cont.innerHTML = meds.map(m => {
    const sede = (DB.sedes.find(s => s.id === m.sedeId) || {}).nombre || '—';
    const inactivo = m.estado === 'Inactivo';
    return `
    <div class="med-card${inactivo ? ' inactivo' : ''}" style="border-left:5px solid ${escHtml(m.color || '#888')}">
      <div class="med-head">
        <strong>${escHtml(m.nombre)}</strong>
        ${inactivo ? '<span class="badge-inactivo">Inactivo</span>' : ''}
      </div>
      <div class="med-datos">
        ${m.especialidad ? `<div>${escHtml(m.especialidad)}</div>` : ''}
        <div class="muted">Sede: ${escHtml(sede)}</div>
        ${m.matricula ? `<div class="muted">Mat.: ${escHtml(m.matricula)}</div>` : ''}
        ${m.cuit ? `<div class="muted">CUIT: ${escHtml(m.cuit)}</div>` : ''}
        ${m.tel ? `<div class="muted">Tel.: ${escHtml(m.tel)}</div>` : ''}
        ${m.email ? `<div class="muted">${escHtml(m.email)}</div>` : ''}
        ${m.cbu ? `<div class="muted">CBU: ${escHtml(m.cbu)}</div>` : ''}
      </div>
      <div class="med-acciones">
        <button onclick="editarMedico(${m.id})">Editar</button>
        <button onclick="toggleEstadoMedico(${m.id})">${inactivo ? 'Reactivar' : 'Inactivar'}</button>
        <button class="danger" onclick="eliminarMedico(${m.id})">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

// ── Modal alta/edición ──
function _poblarSedesModal() {
  const sel = document.getElementById('med_sede');
  if (!sel) return;
  sel.innerHTML = getSedesActivas().map(s => `<option value="${s.id}">${escHtml(s.nombre)}</option>`).join('');
}

function abrirNuevoMedico() {
  _setModalMedico({ id: '', nombre: '', especialidad: '', matricula: '', cuit: '', tel: '', email: '', cbu: '', sedeId: (getSedesActivas()[0] || {}).id, estado: 'Activo' });
  document.getElementById('modalMedicoTitulo').textContent = 'Nuevo médico';
  _mostrarModalMedico(true);
}

function editarMedico(id) {
  const m = DB.medicos.find(x => x.id === Number(id));
  if (!m) return;
  _setModalMedico(m);
  document.getElementById('modalMedicoTitulo').textContent = 'Editar médico';
  _mostrarModalMedico(true);
}

function _setModalMedico(m) {
  _poblarSedesModal();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('med_id', m.id);
  set('med_nombre', m.nombre);
  set('med_especialidad', m.especialidad);
  set('med_matricula', m.matricula);
  set('med_cuit', m.cuit);
  set('med_tel', m.tel);
  set('med_email', m.email);
  set('med_cbu', m.cbu);
  set('med_sede', m.sedeId);
  set('med_estado', m.estado || 'Activo');
}

function _mostrarModalMedico(on) {
  const modal = document.getElementById('modalMedico');
  if (modal) modal.style.display = on ? 'flex' : 'none';
}
function cerrarModalMedico() { _mostrarModalMedico(false); }

// Lee el formulario y devuelve el objeto médico (sin persistir).
function _leerFormMedico() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  return {
    nombre: val('med_nombre'),
    especialidad: val('med_especialidad'),
    matricula: val('med_matricula'),
    cuit: val('med_cuit'),
    tel: val('med_tel'),
    email: val('med_email'),
    cbu: val('med_cbu'),
    sedeId: Number(val('med_sede')) || (getSedesActivas()[0] || {}).id || null,
    estado: val('med_estado') || 'Activo',
    formaPago: 'Transferencia',
  };
}

// ── Guardar (alta o edición) ──
function guardarMedico() {
  const datos = _leerFormMedico();
  if (!datos.nombre) { alert('El nombre del médico es obligatorio.'); return false; }

  const idField = document.getElementById('med_id');
  const idEdit = idField && idField.value ? Number(idField.value) : null;

  if (idEdit) {
    const m = DB.medicos.find(x => x.id === idEdit);
    if (!m) return false;
    const antes = JSON.parse(JSON.stringify(m));
    Object.assign(m, datos);
    registrarAuditoria('edicion', 'medico', m.id, antes, m);
    marcarCambios('medicos');
    cerrarModalMedico();
    renderMedicos();
    return m;
  }

  const nuevo = { id: nuevoId(), ...datos, color: _colorMedicoNuevo(), creadoEn: new Date().toISOString() };
  DB.medicos.push(nuevo);
  registrarAuditoria('alta', 'medico', nuevo.id, null, nuevo);
  marcarCambios('medicos');
  cerrarModalMedico();
  renderMedicos();
  return nuevo;
}

// ── Inactivar / reactivar (baja lógica) ──
function toggleEstadoMedico(id) {
  const m = DB.medicos.find(x => x.id === Number(id));
  if (!m) return;
  const antes = JSON.parse(JSON.stringify(m));
  m.estado = (m.estado === 'Inactivo') ? 'Activo' : 'Inactivo';
  registrarAuditoria('edicion', 'medico', m.id, antes, m);
  marcarCambios('medicos');
  renderMedicos();
  return m;
}

// ── Eliminar (baja física). Bloquea si hay registros asociados (sin huérfanos). ──
function eliminarMedico(id) {
  const m = DB.medicos.find(x => x.id === Number(id));
  if (!m) return false;
  const ref = _referenciasMedico(m.id);
  if (ref.total > 0) {
    alert(`No se puede eliminar a ${m.nombre}: tiene ${ref.prest} prestación(es), ${ref.reglas} regla(s) de reparto y ${ref.liq} liquidación(es) asociadas.\n\nInactivalo en su lugar (deja de aparecer para cargar, pero conserva el historial).`);
    return false;
  }
  if (typeof confirm === 'function' && !confirm(`¿Eliminar definitivamente a ${m.nombre}? Esta acción queda registrada en auditoría.`)) return false;
  const antes = JSON.parse(JSON.stringify(m));
  DB.medicos = DB.medicos.filter(x => x.id !== m.id);
  registrarAuditoria('baja', 'medico', m.id, antes, null);
  marcarCambios('medicos');
  renderMedicos();
  return true;
}
