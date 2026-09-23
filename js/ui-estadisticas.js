// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de ESTADÍSTICAS (Etapa 7)
// ───────────────────────────────────────────────────────────────────────────
//  Sub-vistas: Clínica / Médico / Control interno. Exportación mensual en PDF
//  (ventana de impresión), texto para WhatsApp (portapapeles) y CSV contable.
// ═══════════════════════════════════════════════════════════════════════════

let _statView = 'clinica';

function _statMes() { const el = document.getElementById('statMes'); return el ? el.value : ''; }
function _statCotiz() { const el = document.getElementById('statCotiz'); return el ? (Number(el.value) || null) : null; }

function switchStatView(v) {
  _statView = v;
  document.querySelectorAll('#statTabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  renderEstadisticas();
}

function renderEstadisticas() {
  const cont = document.getElementById('statContenido');
  if (!cont) return;
  const mes = _statMes();
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; return; }
  if (_statView === 'clinica') renderVistaClinica(cont, mes);
  else if (_statView === 'medico') renderVistaMedico(cont, mes);
  else renderVistaControl(cont, mes);
}

function _catLabelSt(id) { return (categoriaInfo(id) || {}).label || id; }

// ── Vista clínica ──
function renderVistaClinica(cont, mes) {
  const r = resumenMes(mes);
  const pct = DB.config.porcentajeSAM;
  const card = (t, v) => `<div class="saldo-card"><div class="saldo-titulo">${escHtml(t)}</div><div class="saldo-monto">${v}</div></div>`;
  // Por categoría: cantidad hecha + lo facturado + lo que corresponde cobrar (40%).
  const desg = desgloseCategoriasMes(mes);
  const totCant = desg.reduce((s, d) => s + d.cantidad, 0);
  const cats = desg.map(d => `<tr>
      <td>${escHtml(_catLabelSt(d.categoria))}</td>
      <td class="num">${d.cantidad}</td>
      <td class="num">${fmtMoneda(d.facturado, 'ARS')}</td>
      <td class="num">${fmtMoneda(d.ingreso, 'ARS')}</td>
    </tr>`).join('');
  const dias = Object.keys(r.porDia).sort()
    .map(d => `<tr><td>${escHtml(d)}</td><td class="num">${r.porDia[d]}</td></tr>`).join('');

  const cardMargen = (t, v) => `<div class="saldo-card total"><div class="saldo-titulo">${escHtml(t)}</div><div class="saldo-monto ${v < 0 ? 'neg' : ''}">${fmtMoneda(v, 'ARS')}</div></div>`;
  cont.innerHTML = `
    <div class="saldos">
      ${card('Prestaciones', r.totalPrestaciones)}
      ${card('Consultas', r.consultas)}
      ${card('Facturado a SAM', fmtMoneda(r.facturadoSAM, 'ARS'))}
      ${card('SAM paga (' + DB.config.porcentajeSAM + '%)', fmtMoneda(r.ingresoSAM, 'ARS'))}
      ${card('Honorarios médicos', fmtMoneda(r.honorariosCalc, 'ARS'))}
      ${cardMargen('Margen estimado', r.margenEstimado)}
      ${card('Saldo caja pesos', fmtMoneda(r.saldos.ARS.total, 'ARS'))}
    </div>
    <p class="muted" style="margin:-6px 0 14px">«Margen estimado» = SAM paga − honorarios (se actualiza al cambiar valores). «Saldo caja» es el dinero real ya movido (ingresos/egresos registrados).</p>
    <div class="btn-group" style="margin-bottom:16px">
      <button class="btn" onclick="exportarResumenPDF('${mes}')">Resumen PDF</button>
      <button class="btn secundario" onclick="exportarResumenWhatsApp('${mes}')">Copiar para WhatsApp</button>
      <button class="btn secundario" onclick="descargarCSVContable('${mes}')">CSV contable</button>
    </div>
    ${_avisosResumenHtml(mes)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div><h4>Prestaciones por categoría</h4>
        <table class="tabla"><thead><tr><th>Categoría</th><th class="num">Cantidad</th><th class="num">Facturado</th><th class="num">A cobrar (${pct}%)</th></tr></thead>
          <tbody>${cats || '<tr><td colspan="4" class="muted">Sin datos</td></tr>'}</tbody>
          <tfoot><tr><th>Total</th><th class="num">${totCant}</th><th class="num">${fmtMoneda(r.facturadoSAM, 'ARS')}</th><th class="num">${fmtMoneda(r.ingresoSAM, 'ARS')}</th></tr></tfoot></table></div>
      <div><h4>Consultas/prestaciones por día</h4>
        <table class="tabla"><thead><tr><th>Día</th><th class="num">Cantidad</th></tr></thead>
          <tbody>${dias || '<tr><td colspan="2" class="muted">Sin datos</td></tr>'}</tbody></table></div>
    </div>
    ${r.anuladas ? `<p class="nota">Anuladas en el mes: ${r.anuladas}.</p>` : ''}`;
}

