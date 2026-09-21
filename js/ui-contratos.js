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
  renderMenorValor();
  renderCobroSAM();
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
  const orden = { consulta: 0, realizacion_estudio: 1, practica: 2, cirugia: 3 };
  const filas = contratosDeOS(os).sort((a, b) =>
    ((orden[a.categoria] ?? 9) - (orden[b.categoria] ?? 9)) || (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
  if (filas.length === 0) { cont.innerHTML = '<p class="vacio">No hay prestaciones en el nomenclador. Cargalas en «Prestaciones» o con el alta manual de acá.</p>'; return; }
  const modoOS = (typeof _modalidadIVAdeOS === 'function') ? _modalidadIVAdeOS(os) : 'ambas';
  const rows = filas.map(f => {
    const v = versionActual(f.grupo);
    const exenta = !(v && v.ivaExento === false);
    const grav = (typeof lineaGravada === 'function') ? lineaGravada(os, f.grupo) : !exenta;
    const iva = (f.valor != null && typeof ivaDeLinea === 'function') ? ivaDeLinea(os, f.grupo, f.valor) : 0;
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
      <td><input type="number" step="0.01" id="ctr_${f.grupo}" value="${f.valor != null ? f.valor : ''}" style="width:130px" placeholder="sin cargar"></td>
      <td class="num">${nosPaga != null ? fmtMoneda(nosPaga, 'ARS') + (iva > 0 ? '<br><span class="muted" style="font-size:10px">c/IVA ' + fmtMoneda(f.valor + iva, 'ARS') + '</span>' : '') : '—'}</td>
      <td class="acc">
        <button onclick="guardarValorContratoUI(${f.grupo})">Guardar</button>
        <button onclick="editarPrestacionUI(${f.grupo})" title="Editar código/descripción">✎</button>
        <button class="danger" onclick="eliminarPrestacionUI(${f.grupo})" title="Eliminar la prestación del catálogo">🗑</button>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
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
  try { _upsertContrato(os, grupo, v, hoyISO().slice(0, 7) + '-01'); }
  catch (e) { avisoUI(e.message); return; }
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
  if (!os) { avisoUI('Elegí una obra social.'); return; }
  if (pct === '' || isNaN(Number(pct))) { avisoUI('Ingresá el porcentaje.'); return; }
  confirmarUI('¿Aumentar un ' + pct + '% todos los contratos de ' + os + '? Rige desde el 1° de este mes.').then(ok => {
    if (!ok) return;
    let r; try { r = aumentarContratosOS(os, pct, hoyISO().slice(0, 7) + '-01'); }
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
