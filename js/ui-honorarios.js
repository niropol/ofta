// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de PAGOS A MÉDICOS (valores fijos)
// ───────────────────────────────────────────────────────────────────────────
//  Vive en Admin ▸ Pagos a médicos. Dos bloques:
//   1) Valores fijos por tipo (consulta/estudio/cirugía/práctica/derivación):
//      general + override por médico, con vigencia.
//   2) Vista previa: cuánto le toca a cada médico en el mes.
// ═══════════════════════════════════════════════════════════════════════════

function _catValLabel(id) { return (CATEGORIAS_VALOR_MEDICO.find(c => c.id === id) || {}).label || id; }

// ── Configuración de valores fijos ──
function renderValoresMedico() {
  const cont = document.getElementById('valoresTabla');
  if (!cont) return;
  const valores = listarValoresMedicoActuales()
    .sort((a, b) => (a.categoria.localeCompare(b.categoria) || ((a.medicoId || 0) - (b.medicoId || 0))));

  const sinGeneral = CATEGORIAS_VALOR_MEDICO.filter(c => !valorMedicoVigente(c.id, null, hoyISO())).map(c => c.label);
  const aviso = sinGeneral.length
    ? `<p class="nota">Falta definir el valor general de: <strong>${sinGeneral.map(escHtml).join(', ')}</strong>. Sin valor, esas prestaciones pagan $0.</p>`
    : '';

  if (valores.length === 0) {
    cont.innerHTML = aviso + '<p class="vacio">No hay valores cargados. Usá «+ Definir valor».</p>';
    return;
  }
  const nomLabel = g => { const it = versionActual(Number(g)); return it ? it.descripcion : ('#' + g); };
  const rows = valores
    .sort((a, b) => (a.categoria.localeCompare(b.categoria) || ((a.grupo || 0) - (b.grupo || 0)) || ((a.medicoId || 0) - (b.medicoId || 0))))
    .map(v => `
    <tr>
      <td>${escHtml(_catValLabel(v.categoria))}</td>
      <td>${v.grupo == null ? '<span class="muted">toda la categoría</span>' : escHtml(nomLabel(v.grupo))}</td>
      <td>${v.medicoId == null ? '<strong>General</strong>' : escHtml(medicoNombre(v.medicoId))}</td>
      <td class="num">${fmtMoneda(v.valor, 'ARS')}</td>
      <td>${escHtml(v.vigenciaDesde)}</td>
    </tr>`).join('');
  cont.innerHTML = aviso + `
    <table class="tabla">
      <thead><tr><th>Tipo</th><th>Prestación</th><th>Alcance</th><th class="num">Valor fijo</th><th>Vigente desde</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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
