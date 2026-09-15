// ═══════════════════════════════════════════════════════════════════════════
//  SAM — CONSULTORIOS (dentro de una sede) + HORARIOS (agenda de médicos)
// ═══════════════════════════════════════════════════════════════════════════

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function _nombreSede(id) { return (DB.sedes.find(s => s.id === Number(id)) || {}).nombre || '—'; }
function _nombreConsultorio(id) { return (DB.consultorios.find(c => c.id === Number(id)) || {}).nombre || '—'; }

// ── Consultorios ──
function _referenciasConsultorio(id) {
  return DB.prestacionesRealizadas.filter(p => p.consultorioId === Number(id)).length +
    DB.horarios.filter(h => h.consultorioId === Number(id)).length;
}

function renderConsultorios() {
  const cont = document.getElementById('consultoriosTabla');
  if (!cont) return;
  const lista = [...DB.consultorios].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  if (lista.length === 0) { cont.innerHTML = '<p class="vacio">No hay consultorios. Usá «+ Nuevo consultorio».</p>'; return; }
  const rows = lista.map(c => {
    const inactivo = c.estado === 'Inactiva';
    return `<tr class="${inactivo ? 'fila-inactiva' : ''}">
      <td>${escHtml(c.nombre)}${inactivo ? ' <span class="badge-inactivo">Inactivo</span>' : ''}</td>
      <td>${escHtml(_nombreSede(c.sedeId))}</td>
      <td class="acc">
        <button onclick="editarConsultorio(${c.id})">Editar</button>
        <button onclick="toggleEstadoConsultorio(${c.id})">${inactivo ? 'Reactivar' : 'Inactivar'}</button>
        <button class="danger" onclick="eliminarConsultorio(${c.id})">Eliminar</button>
      </td></tr>`;
  }).join('');
  cont.innerHTML = `<table class="tabla"><thead><tr><th>Consultorio</th><th>Sede</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function _mostrarModalCons(on) { const m = document.getElementById('modalConsultorio'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalConsultorio() { _mostrarModalCons(false); }

function _optsSedesCons(sel) { return getSedesActivas().map(s => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${escHtml(s.nombre)}</option>`).join(''); }

function abrirNuevoConsultorio() {
  document.getElementById('modalConsultorioTitulo').textContent = 'Nuevo consultorio';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('cons_id', ''); set('cons_nombre', '');
  document.getElementById('cons_sede').innerHTML = _optsSedesCons(sedeActiva());
  set('cons_estado', 'Activa');
  _mostrarModalCons(true);
}

function editarConsultorio(id) {
  const c = DB.consultorios.find(x => x.id === Number(id));
  if (!c) return;
  document.getElementById('modalConsultorioTitulo').textContent = 'Editar consultorio';
  const set = (idf, v) => { const el = document.getElementById(idf); if (el) el.value = v == null ? '' : v; };
  set('cons_id', c.id); set('cons_nombre', c.nombre);
  document.getElementById('cons_sede').innerHTML = _optsSedesCons(c.sedeId);
  set('cons_estado', c.estado || 'Activa');
  _mostrarModalCons(true);
}

function guardarConsultorio() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const nombre = val('cons_nombre');
  if (!nombre) { alert('El nombre del consultorio es obligatorio.'); return false; }
  const idEdit = val('cons_id') ? Number(val('cons_id')) : null;
  const sedeId = Number(val('cons_sede')) || sedeActiva();
  if (idEdit) {
    const c = DB.consultorios.find(x => x.id === idEdit);
    if (!c) return false;
    const antes = JSON.parse(JSON.stringify(c));
    Object.assign(c, { nombre, sedeId, estado: val('cons_estado') || 'Activa' });
    registrarAuditoria('edicion', 'consultorio', c.id, antes, c);
  } else {
    const nuevo = { id: nuevoId(), nombre, sedeId, estado: val('cons_estado') || 'Activa' };
    DB.consultorios.push(nuevo);
    registrarAuditoria('alta', 'consultorio', nuevo.id, null, nuevo);
  }
  marcarCambios('consultorios');
  cerrarModalConsultorio();
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderConsultorios();
  return true;
}

function toggleEstadoConsultorio(id) {
  const c = DB.consultorios.find(x => x.id === Number(id));
  if (!c) return;
  const antes = JSON.parse(JSON.stringify(c));
  c.estado = (c.estado === 'Inactiva') ? 'Activa' : 'Inactiva';
  registrarAuditoria('edicion', 'consultorio', c.id, antes, c);
  marcarCambios('consultorios');
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderConsultorios();
}

