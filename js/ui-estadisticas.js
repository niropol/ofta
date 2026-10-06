// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de ESTADÍSTICAS (Etapa 7)
// ───────────────────────────────────────────────────────────────────────────
//  Sub-vistas: Clínica / Médico / Control interno. Exportación mensual en PDF
//  (ventana de impresión), texto para WhatsApp (portapapeles) y CSV contable.
// ═══════════════════════════════════════════════════════════════════════════

let _statView = 'clinica';

function _statMes() { const el = document.getElementById('statMes'); return el ? el.value : ''; }

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
  const pc = r.porCategoria || {};
  cont.innerHTML = `
    <div class="saldos">
      ${card('Consultas', pc['consulta'] || 0)}
      ${card('Estudios', pc['realizacion_estudio'] || 0)}
      ${card('Prácticas', pc['practica'] || 0)}
      ${card('Cirugías', pc['cirugia'] || 0)}
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
let _statMedicoSel = null;
function seleccionarMedicoStat(id) { _statMedicoSel = Number(id); renderEstadisticas(); }

function renderVistaMedico(cont, mes) {
  const meds = getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  if (!meds.length) { cont.innerHTML = '<p class="vacio">No hay médicos activos. Cargalos en Configuración ▸ Médicos/Consul.</p>'; return; }
  if (_statMedicoSel == null || !meds.find(m => m.id === _statMedicoSel)) _statMedicoSel = meds[0].id;
  const cur = _statMedicoSel;

  // Cuadritos de médicos (clic para elegir), con la cantidad de prestaciones del mes.
  const cards = meds.map(m => {
    const rc = resumenMedicoControl(m.id, mes);
    return `<button class="med-card${m.id === cur ? ' sel' : ''}" onclick="seleccionarMedicoStat(${m.id})">
      <span class="med-card-dot" style="background:${m.color || 'var(--primario)'}"></span>
      <span class="med-card-nombre">${escHtml(m.nombre)}</span>
      <span class="med-card-cant">${rc.total} prest.</span>
    </button>`;
  }).join('');

  // Detalle del médico seleccionado: por categoría, con descripción y cantidad (sin $).
  const r = resumenMedicoControl(cur, mes);
  const catsOrden = categoriasOrdenadasMedico(r.cats);
  const detalle = catsOrden.length
    ? catsOrden.map(c => {
        const info = r.cats[c];
        const filas = Object.entries(info.items).sort((a, b) => b[1] - a[1])
          .map(([desc, cant]) => `<tr><td>${escHtml(desc)}</td><td class="num">${cant}</td></tr>`).join('');
        return `<div style="margin-bottom:16px">
          <div class="section-head" style="margin:0 0 6px"><h4 style="margin:0">${escHtml(_catLabelSt(c))}</h4><span class="badge-ok">${info.total}</span></div>
          <table class="tabla" style="max-width:520px"><thead><tr><th>Descripción</th><th class="num">Cantidad</th></tr></thead><tbody>${filas}</tbody></table>
        </div>`;
      }).join('')
    : '<p class="vacio">Sin prestaciones este mes.</p>';

  const med = DB.medicos.find(m => m.id === cur) || {};
  cont.innerHTML = `
    <div class="med-cards">${cards}</div>
    <div class="section-head" style="margin-top:16px"><h3 style="margin:0">${escHtml(med.nombre)}</h3>
      <span class="muted">Total: ${r.total} prestación(es) · ${escHtml(mes)}</span></div>
    <p class="muted" style="margin-top:0">Resumen de lo atendido para enviarle al médico (solo control, sin valores).</p>
    <div class="btn-group" style="margin-bottom:14px">
      <button class="btn secundario" onclick="enviarResumenMedicoMail(${cur},'${mes}')">✉️ Enviar por mail</button>
      <button class="btn secundario" onclick="copiarResumenMedicoWhatsApp(${cur},'${mes}')">Copiar para WhatsApp</button>
      <button class="btn secundario" onclick="verResumenMedicoPDF(${cur},'${mes}')">Imprimir / PDF</button>
    </div>
    ${detalle}`;
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
// Texto del resumen de atenciones del médico (control, SIN valores $).
function _textoResumenMedicoControl(medicoId, mes) {
  const med = DB.medicos.find(m => m.id === Number(medicoId)) || {};
  const r = resumenMedicoControl(medicoId, mes);
  const L = [`Resumen de atenciones — ${mes}`, (med.nombre || ''), ''];
  const catsOrden = categoriasOrdenadasMedico(r.cats);
  if (!catsOrden.length) { L.push('Sin prestaciones este mes.'); }
  catsOrden.forEach(c => {
    L.push(`${_catLabelSt(c)} (${r.cats[c].total}):`);
    Object.entries(r.cats[c].items).sort((a, b) => b[1] - a[1]).forEach(([desc, cant]) => L.push(`  • ${desc}: ${cant}`));
    L.push('');
  });
  L.push(`Total: ${r.total} prestación(es).`);
  L.push('(Resumen para control, sin valores.)');
  return L.join('\n');
}

function copiarResumenMedicoWhatsApp(medicoId, mes) {
  _copiar(_textoResumenMedicoControl(medicoId, mes), 'Resumen — ' + medicoNombre(Number(medicoId)));
}

// Abre Gmail (compose) con el resumen ya cargado para enviarlo al médico.
// Usa la cuenta de Gmail con la que esté logueado el navegador (la predeterminada de la clínica).
function enviarResumenMedicoMail(medicoId, mes) {
  const med = DB.medicos.find(m => m.id === Number(medicoId));
  if (!med) return;
  if (!med.email) { avisoUI('Este médico no tiene email cargado. Agregalo en Configuración ▸ Médicos/Consul (Editar médico).'); return; }
  const asunto = `Resumen de atenciones ${mes} — ${med.nombre}`;
  const cuerpo = _textoResumenMedicoControl(medicoId, mes);
  const url = 'https://mail.google.com/mail/?view=cm&fs=1'
    + '&to=' + encodeURIComponent(med.email)
    + '&su=' + encodeURIComponent(asunto)
    + '&body=' + encodeURIComponent(cuerpo);
  try {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch (e) {
    if (typeof copiarTextoUI === 'function') copiarTextoUI('Enviar por mail a ' + med.email, cuerpo);
  }
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
  const med = DB.medicos.find(m => m.id === Number(medicoId)) || {};
  const r = resumenMedicoControl(medicoId, mes);
  const bloques = categoriasOrdenadasMedico(r.cats).map(c => {
    const filas = Object.entries(r.cats[c].items).sort((a, b) => b[1] - a[1])
      .map(([desc, cant]) => `<tr><td>${escHtml(desc)}</td><td style="text-align:right">${cant}</td></tr>`).join('');
    return `<h3 style="margin:16px 0 4px">${escHtml(_catLabelSt(c))} (${r.cats[c].total})</h3>
      <table><thead><tr><th>Descripción</th><th style="text-align:right">Cantidad</th></tr></thead><tbody>${filas}</tbody></table>`;
  }).join('') || '<p>Sin prestaciones este mes.</p>';
  const html = `<h1>SAM — Centro de Diagnóstico Médico</h1><h2>Resumen de atenciones — ${escHtml(mes)}</h2>
    <p><strong>${escHtml(med.nombre || '')}</strong> · Total: ${r.total} prestación(es)</p>
    ${bloques}
    <p style="margin-top:18px;color:#666">Resumen para control, sin valores.</p>`;
  _abrirVentanaImpresion('Resumen ' + (med.nombre || '') + ' ' + mes, html);
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

// ─────────────────────────────────────────────────────────────────────────────
//  DASHBOARD — vista principal del admin (estilo OIP).
//  KPIs del mes + distribución 60/40 (SAM retiene 60%, OFTA cobra 40%) +
//  avisos activos + agenda semanal (la misma grilla que Carga diaria).
// ─────────────────────────────────────────────────────────────────────────────
function renderDashboard() {
  const mes = hoyISO().slice(0, 7);
  const [anio, mesNum] = mes.split('-');
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const lbl = document.getElementById('dashMesLabel');
  if (lbl) lbl.textContent = (MESES[+mesNum] || '') + ' ' + anio;

  const r = resumenMes(mes);
  const facturado = r.facturadoSAM || 0;
  const ofta = r.ingresoSAM || 0;             // 40% → lo que OFTA cobra
  const sam = Math.max(0, facturado - ofta);  // 60% → lo que SAM retiene
  const pctOfta = facturado > 0 ? Math.round(ofta / facturado * 100) : 0;
  const pctSam = facturado > 0 ? 100 - pctOfta : 0;
  const fm = m => (typeof fmtMoneda === 'function' ? fmtMoneda(m) : '$' + Math.round(m || 0).toLocaleString('es-AR'));

  // ── KPIs del mes ──
  const kpis = document.getElementById('dashKpis');
  if (kpis) {
    const card = (titulo, monto, extra, cls) => `
      <div class="saldo-card ${cls || ''}">
        <div class="saldo-titulo">${titulo}</div>
        <div class="saldo-monto">${monto}</div>
        ${extra ? `<div class="muted" style="font-size:11.5px;margin-top:3px">${extra}</div>` : ''}
      </div>`;
    kpis.innerHTML =
      card('Prestaciones del mes', (r.totalPrestaciones || 0), (r.consultas || 0) + ' consultas') +
      card('Facturado a SAM', fm(facturado), 'Base del reparto') +
      card('OFTA cobra (40%)', fm(ofta), 'Ingreso de la clínica', 'total') +
      card('SAM retiene (60%)', fm(sam), 'Queda en SAM') +
      card('Honorarios médicos', fm(r.honorariosCalc || 0), 'A liquidar este mes') +
      card('Margen estimado', fm(r.margenEstimado || 0), 'OFTA 40% − honorarios', (r.margenEstimado || 0) < 0 ? 'alerta' : '');
  }

  // ── Distribución 60/40 + por obra social ──
  const dist = document.getElementById('dashDistribucion');
  if (dist) {
    let html;
    if (facturado <= 0) {
      html = '<p class="vacio">Sin prestaciones facturadas este mes.</p>';
    } else {
      html = `
        <div class="dist-split">
          <div class="dist-sam" style="width:${pctSam}%">${pctSam >= 12 ? 'SAM ' + pctSam + '%' : ''}</div>
          <div class="dist-ofta" style="width:${pctOfta}%">${pctOfta >= 12 ? 'OFTA ' + pctOfta + '%' : ''}</div>
        </div>
        <div class="dist-leg">
          <span>SAM retiene <strong>${fm(sam)}</strong></span>
          <span>OFTA cobra <strong>${fm(ofta)}</strong></span>
        </div>`;
      const porOS = (typeof ingresoSAMPorOS === 'function' ? ingresoSAMPorOS(mes) : [])
        .filter(o => o.facturado > 0).sort((a, b) => b.ingreso - a.ingreso);
      const maxIng = porOS.reduce((m, o) => Math.max(m, o.ingreso), 0) || 1;
      if (porOS.length) {
        html += `<div class="saldo-titulo" style="margin:4px 0 8px">OFTA cobra por obra social</div>`;
        html += porOS.slice(0, 8).map(o => `
          <div class="dist-row">
            <div class="dist-row-top"><span>${escHtml(o.obraSocial)}</span><span class="num">${fm(o.ingreso)}</span></div>
            <div class="dist-bar"><div style="width:${Math.round(o.ingreso / maxIng * 100)}%"></div></div>
          </div>`).join('');
      }
    }
    dist.innerHTML = html;
  }

  // ── Avisos activos (automáticos + recordatorios vencidos) ──
  const av = document.getElementById('dashAvisos');
  if (av) {
    const icon = { urgente: '🔴', importante: '🟡', info: '🔵' };
    const autos = (typeof avisosAutomaticos === 'function' ? avisosAutomaticos(mes) : []);
    const manual = (typeof alarmasVencidas === 'function' ? alarmasVencidas() : [])
      .map(a => ({ tipo: a.tipo || 'info', texto: a.texto || 'Recordatorio' }));
    const todos = autos.concat(manual);
    av.innerHTML = todos.length
      ? todos.map(a => `
          <div style="display:flex;align-items:flex-start;gap:9px;padding:9px 0;border-bottom:1px solid var(--borde)">
            <span>${icon[a.tipo] || '🔵'}</span>
            <div style="font-size:13px">${escHtml(a.texto)}</div>
          </div>`).join('')
      : '<p class="muted" style="margin:6px 0">Todo en orden. Sin avisos activos.</p>';
  }

  // ── Atenciones por médico del mes (con «Ver preliq» → vista médico) ──
  const med = document.getElementById('dashMedicos');
  if (med) {
    const lista = (typeof honorariosDelMes === 'function' ? honorariosDelMes(mes) : []);
    const maxTot = lista.reduce((m, h) => Math.max(m, h.total), 0) || 1;
    med.innerHTML = lista.length
      ? lista.map(h => {
          const nombre = (typeof medicoNombre === 'function') ? medicoNombre(h.medicoId) : ('Médico ' + h.medicoId);
          const unidades = h.detalle.reduce((s, d) => s + (d.cantidad || 1), 0);
          const falta = h.faltaValor.length ? ' <span class="badge-inactivo" title="Falta valor fijo">falta valor</span>' : '';
          return `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:11px">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;margin-bottom:3px">${escHtml(nombre)}${falta}</div>
                <div class="dist-bar"><div style="width:${Math.round(h.total / maxTot * 100)}%"></div></div>
                <div class="muted" style="font-size:11px;margin-top:2px">${unidades} prestación(es)</div>
              </div>
              <div style="text-align:right">
                <div class="num" style="font-weight:600">${fm(h.total)}</div>
                <button class="btn secundario btn-sm" style="margin-top:3px" onclick="verPreliqMedico(${h.medicoId},'${mes}')">Ver preliq</button>
              </div>
            </div>`;
        }).join('')
      : '<p class="muted" style="margin:6px 0">Sin atenciones cargadas este mes.</p>';
  }

  // ── Agenda semanal (reusa la grilla de Carga diaria) ──
  if (typeof renderHorarios === 'function') renderHorarios('dashAgenda');
}

// «Ver preliq» del dashboard: salta a Dashboard ▸ Estadísticas ▸ Vista médico para ese médico/mes.
function verPreliqMedico(medicoId, mes) {
  if (typeof irA === 'function') irA('dashboard');
  if (typeof dashTab === 'function') dashTab('estad');
  const mEl = document.getElementById('statMes');
  if (mEl && mes) mEl.value = mes;
  _statMedicoSel = Number(medicoId);
  if (typeof switchStatView === 'function') switchStatView('medico');  // renderiza la vista médico con ese médico elegido
}
