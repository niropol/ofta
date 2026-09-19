// ═══════════════════════════════════════════════════════════════════════════
//  OFTA — UI de DERIVACIONES QUIRÚRGICAS
// ═══════════════════════════════════════════════════════════════════════════

function _cirugiasNom() { return listarPrestaciones({ categoria: 'cirugia', incluirInactivos: false }); }
function _nombreCirugia(g) { const v = versionActual(Number(g)); return v ? v.descripcion : '—'; }

const _DERIV_ESTADO_LABEL = { pendiente: 'Pendiente', programada: 'Programada', realizada: 'Realizada', cancelada: 'Cancelada' };
const _DERIV_ESTADO_CLASE = { pendiente: 'badge-warn', programada: 'badge-ok', realizada: 'badge-ok', cancelada: 'badge-inactivo' };

function renderDerivaciones() {
  const cont = document.getElementById('derivacionesTabla');
  if (!cont) return;

  // Filtro por médico (poblar una vez con médicos activos).
  const selMed = document.getElementById('derivFiltroMedico');
  if (selMed) {
    const cur = selMed.value;
    selMed.innerHTML = '<option value="">Todos</option>' +
      getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
        .map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
    if (cur) selMed.value = cur;
  }

  // Resumen por estado.
  const res = resumenDerivaciones();
  const box = document.getElementById('derivResumen');
  if (box) {
    const card = (t, v, extra) => `<div class="saldo-card ${extra || ''}"><div class="saldo-titulo">${t}</div><div class="saldo-monto">${v}</div></div>`;
    box.innerHTML =
      card('Pendientes', res.pendiente, res.urgentesPendientes ? 'alerta' : '') +
      card('Programadas', res.programada) +
      card('Realizadas', res.realizada) +
      (res.urgentesPendientes ? card('⚠ Urgentes s/ programar', res.urgentesPendientes, 'alerta') : '');
  }

  const estado = (document.getElementById('derivFiltroEstado') || {}).value || '';
  const medico = (document.getElementById('derivFiltroMedico') || {}).value || '';
  const filas = listarDerivaciones({ estado, medicoDerivadorId: medico || null });
  if (!filas.length) { cont.innerHTML = '<p class="vacio">No hay derivaciones para ese filtro. Cargá una con «+ Nueva derivación».</p>'; return; }

  const rows = filas.map(d => {
    const pac = [d.pacienteApellido, d.pacienteNombre].filter(Boolean).join(', ') || '(sin paciente)';
    const urg = d.urgencia === 'urgente' ? ' <span class="badge-inactivo">URGENTE</span>' : '';
    const prog = d.fechaProgramada ? '<br><span class="muted" style="font-size:11px">📅 ' + escHtml(d.fechaProgramada) + '</span>' : '';
    const estadoBadge = `<span class="${_DERIV_ESTADO_CLASE[d.estado] || 'muted'}">${_DERIV_ESTADO_LABEL[d.estado] || d.estado}</span>`;
    let acciones = '';
    if (d.estado === 'pendiente') acciones += `<button onclick="programarDerivacionUI(${d.id})">Programar</button>`;
    if (d.estado === 'programada') acciones += `<button onclick="cambiarEstadoDerivUI(${d.id},'realizada')">Realizada</button>`;
    if (d.estado === 'realizada' && !d.prestacionId) acciones += `<button onclick="cargarDerivacionComoPrestacionUI(${d.id})" title="Cargar en la carga diaria para facturar">→ Facturar</button>`;
    if (d.estado === 'realizada' && d.prestacionId) acciones += '<span class="muted" style="font-size:11px">facturada</span> ';
    if (d.estado !== 'realizada' && d.estado !== 'cancelada') acciones += `<button onclick="cambiarEstadoDerivUI(${d.id},'cancelada')">Cancelar</button>`;
    acciones += `<button onclick="editarDerivacionUI(${d.id})" title="Editar">✎</button>`;
    acciones += `<button class="danger" onclick="eliminarDerivacionUI(${d.id})" title="Eliminar">🗑</button>`;
    return `<tr>
      <td>${escHtml(pac)}${urg}${d.pacienteDni ? '<br><span class="muted" style="font-size:11px">DNI ' + escHtml(d.pacienteDni) + '</span>' : ''}</td>
      <td>${escHtml(_nombreCirugia(d.grupoNomenclador))}${d.obraSocial ? '<br><span class="muted" style="font-size:11px">' + escHtml(d.obraSocial) + '</span>' : ''}</td>
      <td>${escHtml(medicoNombre(d.medicoDerivadorId))}</td>
      <td>${estadoBadge}${prog}</td>
      <td class="acc">${acciones}</td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Paciente</th><th>Cirugía / OS</th><th>Deriva</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Modal alta / edición ──
function _mostrarModalDeriv(on) { const m = document.getElementById('modalDeriv'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalDeriv() { _mostrarModalDeriv(false); }

function _poblarSelectsDeriv() {
  const cirugias = _cirugiasNom();
  const selG = document.getElementById('deriv_grupo');
  if (selG) selG.innerHTML = cirugias.length
    ? cirugias.map(c => `<option value="${c.grupo}">${escHtml(c.descripcion)}</option>`).join('')
    : '<option value="">(cargá cirugías en Contratos)</option>';
  const meds = getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const opts = meds.map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
  const selD = document.getElementById('deriv_derivador'); if (selD) selD.innerHTML = opts;
  const selC = document.getElementById('deriv_cirujano'); if (selC) selC.innerHTML = '<option value="">(sin asignar)</option>' + opts;
}

function abrirNuevaDerivacion() {
  document.getElementById('modalDerivTitulo').textContent = 'Nueva derivación';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  _poblarSelectsDeriv();
  ['deriv_id', 'deriv_apellido', 'deriv_nombre', 'deriv_dni', 'deriv_os', 'deriv_notas', 'deriv_fechaProg'].forEach(id => set(id, ''));
  set('deriv_urgencia', 'normal');
  _mostrarModalDeriv(true);
}

function editarDerivacionUI(id) {
  const d = DB.derivaciones.find(x => x.id === Number(id));
  if (!d) return;
  document.getElementById('modalDerivTitulo').textContent = 'Editar derivación';
  _poblarSelectsDeriv();
  const set = (idf, v) => { const el = document.getElementById(idf); if (el) el.value = v == null ? '' : v; };
  set('deriv_id', d.id); set('deriv_apellido', d.pacienteApellido); set('deriv_nombre', d.pacienteNombre);
  set('deriv_dni', d.pacienteDni); set('deriv_os', d.obraSocial); set('deriv_grupo', d.grupoNomenclador);
  set('deriv_derivador', d.medicoDerivadorId); set('deriv_cirujano', d.medicoCirujanoId || '');
  set('deriv_urgencia', d.urgencia); set('deriv_fechaProg', d.fechaProgramada || ''); set('deriv_notas', d.notas);
  _mostrarModalDeriv(true);
}

function guardarDerivacion() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const datos = {
    pacienteApellido: val('deriv_apellido'), pacienteNombre: val('deriv_nombre'), pacienteDni: val('deriv_dni'),
    obraSocial: val('deriv_os'), grupoNomenclador: val('deriv_grupo'),
    medicoDerivadorId: val('deriv_derivador'), medicoCirujanoId: val('deriv_cirujano') || null,
    urgencia: val('deriv_urgencia'), fechaProgramada: val('deriv_fechaProg') || null, notas: val('deriv_notas'),
  };
  const id = val('deriv_id');
  try {
    if (id) {
      editarDerivacion(Number(id), datos);
      // Poner fecha programada a una derivación pendiente la pasa a «programada».
      const d = DB.derivaciones.find(x => x.id === Number(id));
      if (d && d.estado === 'pendiente' && datos.fechaProgramada) cambiarEstadoDerivacion(Number(id), 'programada', { fechaProgramada: datos.fechaProgramada });
    } else {
      crearDerivacion(datos);
    }
  } catch (e) { alert(e.message); return; }
  cerrarModalDeriv();
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderDerivaciones();
}

// «Programar»: abre el editor con la fecha por defecto en hoy; al guardar, pasa a programada.
function programarDerivacionUI(id) {
  editarDerivacionUI(id);
  const fp = document.getElementById('deriv_fechaProg');
  if (fp && !fp.value) fp.value = hoyISO();
}

function cambiarEstadoDerivUI(id, estado) {
  const msg = estado === 'cancelada' ? '¿Cancelar esta derivación?' : '¿Marcar la derivación como ' + (_DERIV_ESTADO_LABEL[estado] || estado) + '?';
  confirmarUI(msg).then(ok => {
    if (!ok) return;
    try { cambiarEstadoDerivacion(id, estado); } catch (e) { alert(e.message); return; }
    if (typeof sincronizarUI === 'function') sincronizarUI(); else renderDerivaciones();
  });
}

function eliminarDerivacionUI(id) {
  confirmarUI('¿Eliminar esta derivación? Queda en auditoría.').then(ok => {
    if (!ok) return;
    eliminarDerivacion(id);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else renderDerivaciones();
  });
}

// Carga una derivación realizada como cirugía en la carga diaria (para facturar).
function cargarDerivacionComoPrestacionUI(id) {
  const d = DB.derivaciones.find(x => x.id === Number(id));
  if (!d) return;
  if (!d.medicoCirujanoId) { alert('Asigná el cirujano (✎ editar) antes de cargarla para facturar.'); return; }
  confirmarUI('¿Cargar esta cirugía como prestación para facturar? Se registra en la carga diaria con el derivador.').then(ok => {
    if (!ok) return;
    let reg;
    try {
      reg = registrarPrestacion({
        fecha: d.fechaProgramada || hoyISO(),
        categoria: 'cirugia',
        grupoNomenclador: d.grupoNomenclador,
        medicoRealizadorId: d.medicoCirujanoId || null,
        medicoDerivadorId: d.medicoDerivadorId,
        obraSocial: d.obraSocial || 'Particular',
        paciente: { apellido: d.pacienteApellido, nombre: d.pacienteNombre, dni: d.pacienteDni },
        cantidad: 1,
      });
    } catch (e) { alert('No se pudo cargar: ' + e.message); return; }
    cambiarEstadoDerivacion(id, 'realizada', { prestacionId: reg && reg.id });
    if (typeof sincronizarUI === 'function') sincronizarUI(); else renderDerivaciones();
    alert('Cirugía cargada para facturar. Revisala en Carga diaria ▸ Todas las prestaciones.');
  });
}
