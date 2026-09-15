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
  const cotEl = document.getElementById('panelCotiz');
  const cot = cotEl && cotEl.value ? Number(cotEl.value) : null;

  const sam = ingresoSAMDelMes(mes);
  const ins = costoInsumosDelMes(mes, cot);
  const hon = honorariosDelMes(mes).reduce((s, h) => s + h.total, 0);
  const comp = comparacionCobroSAM(mes);
  const costoIns = ins.requiereCotizacion ? 0 : ins.costo;
  const margen = sam.ingreso - costoIns - hon;

  const card = (titulo, valor, clase, nota) => `
    <div class="saldo-card ${clase || ''}">
      <div class="saldo-titulo">${escHtml(titulo)}</div>
      <div class="saldo-monto ${valor < 0 ? 'neg' : ''}">${fmtMoneda(valor, 'ARS')}</div>
      ${nota ? `<div class="muted" style="font-size:12px;margin-top:4px">${nota}</div>` : ''}
    </div>`;

  // Cobro: comparación esperado vs recibido.
  let cobroCard;
  if (!comp.registrado) {
    cobroCard = `
      <div class="saldo-card">
        <div class="saldo-titulo">SAM te pagó</div>
        <div class="saldo-monto muted">pendiente</div>
        <div class="muted" style="font-size:12px;margin-top:4px">Registrá el cobro en Contratos ▸ Cobro de SAM.</div>
      </div>`;
  } else {
    const dif = comp.diferencia;
    const nota = dif === 0 ? 'Coincide con lo esperado ✓'
      : (dif > 0 ? `Te pagaron ${fmtMoneda(dif, 'ARS')} de más` : `Te pagaron ${fmtMoneda(-dif, 'ARS')} de menos`);
    cobroCard = card('SAM te pagó', comp.recibido, dif < 0 ? 'alerta' : '', nota);
  }

  const alertas = [];
  if (sam.sinContrato > 0) alertas.push(`${sam.sinContrato} cirugía(s) sin contrato de OS cargado (no facturan).`);
  if (ins.requiereCotizacion) alertas.push('Hay insumos con costo en USD: cargá la cotización para ver el costo y el margen.');

  cont.innerHTML = `
    <div class="saldos">
      ${card('SAM factura a las OS', sam.facturado, '', 'Contratos de cirugía + valor único + insumos')}
      ${card('SAM te debe pagar (40%)', sam.ingreso, '', 'Tu ingreso esperado')}
      ${cobroCard}
      ${card('Costo de insumos', costoIns, '', ins.requiereCotizacion ? 'Falta cotización USD' : 'Lo que pagás a proveedores')}
      ${card('Honorarios a médicos', hon, '', 'Valores fijos del mes')}
      ${card('Margen estimado', margen, 'total', 'Ingreso − insumos − honorarios')}
    </div>
    ${alertas.length ? `<div class="aviso" style="margin-top:14px">⚠️ ${alertas.map(escHtml).join('<br>')}</div>` : ''}`;
}
