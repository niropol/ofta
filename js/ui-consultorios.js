// ═══════════════════════════════════════════════════════════════════════════
//  SAM — CONSULTORIOS (dentro de una sede) + HORARIOS (agenda de médicos)
// ═══════════════════════════════════════════════════════════════════════════

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Con qué frecuencia del mes viene el médico ese día. 'todas' = todo el mes.
const FRECUENCIAS = [
  ['todas', 'Todas las semanas (todo el mes)'],
  ['1-3', '1ª y 3ª semana (cada 15 días)'],
  ['2-4', '2ª y 4ª semana (cada 15 días)'],
  ['1', 'Solo 1ª semana del mes'],
  ['2', 'Solo 2ª semana del mes'],
  ['3', 'Solo 3ª semana del mes'],
  ['4', 'Solo 4ª semana del mes'],
  ['unica', 'Una sola vez (fecha puntual)'],
];
function _fechaCorta(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');   // 2026-09-12 → 12/09
  return p.length === 3 ? p[2] + '/' + p[1] : iso;
}
// Etiqueta corta para mostrar en la grilla/tabla (vacío = todas las semanas).
function frecuenciaLabel(h) {
  const f = h.frecuencia || 'todas';
  if (f === 'unica') return h.fecha ? '1 vez: ' + _fechaCorta(h.fecha) : '1 sola vez';
  const map = { 'todas': '', '1-3': '1ª y 3ª sem.', '2-4': '2ª y 4ª sem.', '1': '1ª sem.', '2': '2ª sem.', '3': '3ª sem.', '4': '4ª sem.' };
  return map[f] || '';
}

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
  if (!nombre) { avisoUI('El nombre del consultorio es obligatorio.'); return false; }
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
  if (_referenciasConsultorio(c.id) > 0) { avisoUI('No se puede eliminar: está en uso por prestaciones u horarios. Inactivalo.'); return; }
  confirmarUI(`¿Eliminar el consultorio "${c.nombre}"?`).then(ok => {
    if (!ok) return;
    const antes = JSON.parse(JSON.stringify(c));
    DB.consultorios = DB.consultorios.filter(x => x.id !== c.id);
    registrarAuditoria('baja', 'consultorio', c.id, antes, null);
    marcarCambios('consultorios');
    if (typeof sincronizarUI === 'function') sincronizarUI(); else renderConsultorios();
  });
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

  // Días a mostrar: Lun–Sáb siempre; Domingo solo si tiene turnos. (Vista de solo
  // lectura: la agenda se edita en Admin ▸ Configuración ▸ Agenda.)
  const conTurnos = new Set(lista.map(h => h.dia));
  const dias = DIAS_SEMANA.filter((d, i) => i < 6 || conTurnos.has(d));

  const cols = dias.map(dia => {
    const delDia = lista
      .filter(h => h.dia === dia)
      .sort((a, b) => (a.horaDesde || '').localeCompare(b.horaDesde || ''));
    const bloques = delDia.length === 0
      ? '<div class="ag-vacio">—</div>'
      : delDia.map(h => {
          const color = _medicoColor(h.medicoId);
          const horas = (h.horaDesde || '') + (h.horaHasta ? '–' + h.horaHasta : '');
          const frec = frecuenciaLabel(h);
          return `
          <div class="ag-bloque" style="border-left-color:${color}">
            <div class="ag-hora">${escHtml(horas || 'sin hora')}</div>
            <div class="ag-medico">${escHtml(medicoNombre(h.medicoId))}</div>
            <div class="ag-cons">${escHtml(_nombreConsultorio(h.consultorioId))}</div>
            ${frec ? `<div class="ag-frec" style="font-size:11px;color:var(--muted);margin-top:2px">🗓 ${escHtml(frec)}</div>` : ''}
          </div>`;
        }).join('');
    return `<div class="ag-col"><div class="ag-dia">${escHtml(dia)}</div>${bloques}</div>`;
  }).join('');

  cont.innerHTML = `<div class="ag-grid" style="grid-template-columns:repeat(${dias.length},minmax(140px,1fr))">${cols}</div>`;
}

