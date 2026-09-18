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
  _poblarSelectCatContrato();
  renderContratosTabla();
  renderCobroSAM();
}

// Categorías para el alta manual (todas menos insumo).
function _poblarSelectCatContrato() {
  const sel = document.getElementById('ctrNuevoCat');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = CATEGORIAS_NOMENCLADOR.filter(c => c.id !== 'insumo')
    .map(c => `<option value="${c.id}">${escHtml(c.label)}</option>`).join('');
  if (cur) sel.value = cur;
}

function renderContratosTabla() {
  const cont = document.getElementById('contratosTabla');
  if (!cont) return;
  const os = document.getElementById('ctrOS') ? document.getElementById('ctrOS').value : '';
  if (!os) { cont.innerHTML = '<p class="vacio">Cargá una obra social primero (pestaña «Obras sociales»).</p>'; return; }
  const orden = { consulta: 0, realizacion_estudio: 1, practica: 2, cirugia: 3 };
  const filas = contratosDeOS(os).sort((a, b) =>
    ((orden[a.categoria] ?? 9) - (orden[b.categoria] ?? 9)) || (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
  if (filas.length === 0) { cont.innerHTML = '<p class="vacio">No hay prestaciones en el nomenclador. Cargalas en «Prestaciones» o con el alta manual de acá.</p>'; return; }
  const rows = filas.map(f => `
    <tr>
      <td>${escHtml((categoriaInfo(f.categoria) || {}).label || f.categoria)}</td>
      <td>${escHtml(f.codigo || '—')}</td>
      <td>${escHtml(f.descripcion)}</td>
      <td><input type="number" step="0.01" id="ctr_${f.grupo}" value="${f.valor != null ? f.valor : ''}" style="width:140px" placeholder="sin cargar"></td>
      <td class="num">${f.valor != null ? fmtMoneda(Math.floor(f.valor * porcentajeSAM() / 100), 'ARS') : '—'}</td>
      <td class="acc">
        <button onclick="guardarValorContratoUI(${f.grupo})">Guardar</button>
        <button onclick="editarPrestacionUI(${f.grupo})" title="Editar código/descripción">✎</button>
        <button class="danger" onclick="eliminarPrestacionUI(${f.grupo})" title="Eliminar la prestación del catálogo">🗑</button>
      </td>
    </tr>`).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Tipo</th><th>Código</th><th>Descripción</th><th>Valor de contrato</th>
        <th class="num">Nos paga (${porcentajeSAM()}%)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Alta manual: crea la cirugía (código + descripción) y le pone el valor para la OS elegida.
function agregarContratoManualUI() {
  const os = (document.getElementById('ctrOS') || {}).value;
  const cat = (document.getElementById('ctrNuevoCat') || {}).value || 'consulta';
  const cod = (document.getElementById('ctrNuevoCodigo') || {}).value || '';
  const desc = (document.getElementById('ctrNuevoDesc') || {}).value || '';
  const val = (document.getElementById('ctrNuevoValor') || {}).value || '';
  try {
    const r = agregarContratoManual(os, cat, cod, desc, val, hoyISO().slice(0, 7) + '-01');
    _msgImport((r.creada ? 'Prestación creada y ' : '') + 'contrato cargado para ' + os + '.', false);
  } catch (e) { alert(e.message); return; }
  ['ctrNuevoCodigo', 'ctrNuevoDesc', 'ctrNuevoValor'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderContratos();
  if (typeof renderPanelMes === 'function') renderPanelMes();
}

// Aviso si ya se registró el cobro de esa OS (el cambio no lo toca hasta deshacerlo).
function _avisoCobrosRegistrados(os) {
  const meses = [...new Set(DB.cajaMovimientos.filter(m => m.origen === 'cobro_sam' && m.obraSocial === os).map(m => m.mesCobro))].filter(Boolean);
  if (meses.length) alert('Aviso: ya registraste el cobro de ' + os + ' (' + meses.join(', ') + '). El cambio no lo modifica; para aplicarlo, deshacé y volvé a registrar el cobro en Finanzas ▸ Cobros.');
}

function guardarValorContratoUI(grupo) {
  const os = document.getElementById('ctrOS').value;
  const v = document.getElementById('ctr_' + grupo).value;
  if (v === '' || isNaN(Number(v))) { alert('El valor debe ser un número.'); return; }
  try { _upsertContrato(os, grupo, v, hoyISO().slice(0, 7) + '-01'); }
  catch (e) { alert(e.message); return; }
  renderContratos();
  if (typeof renderPanelMes === 'function') renderPanelMes();
  _avisoCobrosRegistrados(os);
}

// ── Aumento por OS, importación de archivo y plantilla ──
function _msgImport(text, isError) {
  const el = document.getElementById('ctrImportMsg');
  if (el) el.innerHTML = '<div class="' + (isError ? 'diag-err' : 'diag-ok') + '" style="margin:8px 0">' + escHtml(text) + '</div>';
}

function aumentarContratosOSUI() {
  const os = (document.getElementById('ctrOS') || {}).value;
  const pct = (document.getElementById('ctrAumento') || {}).value;
  if (!os) { alert('Elegí una obra social.'); return; }
  if (pct === '' || isNaN(Number(pct))) { alert('Ingresá el porcentaje.'); return; }
  confirmarUI('¿Aumentar un ' + pct + '% todos los contratos de ' + os + '? Rige desde el 1° de este mes.').then(ok => {
    if (!ok) return;
    let r; try { r = aumentarContratosOS(os, pct, hoyISO().slice(0, 7) + '-01'); }
    catch (e) { alert(e.message); return; }
    document.getElementById('ctrAumento').value = '';
    _msgImport('Actualizados ' + r.actualizados + ' contrato(s) de ' + os + ' (+' + pct + '%).', false);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderContratos(); if (typeof renderPanelMes === 'function') renderPanelMes(); }
    _avisoCobrosRegistrados(os);
  });
}

// CSV simple → objetos (separador coma o punto y coma).
function _csvAObjetos(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';
  const heads = lines[0].split(sep).map(h => h.trim());
  return lines.slice(1).map(l => { const c = l.split(sep); const o = {}; heads.forEach((h, i) => o[h] = (c[i] || '').trim()); return o; });
}

// Reconoce las columnas por nombre (sin importar acentos/mayúsculas).
function _normalizarFilaContrato(row) {
  const keys = Object.keys(row);
  const norm = s => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const find = re => { const k = keys.find(k => re.test(norm(k))); return k != null ? row[k] : ''; };
  return {
    obraSocial: String(find(/obra|social|^os$/)).trim(),
    ref: String(find(/prestac|codigo|cirug|descrip|practica|nombre/)).trim(),
    valor: find(/valor|precio|monto|importe/),
  };
}

function _parsearArchivoContratos(data, name) {
  let rows;
  if (typeof XLSX !== 'undefined') {
    const wb = /\.csv$/i.test(name) ? XLSX.read(data, { type: 'string' }) : XLSX.read(new Uint8Array(data), { type: 'array' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  } else {
    rows = _csvAObjetos(data);
  }
  return rows.map(_normalizarFilaContrato).filter(f => f.obraSocial || f.ref);
}

function importarContratosArchivo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let filas;
    try { filas = _parsearArchivoContratos(e.target.result, file.name); }
    catch (err) { _msgImport('No se pudo leer el archivo: ' + err.message, true); return; }
    if (!filas.length) { _msgImport('No se reconocieron filas. El archivo necesita encabezados: obra social, prestación (o código), valor.', true); return; }
    const r = importarContratos(filas, hoyISO().slice(0, 7) + '-01');
    const errTxt = r.errores.length ? ' ' + r.errores.length + ' con error: ' + r.errores.slice(0, 4).map(x => 'fila ' + x.fila + ' (' + x.motivo + ')').join('; ') + (r.errores.length > 4 ? '…' : '') : '';
    _msgImport('Importados ' + r.ok + ' contrato(s).' + errTxt, r.ok === 0 && r.errores.length > 0);
    input.value = '';
    renderContratos();
    if (typeof renderPanelMes === 'function') renderPanelMes();
  };
  if (/\.csv$/i.test(file.name)) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

function descargarPlantillaContratos() {
  const items = listarPrestaciones({ incluirInactivos: false }).filter(n => n.categoria !== 'insumo');
  const os = (document.getElementById('ctrOS') || {}).value || 'OSDE';
  const filas = [['obra social', 'codigo', 'prestacion', 'valor']];
  if (items.length) items.forEach(c => filas.push([os, c.codigo || '', c.descripcion, '']));
  else filas.push([os, '', '(cargá prestaciones primero)', '']);
  const esc = x => /[",;\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x);
  const csv = filas.map(f => f.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'plantilla-contratos.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  cont.innerHTML = tabla;
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
