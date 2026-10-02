// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de LIQUIDACIONES A MÉDICOS (Etapa 6) · zona restringida
// ───────────────────────────────────────────────────────────────────────────
//  Elegís mes + cotización, generás la liquidación de cada médico (borrador),
//  la cerrás (bloquea el período y carga el egreso en caja), y sacás comprobante
//  (PDF por impresión) o mensaje de WhatsApp. Panel aparte para la comisión SAM.
// ═══════════════════════════════════════════════════════════════════════════

function _liqGV(id) { const el = document.getElementById(id); return el ? el.value : ''; }

function renderLiquidaciones() {
  const cont = document.getElementById('liquidacionesTabla');
  if (!cont) return;
  const mes = _liqGV('liqMes');
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; return; }

  // Unión de médicos con honorarios del mes + los que ya tienen liquidación.
  const calc = honorariosDelMes(mes);
  const ids = new Set(calc.map(h => h.medicoId));
  listarLiquidaciones(mes).forEach(l => ids.add(l.medicoId));

  if (ids.size === 0) { cont.innerHTML = '<p class="vacio">No hay honorarios ni liquidaciones para este mes.</p>'; return; }

  const rows = [...ids].map(mid => {
    const hc = calc.find(h => h.medicoId === mid);
    const totalCalc = hc ? hc.total : 0;
    const liq = liquidacionDe(mid, mes);
    const nombre = medicoNombre(mid);
    let estado, acciones;
    if (!liq) {
      const flags = (hc && hc.faltaValor.length) ? '<span class="badge-inactivo">falta valor fijo</span>' : '';
      estado = '<span class="muted">sin generar</span> ' + flags;
      acciones = `<button onclick="generarLiquidacionUI(${mid})">Generar</button>`;
    } else if (liq.estado === 'borrador') {
      const drift = liq.total !== totalCalc ? ` <span class="badge-inactivo" title="El cálculo actual difiere del guardado">cambió (${fmtMoneda(totalCalc, 'ARS')})</span>` : '';
      const faltaP = (liq.faltaValor && liq.faltaValor.length) ? ' <span class="badge-inactivo">falta valor fijo</span>' : '';
      estado = 'Borrador' + drift + faltaP;
      acciones = `
        <button title="Vuelve a calcular el borrador con las prestaciones y valores actuales del mes (por si cambiaron)." onclick="generarLiquidacionUI(${mid})">Regenerar</button>
        <button onclick="cerrarLiquidacionUI(${liq.id})">Cerrar y pagar</button>
        <button onclick="verComprobante(${liq.id})">Comprobante</button>
        <button onclick="copiarWhatsApp(${liq.id})">WhatsApp</button>
        <button class="danger" onclick="eliminarLiquidacionUI(${liq.id})">Eliminar</button>`;
    } else {
      const driftC = liq.total !== totalCalc;
      estado = '<span class="pos">Cerrada</span> <span class="muted">' + escHtml(liq.fechaCierre || '') + '</span>'
        + (driftC ? ` <span class="badge-inactivo" title="Los valores cambiaron después del cierre">⚠ cambió a ${fmtMoneda(totalCalc, 'ARS')}</span>` : '');
      acciones = `
        <button onclick="verComprobante(${liq.id})">Comprobante</button>
        <button onclick="copiarWhatsApp(${liq.id})">WhatsApp</button>
        ${driftC
          ? `<button class="danger" title="Reabre y recalcula con los valores actuales (queda en borrador para revisar y cerrar de nuevo)." onclick="recalcularLiquidacionUI(${liq.id})">Reabrir y regenerar</button>`
          : `<button onclick="reabrirLiquidacionUI(${liq.id})">Reabrir</button>`}`;
    }
    const montoMostrado = liq ? liq.total : totalCalc;
    return `<tr>
      <td>${escHtml(nombre)}</td>
      <td class="num">${fmtMoneda(montoMostrado, 'ARS')}</td>
      <td>${estado}</td>
      <td class="acc">${acciones}</td>
    </tr>`;
  }).join('');

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Médico</th><th class="num">A depositar</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function generarLiquidacionUI(medicoId) {
  const mes = _liqGV('liqMes');
  const yaExistia = !!liquidacionDe(Number(medicoId), mes);
  let liq;
  try { liq = generarLiquidacion(medicoId, mes); }
  catch (e) { avisoUI(e.message); return; }
  renderLiquidaciones();
  // Regenerar (borrador que ya existía) no cambia de fila, así que sin aviso
  // parecía que "no hacía nada". Confirmamos con el total recalculado.
  if (yaExistia && liq) {
    const falta = (liq.faltaValor && liq.faltaValor.length)
      ? ' Faltan valores fijos de: ' + liq.faltaValor.map(f => (typeof f === 'string' ? f : f.descripcion || '')).join(', ') + '.'
      : '';
    avisoUI('Liquidación de ' + medicoNombre(Number(medicoId)) + ' regenerada con los datos actuales del mes.\n\nTotal a depositar: ' + fmtMoneda(liq.total, 'ARS') + '.' + falta, 'Liquidación regenerada');
  }
}

