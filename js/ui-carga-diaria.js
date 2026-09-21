// ═══════════════════════════════════════════════════════════════════════════
//  SAM — CARGA DIARIA (parte visible, uso de la secretaria)
// ───────────────────────────────────────────────────────────────────────────
//  Ritmo real de carga:
//    • Consultas → por CANTIDAD y obra social (ej. "5 de IOMA, 2 particulares").
//      Sin cargar paciente por paciente. Valor único.
//    • Estudios (y prácticas) → igual: tipo + OS + cantidad.
//    • Cirugías → detalle completo (apellido, nombre, DNI, OS, tipo, insumo,
//      derivador) en el modal de siempre. Es la única con paciente y derivador.
//  Elegís el día + médico una sola vez y cargás rápido. Debajo, "Cargado el
//  <día>" agrupa lo del día para revisar/corregir.
// ═══════════════════════════════════════════════════════════════════════════

function _cdGet(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function _cdSet(id, v) { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }

// Opciones del nomenclador de una categoría (o varias). En la parte visible solo
// se muestra la descripción — los valores quedan para la parte restringida.
function _optsNomencladorCats(cats, fecha, sel) {
  let items = [];
  cats.forEach(c => { items = items.concat(listarPrestaciones({ categoria: c, incluirInactivos: false })); });
  if (items.length === 0) return '<option value="">(cargá el nomenclador primero)</option>';
  return '<option value="">Elegí…</option>' + items.map(v =>
    `<option value="${v.grupo}"${v.grupo === sel ? ' selected' : ''}>${escHtml(v.descripcion)}</option>`).join('');
}

// Opciones del nomenclador FILTRADAS por el contrato de la OS elegida (primero la
// OS, después la prestación). Solo se ofrecen las que tienen contrato para esa OS.
function _optsNomencladorCatsOS(cats, os, fecha, sel) {
  if (!os) return '<option value="">Elegí primero la obra social…</option>';
  let items = [];
  cats.forEach(c => { items = items.concat(listarPrestaciones({ categoria: c, incluirInactivos: false })); });
  items = items.filter(v => valorContrato(os, v.grupo, fecha || hoyISO()) != null);
  if (items.length === 0) return '<option value="">(esta OS no tiene contratos de este tipo — cargalos en Contratos)</option>';
  return '<option value="">Elegí…</option>' + items.map(v =>
    `<option value="${v.grupo}"${v.grupo === sel ? ' selected' : ''}>${escHtml(v.descripcion)}</option>`).join('');
}

// Al cambiar la OS, repoblar el tipo (nomenclador) con lo contratado para esa OS.
function cdConOsChange() {
  _cdSet('cd_con_tipo', '');
  const el = document.getElementById('cd_con_tipo');
  if (el) el.innerHTML = _optsNomencladorCatsOS(['consulta'], _cdGet('cd_con_os'), _cdGet('cd_fecha'), null);
}
function cdEstOsChange() {
  _cdSet('cd_est_tipo', '');
  const el = document.getElementById('cd_est_tipo');
  if (el) el.innerHTML = _optsNomencladorCatsOS(['realizacion_estudio', 'practica'], _cdGet('cd_est_os'), _cdGet('cd_fecha'), null);
}

function cdSedeChange() {
  const el = document.getElementById('cd_consultorio');
  if (el) el.innerHTML = _optsConsultorios(Number(_cdGet('cd_sede')));
}

// ── Render principal ──
function renderCargaDiaria() {
  const cont = document.getElementById('cd_tabla');
  if (!cont) return;
  if (!_cdGet('cd_fecha')) _cdSet('cd_fecha', hoyISO());
  const fecha = _cdGet('cd_fecha');

  const prev = {
    medico: _cdGet('cd_medico'), sede: _cdGet('cd_sede'), consultorio: _cdGet('cd_consultorio'),
    conTipo: _cdGet('cd_con_tipo'), conOs: _cdGet('cd_con_os'),
    estTipo: _cdGet('cd_est_tipo'), estOs: _cdGet('cd_est_os'),
  };
  const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  setHTML('cd_medico', _optsMedicos(prev.medico ? Number(prev.medico) : null, true, '— Elegí médico —'));
  const sede = prev.sede ? Number(prev.sede) : sedeActiva();
  setHTML('cd_sede', _optsSedes(sede));
  setHTML('cd_consultorio', _optsConsultorios(sede, prev.consultorio ? Number(prev.consultorio) : null));
  // Primero la OS (contrato), después el nomenclador filtrado por esa OS.
  const conOs = prev.conOs || 'Particular';
  const estOs = prev.estOs || 'Particular';
  setHTML('cd_con_os', _optsOS(conOs));
  setHTML('cd_con_tipo', _optsNomencladorCatsOS(['consulta'], conOs, fecha, prev.conTipo ? Number(prev.conTipo) : null));
  setHTML('cd_est_os', _optsOS(estOs));
  setHTML('cd_est_tipo', _optsNomencladorCatsOS(['realizacion_estudio', 'practica'], estOs, fecha, prev.estTipo ? Number(prev.estTipo) : null));

  const lbl = document.getElementById('cd_fecha_lbl');
  if (lbl) lbl.textContent = fecha || '—';

  // Tabla del día: una fila por registro (las consultas/estudios ya vienen agrupados por cantidad).
  const filas = DB.prestacionesRealizadas.filter(r => r.fecha === fecha).sort((a, b) => b.id - a.id);
  if (filas.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no cargaste nada para este día.</p>';
    return;
  }
  const rows = filas.map(r => {
    const anulada = r.estado === 'anulada';
    const esCir = r.categoria === 'cirugia';
    const deriv = r.medicoDerivadorId ? medicoNombre(r.medicoDerivadorId) : '—';
    const cant = Math.max(1, Math.floor(Number(r.cantidad) || 1));
    return `
    <tr class="${anulada ? 'fila-inactiva' : ''}">
      <td>${escHtml(_catLabel(r.categoria))}</td>
      <td>${escHtml(r.descripcion)}${esCir && r.pacienteNombre && r.pacienteNombre !== '—' ? ' · ' + escHtml(r.pacienteNombre) : ''}${anulada ? ' <span class="badge-inactivo">Anulada</span>' : ''}</td>
      <td>${escHtml(r.obraSocial)}</td>
      <td class="num">${esCir ? '1' : cant}</td>
      <td>${escHtml(medicoNombre(r.medicoRealizadorId))}</td>
      <td>${escHtml(deriv)}</td>
      <td class="acc">
        ${anulada
          ? `<button onclick="reactivarPrestacionUI(${r.id})">Reactivar</button>`
          : (esCir
              ? `<button onclick="editarPrestacionRealizadaUI(${r.id})">Editar</button>
                 <button onclick="anularPrestacionUI(${r.id})">Anular</button>`
              : `<button onclick="cdEditarCantidad(${r.id})">Cantidad</button>
                 <button onclick="anularPrestacionUI(${r.id})">Anular</button>`)}
        <button class="danger" onclick="eliminarPrestacionRealizadaUI(${r.id})">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr>
        <th>Tipo</th><th>Descripción</th><th>Obra social</th><th class="num">Cant.</th>
        <th>Realizador</th><th>Derivador</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted" style="margin-top:8px">${filas.length} línea(s) el ${escHtml(fecha)}.</p>`;
}

// Día + médico + sede/consultorio comunes.
function _cdComun() {
  const fecha = _cdGet('cd_fecha');
  const medico = _cdGet('cd_medico');
  if (!fecha) { avisoUI('Elegí el día.'); return null; }
  if (!medico) { avisoUI('Elegí el médico.'); return null; }
  return {
    fecha, medicoRealizadorId: medico,
    sedeId: Number(_cdGet('cd_sede')) || sedeActiva(),
    consultorioId: _cdGet('cd_consultorio') || null,
  };
}

// Busca un contador ya cargado (mismo día/médico/tipo/OS, sin derivador) para sumarle.
function _cdContador(base, categoria, grupo, os) {
  return DB.prestacionesRealizadas.find(r =>
    r.estado === 'activa' && r.fecha === base.fecha &&
    Number(r.medicoRealizadorId) === Number(base.medicoRealizadorId) &&
    r.categoria === categoria && Number(r.grupoNomenclador) === Number(grupo) &&
    r.obraSocial === os && !r.medicoDerivadorId &&
    !(typeof prestacionBloqueada === 'function' && prestacionBloqueada(r)));
}

// Alta por cantidad (consulta o estudio/práctica). Si ya hay una línea igual, suma.
function _cdAgregarContador(categoria, grupoId, osId, cantId) {
  const base = _cdComun(); if (!base) return;
  const grupo = _cdGet(grupoId);
  if (!grupo) { avisoUI('Elegí el tipo.'); return; }
  const cant = Math.max(1, Math.floor(Number(_cdGet(cantId)) || 1));
  const os = _cdGet(osId) || 'Particular';
  const cat = (versionActual(Number(grupo)) || {}).categoria || categoria;
  try {
    const existente = _cdContador(base, cat, grupo, os);
    if (existente) {
      const antes = JSON.parse(JSON.stringify(existente));
      existente.cantidad = Math.max(1, Math.floor(Number(existente.cantidad) || 1)) + cant;
      registrarAuditoria('edicion', 'prestacionRealizada', existente.id, antes, existente);
      marcarCambios('prestacionesRealizadas');
    } else {
      registrarPrestacion({ ...base, categoria: cat, grupoNomenclador: grupo, obraSocial: os, cantidad: cant });
    }
  } catch (e) { avisoUI(e.message); return; }
  _cdSet(cantId, '');
  renderCargaDiaria();
}

function cdAgregarConsulta() { _cdAgregarContador('consulta', 'cd_con_tipo', 'cd_con_os', 'cd_con_cant'); }
function cdAgregarEstudio() { _cdAgregarContador('realizacion_estudio', 'cd_est_tipo', 'cd_est_os', 'cd_est_cant'); }

// Corregir la cantidad de una línea de conteo.
function cdEditarCantidad(id) {
  const reg = DB.prestacionesRealizadas.find(r => r.id === Number(id));
  if (!reg) return;
  if (typeof prestacionBloqueada === 'function' && prestacionBloqueada(reg)) { avisoUI('El período está liquidado. Reabrí la liquidación para corregir.'); return; }
  const actual = Math.max(1, Math.floor(Number(reg.cantidad) || 1));
  const nueva = (typeof prompt === 'function') ? prompt('Cantidad de ' + reg.descripcion + ' (' + reg.obraSocial + '):', actual) : actual;
  if (nueva === null) return;
  const n = Math.floor(Number(nueva));
  if (!(n >= 1)) { avisoUI('La cantidad debe ser un entero ≥ 1.'); return; }
  const antes = JSON.parse(JSON.stringify(reg));
  reg.cantidad = n;
  registrarAuditoria('edicion', 'prestacionRealizada', reg.id, antes, reg);
  marcarCambios('prestacionesRealizadas');
  renderCargaDiaria();
}

// Cirugía: modal completo (paciente, insumo, derivador) con día/médico prellenados.
// La cirugía se detalla en el modal (paciente, OS, médico, insumo), así que NO
// exige elegir antes el médico de arriba: el realizador se elige en el modal.
function cdNuevaCirugia() {
  abrirNuevaPrestacionRealizada({
    categoria: 'cirugia',
    fecha: _cdGet('cd_fecha') || hoyISO(),
    medicoRealizadorId: _cdGet('cd_medico') || null,   // opcional: precarga el de arriba si hay
    sedeId: Number(_cdGet('cd_sede')) || sedeActiva(),
    consultorioId: _cdGet('cd_consultorio') || null,
  });
}

// ── Pegar resumen del día (carga rápida por texto) ──
function _mostrarModalPegar(on) { const m = document.getElementById('modalPegar'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalPegar() { _mostrarModalPegar(false); }

function abrirPegarResumen() {
  const ta = document.getElementById('pegarTexto'); if (ta) ta.value = '';
  const pv = document.getElementById('pegarPreview'); if (pv) pv.innerHTML = '';
  const msg = document.getElementById('pegarMsg'); if (msg) msg.innerHTML = '';
  _mostrarModalPegar(true);
}

let _pegarPlan = [];
function previsualizarPegar() {
  const ta = document.getElementById('pegarTexto');
  const pv = document.getElementById('pegarPreview');
  if (!ta || !pv) return;
  _pegarPlan = parsearResumenDiario(ta.value);
  if (!_pegarPlan.length) { pv.innerHTML = '<p class="muted">Escribí o pegá el resumen arriba.</p>'; return; }
  const rows = _pegarPlan.map(p => {
    const okCell = p.problema
      ? `<span class="badge-inactivo">${escHtml(p.problema)}</span>`
      : `<span class="badge-ok">✓ ${escHtml((categoriaInfo(p.categoria) || {}).label || p.categoria)}</span>`;
    return `<tr class="${p.problema ? 'fila-inactiva' : ''}">
      <td class="num">${p.cantidad}</td>
      <td>${escHtml(p.problema ? p.prestTxt : p.descripcion)}</td>
      <td>${escHtml(p.obraSocial)}</td>
      <td>${okCell}</td>
    </tr>`;
  }).join('');
  const okN = _pegarPlan.filter(p => !p.problema).length;
  pv.innerHTML = `<p class="muted">${okN}/${_pegarPlan.length} línea(s) reconocida(s).</p>
    <table class="tabla"><thead><tr><th class="num">Cant.</th><th>Prestación</th><th>OS</th><th>Detección</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function confirmarPegarResumen() {
  const fecha = (document.getElementById('cd_fecha') || {}).value || hoyISO();
  const medicoId = (document.getElementById('cd_medico') || {}).value || null;
  if (!medicoId) { avisoUI('Elegí el médico arriba antes de cargar.'); return; }
  if (!_pegarPlan.length) { previsualizarPegar(); }
  const r = aplicarResumenDiario(_pegarPlan, { fecha, medicoRealizadorId: Number(medicoId) });
  if (r.ok === 0) { const msg = document.getElementById('pegarMsg'); if (msg) msg.innerHTML = '<div class="diag-err" style="margin:8px 0">No se cargó ninguna línea (revisá la detección).</div>'; return; }
  cerrarModalPegar();
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderCargaDiaria();
  avisoUI('Cargadas ' + r.ok + ' línea(s) (' + r.unidades + ' unidad/es)' + (r.omitidas ? ', ' + r.omitidas + ' omitida(s)' : '') + '.');
}
