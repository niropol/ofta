// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de CONTRATOS (Admin / oculto)
// ───────────────────────────────────────────────────────────────────────────
//  Elegís una obra social y cargás el valor real por prestación. Abajo, el
//  cálculo de lo que SAM te tiene que pagar en el mes (40% de lo facturado) y el
//  botón para registrar ese cobro en la caja.
// ═══════════════════════════════════════════════════════════════════════════

function _poblarSelectOSContratos() {
  const sel = document.getElementById('ctrOS');
  if (!sel) return;
  const cur = sel.value;
  const activas = getObrasSocialesActivas().map(o => o.nombre);
  sel.innerHTML = activas.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  if (cur && activas.includes(cur)) sel.value = cur;
}

function renderContratos() {
  _poblarSelectOSContratos();
  renderContratosTabla();
  renderCobroSAM();
}

function renderContratosTabla() {
  const cont = document.getElementById('contratosTabla');
  if (!cont) return;
  const os = document.getElementById('ctrOS') ? document.getElementById('ctrOS').value : '';
  if (!os) { cont.innerHTML = '<p class="vacio">Cargá una obra social primero (Configuración ▸ Obras sociales).</p>'; return; }
  const filas = contratosDeOS(os);
  if (filas.length === 0) { cont.innerHTML = '<p class="vacio">No hay prestaciones en el nomenclador. Cargalas primero.</p>'; return; }
  const rows = filas.map(f => `
    <tr>
      <td>${escHtml((categoriaInfo(f.categoria) || {}).label || f.categoria)}</td>
      <td>${escHtml(f.descripcion)}</td>
      <td><input type="number" step="0.01" id="ctr_${f.grupo}" value="${f.valor != null ? f.valor : ''}" style="width:150px" placeholder="sin cargar"></td>
      <td class="num">${f.valor != null ? fmtMoneda(Math.floor(f.valor * porcentajeSAM() / 100), 'ARS') : '—'}</td>
      <td class="acc"><button onclick="guardarValorContratoUI(${f.grupo})">Guardar</button></td>
    </tr>`).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Categoría</th><th>Prestación</th><th>Valor de contrato</th>
        <th class="num">Nos paga (${porcentajeSAM()}%)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function guardarValorContratoUI(grupo) {
  const os = document.getElementById('ctrOS').value;
  const v = document.getElementById('ctr_' + grupo).value;
  if (v === '' || isNaN(Number(v))) { alert('El valor debe ser un número.'); return; }
  try { setContrato(os, grupo, v, hoyISO().slice(0, 7) + '-01'); }
  catch (e) { alert(e.message); return; }
  renderContratos();
}

// ── Cobro de SAM del mes ──
function renderCobroSAM() {
  const cont = document.getElementById('cobroSAM');
  if (!cont) return;
  const mes = document.getElementById('ctrMes') ? document.getElementById('ctrMes').value : '';
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; return; }
  const r = ingresoSAMDelMes(mes);
  const cotEl = document.getElementById('ctrCotiz');
  const cotiz = cotEl ? (Number(cotEl.value) || null) : null;
  const ci = costoInsumosDelMes(mes, cotiz);
  const yaCobrado = DB.cajaMovimientos.some(m => m.origen === 'cobro_sam' && m.referenciaId === mes);
  const yaCosto = DB.cajaMovimientos.some(m => m.origen === 'costo_insumos' && m.referenciaId === mes);
  cont.innerHTML = `
    <div class="saldos">
      <div class="saldo-card"><div class="saldo-titulo">Facturado a las OS (incluye insumos)</div><div class="saldo-monto">${fmtMoneda(r.facturado, 'ARS')}</div></div>
      <div class="saldo-card total"><div class="saldo-titulo">SAM te paga (${r.porcentaje}%)</div><div class="saldo-monto">${fmtMoneda(r.ingreso, 'ARS')}</div></div>
      <div class="saldo-card"><div class="saldo-titulo">Costo de insumos (comprás)</div><div class="saldo-monto neg">${ci.requiereCotizacion ? 'falta cotización USD' : fmtMoneda(ci.costo, 'ARS')}</div></div>
    </div>
    ${r.sinContrato ? `<p class="nota">${r.sinContrato} prestación(es) del mes sin valor de contrato cargado (solo suman sus insumos).</p>` : ''}
    <div class="btn-group">
      ${yaCobrado
        ? '<span class="diag-ok" style="margin:0">✅ Cobro de SAM registrado.</span> <button class="btn secundario" onclick="quitarCobroSAMUI()">Deshacer</button>'
        : `<button class="btn" onclick="registrarCobroSAMUI()">Registrar cobro de SAM (ingreso)</button>`}
      ${yaCosto
        ? '<span class="diag-ok" style="margin:0">✅ Costo de insumos registrado.</span> <button class="btn secundario" onclick="quitarCostoInsumosUI()">Deshacer</button>'
        : `<button class="btn" onclick="registrarCostoInsumosUI()">Registrar costo de insumos (egreso)</button>`}
    </div>`;
}

function registrarCobroSAMUI() {
  const mes = document.getElementById('ctrMes').value;
  try { registrarCobroSAM(mes); } catch (e) { alert(e.message); return; }
  renderCobroSAM();
  if (typeof renderCaja === 'function') renderCaja();
}
function quitarCobroSAMUI() {
  const mes = document.getElementById('ctrMes').value;
  quitarCobroSAM(mes);
  renderCobroSAM();
  if (typeof renderCaja === 'function') renderCaja();
}
function registrarCostoInsumosUI() {
  const mes = document.getElementById('ctrMes').value;
  const cotEl = document.getElementById('ctrCotiz');
  try { registrarCostoInsumos(mes, cotEl ? cotEl.value : null); } catch (e) { alert(e.message); return; }
  renderCobroSAM();
  if (typeof renderCaja === 'function') renderCaja();
}
function quitarCostoInsumosUI() {
  const mes = document.getElementById('ctrMes').value;
  quitarCostoInsumos(mes);
  renderCobroSAM();
  if (typeof renderCaja === 'function') renderCaja();
}
