// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de CONTRATOS (Admin / oculto)
// ───────────────────────────────────────────────────────────────────────────
//  Elegís una obra social y cargás el valor real por prestación. Abajo, el
//  cálculo de lo que SAM te tiene que pagar en el mes (40% de lo facturado) y el
//  botón para registrar ese cobro en la caja.
// ═══════════════════════════════════════════════════════════════════════════

function _poblarSelectOSContratos() {
  // Particular también factura por SAM (paga 40%), así que también tiene contratos.
  const activas = ['Particular', ...getObrasSocialesActivas().map(o => o.nombre)];
  const opts = activas.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  // Select de la tabla de valores.
  const sel = document.getElementById('ctrOS');
  if (sel) { const cur = sel.value; sel.innerHTML = opts; if (cur && activas.includes(cur)) sel.value = cur; }
  // Select de la zona de aumento (con opción vacía).
  const aum = document.getElementById('ctrAumOS');
  if (aum) { const cur = aum.value; aum.innerHTML = '<option value="">— Obra social —</option>' + opts; if (cur && activas.includes(cur)) aum.value = cur; }
}

function renderContratos() {
  _poblarSelectOSContratos();
  _poblarSelectCatContrato();
  renderContratosTabla();
  renderContratosVigencias();
  renderMenorValor();
  renderCobroSAM();
}

// ── Aumento por % con vista previa (estilo OIP) ──
function calcularAumentoUI() {
  const os = (document.getElementById('ctrAumOS') || {}).value || '';
  const pct = (document.getElementById('ctrAumPct') || {}).value || '';
  const mes = (document.getElementById('ctrAumMes') || {}).value || hoyISO().slice(0, 7);
  const cont = document.getElementById('aumentoPreview');
  if (!os) { avisoUI('Elegí una obra social.'); return; }
  if (pct === '' || isNaN(Number(pct))) { avisoUI('Ingresá el porcentaje.'); return; }
  const filas = previewAumentoContratos(os, pct, mes + '-01');
  if (!filas.length) { avisoUI('Esa OS no tiene contratos cargados para ' + mes + '.'); return; }
  const totAct = filas.reduce((s, f) => s + f.actual, 0);
  const totNue = filas.reduce((s, f) => s + f.nuevo, 0);
  const rows = filas.map(f => `<tr>
      <td>${escHtml(f.codigo || '—')}</td>
      <td>${escHtml(f.descripcion)}</td>
      <td class="num">${fmtMoneda(f.actual, 'ARS')}</td>
      <td class="num">${fmtMoneda(f.nuevo, 'ARS')}</td>
      <td class="num pos">+${fmtMoneda(f.diferencia, 'ARS')}</td>
    </tr>`).join('');
  cont.innerHTML = `
    <div class="saldo-card" style="padding:0;border-top:3px solid var(--ok)">
      <div class="section-head" style="padding:12px 16px;margin:0;border-bottom:1px solid var(--borde)">
        <strong>Vista previa — +${escHtml(String(pct))}% a ${escHtml(os)} desde ${escHtml(mes)}</strong>
        <div class="btn-group">
          <button class="btn secundario" onclick="cancelarAumentoUI()">✕ Cancelar</button>
          <button class="btn" style="background:var(--ok)" onclick="aplicarAumentoUI()">✓ Aplicar aumento</button>
        </div>
      </div>
      <div class="tabla-wrap" style="max-height:320px;overflow:auto">
        <table class="tabla" style="border:none;box-shadow:none;border-radius:0">
          <thead><tr><th>Código</th><th>Descripción</th><th class="num">Valor actual</th><th class="num">Valor nuevo</th><th class="num">Diferencia</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><th colspan="2" style="text-align:right">Total</th><th class="num">${fmtMoneda(totAct, 'ARS')}</th><th class="num">${fmtMoneda(totNue, 'ARS')}</th><th class="num pos">+${fmtMoneda(totNue - totAct, 'ARS')}</th></tr></tfoot>
        </table>
      </div>
    </div>`;
  cont.style.display = '';
  cont.dataset.os = os; cont.dataset.pct = pct; cont.dataset.mes = mes;
}
function cancelarAumentoUI() { const c = document.getElementById('aumentoPreview'); if (c) { c.style.display = 'none'; c.innerHTML = ''; } }
function aplicarAumentoUI() {
  const c = document.getElementById('aumentoPreview');
  const os = c.dataset.os, pct = c.dataset.pct, mes = c.dataset.mes;
  let r; try { r = aumentarContratosOS(os, pct, mes + '-01'); }
  catch (e) { avisoUI(e.message); return; }
  cancelarAumentoUI();
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderContratos();
  avisoUI('Aumento aplicado: ' + r.actualizados + ' prestación(es) de ' + os + ' (+' + pct + '%) desde ' + mes + '.', 'Listo');
  if (typeof _avisoCobrosRegistrados === 'function') _avisoCobrosRegistrados(os);
}

