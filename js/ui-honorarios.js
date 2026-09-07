// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de HONORARIOS (Etapa 4): configuración de % + vista previa
// ───────────────────────────────────────────────────────────────────────────
//  Vive en el área Admin (acceso restringido). Dos bloques:
//   1) Reparto de honorarios: % general por categoría + overrides por médico,
//      con vigencia (versionado; un cambio no recalcula el pasado).
//   2) Vista previa: honorarios calculados del mes por médico (precursor de la
//      liquidación de la Etapa 6), con cotización para los montos en USD.
// ═══════════════════════════════════════════════════════════════════════════

function _catReglaLabel(id) { return (CATEGORIAS.find(c => c.id === id) || {}).label || id; }

// ── Configuración de % ──
function renderReglas() {
  const cont = document.getElementById('reglasTabla');
  if (!cont) return;
  const reglas = listarReglasActuales()
    .sort((a, b) => (a.categoria.localeCompare(b.categoria) || ((a.medicoId || 0) - (b.medicoId || 0))));

  // Aviso: categorías sin % general definido.
  const sinGeneral = CATEGORIAS_REGLA.filter(c => !porcentajeReglaVigente(c.id, null, hoyISO()))
    .map(c => c.label);
  const aviso = sinGeneral.length
    ? `<p class="nota">Falta definir el % general de: <strong>${sinGeneral.map(escHtml).join(', ')}</strong>. Sin % general ni override, esas prestaciones calculan $0.</p>`
    : '';

  if (reglas.length === 0) {
    cont.innerHTML = aviso + '<p class="vacio">No hay % cargados. Usá «+ Definir %».</p>';
    return;
  }
  const rows = reglas.map(r => `
    <tr>
      <td>${escHtml(_catReglaLabel(r.categoria))}</td>
      <td>${r.medicoId == null ? '<strong>General</strong>' : escHtml(medicoNombre(r.medicoId))}</td>
      <td class="num">${r.porcentaje}%</td>
      <td>${escHtml(r.vigenciaDesde)}</td>
    </tr>`).join('');
  cont.innerHTML = aviso + `
    <table class="tabla">
      <thead><tr><th>Categoría</th><th>Alcance</th><th class="num">%</th><th>Vigente desde</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _mostrarModalRegla(on) { const m = document.getElementById('modalRegla'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalRegla() { _mostrarModalRegla(false); }

function abrirNuevaRegla() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  document.getElementById('regla_categoria').innerHTML =
    CATEGORIAS_REGLA.map(c => `<option value="${c.id}">${escHtml(c.label)}</option>`).join('');
  document.getElementById('regla_medico').innerHTML =
    '<option value="">General (todos los médicos)</option>' +
    getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
      .map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
  set('regla_porcentaje', ''); set('regla_vigencia', hoyISO());
  _mostrarModalRegla(true);
}

function guardarRegla() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  try {
    setReglaReparto(val('regla_categoria'), val('regla_medico') || null, val('regla_porcentaje'), val('regla_vigencia') || hoyISO());
  } catch (e) { alert(e.message); return false; }
  cerrarModalRegla();
  renderReglas();
  return true;
}

// ── Vista previa de honorarios del mes ──
function calcularPreviewHonorarios() {
  const cont = document.getElementById('previewHonorarios');
  if (!cont) return;
  const mes = document.getElementById('prevMes').value;
  const cotiz = Number(document.getElementById('prevCotiz').value) || null;
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; return; }

  const meds = honorariosDelMes(mes, cotiz);
  if (meds.length === 0) { cont.innerHTML = '<p class="vacio">No hay prestaciones activas en ese mes.</p>'; return; }

  const rows = meds.map(h => {
    const flags = [];
    if (h.requiereCotizacion) flags.push('<span class="badge-inactivo">requiere cotización</span>');
    if (h.faltaPct.length) flags.push('<span class="badge-inactivo">falta % de ' + h.faltaPct.map(c => escHtml(_catReglaLabel(c))).join(', ') + '</span>');
    return `
    <tr>
      <td>${escHtml(medicoNombre(h.medicoId))}</td>
      <td class="num">${fmtMoneda(h.total, 'ARS')}</td>
      <td>${flags.join(' ') || '<span class="muted">ok</span>'}</td>
    </tr>`;
  }).join('');
  const totalMes = meds.reduce((s, h) => s + h.total, 0);
  const reparto = repartoLentesDelMes(mes, cotiz);
  const bloqueLentes = (reparto.sam || reparto.clinica) ? `
    <h4 style="margin:18px 0 6px">Reparto de lentes/insumos (aparte de los médicos)</h4>
    <table class="tabla" style="max-width:520px">
      <tbody>
        <tr><td>Comisión <strong>SAM</strong> (externo)</td><td class="num">${fmtMoneda(reparto.sam, 'ARS')}</td></tr>
        <tr><td>Queda para <strong>SAM Oftalmo</strong> (nosotros)</td><td class="num">${fmtMoneda(reparto.clinica, 'ARS')}</td></tr>
      </tbody>
    </table>` : '';
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Médico</th><th class="num">Honorarios (ARS)</th><th>Observaciones</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Total del mes</th><th class="num">${fmtMoneda(totalMes, 'ARS')}</th><th></th></tr></tfoot>
    </table>
    ${bloqueLentes}
    <p class="muted">Vista previa (redondeo hacia abajo al peso). La liquidación formal, el comprobante y el egreso en caja se generan en la Etapa 6.</p>`;
}