// Avisos del mes en el resumen: falta de cobro de SAM y cirugías sin contrato.
function _avisosResumenHtml(mes) {
  const avisos = [];
  if (typeof comparacionCobrosMes === 'function') {
    const cob = comparacionCobrosMes(mes);
    if (cob.pendientes > 0) {
      const faltan = cob.filas.filter(f => !f.registrado)
        .map(f => `${escHtml(f.obraSocial)} (${fmtMoneda(f.esperado, 'ARS')})`).join(', ');
      avisos.push(`🔔 Falta registrar el cobro de SAM de <strong>${cob.pendientes}</strong> obra(s) social(es) de ${mes}: ${faltan}.`);
    }
  }
  if (typeof ingresoSAMDelMes === 'function') {
    const s = ingresoSAMDelMes(mes);
    if (s.sinContrato > 0) avisos.push(`⚠️ ${s.sinContrato} prestación(es) sin contrato de OS cargado (facturan de menos).`);
  }
  if (!avisos.length) return '';
  return `<div class="aviso" style="margin:-4px 0 16px">${avisos.join('<br>')}</div>`;
}

// ── Vista médico ──
function renderVistaMedico(cont, mes) {
  const meds = getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const sel = document.getElementById('statMedico');
  const cur = sel ? sel.value : (meds[0] ? meds[0].id : '');
  const opciones = meds.map(m => `<option value="${m.id}"${String(m.id) === String(cur) ? ' selected' : ''}>${escHtml(m.nombre)}</option>`).join('');
  let cuerpo = '<p class="muted">Elegí un médico.</p>';
  if (cur) {
    const r = resumenMedicoMes(Number(cur), mes);
    const cats = Object.keys(r.porCategoria).sort()
      .map(c => `<tr><td>${escHtml(_catLabelSt(c))}</td><td class="num">${r.porCategoria[c]}</td></tr>`).join('');
    const flags = [];
    if (r.faltaValor.length) flags.push('<span class="badge-inactivo">falta valor fijo</span>');
    cuerpo = `
      <div class="saldos">
        <div class="saldo-card"><div class="saldo-titulo">Prestaciones</div><div class="saldo-monto">${r.cantidad}</div></div>
        <div class="saldo-card total"><div class="saldo-titulo">Honorarios del mes</div><div class="saldo-monto">${fmtMoneda(r.total, 'ARS')}</div></div>
      </div>
      ${flags.length ? '<p class="nota">' + flags.join(' ') + '</p>' : ''}
      <div class="btn-group" style="margin-bottom:14px">
        <button class="btn" onclick="verResumenMedicoPDF(${cur},'${mes}')">Informe PDF</button>
        <button class="btn secundario" onclick="copiarResumenMedicoWhatsApp(${cur},'${mes}')">Copiar para WhatsApp</button>
      </div>
      <table class="tabla" style="max-width:420px"><thead><tr><th>Categoría</th><th class="num">Cantidad</th></tr></thead>
        <tbody>${cats || '<tr><td colspan="2" class="muted">Sin prestaciones</td></tr>'}</tbody></table>`;
  }
  cont.innerHTML = `
    <div class="filtros"><label class="muted">Médico <select id="statMedico" onchange="renderEstadisticas()">${opciones}</select></label></div>
    ${cuerpo}`;
}