// ── Contratos y vigencias (estilo OIP): una fila por OS con contratos ──
function renderContratosVigencias() {
  const cont = document.getElementById('contratosVigencias');
  if (!cont) return;
  const lista = (typeof resumenContratosPorOS === 'function') ? resumenContratosPorOS() : [];
  if (!lista.length) { cont.innerHTML = '<p class="vacio">Todavía no hay contratos cargados. Subí uno o cargá valores arriba.</p>'; return; }
  const rows = lista.map(o => {
    const vigs = o.vigencias.map(v => v.slice(0, 7)).join(', ');
    return `<tr>
      <td><strong>${escHtml(o.obraSocial)}</strong></td>
      <td>${escHtml(o.desde.slice(0, 7))}</td>
      <td class="num">${o.prestaciones}</td>
      <td class="muted">${escHtml(vigs)}</td>
      <td class="acc"><button onclick="verContratoOS('${escHtml(o.obraSocial)}')">Ver valores</button></td>
    </tr>`;
  }).join('');
  cont.innerHTML = `<table class="tabla">
    <thead><tr><th>Obra social</th><th>Vigente desde</th><th class="num">Prestaciones</th><th>Vigencias cargadas</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}
// Clic en "Ver valores" → carga esa OS en la tabla de valores.
function verContratoOS(os) {
  const sel = document.getElementById('ctrOS'); if (sel) sel.value = os;
  renderContratosTabla();
  const t = document.getElementById('contratosTabla'); if (t) t.scrollIntoView({ block: 'center' });
}

// ── Prestaciones de menor valor: comparativa de precios entre obras sociales ──
function renderMenorValor() {
  const cont = document.getElementById('menorValorTabla');
  if (!cont) return;
  const catF = (document.getElementById('mvCat') || {}).value || '';
  const q = (((document.getElementById('mvBuscar') || {}).value) || '').trim().toLowerCase();
  let filas = comparativaContratos();
  if (catF) filas = filas.filter(r => r.categoria === catF);
  if (q) filas = filas.filter(r => (r.descripcion || '').toLowerCase().includes(q) || (r.codigo || '').toLowerCase().includes(q));
  const orden = { consulta: 0, realizacion_estudio: 1, practica: 2, cirugia: 3 };
  filas.sort((a, b) => ((orden[a.categoria] ?? 9) - (orden[b.categoria] ?? 9)) || (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
  if (!filas.length) { cont.innerHTML = '<p class="vacio">No hay contratos cargados todavía. Cargá valores por obra social en «Contratos».</p>'; return; }

  const rows = filas.map(r => {
    const detalle = r.contratos.map(c =>
      `<span style="white-space:nowrap;${c.obraSocial === r.menorOS ? 'font-weight:700;color:var(--ok)' : ''}">${escHtml(c.obraSocial)} ${fmtMoneda(c.valor, 'ARS')}</span>`
    ).join(' · ');
    const dif = (r.cantidadOS > 1 && r.diferencia > 0)
      ? `<span class="muted">+${fmtMoneda(r.diferencia, 'ARS')} vs ${escHtml(r.mayorOS)}</span>` : '<span class="muted">única OS</span>';
    return `<tr>
      <td>${escHtml((categoriaInfo(r.categoria) || {}).label || r.categoria)}</td>
      <td>${escHtml(r.descripcion)}</td>
      <td><span class="badge-ok">▼ ${escHtml(r.menorOS)}</span> <strong>${fmtMoneda(r.menorValor, 'ARS')}</strong></td>
      <td>${dif}</td>
      <td class="muted" style="font-size:12px">${detalle}</td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Categoría</th><th>Prestación</th><th>Menor valor (OS)</th><th>Diferencia</th><th>Todas las OS</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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

// Al escribir la descripción, detecta la clasificación y la preselecciona (estilo OIP):
// consulta/estudio/cirugía por palabras clave; si no matchea, práctica + aviso «confirmá».
function _autoClasificarAlta() {
  const desc = ((document.getElementById('ctrNuevoDesc') || {}).value || '').trim();
  const hint = document.getElementById('ctrNuevoHint');
  const sel = document.getElementById('ctrNuevoCat');
  if (!desc) { if (hint) hint.textContent = ''; return; }
  const { categoria, dudosa } = clasificarPrestacionOFTA(desc);
  if (sel) sel.value = categoria;
  const label = (categoriaInfo(categoria) || {}).label || categoria;
  if (hint) hint.innerHTML = dudosa
    ? '⚠️ No la pude clasificar con seguridad: la puse en <strong>' + escHtml(label) + '</strong> por descarte. Confirmá o cambiala.'
    : '✓ Detectada como <strong>' + escHtml(label) + '</strong>. Cambiala si no corresponde.';
}
function _altaCatManual() { const h = document.getElementById('ctrNuevoHint'); if (h) h.textContent = 'Clasificación elegida a mano.'; }

function renderContratosTabla() {
  const cont = document.getElementById('contratosTabla');
  if (!cont) return;
  const os = document.getElementById('ctrOS') ? document.getElementById('ctrOS').value : '';
  if (!os) { cont.innerHTML = '<p class="vacio">Cargá una obra social primero (pestaña «Obras sociales»).</p>'; return; }
  // Mes elegido: muestra los valores de contrato vigentes EN ese mes; al guardar,
  // el valor rige desde ese mes. Sin selector → mes actual.
  const mesSel = (document.getElementById('ctrMes') || {}).value || hoyISO().slice(0, 7);
  const fecha = mesSel + '-01';
  const orden = { consulta: 0, realizacion_estudio: 1, practica: 2, cirugia: 3 };
  const filas = contratosDeOS(os, fecha).sort((a, b) =>
    ((orden[a.categoria] ?? 9) - (orden[b.categoria] ?? 9)) || (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
  if (filas.length === 0) { cont.innerHTML = '<p class="vacio">No hay prestaciones en el nomenclador. Cargalas en «Prestaciones» o con el alta manual de acá.</p>'; return; }
  const modoOS = (typeof _modalidadIVAdeOS === 'function') ? _modalidadIVAdeOS(os) : 'ambas';
  const rows = filas.map(f => {
    const v = versionActual(f.grupo);
    const exenta = !(v && v.ivaExento === false);
    const grav = (typeof lineaGravada === 'function') ? lineaGravada(os, f.grupo, fecha) : !exenta;
    const iva = (f.valor != null && typeof ivaDeLinea === 'function') ? ivaDeLinea(os, f.grupo, f.valor, fecha) : 0;
    const nosPaga = f.valor != null ? Math.floor((f.valor + iva) * porcentajeSAM() / 100) : null;
    const pill = exenta
      ? '<button class="pill" style="border:1px solid var(--borde);background:#eef2f7;cursor:pointer;font-size:11px;padding:3px 8px;border-radius:10px" onclick="toggleIvaPrestacionUI(' + f.grupo + ')">Exenta</button>'
      : '<button class="pill" style="border:1px solid #fde68a;background:#fffbeb;color:#92400e;cursor:pointer;font-size:11px;padding:3px 8px;border-radius:10px" onclick="toggleIvaPrestacionUI(' + f.grupo + ')">Gravada +' + ivaAlicuota() + '%</button>';
    const forzada = modoOS !== 'ambas' ? ` <span class="muted" style="font-size:10px">(OS: ${modoOS === 'exenta' ? 'exenta' : 'gravada'})</span>` : '';
    return `
    <tr>
      <td>${escHtml((categoriaInfo(f.categoria) || {}).label || f.categoria)}</td>
      <td>${escHtml(f.codigo || '—')}</td>
      <td>${escHtml(f.descripcion)}</td>
      <td>${pill}${forzada}</td>
      <td><input type="number" step="0.01" id="ctr_${f.grupo}" value="${f.valor != null ? f.valor : ''}" style="width:130px" placeholder="sin cargar">${f.vigenciaDesde ? `<br><span class="muted" style="font-size:10px">rige desde ${escHtml(f.vigenciaDesde.slice(0, 7))}</span>` : ''}</td>
      <td class="num">${nosPaga != null ? fmtMoneda(nosPaga, 'ARS') + (iva > 0 ? '<br><span class="muted" style="font-size:10px">c/IVA ' + fmtMoneda(f.valor + iva, 'ARS') + '</span>' : '') : '—'}</td>
      <td class="acc">
        <button onclick="guardarValorContratoUI(${f.grupo})">Guardar</button>
        <button onclick="editarPrestacionUI(${f.grupo})" title="Editar código/descripción">✎</button>
        <button class="danger" onclick="eliminarPrestacionUI(${f.grupo})" title="Eliminar la prestación del catálogo">🗑</button>
      </td>
    </tr>`;
  }).join('');
  // Resumen del contrato (estilo OIP): cuántas prestaciones con valor y totales.
  const conValor = filas.filter(f => f.valor != null);
  let totalValor = 0, totalNosPaga = 0;
  conValor.forEach(f => {
    const ivaF = (typeof ivaDeLinea === 'function') ? ivaDeLinea(os, f.grupo, f.valor, fecha) : 0;
    totalValor += f.valor + ivaF;
    totalNosPaga += Math.floor((f.valor + ivaF) * porcentajeSAM() / 100);
  });
  const tile = (t, v, cls) => `<div class="saldo-card ${cls || ''}"><div class="saldo-titulo">${t}</div><div class="saldo-monto">${v}</div></div>`;
  const resumen = `<div class="saldos" style="margin-bottom:16px">
    ${tile('Prestaciones con valor', conValor.length + ' / ' + filas.length)}
    ${tile('Total facturado (c/IVA)', fmtMoneda(totalValor, 'ARS'))}
    ${tile('Nos paga (' + porcentajeSAM() + '%)', fmtMoneda(totalNosPaga, 'ARS'), 'total')}
  </div>`;

  cont.innerHTML = resumen + `
    <table class="tabla">
      <thead><tr><th>Tipo</th><th>Código</th><th>Descripción</th><th>IVA</th><th>Valor de contrato</th>
        <th class="num">Nos paga (${porcentajeSAM()}%)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Alterna exenta ↔ gravada de una prestación (afecta el IVA al facturar).
function toggleIvaPrestacionUI(grupo) {
  const v = versionActual(grupo);
  if (!v) return;
  const nuevoExento = v.ivaExento === false;   // si estaba gravada → exenta; si exenta → gravada
  editarPrestacion(grupo, { ivaExento: nuevoExento });
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderContratos();
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
    // Aprende la equivalencia (OS + código/nombre → prestación) para futuras importaciones.
    if (typeof guardarAliasContrato === 'function') guardarAliasContrato(os, cod, desc, r.grupo);
    _msgImport((r.creada ? 'Prestación creada y ' : '') + 'contrato cargado para ' + os + '.', false);
  } catch (e) { avisoUI(e.message); return; }
  ['ctrNuevoCodigo', 'ctrNuevoDesc', 'ctrNuevoValor'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const hint = document.getElementById('ctrNuevoHint'); if (hint) hint.textContent = '';
  if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderContratos(); if (typeof renderPanelMes === 'function') renderPanelMes(); }
}

// Aviso si ya se registró el cobro de esa OS (el cambio no lo toca hasta deshacerlo).
function _avisoCobrosRegistrados(os) {
  const meses = [...new Set(DB.cajaMovimientos.filter(m => m.origen === 'cobro_sam' && m.obraSocial === os).map(m => m.mesCobro))].filter(Boolean);
  if (meses.length) avisoUI('Aviso: ya registraste el cobro de ' + os + ' (' + meses.join(', ') + '). El cambio no lo modifica; para aplicarlo, deshacé y volvé a registrar el cobro en Finanzas ▸ Cobros.');
}

function guardarValorContratoUI(grupo) {
  const os = document.getElementById('ctrOS').value;
  const v = document.getElementById('ctr_' + grupo).value;
  if (v === '' || isNaN(Number(v))) { avisoUI('El valor debe ser un número.'); return; }
  const mes = (document.getElementById('ctrMes') || {}).value || hoyISO().slice(0, 7);
  try { setContratoDeMes(os, grupo, v, mes); }
  catch (e) { avisoUI(e.message); return; }
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderContratos();
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
  if (!os) { avisoUI('Elegí una obra social.'); return; }
  if (pct === '' || isNaN(Number(pct))) { avisoUI('Ingresá el porcentaje.'); return; }
  const mes = (document.getElementById('ctrMes') || {}).value || hoyISO().slice(0, 7);
  confirmarUI('¿Aumentar un ' + pct + '% todos los contratos de ' + os + '? Rige desde el 1° de ' + mes + '.').then(ok => {
    if (!ok) return;
    let r; try { r = aumentarContratosOS(os, pct, mes + '-01'); }
    catch (e) { avisoUI(e.message); return; }
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

// Reconoce las columnas por nombre (sin importar acentos/mayúsculas). Separa
// código y descripción cuando vienen en columnas distintas; si no, usa lo que haya.
function _normalizarFilaContrato(row) {
  const keys = Object.keys(row);
  const norm = s => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const find = res => { for (const re of res) { const k = keys.find(k => re.test(norm(k))); if (k != null && String(row[k]).trim() !== '') return row[k]; } return ''; };
  const codigo = String(find([/^codigo$/, /codigo/, /\bcod\b/])).trim();
  const descripcion = String(find([/prestac/, /descrip/, /cirug/, /practica/, /estudio/, /nombre/])).trim();
  const categoria = String(find([/categor/, /^tipo$/])).trim();
  return {
    obraSocial: String(find([/obra/, /social/, /^os$/])).trim(),
    codigo, descripcion,
    categoria: _mapCategoriaTexto(categoria),
    valor: find([/valor/, /precio/, /monto/, /importe/]),
  };
}

// Mapea un texto libre de categoría a un id del nomenclador (o '' si no aplica).
function _mapCategoriaTexto(t) {
  const n = (t || '').toLowerCase();
  if (/consult/.test(n)) return 'consulta';
  if (/cirug/.test(n)) return 'cirugia';
  if (/practic|práctic/.test(n)) return 'practica';
  if (/estudio|estud/.test(n)) return 'realizacion_estudio';
  return '';
}

function _parsearArchivoContratos(data, name) {
  let rows;
  if (typeof XLSX !== 'undefined') {
    const wb = /\.csv$/i.test(name) ? XLSX.read(data, { type: 'string' }) : XLSX.read(new Uint8Array(data), { type: 'array' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  } else {
    rows = _csvAObjetos(data);
  }
  return rows.map(_normalizarFilaContrato).filter(f => f.obraSocial || f.codigo || f.descripcion);
}

function importarContratosArchivo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let filas;
    try { filas = _parsearArchivoContratos(e.target.result, file.name); }
    catch (err) { _msgImport('No se pudo leer el archivo: ' + err.message, true); return; }
    if (!filas.length) { _msgImport('No se reconocieron filas. El archivo necesita encabezados: obra social, código y/o prestación, valor.', true); return; }
    input.value = '';
    abrirRevisionImport(planImportarContratos(filas));
  };
  if (/\.csv$/i.test(file.name)) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

// ── Revisión de importación (confirmar el matcheo antes de guardar) ──
let _planImportActual = [];

function cerrarModalImportRev() { const m = document.getElementById('modalImportRev'); if (m) m.style.display = 'none'; }

function _badgeMatch(m) {
  if (m.estado === 'alias') return '<span class="badge-ok">✓ recordado</span>';
  if (m.estado === 'codigo') return '<span class="badge-ok">✓ código</span>';
  if (m.estado === 'exacto') return '<span class="badge-ok">✓ exacto</span>';
  if (m.estado === 'sugerido') return '<span class="badge-warn">~ ' + Math.round(m.score * 100) + '%</span>';
  return '<span class="badge-inactivo">sin match</span>';
}

// Opciones del catálogo agrupadas por categoría + acciones especiales.
function _opcionesCatalogoImport(selGrupo, estado) {
  const items = listarPrestaciones({ incluirInactivos: false }).filter(n => n.categoria !== 'insumo');
  const cats = ['consulta', 'realizacion_estudio', 'practica', 'cirugia'];
  const label = id => (categoriaInfo(id) || {}).label || id;
  let opts = '';
  // Placeholder solo si no hay selección (sin match): fuerza decidir.
  const haySel = selGrupo != null;
  opts += `<option value=""${!haySel ? ' selected' : ''} disabled>— elegí una opción —</option>`;
  cats.forEach(cat => {
    const de = items.filter(n => n.categoria === cat);
    if (!de.length) return;
    opts += `<optgroup label="${escHtml(label(cat))}">`;
    de.forEach(n => { opts += `<option value="${n.grupo}"${n.grupo === selGrupo ? ' selected' : ''}>${escHtml(n.descripcion)}${n.codigo ? ' (' + escHtml(n.codigo) + ')' : ''}</option>`; });
    opts += `</optgroup>`;
  });
  opts += `<option value="__crear__">➕ Crear prestación nueva…</option>`;
  opts += `<option value="__omitir__">⏭ Omitir esta línea</option>`;
  return opts;
}

function _opcionesCategoriaImport(sel) {
  return ['consulta', 'realizacion_estudio', 'practica', 'cirugia']
    .map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${escHtml((categoriaInfo(c) || {}).label || c)}</option>`).join('');
}

function abrirRevisionImport(plan) {
  _planImportActual = plan;
  const cont = document.getElementById('impRevBody');
  const vig = document.getElementById('impVigencia');
  if (vig && !vig.value) vig.value = hoyISO().slice(0, 7);
  const rows = plan.map((p, i) => {
    const invalida = p.problemas.length > 0;
    const selGrupo = invalida ? null : p.match.grupo;
    const catInicial = (p.match.candidato && p.match.candidato.categoria) || p.categoria || 'realizacion_estudio';
    // Si la línea no matchea con nada del catálogo, la categoría detectada guía el "crear nueva".
    const dudaCat = p.dudosa && p.match.grupo == null;
    const archivo = `<strong>${escHtml(p.obraSocial || '—')}</strong>` +
      (p.codigo ? ' · <span class="muted">' + escHtml(p.codigo) + '</span>' : '') +
      '<br>' + escHtml(p.descripcion || '—') +
      ' · <span class="muted">' + (p.valor != null ? fmtMoneda(p.valor, 'ARS') : '¿valor?') + '</span>';
    const estadoCell = invalida ? '<span class="badge-inactivo">' + escHtml(p.problemas.join(', ')) + '</span>' : _badgeMatch(p.match);
    const selDisabled = invalida ? ' disabled' : '';
    return `<tr data-i="${i}">
      <td style="min-width:230px">${archivo}</td>
      <td>${estadoCell}</td>
      <td>
        <select id="imp_g_${i}" onchange="_impFilaChange(${i})" style="min-width:230px"${selDisabled}>${_opcionesCatalogoImport(selGrupo, p.match.estado)}</select>
        <div id="imp_crear_${i}" style="display:none;margin-top:6px">
          <label class="muted" style="font-size:11px">Clasificar como
            <select id="imp_cat_${i}" title="${dudaCat ? 'No pude clasificarla con seguridad — confirmá dónde va' : 'Categoría detectada automáticamente'}"${dudaCat ? ' style="border:2px solid var(--warn);background:#fffbeb"' : ''}>${_opcionesCategoriaImport(catInicial)}</select>
          </label>${dudaCat ? ' <span title="Revisar categoría">⚠️</span>' : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `<table class="tabla"><thead><tr><th>Del archivo</th><th>Detección</th><th>Corresponde a</th></tr></thead><tbody>${rows}</tbody></table>`;
  const auto = plan.filter(p => !p.problemas.length && p.match.grupo != null).length;
  const rev = plan.length - auto;
  const inval = plan.filter(p => p.problemas.length).length;
  // Chequeos de salud del archivo (estilo OIP): conteo por categoría + códigos repetidos.
  const cont2 = { consulta: 0, realizacion_estudio: 0, practica: 0, cirugia: 0 };
  plan.forEach(p => { if (cont2[p.categoria] != null) cont2[p.categoria]++; });
  const conteoCod = {};
  plan.forEach(p => { const k = (p.codigo || '').trim(); if (k) conteoCod[k] = (conteoCod[k] || 0) + 1; });
  const dup = Object.keys(conteoCod).filter(k => conteoCod[k] > 1);
  const resumen = document.getElementById('impResumen');
  if (resumen) {
    resumen.innerHTML = plan.length + ' línea(s): ' + auto + ' reconocida(s), ' + rev + ' para revisar' + (inval ? ', ' + inval + ' inválida(s)' : '') +
      ' · 🩺 ' + cont2.consulta + ' · 🔬 ' + cont2.realizacion_estudio + ' · ⚕️ ' + cont2.practica + ' · 🔪 ' + cont2.cirugia +
      (dup.length ? '<br><span style="color:var(--danger);font-weight:600">⚠️ ' + dup.length + ' código(s) repetido(s) en el archivo: ' + escHtml(dup.slice(0, 8).join(', ')) + (dup.length > 8 ? '…' : '') + '</span>' : '');
  }
  document.getElementById('impRevMsg').innerHTML = '';
  const m = document.getElementById('modalImportRev'); if (m) m.style.display = 'flex';
  plan.forEach((p, i) => _impFilaChange(i));   // mostrar el sub-select "crear" si corresponde
}

function _impFilaChange(i) {
  const sel = document.getElementById('imp_g_' + i);
  const box = document.getElementById('imp_crear_' + i);
  if (sel && box) box.style.display = (sel.value === '__crear__') ? 'block' : 'none';
}

function confirmarImportacionUI() {
  const desde = ((document.getElementById('impVigencia') || {}).value || hoyISO().slice(0, 7)) + '-01';
  const decisiones = [];
  let sinResolver = 0;
  _planImportActual.forEach((p, i) => {
    if (p.problemas.length) return;   // filas inválidas del archivo: se ignoran
    const sel = document.getElementById('imp_g_' + i);
    const v = sel ? sel.value : '';
    if (v === '' ) { sinResolver++; return; }
    if (v === '__omitir__') { decisiones.push({ ...p, accion: 'omitir' }); return; }
    if (v === '__crear__') {
      const cat = (document.getElementById('imp_cat_' + i) || {}).value || 'realizacion_estudio';
      decisiones.push({ ...p, accion: 'crear', categoria: cat, recordar: true });
      return;
    }
    decisiones.push({ ...p, accion: 'asignar', grupo: Number(v), recordar: true });
  });
  if (sinResolver > 0) {
    document.getElementById('impRevMsg').innerHTML = '<div class="diag-err" style="margin:8px 0">Quedan ' + sinResolver + ' línea(s) sin resolver (marcadas «sin match»): elegí una prestación, «Crear nueva» u «Omitir».</div>';
    return;
  }
  const r = aplicarImportacionContratos(decisiones, desde);
  cerrarModalImportRev();
  const errTxt = r.errores.length ? ' · ' + r.errores.length + ' con error: ' + r.errores.slice(0, 3).map(x => 'fila ' + x.fila + ' (' + x.motivo + ')').join('; ') : '';
  _msgImport('Importados ' + r.ok + ' contrato(s)' + (r.creadas ? ' (' + r.creadas + ' prestación/es nueva/s)' : '') + '.' + errTxt, r.ok === 0 && r.errores.length > 0);
  if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderContratos(); if (typeof renderPanelMes === 'function') renderPanelMes(); }
}

function descargarPlantillaContratos() {
  const items = listarPrestaciones({ incluirInactivos: false }).filter(n => n.categoria !== 'insumo');
  const os = (document.getElementById('ctrOS') || {}).value || 'OSDE';
  const filas = [['obra social', 'codigo', 'prestacion', 'categoria', 'valor']];
  const catLabel = id => (categoriaInfo(id) || {}).label || id;
  if (items.length) items.forEach(c => filas.push([os, c.codigo || '', c.descripcion, catLabel(c.categoria), '']));
  else filas.push([os, '', '(cargá prestaciones primero)', '', '']);
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
  catch (e) { avisoUI(e.message); return; }
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

// ═══════════════════════════════════════════════════════════════════════════
//  PRESTACIONES — vista única estilo OIP (todas las OS, filtro) + edición por modal
// ───────────────────────────────────────────────────────────────────────────
//  Una fila por (obra social × prestación) con su valor. "Editar" abre un modal
//  donde se cambia el valor y la VIGENCIA (el mes desde el que rige) — así se
//  corrigen valores de meses pasados sin pisar los anteriores (setContratoDeMes).
// ═══════════════════════════════════════════════════════════════════════════

function _osParaPrest() { return ['Particular', ...getObrasSocialesActivas().map(o => o.nombre)]; }

const _CAT_PILL_PREST = {
  consulta:            { label: '🩺 Consulta', bg: 'var(--acento-soft)', fg: 'var(--acento)' },
  realizacion_estudio: { label: '🔬 Estudio',  bg: '#ede8f5',            fg: '#5a3a99' },
  practica:            { label: '⚕️ Práctica', bg: 'var(--warn-soft)',  fg: 'var(--warn)' },
  cirugia:             { label: '🔪 Cirugía',  bg: 'var(--primario-soft)', fg: 'var(--primario)' },
};

function renderPrestacionesOIP() {
  const cont = document.getElementById('prestOIPTabla');
  if (!cont) return;
  const selF = document.getElementById('prestFiltroOS');
  if (selF) {
    const cur = selF.value;
    selF.innerHTML = '<option value="">Todas las OS</option>' + _osParaPrest().map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    if (cur) selF.value = cur;
  }
  const q = (((document.getElementById('prestBuscarOIP') || {}).value) || '').trim().toLowerCase();
  const filtro = (selF || {}).value || '';
  const hoy = hoyISO();
  const orden = { consulta: 0, realizacion_estudio: 1, practica: 2, cirugia: 3 };
  const osList = filtro ? [filtro] : _osParaPrest();
  const rows = [];
  osList.forEach(os => {
    contratosDeOS(os, hoy)
      .filter(c => c.valor != null && (!q || (c.descripcion || '').toLowerCase().includes(q) || (c.codigo || '').toLowerCase().includes(q)))
      .sort((a, b) => ((orden[a.categoria] ?? 9) - (orden[b.categoria] ?? 9)) || String(a.codigo || '').localeCompare(String(b.codigo || ''), undefined, { numeric: true }))
      .forEach(c => {
        const ver = versionActual(c.grupo);
        const exenta = !(ver && ver.ivaExento === false);
        const valPart = valorContrato('Particular', c.grupo, hoy);
        const cp = _CAT_PILL_PREST[c.categoria] || { label: c.categoria, bg: 'var(--panel-2)', fg: 'var(--muted)' };
        const vig = c.vigenciaDesde ? c.vigenciaDesde.slice(0, 7) : '—';
        rows.push(`<tr>
          <td style="font-family:var(--mono);font-size:11px;font-weight:600">${escHtml(c.codigo || '—')}</td>
          <td>${escHtml(c.descripcion)}</td>
          <td><span class="pill" style="background:var(--acento-soft);color:var(--acento);font-size:10px">${escHtml(os)}</span></td>
          <td><button class="pill" title="Clic para cambiar la categoría" onclick="togglePrestCatOIP(${c.grupo})" style="border:none;cursor:pointer;font-size:10px;background:${cp.bg};color:${cp.fg}">${cp.label}</button></td>
          <td class="num" style="font-weight:600">${fmtMoneda(c.valor, 'ARS')}</td>
          <td class="num muted">${valPart != null ? fmtMoneda(valPart, 'ARS') : '—'}</td>
          <td class="muted" style="font-size:11px">${escHtml(vig)}</td>
          <td><button class="pill" onclick="toggleIvaPrestacionUI(${c.grupo})" style="border:none;cursor:pointer;font-size:10px;${exenta ? 'background:var(--ok-soft);color:var(--ok)' : 'background:var(--warn-soft);color:var(--warn)'}">${exenta ? '✓ Exenta' : '⚡ ' + ivaAlicuota() + '%'}</button></td>
          <td class="acc"><button onclick="abrirEditarPrestOIP('${escHtml(os).replace(/'/g, "\\'")}',${c.grupo})">Editar</button></td>
        </tr>`);
      });
  });
  cont.innerHTML = rows.length
    ? `<table class="tabla"><thead><tr><th>Código</th><th>Descripción</th><th>OS</th><th>Categoría</th><th class="num">Valor OS</th><th class="num">Valor particular</th><th>Vigencia</th><th>IVA</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`
    : '<p class="vacio">No hay prestaciones con contrato para ese filtro. Cargá valores en «Contratos OS» o con «+ Nueva prestación».</p>';
}

// Cambiar la categoría de una prestación (rota entre los 4 tipos), como el pill de OIP.
function togglePrestCatOIP(grupo) {
  const ver = versionActual(grupo); if (!ver) return;
  const ciclo = ['consulta', 'realizacion_estudio', 'practica', 'cirugia'];
  const i = ciclo.indexOf(ver.categoria);
  const nueva = ciclo[(i + 1) % ciclo.length];
  try { editarPrestacion(grupo, { categoria: nueva }); } catch (e) { avisoUI(e.message); return; }
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderPrestacionesOIP();
}

// ── Modal de edición de una prestación para una OS (estilo OIP) ──
function abrirEditarPrestOIP(os, grupo) {
  const ver = versionActual(grupo); if (!ver) return;
  const mes = hoyISO().slice(0, 7);
  const valor = valorContrato(os, grupo, mes + '-01');
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('ep_os', os); set('ep_grupo', grupo);
  set('ep_codigo', ver.codigo || ''); set('ep_desc', ver.descripcion || '');
  set('ep_valor', valor != null ? valor : '');
  set('ep_vigencia', vigenciaContrato(os, grupo, mes + '-01') ? vigenciaContrato(os, grupo, mes + '-01').slice(0, 7) : mes);
  const selIva = document.getElementById('ep_iva'); if (selIva) selIva.value = (ver.ivaExento === false) ? 'false' : 'true';
  const selCat = document.getElementById('ep_cat');
  if (selCat) selCat.innerHTML = ['consulta', 'realizacion_estudio', 'practica', 'cirugia'].map(c => `<option value="${c}"${c === ver.categoria ? ' selected' : ''}>${(categoriaInfo(c) || {}).label || c}</option>`).join('');
  const m = document.getElementById('modalEditarPrest'); if (m) m.style.display = 'flex';
}
function cerrarEditarPrestOIP() { const m = document.getElementById('modalEditarPrest'); if (m) m.style.display = 'none'; }

function guardarEditarPrestOIP() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const grupo = Number(val('ep_grupo')), os = val('ep_os');
  if (!grupo || !os) return;
  const valor = val('ep_valor'), mes = val('ep_vigencia') || hoyISO().slice(0, 7);
  if (valor === '' || isNaN(Number(valor))) { avisoUI('El valor debe ser un número.'); return; }
  try {
    editarPrestacion(grupo, { codigo: val('ep_codigo'), descripcion: val('ep_desc'), categoria: val('ep_cat'), ivaExento: val('ep_iva') === 'true' ? true : false });
    setContratoDeMes(os, grupo, valor, mes);
  } catch (e) { avisoUI(e.message); return; }
  cerrarEditarPrestOIP();
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderPrestacionesOIP();
  if (typeof ofrecerRecalcularAfectadas === 'function') ofrecerRecalcularAfectadas();
}
