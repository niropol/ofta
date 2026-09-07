// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de LIQUIDACIONES A MÉDICOS (Etapa 6) · zona restringida
// ───────────────────────────────────────────────────────────────────────────
//  Elegís mes + cotización, generás la liquidación de cada médico (borrador),
//  la cerrás (bloquea el período y carga el egreso en caja), y sacás comprobante
//  (PDF por impresión) o mensaje de WhatsApp. Panel aparte para la comisión SAM.
// ═══════════════════════════════════════════════════════════════════════════

function _liqGV(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function _liqCotiz() { return Number(_liqGV('liqCotiz')) || null; }

function renderLiquidaciones() {
  const cont = document.getElementById('liquidacionesTabla');
  if (!cont) return;
  const mes = _liqGV('liqMes');
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; renderComisionSAM(); return; }
  const cotiz = _liqCotiz();

  // Unión de médicos con honorarios del mes + los que ya tienen liquidación.
  const calc = honorariosDelMes(mes, cotiz);
  const ids = new Set(calc.map(h => h.medicoId));
  listarLiquidaciones(mes).forEach(l => ids.add(l.medicoId));

  if (ids.size === 0) { cont.innerHTML = '<p class="vacio">No hay honorarios ni liquidaciones para este mes.</p>'; renderComisionSAM(); return; }

  const rows = [...ids].map(mid => {
    const hc = calc.find(h => h.medicoId === mid);
    const totalCalc = hc ? hc.total : 0;
    const liq = liquidacionDe(mid, mes);
    const nombre = medicoNombre(mid);
    let estado, acciones;
    if (!liq) {
      const flags = [];
      if (hc && hc.requiereCotizacion) flags.push('<span class="badge-inactivo">req. cotización</span>');
      if (hc && hc.faltaPct.length) flags.push('<span class="badge-inactivo">falta %</span>');
      estado = '<span class="muted">sin generar</span> ' + flags.join(' ');
      acciones = `<button onclick="generarLiquidacionUI(${mid})">Generar</button>`;
    } else if (liq.estado === 'borrador') {
      const drift = liq.total !== totalCalc ? ` <span class="badge-inactivo" title="El cálculo actual difiere del guardado">cambió (${fmtMoneda(totalCalc, 'ARS')})</span>` : '';
      estado = 'Borrador' + drift;
      acciones = `
        <button onclick="generarLiquidacionUI(${mid})">Regenerar</button>
        <button onclick="cerrarLiquidacionUI(${liq.id})">Cerrar y pagar</button>
        <button onclick="verComprobante(${liq.id})">Comprobante</button>
        <button onclick="copiarWhatsApp(${liq.id})">WhatsApp</button>
        <button class="danger" onclick="eliminarLiquidacionUI(${liq.id})">Eliminar</button>`;
    } else {
      estado = '<span class="pos">Cerrada</span> <span class="muted">' + escHtml(liq.fechaCierre || '') + '</span>';
      acciones = `
        <button onclick="verComprobante(${liq.id})">Comprobante</button>
        <button onclick="copiarWhatsApp(${liq.id})">WhatsApp</button>
        <button onclick="reabrirLiquidacionUI(${liq.id})">Reabrir</button>`;
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
  renderComisionSAM();
}

// Comisión SAM + lo que queda para SAM Oftalmo (del mes).
function renderComisionSAM() {
  const cont = document.getElementById('comisionSAM');
  if (!cont) return;
  const mes = _liqGV('liqMes');
  if (!mes) { cont.innerHTML = ''; return; }
  const rep = repartoLentesDelMes(mes, _liqCotiz());
  if (!rep.sam && !rep.clinica) { cont.innerHTML = '<p class="muted">Sin lentes/insumos en el mes.</p>'; return; }
  const pagada = DB.cajaMovimientos.some(m => m.origen === 'manual' && m.descripcion === 'Comisión SAM ' + mes);
  cont.innerHTML = `
    <table class="tabla" style="max-width:560px">
      <tbody>
        <tr><td>Comisión <strong>SAM</strong> (externo)</td><td class="num">${fmtMoneda(rep.sam, 'ARS')}</td>
          <td class="acc">${pagada ? '<span class="pos">pagada</span>' : `<button onclick="pagarComisionSAMUI()">Registrar pago a SAM</button>`}</td></tr>
        <tr><td>Queda para <strong>SAM Oftalmo</strong> (nosotros)</td><td class="num">${fmtMoneda(rep.clinica, 'ARS')}</td><td></td></tr>
      </tbody>
    </table>`;
}

function generarLiquidacionUI(medicoId) {
  try { generarLiquidacion(medicoId, _liqGV('liqMes'), _liqCotiz()); }
  catch (e) { alert(e.message); return; }
  renderLiquidaciones();
}

function cerrarLiquidacionUI(id) {
  if (typeof confirm === 'function' && !confirm('¿Cerrar la liquidación? Se carga el egreso en caja y se bloquea el período (podés reabrirla después).')) return;
  try { cerrarLiquidacion(id); }
  catch (e) { alert(e.message); return; }
  renderLiquidaciones();
  if (typeof renderCaja === 'function') renderCaja();
}

function reabrirLiquidacionUI(id) {
  if (typeof confirm === 'function' && !confirm('¿Reabrir? Se quita el egreso de caja y se desbloquea el período.')) return;
  reabrirLiquidacion(id);
  renderLiquidaciones();
  if (typeof renderCaja === 'function') renderCaja();
}

function eliminarLiquidacionUI(id) {
  if (typeof confirm === 'function' && !confirm('¿Eliminar esta liquidación? Queda en auditoría.')) return;
  eliminarLiquidacion(id);
  renderLiquidaciones();
  if (typeof renderCaja === 'function') renderCaja();
}

function pagarComisionSAMUI() {
  try { pagarComisionSAM(_liqGV('liqMes'), _liqCotiz()); }
  catch (e) { alert(e.message); return; }
  renderComisionSAM();
  if (typeof renderCaja === 'function') renderCaja();
}

// ── WhatsApp: copia el mensaje al portapapeles ──
function copiarWhatsApp(id) {
  const l = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!l) return;
  const msg = mensajeLiquidacionWhatsApp(l);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(() => alert('Mensaje copiado — listo para pegar en WhatsApp.'), () => window.prompt('Copiá el mensaje:', msg));
  } else {
    window.prompt('Copiá el mensaje:', msg);
  }
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
    <h1>SAM Oftalmología</h1>
    <h2>Comprobante de liquidación — ${escHtml(l.mes)}</h2>
    <p><strong>Médico:</strong> ${escHtml(med ? med.nombre : '')}<br>
       <strong>Estado:</strong> ${l.estado === 'cerrada' ? 'Cerrada (' + escHtml(l.fechaCierre || '') + ')' : 'Borrador'}
       ${l.cotizacion ? '<br><strong>Cotización USD:</strong> ' + fmtMoneda(l.cotizacion, 'ARS') : ''}</p>
    <table>
      <thead><tr><th>Fecha</th><th>Prestación</th><th>Paciente</th><th>Rol</th><th style="text-align:right">Honorario</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><th colspan="4" style="text-align:right">TOTAL A DEPOSITAR</th><th style="text-align:right">${fmtMoneda(l.total, 'ARS')}</th></tr></tfoot>
    </table>
    <p style="margin-top:24px;color:#666">Pago por transferencia bancaria. Comprobante generado el ${hoyISO()}.</p>`;
  _abrirVentanaImpresion('Liquidación ' + l.mes + ' — ' + (med ? med.nombre : ''), html);
}

function _abrirVentanaImpresion(titulo, contenidoHTML) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Habilitá las ventanas emergentes para ver el comprobante.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
    <style>
      body{font-family:Arial,sans-serif;color:#222;margin:24px;}
      h1{font-size:20px;margin:0 0 2px;} h2{font-size:15px;color:#555;margin:0 0 16px;font-weight:600;}
      table{width:100%;border-collapse:collapse;margin-top:12px;}
      th,td{border:1px solid #ddd;padding:7px 10px;font-size:13px;text-align:left;}
      thead th{background:#f5f7fa;} tfoot th{background:#f0f6ff;font-size:14px;}
      @media print{@page{margin:14mm;} button{display:none;}}
    </style></head><body>
    <div style="text-align:right"><button onclick="window.print()" style="padding:8px 18px;background:#2d5a8e;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir / PDF</button></div>
    ${contenidoHTML}
    </body></html>`);
  win.document.close();
}
