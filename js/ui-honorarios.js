// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de PAGOS A MÉDICOS (valores fijos)
// ───────────────────────────────────────────────────────────────────────────
//  Vive en Admin ▸ Pagos a médicos. Dos bloques:
//   1) Valores fijos por tipo (consulta/estudio/cirugía/práctica/derivación):
//      general + override por médico, con vigencia.
//   2) Vista previa: cuánto le toca a cada médico en el mes.
// ═══════════════════════════════════════════════════════════════════════════

function _catValLabel(id) { return (CATEGORIAS_VALOR_MEDICO.find(c => c.id === id) || {}).label || id; }

// ── Pagos a médicos: tabla EDITABLE en el lugar ──
// Un selector arriba elige el alcance: General (todos) o un médico puntual.
// Cada fila muestra el valor actual, editable; "Guardar" corrige en el lugar.
function renderValoresMedico() {
  const cont = document.getElementById('valoresTabla');
  if (!cont) return;

  const sel = document.getElementById('valScope');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">General (todos los médicos)</option>' +
      getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
        .map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
    if (cur) sel.value = cur;
  }
  const mid = (sel && sel.value) ? Number(sel.value) : null;
  const catFiltro = (document.getElementById('valCat') || {}).value || '';
  const q = (((document.getElementById('valBuscar') || {}).value) || '').trim().toLowerCase();
  const coincide = txt => !q || (txt || '').toLowerCase().includes(q);
  const fecha = hoyISO();

  // Fila editable de un valor por categoría (+ grupo opcional = tipo puntual).
  const fila = (label, categoria, grupo) => {
    const gen = valorMedicoVigente(categoria, null, fecha, grupo);
    let valorInput = gen ? gen.valor : '';
    let hint = '';
    if (mid != null) {
      const propio = valorMedicoVigente(categoria, mid, fecha, grupo);
      const esOverride = propio && /^medico/.test(propio.origen);
      valorInput = esOverride ? propio.valor : '';
      hint = gen ? `general ${fmtMoneda(gen.valor, 'ARS')}` : 'sin general';
    }
    const id = 'vm_' + categoria + '_' + (grupo || 'g') + '_' + (mid || 'gen');
    return `<tr>
      <td>${escHtml(label)}</td>
      <td><input type="number" step="0.01" id="${id}" value="${valorInput}" style="width:130px" placeholder="${mid != null ? '(usa el general)' : 'sin definir'}"></td>
      <td class="muted">${hint}</td>
      <td class="acc"><button onclick="guardarValorInlineUI('${categoria}',${grupo || 'null'},${mid || 'null'},'${id}')">Guardar</button></td>
    </tr>`;
  };

  const encabezado = titulo => `<tr><td colspan="4" style="background:#f8fafc;font-weight:600">${escHtml(titulo)}</td></tr>`;

  // Bloque de una categoría: fila «general» (respaldo) + una fila por tipo del nomenclador.
  const bloque = (categoria, titulo, items, etiquetaGeneral) => {
    const rows = [];
    if (coincide('general ' + titulo)) rows.push(fila(etiquetaGeneral || ('General — toda la categoría'), categoria, null));
    items.filter(it => coincide(it.descripcion)).forEach(it => rows.push(fila(it.descripcion, categoria, it.grupo)));
    return rows.length ? encabezado(titulo) + rows.join('') : '';
  };

  const consultas = listarPrestaciones({ categoria: 'consulta', incluirInactivos: false });
  const estudios = listarPrestaciones({ categoria: 'realizacion_estudio', incluirInactivos: false });
  const practicas = listarPrestaciones({ categoria: 'practica', incluirInactivos: false });
  const cirugias = listarPrestaciones({ categoria: 'cirugia', incluirInactivos: false });

  const mostrar = c => !catFiltro || catFiltro === c;
  let cuerpo = '';
  if (mostrar('consulta')) cuerpo += bloque('consulta', 'Consultas', consultas, 'Consulta (valor general)');
  if (mostrar('realizacion_estudio')) cuerpo += bloque('realizacion_estudio', 'Estudios', estudios, 'Estudio (valor general)');
  if (mostrar('practica')) cuerpo += bloque('practica', 'Prácticas', practicas, 'Práctica (valor general)');
  if (mostrar('cirugia')) cuerpo += bloque('cirugia', 'Cirugías', cirugias, 'Cirugía (valor general)');

  // Derivación: valor al derivador. General siempre; por tipo al filtrar «Derivaciones».
  if (mostrar('derivacion')) {
    const rows = [];
    if (coincide('general derivacion derivación')) rows.push(fila('Derivación (valor general)', 'derivacion', null));
    if (catFiltro === 'derivacion') {
      [...cirugias, ...estudios, ...practicas]
        .filter(it => coincide(it.descripcion))
        .forEach(it => rows.push(fila('↪ ' + it.descripcion, 'derivacion', it.grupo)));
    }
    if (rows.length) cuerpo += encabezado('Derivaciones (al médico que deriva)') + rows.join('');
  }

  // Insumos: pago fijo por colocarlos (siempre general, no por médico).
  if (mid == null && mostrar('insumo')) {
    const insumos = listarPrestaciones({ categoria: 'insumo', incluirInactivos: false })
      .filter(v => coincide(v.descripcion));
    if (insumos.length) {
      cuerpo += encabezado('Insumos (pago por colocarlos)') + insumos.map(v => `
        <tr>
          <td>${escHtml(v.descripcion)}</td>
          <td><input type="number" step="0.01" id="vmi_${v.grupo}" value="${v.honorarioMedico != null ? v.honorarioMedico : ''}" style="width:130px" placeholder="0"></td>
          <td class="muted">por colocarlo</td>
          <td class="acc"><button onclick="guardarHonInsumoInlineUI(${v.grupo})">Guardar</button></td>
        </tr>`).join('');
    }
  }

  if (!cuerpo) cuerpo = '<tr><td colspan="4" class="muted">Sin prestaciones para ese filtro. Cargá el nomenclador/contratos primero.</td></tr>';

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Prestación</th><th>Pago al médico</th><th></th><th></th></tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    <p class="muted" style="margin-top:6px">${mid == null
      ? 'Valores generales (todos los médicos). La fila «valor general» de cada bloque se usa cuando un tipo puntual no tiene valor propio. Elegí un médico arriba para ponerle un valor especial. En «Derivaciones» elegí esa categoría para fijar el pago por tipo derivado.'
      : 'Valor especial para <strong>' + escHtml(medicoNombre(mid)) + '</strong>. Vacío = usa el general. Los insumos son siempre generales.'}</p>`;
}

// Aviso si hay liquidaciones cerradas (el cambio no las toca hasta reabrirlas).
function _avisoLiquidacionesCerradas() {
  const cerradas = [...new Set(DB.pagosMedicos.filter(p => p.estado === 'cerrada').map(p => p.mes))];
  if (cerradas.length) {
    alert('Aviso: hay liquidaciones CERRADAS (' + cerradas.join(', ') + '). El cambio no las modifica. Para aplicarlo a esos meses, reabrilas en Finanzas ▸ Liquidaciones.');
  }
}

function guardarValorInlineUI(categoria, grupo, medicoId, inputId) {
  const el = document.getElementById(inputId);
  const v = el ? el.value.trim() : '';
  if (v === '') return;  // vacío = sin cambio (para el override vacío usá "quitar" — próxima)
  try { setValorMedicoActual(categoria, medicoId || null, v, grupo || null); }
  catch (e) { alert(e.message); return; }
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderValoresMedico();
  _avisoLiquidacionesCerradas();
}

function guardarHonInsumoInlineUI(grupo) {
  const el = document.getElementById('vmi_' + grupo);
  const v = el ? el.value.trim() : '';
  try { setHonorarioMedicoInsumo(grupo, v === '' ? 0 : v); }
  catch (e) { alert(e.message); return; }
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderValoresMedico();
  _avisoLiquidacionesCerradas();
}

// Al cambiar la categoría en el modal: repuebla la lista de prestaciones específicas.
function onValorCategoriaChange() {
  const cat = document.getElementById('valor_categoria').value;
  const box = document.getElementById('valor_prestacion_box');
  const sel = document.getElementById('valor_prestacion');
  if (!sel || !box) return;
  const conNomenclador = (categoriaInfo(cat) || {}).nomenclador && cat !== 'derivacion';
  box.style.display = conNomenclador ? 'block' : 'none';
  if (!conNomenclador) { sel.innerHTML = ''; return; }
  const items = listarPrestaciones({ categoria: cat, incluirInactivos: false });
  sel.innerHTML = '<option value="">— toda la categoría (valor general) —</option>' +
    items.map(v => `<option value="${v.grupo}">${escHtml(v.descripcion)}</option>`).join('');
}

function _mostrarModalValor(on) { const m = document.getElementById('modalValor'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalValor() { _mostrarModalValor(false); }

function abrirNuevoValorMedico() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  document.getElementById('valor_categoria').innerHTML =
    CATEGORIAS_VALOR_MEDICO.map(c => `<option value="${c.id}">${escHtml(c.label)}</option>`).join('');
  document.getElementById('valor_medico').innerHTML =
    '<option value="">General (todos los médicos)</option>' +
    getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
      .map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
  set('valor_monto', ''); set('valor_vigencia', hoyISO().slice(0, 7) + '-01');
  onValorCategoriaChange();
  _mostrarModalValor(true);
}

function guardarValorMedico() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  try {
    setValorMedico(val('valor_categoria'), val('valor_medico') || null, val('valor_monto'), val('valor_vigencia') || (hoyISO().slice(0, 7) + '-01'), val('valor_prestacion') || null);
  } catch (e) { alert(e.message); return false; }
  cerrarModalValor();
  renderValoresMedico();
  return true;
}

// ── Vista previa de pagos del mes ──
function calcularPreviewHonorarios() {
  const cont = document.getElementById('previewHonorarios');
  if (!cont) return;
  const mesEl = document.getElementById('prevMes');
  const mes = mesEl ? mesEl.value : '';
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; return; }

  const meds = honorariosDelMes(mes);
  if (meds.length === 0) { cont.innerHTML = '<p class="vacio">No hay prestaciones activas en ese mes.</p>'; return; }

  const rows = meds.map(h => {
    const flags = h.faltaValor.length
      ? '<span class="badge-inactivo">falta valor de ' + h.faltaValor.map(c => escHtml(_catValLabel(c))).join(', ') + '</span>'
      : '<span class="muted">ok</span>';
    return `<tr><td>${escHtml(medicoNombre(h.medicoId))}</td><td class="num">${fmtMoneda(h.total, 'ARS')}</td><td>${flags}</td></tr>`;
  }).join('');
  const totalMes = meds.reduce((s, h) => s + h.total, 0);
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Médico</th><th class="num">Pago (ARS)</th><th>Observaciones</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Total del mes</th><th class="num">${fmtMoneda(totalMes, 'ARS')}</th><th></th></tr></tfoot>
    </table>
    <p class="muted">Vista previa. La liquidación formal, el comprobante y el egreso en caja se hacen en Admin ▸ Liquidaciones.</p>`;
}
