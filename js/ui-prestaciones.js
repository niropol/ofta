// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de PRESTACIONES REALIZADAS (Etapa 3)
// ───────────────────────────────────────────────────────────────────────────
//  Tabla con filtros (mes / médico / categoría) + alta/edición, anulación
//  (contra-movimiento, queda visible) y eliminación. La lógica vive en
//  prestaciones.js.
// ═══════════════════════════════════════════════════════════════════════════

function _catLabel(id) { const c = categoriaInfo(id); return c ? c.label : id; }

function _optsMedicos(sel, incluirVacio, labelVacio) {
  const meds = getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const vacio = incluirVacio ? `<option value="">${escHtml(labelVacio || '—')}</option>` : '';
  return vacio + meds.map(m => `<option value="${m.id}"${m.id === sel ? ' selected' : ''}>${escHtml(m.nombre)}</option>`).join('');
}

// Opciones de obra social: Particular + las OS activas.
function _optsOS(sel) {
  const nombres = ['Particular', ...getObrasSocialesActivas().map(o => o.nombre)];
  return nombres.map(n => `<option value="${escHtml(n)}"${n === sel ? ' selected' : ''}>${escHtml(n)}</option>`).join('');
}

// Opciones de sede activas.
function _optsSedes(sel) {
  return getSedesActivas().map(s => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${escHtml(s.nombre)}</option>`).join('');
}

// Opciones del nomenclador para una categoría (solo descripción; los valores
// quedan para la parte restringida).
function _optsPrestacionesCat(categoria, fecha, sel, os) {
  const all = listarPrestaciones({ categoria, incluirInactivos: false });
  // Primero el contrato: si hay OS, ofrecer las que tienen contrato para esa OS
  // (+ la ya seleccionada). Si ninguna está contratada, fallback a todas (no bloquear).
  let items = all;
  if (os) {
    const contratadas = all.filter(v => valorContrato(os, v.grupo, fecha) != null || v.grupo === sel);
    if (contratadas.length) items = contratadas;
  }
  if (items.length === 0) return '<option value="">(no hay prestaciones de esta categoría en el nomenclador)</option>';
  return '<option value="">Elegí la prestación…</option>' + items.map(v =>
    `<option value="${v.grupo}"${v.grupo === sel ? ' selected' : ''}>${escHtml(v.descripcion)}</option>`).join('');
}

// ── Render de la tabla (paginada) ──
const PRESTACIONES_POR_PAGINA = 50;
let _prestPagina = 0;
function irPaginaPrestaciones(p) { _prestPagina = p; renderPrestaciones(); }

function renderPrestaciones() {
  const cont = document.getElementById('prestacionesTabla');
  if (!cont) return;
  const gv = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const filas = listarPrestacionesRealizadas({ mes: gv('regFiltroMes'), medicoId: gv('regFiltroMedico') || null, categoria: gv('regFiltroCat') || null });

  if (filas.length === 0) {
    cont.innerHTML = '<p class="vacio">No hay prestaciones cargadas para este filtro. Usá «+ Cargar prestación».</p>';
    return;
  }

  // Paginación: acotar la página al rango válido y cortar las filas.
  const totalPag = Math.max(1, Math.ceil(filas.length / PRESTACIONES_POR_PAGINA));
  if (_prestPagina >= totalPag) _prestPagina = totalPag - 1;
  if (_prestPagina < 0) _prestPagina = 0;
  const desde = _prestPagina * PRESTACIONES_POR_PAGINA;
  const pagina = filas.slice(desde, desde + PRESTACIONES_POR_PAGINA);

  const rows = pagina.map(r => {
    const anulada = r.estado === 'anulada';
    const deriv = r.medicoDerivadorId ? medicoNombre(r.medicoDerivadorId) : '—';
    return `
    <tr class="${anulada ? 'fila-inactiva' : ''}">
      <td>${escHtml(r.fecha)}</td>
      <td>${escHtml(_catLabel(r.categoria))}</td>
      <td>${escHtml(r.descripcion)}${anulada ? ' <span class="badge-inactivo">Anulada</span>' : ''}</td>
      <td>${escHtml(r.obraSocial)}</td>
      <td>${escHtml(r.pacienteNombre || '—')}</td>
      <td class="num">${Math.max(1, Math.floor(Number(r.cantidad) || 1))}</td>
      <td>${escHtml(medicoNombre(r.medicoRealizadorId))}</td>
      <td>${escHtml(deriv)}</td>
      <td class="num">${fmtMoneda(r.precioNomenclador, r.moneda)}</td>
      <td class="acc">
        ${anulada
          ? `<button onclick="reactivarPrestacionUI(${r.id})">Reactivar</button>`
          : `<button onclick="editarPrestacionRealizadaUI(${r.id})">Editar</button>
             <button onclick="anularPrestacionUI(${r.id})">Anular</button>`}
        <button class="danger" onclick="eliminarPrestacionRealizadaUI(${r.id})">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  const hasta = Math.min(desde + PRESTACIONES_POR_PAGINA, filas.length);
  const pager = totalPag > 1 ? `
    <div class="pager">
      <button ${_prestPagina === 0 ? 'disabled' : ''} onclick="irPaginaPrestaciones(${_prestPagina - 1})">‹ Anterior</button>
      <span class="muted">${desde + 1}–${hasta} de ${filas.length} · página ${_prestPagina + 1}/${totalPag}</span>
      <button ${_prestPagina >= totalPag - 1 ? 'disabled' : ''} onclick="irPaginaPrestaciones(${_prestPagina + 1})">Siguiente ›</button>
    </div>` : `<p class="muted" style="margin-top:8px">${filas.length} prestación(es)</p>`;

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr>
        <th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Obra social</th>
        <th>Paciente</th><th class="num">Cant.</th><th>Realizador</th><th>Derivador</th>
        <th class="num">Precio nomenclador</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>${pager}`;
}

// Poblar los selects de filtro, preservando la selección actual al refrescar.
function _poblarFiltrosPrestaciones() {
  const cat = document.getElementById('regFiltroCat');
  if (cat) {
    const prev = cat.value;
    cat.innerHTML = '<option value="">Todas las categorías</option>' +
      CATEGORIAS_REALIZADAS.map(c => `<option value="${c.id}">${escHtml(c.label)}</option>`).join('');
    cat.value = prev;
  }
  const med = document.getElementById('regFiltroMedico');
  if (med) {
    const prev = med.value;
    med.innerHTML = '<option value="">Todos los médicos</option>' + _optsMedicos(null, false);
    med.value = prev;
  }
}

// ── Modal alta / edición ──
function _mostrarModalReg(on) { const m = document.getElementById('modalReg'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalReg() { _mostrarModalReg(false); }

// Insumos seleccionados en el formulario abierto (snapshots {grupo, descripcion, precio, moneda, costo, costoMoneda}).
let _regInsumos = [];

// Al cambiar categoría o fecha: repoblar prestaciones, mostrar/ocultar derivador e insumos.
function onCategoriaChangeReg() {
  const categoria = document.getElementById('reg_categoria').value;
  const fecha = document.getElementById('reg_fecha').value || hoyISO();
  const cur = document.getElementById('reg_prestacion').value;
  const os = (document.getElementById('reg_os') || {}).value || '';   // primero el contrato: filtra por OS
  document.getElementById('reg_prestacion').innerHTML = _optsPrestacionesCat(categoria, fecha, cur ? Number(cur) : null, os);
  const cat = categoriaInfo(categoria);
  const box = document.getElementById('reg_derivador_box');
  if (box) box.style.display = (cat && cat.permiteDerivador) ? 'block' : 'none';
  if (cat && !cat.permiteDerivador) { const d = document.getElementById('reg_derivador'); if (d) d.value = ''; }
  // Insumos: solo cirugía / práctica.
  const insBox = document.getElementById('reg_insumos_box');
  if (insBox) insBox.style.display = (cat && cat.permiteInsumos) ? 'block' : 'none';
  if (cat && !cat.permiteInsumos) _regInsumos = [];
  _poblarSelectInsumos(fecha);
  _renderInsumosReg();
}

// Opciones del catálogo de insumos, con precio y costo vigentes a la fecha.
function _poblarSelectInsumos(fecha) {
  const sel = document.getElementById('reg_insumo_sel');
  if (!sel) return;
  const items = listarPrestaciones({ categoria: 'insumo', incluirInactivos: false });
  if (items.length === 0) { sel.innerHTML = '<option value="">(no hay insumos cargados en el nomenclador)</option>'; return; }
  sel.innerHTML = '<option value="">Elegí un insumo…</option>' + items.map(v =>
    `<option value="${v.grupo}">${escHtml(v.descripcion)}</option>`).join('');
}

// Agregar el insumo elegido a la lista (con ingreso opcional; costo del catálogo).
function agregarInsumoReg() {
  const g = document.getElementById('reg_insumo_sel').value;
  if (!g) return;
  const fecha = document.getElementById('reg_fecha').value || hoyISO();
  const item = versionActual(Number(g));
  const ver = item ? precioVigente(item.grupo, fecha) : null;
  if (!ver) { avisoUI('Ese insumo no tiene precio vigente a la fecha.'); return; }
  const ingEl = document.getElementById('reg_insumo_ingreso');
  const ing = ingEl && ingEl.value !== '' ? Number(ingEl.value) : (ver.moneda === 'ARS' ? (ver.precio || 0) : 0);
  _regInsumos.push({ grupo: item.grupo, descripcion: ver.descripcion, costo: ver.costo != null ? ver.costo : 0, costoMoneda: ver.costoMoneda || 'ARS', ingreso: ing });
  document.getElementById('reg_insumo_sel').value = '';
  if (ingEl) ingEl.value = '';
  _renderInsumosReg();
}

function quitarInsumoReg(i) { _regInsumos.splice(i, 1); _renderInsumosReg(); }

function _renderInsumosReg() {
  const cont = document.getElementById('reg_insumos_lista');
  if (!cont) return;
  if (_regInsumos.length === 0) { cont.innerHTML = '<p class="muted">Sin insumos.</p>'; return; }
  cont.innerHTML = _regInsumos.map((ins, i) => `
    <div class="ins-item">
      <span>${escHtml(ins.descripcion)}</span>
      <button onclick="quitarInsumoReg(${i})">Quitar</button>
    </div>`).join('');
}

// Opciones de consultorios de la sede elegida en el formulario.
function _optsConsultorios(sedeId, sel) {
  const cs = getConsultoriosDeSede(sedeId);
  if (cs.length === 0) return '<option value="">(sin consultorios en la sede)</option>';
  return cs.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${escHtml(c.nombre)}</option>`).join('');
}
function onSedeChangeReg() {
  const sede = document.getElementById('reg_sede').value;
  const el = document.getElementById('reg_consultorio');
  if (el) el.innerHTML = _optsConsultorios(Number(sede));
}