// ── Gestión de la agenda (Configuración): tabla con alta / edición / baja ──
function renderAgendaConfig() {
  renderHorarios();   // refresca también la grilla de solo lectura de Carga diaria
  const cont = document.getElementById('agendaAdminTabla');
  if (!cont) return;
  const lista = DB.horarios.slice().sort((a, b) =>
    (DIAS_SEMANA.indexOf(a.dia) - DIAS_SEMANA.indexOf(b.dia)) || (a.horaDesde || '').localeCompare(b.horaDesde || ''));
  if (!lista.length) { cont.innerHTML = '<p class="vacio">No hay horarios cargados. Usá «+ Nuevo horario».</p>'; return; }
  const rows = lista.map(h => {
    const horas = (h.horaDesde || '') + (h.horaHasta ? '–' + h.horaHasta : '');
    const frec = frecuenciaLabel(h) || 'Todas las semanas';
    return `<tr>
      <td>${escHtml(medicoNombre(h.medicoId))}</td>
      <td>${escHtml(h.dia || '')}</td>
      <td>${escHtml(horas || '—')}</td>
      <td>${escHtml(frec)}</td>
      <td>${escHtml(_nombreConsultorio(h.consultorioId))}</td>
      <td class="acc">
        <button onclick="editarHorarioUI(${h.id})">Editar</button>
        <button class="danger" onclick="eliminarHorario(${h.id})">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `<table class="tabla"><thead><tr>
      <th>Médico</th><th>Día</th><th>Horario</th><th>Frecuencia</th><th>Consultorio</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}
function _refrescarAgenda() {
  if (typeof renderAgendaConfig === 'function') renderAgendaConfig(); else renderHorarios();
}

function _mostrarModalHorario(on) { const m = document.getElementById('modalHorario'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalHorario() { _mostrarModalHorario(false); }

let _editHorarioId = null;   // null = alta nueva

function _poblarModalHorario() {
  document.getElementById('hor_dia').innerHTML = DIAS_SEMANA.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('hor_medico').innerHTML = getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')).map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
  document.getElementById('hor_consultorio').innerHTML = getConsultoriosActivos().map(c => `<option value="${c.id}">${escHtml(c.nombre)} · ${escHtml(_nombreSede(c.sedeId))}</option>`).join('');
  const frec = document.getElementById('hor_frec');
  if (frec) frec.innerHTML = FRECUENCIAS.map(f => `<option value="${f[0]}">${escHtml(f[1])}</option>`).join('');
}
// Muestra el campo de fecha solo cuando la frecuencia es "una sola vez".
function _horFrecChange() {
  const f = (document.getElementById('hor_frec') || {}).value;
  const wrap = document.getElementById('hor_fecha_wrap');
  if (wrap) wrap.style.display = (f === 'unica') ? '' : 'none';
}

function abrirNuevoHorario() {
  _editHorarioId = null;
  _poblarModalHorario();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('hor_desde', ''); set('hor_hasta', ''); set('hor_fecha', '');
  const frec = document.getElementById('hor_frec'); if (frec) frec.value = 'todas';
  _horFrecChange();
  const t = document.getElementById('hor_titulo'); if (t) t.textContent = 'Nuevo horario';
  _mostrarModalHorario(true);
}

function editarHorarioUI(id) {
  const h = DB.horarios.find(x => x.id === Number(id));
  if (!h) { avisoUI('No se encontró el horario.'); return; }
  _editHorarioId = h.id;
  _poblarModalHorario();
  const set = (elid, v) => { const el = document.getElementById(elid); if (el) el.value = v == null ? '' : v; };
  set('hor_medico', h.medicoId); set('hor_dia', h.dia || 'Lunes');
  set('hor_consultorio', h.consultorioId || '');
  set('hor_desde', h.horaDesde || ''); set('hor_hasta', h.horaHasta || '');
  set('hor_frec', h.frecuencia || 'todas'); set('hor_fecha', h.fecha || '');
  _horFrecChange();
  const t = document.getElementById('hor_titulo'); if (t) t.textContent = 'Editar horario';
  _mostrarModalHorario(true);
}

// Motor: crea/edita un horario (testeable, sin DOM).
function crearHorario(datos) {
  if (!datos || !Number(datos.medicoId)) throw new Error('Elegí un médico.');
  const frec = FRECUENCIAS.some(f => f[0] === datos.frecuencia) ? datos.frecuencia : 'todas';
  const h = {
    id: nuevoId(), medicoId: Number(datos.medicoId), consultorioId: Number(datos.consultorioId) || null,
    dia: datos.dia || 'Lunes', horaDesde: datos.horaDesde || '', horaHasta: datos.horaHasta || '',
    frecuencia: frec, fecha: frec === 'unica' ? (datos.fecha || '') : '',
  };
  DB.horarios.push(h);
  registrarAuditoria('alta', 'horario', h.id, null, h);
  marcarCambios('horarios');
  return h;
}
function editarHorario(id, datos) {
  const h = DB.horarios.find(x => x.id === Number(id));
  if (!h) return false;
  if (!Number(datos.medicoId)) throw new Error('Elegí un médico.');
  const antes = JSON.parse(JSON.stringify(h));
  const frec = FRECUENCIAS.some(f => f[0] === datos.frecuencia) ? datos.frecuencia : 'todas';
  h.medicoId = Number(datos.medicoId); h.consultorioId = Number(datos.consultorioId) || null;
  h.dia = datos.dia || 'Lunes'; h.horaDesde = datos.horaDesde || ''; h.horaHasta = datos.horaHasta || '';
  h.frecuencia = frec; h.fecha = frec === 'unica' ? (datos.fecha || '') : '';
  registrarAuditoria('edicion', 'horario', h.id, antes, h);
  marcarCambios('horarios');
  return h;
}

function guardarHorario() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const datos = {
    medicoId: Number(val('hor_medico')), consultorioId: Number(val('hor_consultorio')) || null,
    dia: val('hor_dia'), horaDesde: val('hor_desde'), horaHasta: val('hor_hasta'),
    frecuencia: val('hor_frec'), fecha: val('hor_fecha'),
  };
  try {
    if (_editHorarioId != null) editarHorario(_editHorarioId, datos); else crearHorario(datos);
  } catch (e) { avisoUI(e.message); return false; }
  _editHorarioId = null;
  cerrarModalHorario();
  _refrescarAgenda();
  return true;
}

function eliminarHorario(id) {
  const h = DB.horarios.find(x => x.id === Number(id));
  if (!h) return;
  DB.horarios = DB.horarios.filter(x => x.id !== h.id);
  registrarAuditoria('baja', 'horario', h.id, h, null);
  marcarCambios('horarios');
  _refrescarAgenda();
}
