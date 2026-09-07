// ═══════════════════════════════════════════════════════════════════════════
//  SAM — ESTADÍSTICAS (Etapa 7): agregaciones para dashboards y exportación
// ───────────────────────────────────────────────────────────────────────────
//  Tres vistas: clínica (KPIs del mes), médico (resumen para entregar al médico),
//  y control interno (anulaciones, diferencias de caja, pendientes de liquidar).
//  Exportación mensual en texto para WhatsApp y CSV contable.
// ═══════════════════════════════════════════════════════════════════════════

// ── Vista clínica: KPIs del mes ──
function resumenMes(mes, cotizacion) {
  const prest = DB.prestacionesRealizadas.filter(r => (r.fecha || '').slice(0, 7) === mes);
  const activas = prest.filter(r => r.estado === 'activa');
  const porCategoria = {};
  const porDia = {};
  activas.forEach(r => {
    porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + 1;
    porDia[r.fecha] = (porDia[r.fecha] || 0) + 1;
  });
  const consultas = activas.filter(r => r.categoria === 'consulta').length;
  const anuladas = prest.filter(r => r.estado === 'anulada').length;

  const movs = DB.cajaMovimientos.filter(m => m.estado === 'activo' && (m.fecha || '').slice(0, 7) === mes && m.moneda === 'ARS');
  const ingresosMes = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const egresosMes = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  const gastosMes = movs.filter(m => m.origen === 'gasto').reduce((s, m) => s + m.monto, 0);

  const honorariosCalc = honorariosDelMes(mes, cotizacion).reduce((s, h) => s + h.total, 0);
  const liquidado = DB.pagosMedicos.filter(p => p.mes === mes && p.estado === 'cerrada').reduce((s, p) => s + p.total, 0);
  const lentes = repartoLentesDelMes(mes, cotizacion);

  return {
    mes, totalPrestaciones: activas.length, consultas, porCategoria, porDia, anuladas,
    ingresosMes, egresosMes, gastosMes, honorariosCalc, liquidado, lentes, saldos: saldosCaja(),
  };
}

// ── Vista médico: resumen para entregar (no entra al sistema) ──
function resumenMedicoMes(medicoId, mes, cotizacion) {
  const h = honorariosDeMedico(medicoId, mes, cotizacion);
  const porCategoria = {};
  h.detalle.forEach(d => {
    const reg = DB.prestacionesRealizadas.find(r => r.id === d.prestacionId);
    const cat = reg ? reg.categoria : d.rol;
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
  });
  return {
    medicoId, mes, total: h.total, cantidad: h.detalle.length, porCategoria,
    detalle: h.detalle, requiereCotizacion: h.requiereCotizacion, faltaPct: h.faltaPct,
  };
}

// ── Vista control interno ──
function controlInterno(mes) {
  const enMes = r => !mes || (r.fecha || '').slice(0, 7) === mes;
  const anulaciones = DB.prestacionesRealizadas.filter(r => r.estado === 'anulada' && enMes(r));
  const diferenciasCaja = DB.cajaCierres.filter(c => c.diferencia !== 0 && enMes(c));
  const liquidacionesBorrador = DB.pagosMedicos.filter(p => p.estado === 'borrador' && (!mes || p.mes === mes));
  const conHon = honorariosDelMes(mes).map(h => h.medicoId);
  const sinLiquidar = conHon.filter(mid => {
    const l = liquidacionDe(mid, mes);
    return !l || l.estado !== 'cerrada';
  });
  return { anulaciones, diferenciasCaja, liquidacionesBorrador, sinLiquidar };
}

// ── Exportación: texto para WhatsApp (resumen del mes) ──
function resumenMesTextoWhatsApp(mes, cotizacion) {
  const r = resumenMes(mes, cotizacion);
  const cats = Object.keys(r.porCategoria).sort()
    .map(c => `   • ${(categoriaInfo(c) || {}).label || c}: ${r.porCategoria[c]}`).join('\n');
  return `👁 *SAM Oftalmología* — Resumen ${mes}\n\n` +
    `🧾 Prestaciones: *${r.totalPrestaciones}* (consultas: ${r.consultas})\n` +
    (cats ? cats + '\n' : '') +
    (r.anuladas ? `⚠️ Anuladas: ${r.anuladas}\n` : '') +
    `\n💵 Ingresos (pesos): *${fmtMoneda(r.ingresosMes, 'ARS')}*\n` +
    `💸 Egresos (pesos): *${fmtMoneda(r.egresosMes, 'ARS')}*\n` +
    (r.gastosMes ? `   (gastos: ${fmtMoneda(r.gastosMes, 'ARS')})\n` : '') +
    `👨‍⚕️ Honorarios del mes: *${fmtMoneda(r.honorariosCalc, 'ARS')}* (liquidado: ${fmtMoneda(r.liquidado, 'ARS')})\n` +
    (r.lentes.sam ? `🔎 Comisión SAM: ${fmtMoneda(r.lentes.sam, 'ARS')} · SAM Oftalmo: ${fmtMoneda(r.lentes.clinica, 'ARS')}\n` : '') +
    `\n💰 Saldo caja pesos: *${fmtMoneda(r.saldos.ARS.total, 'ARS')}* · dólares: ${fmtMoneda(r.saldos.USD.total, 'USD')}`;
}

// ── Exportación contable: CSV de los movimientos de caja del mes ──
function _csvCampo(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvContable(mes) {
  const movs = listarMovimientosCaja({ mes }).slice().reverse(); // cronológico
  const cab = ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Monto', 'Moneda', 'Medio', 'Origen'];
  const filas = movs.map(m => [
    m.fecha, m.tipo, m.descripcion, m.categoriaGasto || '', m.monto, m.moneda, m.medioPago, m.origen,
  ].map(_csvCampo).join(','));
  return [cab.join(','), ...filas].join('\n');
}