// preset (opcional, desde Carga diaria): { categoria, fecha, medicoRealizadorId, sedeId, consultorioId }
function abrirNuevaPrestacionRealizada(preset) {
  preset = preset || {};
  document.getElementById('modalRegTitulo').textContent = 'Cargar prestación';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('reg_id', '');
  set('reg_fecha', preset.fecha || hoyISO()); set('reg_hora', ''); set('reg_extra', '');
  _regInsumos = [];
  const catSel = preset.categoria || null;
  document.getElementById('reg_categoria').innerHTML = CATEGORIAS_REALIZADAS.map(c => `<option value="${c.id}"${c.id === catSel ? ' selected' : ''}>${escHtml(c.label)}</option>`).join('');
  document.getElementById('reg_realizador').innerHTML = _optsMedicos(preset.medicoRealizadorId ? Number(preset.medicoRealizadorId) : null, true, 'Elegí el médico…');
  document.getElementById('reg_derivador').innerHTML = _optsMedicos(null, true, '— sin derivación —');
  document.getElementById('reg_os').innerHTML = _optsOS('Particular');
  const sede = preset.sedeId ? Number(preset.sedeId) : sedeActiva();
  document.getElementById('reg_sede').innerHTML = _optsSedes(sede);
  document.getElementById('reg_consultorio').innerHTML = _optsConsultorios(sede, preset.consultorioId ? Number(preset.consultorioId) : null);
  set('reg_pac_apellido', ''); set('reg_pac_nombre', ''); set('reg_pac_dni', '');
  onCategoriaChangeReg();
  _mostrarModalReg(true);
}