// ── Vista control interno ──
function renderVistaControl(cont, mes) {
  const c = controlInterno(mes);
  const anul = c.anulaciones.map(r => `<tr><td>${escHtml(r.fecha)}</td><td>${escHtml(r.descripcion)}</td><td>${escHtml(r.motivoAnulacion || '')}</td></tr>`).join('');
  const dif = c.diferenciasCaja.map(x => `<tr><td>${escHtml(x.fecha)}</td><td>${x.moneda} · ${x.medioPago}</td><td class="num neg">${fmtMoneda(x.diferencia, x.moneda)}</td></tr>`).join('');
  const sinLiq = c.sinLiquidar.map(mid => `<li>${escHtml(medicoNombre(mid))}</li>`).join('');
  const borr = c.liquidacionesBorrador.map(l => `<li>${escHtml(medicoNombre(l.medicoId))} — ${fmtMoneda(l.total, 'ARS')} (borrador)</li>`).join('');
  cont.innerHTML = `
    <h4>Anulaciones del mes ${c.anulaciones.length ? '(' + c.anulaciones.length + ')' : ''}</h4>
    <table class="tabla"><thead><tr><th>Fecha</th><th>Prestación</th><th>Motivo</th></tr></thead>
      <tbody>${anul || '<tr><td colspan="3" class="muted">Ninguna</td></tr>'}</tbody></table>
    <h4 style="margin-top:20px">Diferencias en cierres de caja</h4>
    <table class="tabla"><thead><tr><th>Fecha</th><th>Pool</th><th class="num">Diferencia</th></tr></thead>
      <tbody>${dif || '<tr><td colspan="3" class="muted">Sin diferencias</td></tr>'}</tbody></table>
    <h4 style="margin-top:20px">Pendientes de liquidar</h4>
    <ul>${sinLiq || '<li class="muted">Ninguno</li>'}</ul>
    ${borr ? '<h4>Liquidaciones en borrador</h4><ul>' + borr + '</ul>' : ''}`;
}

// ── Exportaciones ──
function _copiar(txt, titulo) { copiarTextoUI(titulo || 'Copiar', txt); }
function exportarResumenWhatsApp(mes) { _copiar(resumenMesTextoWhatsApp(mes), 'Resumen del mes — ' + mes); }
function copiarResumenMedicoWhatsApp(medicoId, mes) {
  const r = resumenMedicoMes(Number(medicoId), mes);
  const txt = `👁 *OFTA* — ${medicoNombre(Number(medicoId))}\n📋 ${mes}\n\n🧾 Prestaciones: *${r.cantidad}*\n👨‍⚕️ Honorarios: *${fmtMoneda(r.total, 'ARS')}*`;
  _copiar(txt, 'Informe médico — ' + medicoNombre(Number(medicoId)));
}

