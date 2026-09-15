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
  // Particular también factura por SAM (paga 40%), así que también tiene contratos de cirugía.
  const activas = ['Particular', ...getObrasSocialesActivas().map(o => o.nombre)];
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
  if (filas.length === 0) { cont.innerHTML = '<p class="vacio">No hay cirugías en el nomenclador. (Solo las cirugías facturan por contrato de OS; consulta/estudio/práctica van por valor único, con el precio del nomenclador.)</p>'; return; }
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

// ── Cobro de SAM del mes, obra social por obra social ──
// Cada OS paga en su momento: se registra (y controla esperado vs recibido) por
// separado. _cobroOS mapea el índice de fila (para los ids de inputs) a la OS.
let _cobroOS = [];

function renderCobroSAM() {
  const cont = document.getElementById('cobroSAM');
  if (!cont) return;
  const mes = document.getElementById('ctrMes') ? document.getElementById('ctrMes').value : '';
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; return; }

  const resumen = comparacionCobrosMes(mes);
  _cobroOS = resumen.filas.map(f => f.obraSocial);

  const cotEl = document.getElementById('ctrCotiz');
  const cotiz = cotEl ? (Number(cotEl.value) || null) : null;
  const ci = costoInsumosDelMes(mes, cotiz);
  const yaCosto = DB.cajaMovimientos.some(m => m.origen === 'costo_insumos' && m.referenciaId === mes);

  let tabla;
  if (resumen.filas.length === 0) {
    tabla = '<p class="vacio">No hay prestaciones facturables en este mes.</p>';
  } else {
    const rows = resumen.filas.map((f, i) => {
      const sinC = f.sinContrato ? ` <span class="muted">(${f.sinContrato} cirugía/s sin contrato)</span>` : '';
      if (f.registrado) {
        const dif = f.diferencia;
        const difTxt = dif === 0 ? '<span class="pos">coincide ✓</span>'
          : (dif > 0 ? `<span class="pos">+${fmtMoneda(dif, 'ARS')}</span>` : `<span class="neg">${fmtMoneda(dif, 'ARS')}</span>`);
        return `
        <tr>
          <td>${escHtml(f.obraSocial)}${sinC}</td>
          <td class="num">${fmtMoneda(f.facturado, 'ARS')}</td>
          <td class="num">${fmtMoneda(f.esperado, 'ARS')}</td>
          <td class="num">${fmtMoneda(f.recibido, 'ARS')}</td>
          <td class="num">${difTxt}</td>
          <td>✅ ${escHtml(f.fecha || '')}</td>
          <td class="acc"><button class="btn secundario" onclick="quitarCobroSAMUI(${i})">Deshacer</button></td>
        </tr>`;
      }
      return `
        <tr>
          <td>${escHtml(f.obraSocial)}${sinC}</td>
          <td class="num">${fmtMoneda(f.facturado, 'ARS')}</td>
          <td class="num">${fmtMoneda(f.esperado, 'ARS')}</td>
          <td class="num"><input type="number" id="cob_rec_${i}" value="${f.esperado}" style="width:120px" title="Lo que SAM te transfirió"></td>
          <td class="num muted">—</td>
          <td><input type="date" id="cob_fec_${i}" value="${hoyISO()}"></td>
          <td class="acc"><button class="btn" onclick="registrarCobroSAMUI(${i})">Registrar</button></td>
        </tr>`;
    }).join('');
    tabla = `
      <table class="tabla">
        <thead><tr>
          <th>Obra social</th><th class="num">Facturado</th><th class="num">SAM te paga (${porcentajeSAM()}%)</th>
          <th class="num">Cobrado</th><th class="num">Diferencia</th><th>Fecha</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <th>Total</th><th class="num">${fmtMoneda(resumen.filas.reduce((s, f) => s + f.facturado, 0), 'ARS')}</th>
          <th class="num">${fmtMoneda(resumen.esperado, 'ARS')}</th>
          <th class="num">${fmtMoneda(resumen.recibido, 'ARS')}</th>
          <th class="num">${resumen.registradas ? (resumen.diferenciaCobrada === 0 ? '✓' : fmtMoneda(resumen.diferenciaCobrada, 'ARS')) : '—'}</th>
          <th colspan="2">${resumen.registradas}/${resumen.total} cobradas</th>
        </tr></tfoot>
      </table>
      <p class="muted" style="margin-top:6px">Registrá cada obra social cuando te pague; el "Cobrado" es lo que realmente te transfirió (podés editarlo si difiere del 40% esperado).</p>`;
  }

  cont.innerHTML = `
    ${tabla}
    <div class="section-head" style="margin-top:20px"><h4 style="margin:0">Costo de insumos del mes (egreso)</h4></div>
    <div class="saldos">
      <div class="saldo-card"><div class="saldo-titulo">Costo de insumos (comprás)</div><div class="saldo-monto neg">${ci.requiereCotizacion ? 'falta cotización USD' : fmtMoneda(ci.costo, 'ARS')}</div></div>
    </div>
    <div class="btn-group">
      ${yaCosto
        ? '<span class="diag-ok" style="margin:0">✅ Costo de insumos registrado.</span> <button class="btn secundario" onclick="quitarCostoInsumosUI()">Deshacer</button>'
        : `<button class="btn" onclick="registrarCostoInsumosUI()">Registrar costo de insumos (egreso)</button>`}
    </div>`;
}

function registrarCobroSAMUI(i) {
  const mes = document.getElementById('ctrMes').value;
  const os = _cobroOS[i];
  const recEl = document.getElementById('cob_rec_' + i);
  const fecEl = document.getElementById('cob_fec_' + i);
  try { registrarCobroSAM(mes, os, fecEl ? fecEl.value : null, recEl ? recEl.value : null); }
  catch (e) { alert(e.message); return; }
  renderCobroSAM();
  if (typeof renderCaja === 'function') renderCaja();
  if (typeof renderPanelMes === 'function') renderPanelMes();
}
function quitarCobroSAMUI(i) {
  const mes = document.getElementById('ctrMes').value;
  quitarCobroSAM(mes, _cobroOS[i]);
  renderCobroSAM();
  if (typeof renderCaja === 'function') renderCaja();
  if (typeof renderPanelMes === 'function') renderPanelMes();
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