function editarPrestacionRealizadaUI(id) {
  const r = DB.prestacionesRealizadas.find(x => x.id === Number(id));
  if (!r) return;
  document.getElementById('modalRegTitulo').textContent = 'Editar prestación';
  const set = (idf, v) => { const el = document.getElementById(idf); if (el) el.value = v == null ? '' : v; };
  set('reg_id', r.id);
  set('reg_fecha', r.fecha); set('reg_hora', r.hora || ''); set('reg_extra', r.extraMedico || '');
  _regInsumos = (r.insumos || []).map(i => ({ ...i }));
  document.getElementById('reg_categoria').innerHTML = CATEGORIAS_REALIZADAS.map(c => `<option value="${c.id}"${c.id === r.categoria ? ' selected' : ''}>${escHtml(c.label)}</option>`).join('');
  document.getElementById('reg_realizador').innerHTML = _optsMedicos(r.medicoRealizadorId, true, 'Elegí el médico…');
  document.getElementById('reg_derivador').innerHTML = _optsMedicos(r.medicoDerivadorId, true, '— sin derivación —');
  document.getElementById('reg_os').innerHTML = _optsOS(r.obraSocial);
  document.getElementById('reg_sede').innerHTML = _optsSedes(r.sedeId);
  document.getElementById('reg_consultorio').innerHTML = _optsConsultorios(r.sedeId, r.consultorioId);
  // Paciente: prellenar desde la ficha vinculada.
  const pac = DB.pacientes.find(p => p.id === r.pacienteId);
  set('reg_pac_apellido', pac ? pac.apellido : ''); set('reg_pac_nombre', pac ? pac.nombre : ''); set('reg_pac_dni', pac ? pac.dni : '');
  onCategoriaChangeReg();
  // onCategoriaChangeReg repobló prestaciones; seleccionar la del registro.
  set('reg_prestacion', r.grupoNomenclador);
  _mostrarModalReg(true);
}

