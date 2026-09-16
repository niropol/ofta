// ═══════════════════════════════════════════════════════════════════════════
//  SAM — PANEL DEL MES (parte oculta, resumen para el dueño)
// ───────────────────────────────────────────────────────────────────────────
//  Foto del mes de un vistazo: qué factura SAM, cuánto te debe pagar (40%),
//  cuánto te pagó de verdad (diferencia), qué te cuestan los insumos, cuánto
//  van los honorarios y el margen estimado. Todo calculado (no se carga acá).
// ═══════════════════════════════════════════════════════════════════════════

function renderPanelMes() {
  const cont = document.getElementById('panelContenido');
  if (!cont) return;
  const mes = (document.getElementById('panelMes') || {}).value || new Date().toISOString().slice(0, 7);

  const sam = ingresoSAMDelMes(mes);
  const hon = honorariosDelMes(mes).reduce((s, h) => s + h.total, 0);
  const cob = comparacionCobrosMes(mes);
  const modoIns = (typeof insumoModo === 'function') ? insumoModo() : 'total';
  const margen = sam.ingreso - hon;  // no restamos costo de insumos: no lo pagamos nosotros

  const card = (titulo, valor, clase, nota) => `
    <div class="saldo-card ${clase || ''}">
      <div class="saldo-titulo">${escHtml(titulo)}</div>
      <div class="saldo-monto ${valor < 0 ? 'neg' : ''}">${fmtMoneda(valor, 'ARS')}</div>
      ${nota ? `<div class="muted" style="font-size:12px;margin-top:4px">${nota}</div>` : ''}
    </div>`;

  // Cobro: comparación esperado vs recibido, sumando lo cobrado por cada OS.
  let cobroCard;
  if (cob.total === 0) {
    cobroCard = `
      <div class="saldo-card">
        <div class="saldo-titulo">SAM te pagó</div>
        <div class="saldo-monto muted">—</div>
      </div>`;
  } else if (cob.registradas === 0) {
    cobroCard = `
      <div class="saldo-card">
        <div class="saldo-titulo">SAM te pagó</div>
        <div class="saldo-monto muted">pendiente</div>
        <div class="muted" style="font-size:12px;margin-top:4px">${cob.total} OS por cobrar (Contratos ▸ Cobro de SAM).</div>
      </div>`;
  } else {
    const dif = cob.diferenciaCobrada;
    const notas = [`${cob.registradas}/${cob.total} OS cobradas`];
    if (dif !== 0) notas.push(dif > 0 ? `+${fmtMoneda(dif, 'ARS')} vs esperado` : `${fmtMoneda(dif, 'ARS')} vs esperado`);
    if (cob.pendientes) notas.push(`${cob.pendientes} pendiente(s)`);
    cobroCard = card('SAM te pagó (cobrado)', cob.recibido, dif < 0 ? 'alerta' : '', notas.join(' · '));
  }

  const alertas = [];
  if (sam.sinContrato > 0) alertas.push(`${sam.sinContrato} cirugía(s) sin contrato de OS cargado (facturan solo el insumo).`);
  if (cob.pendientes > 0) alertas.push(`${cob.pendientes} obra(s) social(es) del mes sin cobro registrado.`);

  const notaModo = modoIns === 'margen'
    ? 'Insumos: se descuenta el costo y se reparte el margen 60/40 (Mec 2)'
    : 'Insumos: se reparte lo facturado 60/40, el costo lo absorbe SAM (Mec 1)';

  cont.innerHTML = `
    <div class="saldos">
      ${card('SAM factura a las OS', sam.facturado, '', 'Contratos de cirugía + valor único + insumos')}
      ${card('SAM te debe pagar (40%)', sam.ingreso, '', notaModo)}
      ${cobroCard}
      ${card('Honorarios a médicos', hon, '', 'Valores fijos del mes')}
      ${card('Margen estimado', margen, 'total', 'Ingreso − honorarios')}
    </div>
    ${alertas.length ? `<div class="aviso" style="margin-top:14px">⚠️ ${alertas.map(escHtml).join('<br>')}</div>` : ''}`;
}