function eliminarConsultorio(id) {
  const c = DB.consultorios.find(x => x.id === Number(id));
  if (!c) return;
  if (_referenciasConsultorio(c.id) > 0) { alert('No se puede eliminar: está en uso por prestaciones u horarios. Inactivalo.'); return; }
  if (typeof confirm === 'function' && !confirm(`¿Eliminar el consultorio "${c.nombre}"?`)) return;
  const antes = JSON.parse(JSON.stringify(c));
  DB.consultorios = DB.consultorios.filter(x => x.id !== c.id);
  registrarAuditoria('baja', 'consultorio', c.id, antes, null);
  marcarCambios('consultorios');
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderConsultorios();
}

// ── Agenda semanal (grilla): columnas = días, bloques por médico ──
function _medicoColor(id) { const m = DB.medicos.find(x => x.id === Number(id)); return (m && m.color) || '#64748b'; }

// Puebla el filtro de consultorio (Todos + activos), preservando la selección.
function _poblarFiltroConsultorioAgenda() {
  const sel = document.getElementById('agFiltroConsultorio');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los consultorios</option>' +
    getConsultoriosActivos().map(c => `<option value="${c.id}">${escHtml(c.nombre)} · ${escHtml(_nombreSede(c.sedeId))}</option>`).join('');
  if (cur) sel.value = cur;
}

function renderHorarios() {
  const cont = document.getElementById('horariosTabla');
  if (!cont) return;
  _poblarFiltroConsultorioAgenda();
  const filtroCons = (document.getElementById('agFiltroConsultorio') || {}).value || '';

  let lista = DB.horarios.slice();
  if (filtroCons) lista = lista.filter(h => Number(h.consultorioId) === Number(filtroCons));

  if (lista.length === 0) {
    cont.innerHTML = '<p class="vacio">No hay horarios cargados' + (filtroCons ? ' para este consultorio' : '') + '. Usá «+ Nuevo horario».</p>';
    return;
  }

  // Días a mostrar: Lun–Vie siempre; Sáb/Dom solo si tienen turnos.
  const conTurnos = new Set(lista.map(h => h.dia));
  const dias = DIAS_SEMANA.filter((d, i) => i < 5 || conTurnos.has(d));

  const cols = dias.map(dia => {
    const delDia = lista
      .filter(h => h.dia === dia)
      .sort((a, b) => (a.horaDesde || '').localeCompare(b.horaDesde || ''));
    const bloques = delDia.length === 0
      ? '<div class="ag-vacio">—</div>'
      : delDia.map(h => {
          const color = _medicoColor(h.medicoId);
          const horas = (h.horaDesde || '') + (h.horaHasta ? '–' + h.horaHasta : '');
          return `
          <div class="ag-bloque" style="border-left-color:${color}">
            <button class="ag-del" title="Eliminar" onclick="eliminarHorario(${h.id})">✕</button>
            <div class="ag-hora">${escHtml(horas || 'sin hora')}</div>
            <div class="ag-medico">${escHtml(medicoNombre(h.medicoId))}</div>
            <div class="ag-cons">${escHtml(_nombreConsultorio(h.consultorioId))}</div>
          </div>`;
        }).join('');
    return `<div class="ag-col"><div class="ag-dia">${escHtml(dia)}</div>${bloques}</div>`;
  }).join('');

  cont.innerHTML = `<div class="ag-grid" style="grid-template-columns:repeat(${dias.length},minmax(140px,1fr))">${cols}</div>`;
}

function _mostrarModalHorario(on) { const m = document.getElementById('modalHorario'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalHorario() { _mostrarModalHorario(false); }

function abrirNuevoHorario() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  document.getElementById('hor_dia').innerHTML = DIAS_SEMANA.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('hor_medico').innerHTML = getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')).map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
  document.getElementById('hor_consultorio').innerHTML = getConsultoriosActivos().map(c => `<option value="${c.id}">${escHtml(c.nombre)} · ${escHtml(_nombreSede(c.sedeId))}</option>`).join('');
  set('hor_desde', ''); set('hor_hasta', '');
  _mostrarModalHorario(true);
}

function guardarHorario() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const medicoId = Number(val('hor_medico'));
  if (!medicoId) { alert('Elegí un médico.'); return false; }
  const nuevo = {
    id: nuevoId(), medicoId, consultorioId: Number(val('hor_consultorio')) || null,
    dia: val('hor_dia'), horaDesde: val('hor_desde'), horaHasta: val('hor_hasta'),
  };
  DB.horarios.push(nuevo);
  registrarAuditoria('alta', 'horario', nuevo.id, null, nuevo);
  marcarCambios('horarios');
  cerrarModalHorario();
  renderHorarios();
  return true;
}

function eliminarHorario(id) {
  const h = DB.horarios.find(x => x.id === Number(id));
  if (!h) return;
  DB.horarios = DB.horarios.filter(x => x.id !== h.id);
  registrarAuditoria('baja', 'horario', h.id, h, null);
  marcarCambios('horarios');
  renderHorarios();
}