function exportarResumenPDF(mes) {
  const r = resumenMes(mes);
  const pct = DB.config.porcentajeSAM;
  const desg = desgloseCategoriasMes(mes);
  const cats = desg.map(d => `<tr>
      <td>${escHtml(_catLabelSt(d.categoria))}</td>
      <td style="text-align:right">${d.cantidad}</td>
      <td style="text-align:right">${fmtMoneda(d.facturado, 'ARS')}</td>
      <td style="text-align:right">${fmtMoneda(d.ingreso, 'ARS')}</td>
    </tr>`).join('') || '<tr><td colspan="4">Sin prestaciones</td></tr>';
  const totCant = desg.reduce((s, d) => s + d.cantidad, 0);
  const cob = (typeof comparacionCobrosMes === 'function') ? comparacionCobrosMes(mes) : null;
  const cobHtml = (cob && cob.pendientes > 0)
    ? `<h3>Cobros pendientes de SAM</h3><p>${cob.pendientes} obra(s) social(es) sin cobro registrado: ${escHtml(cob.filas.filter(f => !f.registrado).map(f => f.obraSocial + ' (' + fmtMoneda(f.esperado, 'ARS') + ')').join(', '))}.</p>`
    : '';
  const html = `<h1>OFTA — Oftalmología</h1><h2>Resumen mensual — ${escHtml(mes)}</h2>
    <table><tbody>
      <tr><td>Prestaciones</td><td style="text-align:right">${r.totalPrestaciones}</td></tr>
      <tr><td>Consultas</td><td style="text-align:right">${r.consultas}</td></tr>
      <tr><td>SAM factura a las OS</td><td style="text-align:right">${fmtMoneda(r.facturadoSAM, 'ARS')}</td></tr>
      <tr><td>SAM paga (${pct}%)</td><td style="text-align:right">${fmtMoneda(r.ingresoSAM, 'ARS')}</td></tr>
      <tr><td>Honorarios del mes</td><td style="text-align:right">${fmtMoneda(r.honorariosCalc, 'ARS')}</td></tr>
      <tr><td>Liquidado</td><td style="text-align:right">${fmtMoneda(r.liquidado, 'ARS')}</td></tr>
      <tr><td>Margen estimado</td><td style="text-align:right">${fmtMoneda(r.margenEstimado, 'ARS')}</td></tr>
      <tr><td>Ingresos / egresos de caja</td><td style="text-align:right">${fmtMoneda(r.ingresosMes, 'ARS')} / ${fmtMoneda(r.egresosMes, 'ARS')}</td></tr>
      <tr><td>Saldo caja pesos</td><td style="text-align:right">${fmtMoneda(r.saldos.ARS.total, 'ARS')}</td></tr>
    </tbody></table>
    <h3>Prestaciones por categoría</h3>
    <table><thead><tr><th>Categoría</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Facturado a SAM</th><th style="text-align:right">SAM paga (${pct}%)</th></tr></thead>
      <tbody>${cats}</tbody>
      <tfoot><tr><th>Total</th><th style="text-align:right">${totCant}</th><th style="text-align:right">${fmtMoneda(r.facturadoSAM, 'ARS')}</th><th style="text-align:right">${fmtMoneda(r.ingresoSAM, 'ARS')}</th></tr></tfoot></table>
    ${cobHtml}`;
  _abrirVentanaImpresion('Resumen ' + mes, html);
}

function verResumenMedicoPDF(medicoId, mes) {
  const r = resumenMedicoMes(Number(medicoId), mes);
  const filas = r.detalle.map(d => `<tr><td>${escHtml(d.fecha)}</td><td>${escHtml(d.descripcion)}</td><td>${d.rol === 'derivador' ? 'Derivador' : 'Realizador'}</td><td style="text-align:right">${fmtMoneda(d.monto, 'ARS')}</td></tr>`).join('');
  const html = `<h1>OFTA — Oftalmología</h1><h2>Informe del médico — ${escHtml(mes)}</h2>
    <p><strong>${escHtml(medicoNombre(Number(medicoId)))}</strong> · Prestaciones: ${r.cantidad}</p>
    <table><thead><tr><th>Fecha</th><th>Prestación</th><th>Rol</th><th style="text-align:right">Honorario</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><th colspan="3" style="text-align:right">TOTAL</th><th style="text-align:right">${fmtMoneda(r.total, 'ARS')}</th></tr></tfoot></table>`;
  _abrirVentanaImpresion('Informe ' + medicoNombre(Number(medicoId)) + ' ' + mes, html);
}

function descargarCSVContable(mes) {
  const csv = csvContable(mes);
  try {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ofta_contable_' + mes + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    _copiar(csv, 'No se pudo descargar; CSV copiado al portapapeles.');
  }
}