function guardarPrestacionReg() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const datos = {
    fecha: val('reg_fecha'),
    hora: val('reg_hora'),
    categoria: val('reg_categoria'),
    grupoNomenclador: val('reg_prestacion'),
    medicoRealizadorId: val('reg_realizador'),
    medicoDerivadorId: val('reg_derivador') || null,
    obraSocial: val('reg_os') || 'Particular',
    sedeId: Number(val('reg_sede')) || sedeActiva(),
    consultorioId: val('reg_consultorio') || null,
    insumos: _regInsumos.map(i => ({ grupo: i.grupo, ingreso: i.ingreso })),
    paciente: { apellido: val('reg_pac_apellido'), nombre: val('reg_pac_nombre'), dni: val('reg_pac_dni') },
  };
  const idEdit = val('reg_id');
  try {
    if (idEdit) editarPrestacionRealizada(Number(idEdit), datos);
    else registrarPrestacion(datos);
  } catch (e) {
    avisoUI(e.message);
    return false;
  }
  cerrarModalReg();
  renderPrestaciones();
  if (typeof renderCargaDiaria === 'function') renderCargaDiaria();
  return true;
}

// ── Anular / reactivar / eliminar ──
function anularPrestacionUI(id) {
  const motivo = (typeof prompt === 'function') ? prompt('Motivo de la anulación:') : 'Sin especificar';
  if (motivo === null) return; // canceló
  anularPrestacion(id, motivo);
  renderPrestaciones();
  if (typeof renderCargaDiaria === 'function') renderCargaDiaria();
}
function reactivarPrestacionUI(id) {
  confirmarUI('¿Reactivar esta prestación anulada?').then(ok => {
    if (!ok) return;
    reactivarPrestacion(id);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderPrestaciones(); if (typeof renderCargaDiaria === 'function') renderCargaDiaria(); }
  });
}
function eliminarPrestacionRealizadaUI(id) {
  confirmarUI('¿Eliminar definitivamente esta prestación? Para dejar constancia, conviene «Anular» en su lugar. Queda registrado en auditoría.').then(ok => {
    if (!ok) return;
    eliminarPrestacionRealizada(id);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderPrestaciones(); if (typeof renderCargaDiaria === 'function') renderCargaDiaria(); }
  });
}