function cerrarLiquidacionUI(id) {
  confirmarUI('¿Cerrar la liquidación? Se carga el egreso en caja y se bloquea el período (podés reabrirla después).').then(ok => {
    if (!ok) return;
    try { cerrarLiquidacion(id); }
    catch (e) { avisoUI(e.message); return; }
    if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderLiquidaciones(); if (typeof renderCaja === 'function') renderCaja(); }
  });
}

function reabrirLiquidacionUI(id) {
  confirmarUI('¿Reabrir? Se quita el egreso de caja y se desbloquea el período.').then(ok => {
    if (!ok) return;
    reabrirLiquidacion(id);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderLiquidaciones(); if (typeof renderCaja === 'function') renderCaja(); }
  });
}

function eliminarLiquidacionUI(id) {
  confirmarUI('¿Eliminar esta liquidación? Queda en auditoría.').then(ok => {
    if (!ok) return;
    eliminarLiquidacion(id);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderLiquidaciones(); if (typeof renderCaja === 'function') renderCaja(); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  RECÁLCULO RETROACTIVO: valores que llegan tarde (ej. en octubre, los de sept.)
// ───────────────────────────────────────────────────────────────────────────
//  Si se corrige un valor a médico, las liquidaciones ya generadas de meses
//  pasados quedan "desactualizadas" (su total guardado difiere del recalculado).
//  Se ofrece reabrir (si están cerradas) y regenerar con los valores nuevos.
// ═══════════════════════════════════════════════════════════════════════════

// Liquidaciones cuyo total guardado ya no coincide con el cálculo actual.
function liquidacionesDesactualizadas() {
  return (DB.pagosMedicos || [])
    .map(liq => ({ liq, totalNuevo: honorariosDeMedico(liq.medicoId, liq.mes).total }))
    .filter(x => x.totalNuevo !== x.liq.total);
}

// Reabre (si está cerrada) y regenera una liquidación con los valores actuales.
// Queda en BORRADOR para que el usuario la revise y la cierre de nuevo.
function recalcularLiquidacion(id) {
  const liq = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!liq) return false;
  if (liq.estado === 'cerrada') reabrirLiquidacion(liq.id);
  return generarLiquidacion(liq.medicoId, liq.mes);
}

function recalcularLiquidacionUI(id) {
  const liq = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!liq) return;
  const nombre = medicoNombre(liq.medicoId);
  const msg = liq.estado === 'cerrada'
    ? `¿Reabrir y regenerar la liquidación de ${nombre} (${liq.mes})? Se quita el egreso de la caja y queda en borrador con los valores nuevos, para que la revises y la cierres de nuevo.`
    : `¿Regenerar la liquidación de ${nombre} (${liq.mes}) con los valores actuales?`;
  confirmarUI(msg).then(ok => {
    if (!ok) return;
    recalcularLiquidacion(id);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else { renderLiquidaciones(); if (typeof renderCaja === 'function') renderCaja(); }
  });
}

// Tras cambiar un valor a médico: si hay liquidaciones afectadas, ofrecer
// recalcularlas en 1 paso (lo que el usuario eligió: "automático").
function ofrecerRecalcularAfectadas() {
  const afec = liquidacionesDesactualizadas();
  if (!afec.length) return;
  const lista = afec.map(a => '• ' + medicoNombre(a.liq.medicoId) + ' — ' + a.liq.mes
    + (a.liq.estado === 'cerrada' ? ' (cerrada)' : ' (borrador)')
    + ': ' + fmtMoneda(a.liq.total, 'ARS') + ' → ' + fmtMoneda(a.totalNuevo, 'ARS')).join('\n');
  confirmarUI('El cambio de valores afecta liquidaciones ya generadas:\n\n' + lista
    + '\n\n¿Reabrir las cerradas y regenerarlas con los valores nuevos? Quedan en borrador para revisar y cerrar de nuevo.').then(ok => {
    if (!ok) return;
    afec.forEach(a => recalcularLiquidacion(a.liq.id));
    if (typeof sincronizarUI === 'function') sincronizarUI();
    avisoUI('Se regeneraron ' + afec.length + ' liquidación(es) con los valores nuevos. Revisalas y cerralas en Pagos ▸ Liquidaciones del mes.', 'Recalculado');
  });
}

// ── Historial de pagos: todas las liquidaciones CERRADAS, de todos los meses ──
function renderHistorialPagos() {
  const cont = document.getElementById('histPagosTabla');
  if (!cont) return;
  const cerradas = (DB.pagosMedicos || [])
    .filter(p => p.estado === 'cerrada')
    .sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : (medicoNombre(a.medicoId) < medicoNombre(b.medicoId) ? -1 : 1)));
  if (!cerradas.length) { cont.innerHTML = '<p class="vacio">Todavía no hay pagos cerrados. Cerrá una liquidación en «Liquidaciones del mes».</p>'; return; }
  const total = cerradas.reduce((s, l) => s + l.total, 0);
  const rows = cerradas.map(l => `<tr>
      <td>${escHtml(l.mes)}</td>
      <td>${escHtml(medicoNombre(l.medicoId))}</td>
      <td>${escHtml(l.fechaCierre || '')}</td>
      <td class="num">${fmtMoneda(l.total, 'ARS')}</td>
      <td class="acc">
        <button onclick="verComprobante(${l.id})">Comprobante</button>
        <button onclick="copiarWhatsApp(${l.id})">WhatsApp</button>
      </td>
    </tr>`).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Mes</th><th>Médico</th><th>Pagado el</th><th class="num">Monto</th><th>Comprobante</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th colspan="3" style="text-align:right">Total pagado</th><th class="num">${fmtMoneda(total, 'ARS')}</th><th></th></tr></tfoot>
    </table>`;
}

// ── WhatsApp: muestra el mensaje en un modal para copiar ──
function copiarWhatsApp(id) {
  const l = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!l) return;
  copiarTextoUI('WhatsApp — ' + medicoNombre(l.medicoId) + ' · ' + l.mes, mensajeLiquidacionWhatsApp(l));
}

// ── Comprobante en PDF (ventana de impresión) ──
function verComprobante(id) {
  const l = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!l) return;
  const med = DB.medicos.find(m => m.id === l.medicoId);
  const filas = l.detalle.map(d => `
    <tr>
      <td>${escHtml(d.fecha)}</td>
      <td>${escHtml(d.descripcion)}</td>
      <td>${escHtml(d.paciente || '')}</td>
      <td>${d.rol === 'derivador' ? 'Derivador' : 'Realizador'}</td>
      <td style="text-align:right">${fmtMoneda(d.monto, 'ARS')}</td>
    </tr>`).join('');
  const html = `
    <h1>OFTA — Oftalmología</h1>
    <h2>Comprobante de liquidación — ${escHtml(l.mes)}</h2>
    <p><strong>Médico:</strong> ${escHtml(med ? med.nombre : '')}<br>
       <strong>Estado:</strong> ${l.estado === 'cerrada' ? 'Cerrada (' + escHtml(l.fechaCierre || '') + ')' : 'Borrador'}
    </p>
    <table>
      <thead><tr><th>Fecha</th><th>Prestación</th><th>Paciente</th><th>Rol</th><th style="text-align:right">Honorario</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><th colspan="4" style="text-align:right">TOTAL A DEPOSITAR</th><th style="text-align:right">${fmtMoneda(l.total, 'ARS')}</th></tr></tfoot>
    </table>
    <p style="margin-top:24px;color:#666">Pago por transferencia bancaria. Comprobante generado el ${hoyISO()}.</p>`;
  mostrarDocModal('Liquidación ' + l.mes + ' — ' + (med ? med.nombre : ''), html);
}
