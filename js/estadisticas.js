// ═══════════════════════════════════════════════════════════════════════════
//  SAM — ESTADÍSTICAS (Etapa 7): agregaciones para dashboards y exportación
// ───────────────────────────────────────────────────────────────────────────
//  Tres vistas: clínica (KPIs del mes), médico (resumen para entregar al médico),
//  y control interno (anulaciones, diferencias de caja, pendientes de liquidar).
//  Exportación mensual en texto para WhatsApp y CSV contable.
// ═══════════════════════════════════════════════════════════════════════════

// ── Vista clínica: KPIs del mes ──
function resumenMes(mes) {
  const prest = DB.prestacionesRealizadas.filter(r => (r.fecha || '').slice(0, 7) === mes);
  const activas = prest.filter(r => r.estado === 'activa');
  const porCategoria = {};
  const porDia = {};
  const cantDe = r => Math.max(1, Math.floor(Number(r.cantidad) || 1));
  let unidades = 0;
  activas.forEach(r => {
    const c = cantDe(r);
    porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + c;
    porDia[r.fecha] = (porDia[r.fecha] || 0) + c;
    unidades += c;
  });
  const consultas = activas.filter(r => r.categoria === 'consulta').reduce((s, r) => s + cantDe(r), 0);
  const anuladas = prest.filter(r => r.estado === 'anulada').length;

  const movs = DB.cajaMovimientos.filter(m => m.estado === 'activo' && (m.fecha || '').slice(0, 7) === mes && m.moneda === 'ARS');
  const ingresosMes = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const egresosMes = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  const gastosMes = movs.filter(m => m.origen === 'gasto').reduce((s, m) => s + m.monto, 0);

  const honorariosCalc = honorariosDelMes(mes).reduce((s, h) => s + h.total, 0);
  const liquidado = DB.pagosMedicos.filter(p => p.mes === mes && p.estado === 'cerrada').reduce((s, p) => s + p.total, 0);
  const sam = (typeof ingresoSAMDelMes === 'function') ? ingresoSAMDelMes(mes) : { facturado: 0, ingreso: 0 };

  // Margen estimado del mes: igual que el Panel del mes (lo que SAM nos paga − honorarios).
  // Es "vivo": si cambian los valores a médicos o los contratos, se recalcula al instante.
  const margenEstimado = sam.ingreso - honorariosCalc;

  return {
    mes, totalPrestaciones: unidades, registros: activas.length, consultas, porCategoria, porDia, anuladas,
    ingresosMes, egresosMes, gastosMes, honorariosCalc, liquidado, margenEstimado,
    facturadoSAM: sam.facturado, ingresoSAM: sam.ingreso, saldos: saldosCaja(),
  };
}

// ── Vista médico: resumen para entregar (no entra al sistema) ──
function resumenMedicoMes(medicoId, mes) {
  const h = honorariosDeMedico(medicoId, mes);
  const porCategoria = {};
  h.detalle.forEach(d => {
    const reg = DB.prestacionesRealizadas.find(r => r.id === d.prestacionId);
    const cat = reg ? reg.categoria : d.rol;
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
  });
  return {
    medicoId, mes, total: h.total, cantidad: h.detalle.length, porCategoria,
    detalle: h.detalle, faltaValor: h.faltaValor,
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

// ── Desglose por categoría con la CANTIDAD y el dinero que la justifica ──
//  Para cada categoría del mes: unidades hechas, lo facturado a SAM y lo que
//  SAM paga (40%). Así el informe muestra "de dónde sale" cada monto.
function desgloseCategoriasMes(mes) {
  const acc = {};
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (r.fecha || '').slice(0, 7) === mes)
    .forEach(r => {
      const i = ingresoSAMDePrestacion(r);
      const a = acc[r.categoria] || (acc[r.categoria] = { categoria: r.categoria, cantidad: 0, facturado: 0, ingreso: 0 });
      a.cantidad += i.cantidad;      // unidades (consulta/estudio se cargan por cantidad)
      a.facturado += i.facturado;
      a.ingreso += i.ingreso;
    });
  return Object.values(acc).sort((a, b) => ((categoriaInfo(a.categoria) || {}).label || a.categoria)
    .localeCompare((categoriaInfo(b.categoria) || {}).label || b.categoria, 'es'));
}

// ── Exportación: texto para WhatsApp (resumen del mes) — completo y detallado ──
function resumenMesTextoWhatsApp(mes) {
  const r = resumenMes(mes);
  const pct = DB.config.porcentajeSAM;
  const L = [];
  L.push(`👁 *OFTA* — Resumen ${mes}`);
  L.push('');

  // Prestaciones: total + desglose por categoría con cantidad y facturado.
  L.push(`🧾 *Prestaciones:* ${r.totalPrestaciones}  (consultas: ${r.consultas})`);
  const desg = desgloseCategoriasMes(mes);
  desg.forEach(d => {
    const lbl = (categoriaInfo(d.categoria) || {}).label || d.categoria;
    L.push(`   • ${lbl}: *${d.cantidad}*` + (d.facturado ? ` · ${fmtMoneda(d.facturado, 'ARS')} facturado` : ''));
  });
  if (r.anuladas) L.push(`   ⚠️ Anuladas: ${r.anuladas}`);
  L.push('');

  // Facturación y reparto con SAM (el 40% que justifica la cuenta).
  L.push(`🏦 *SAM factura:* ${fmtMoneda(r.facturadoSAM, 'ARS')}`);
  if (r.ingresoSAM) L.push(`🏦 *SAM paga (${pct}%):* ${fmtMoneda(r.ingresoSAM, 'ARS')}  (${r.totalPrestaciones} prestación/es)`);
  L.push(`👨‍⚕️ *Honorarios del mes:* ${fmtMoneda(r.honorariosCalc, 'ARS')}  (liquidado: ${fmtMoneda(r.liquidado, 'ARS')})`);
  L.push(`📈 *Margen estimado:* ${fmtMoneda(r.margenEstimado, 'ARS')}`);
  L.push('');

  // Caja real del mes.
  L.push(`💵 Caja del mes — ingresos: ${fmtMoneda(r.ingresosMes, 'ARS')} · egresos: ${fmtMoneda(r.egresosMes, 'ARS')}`);
  if (r.gastosMes) L.push(`   (gastos: ${fmtMoneda(r.gastosMes, 'ARS')})`);
  L.push(`💰 *Saldo caja:* ${fmtMoneda(r.saldos.ARS.total, 'ARS')}` + (r.saldos.USD.total ? ` · USD ${fmtMoneda(r.saldos.USD.total, 'USD')}` : ''));

  // Cobros pendientes de SAM (lo que falta cobrar del mes).
  if (typeof comparacionCobrosMes === 'function') {
    const cob = comparacionCobrosMes(mes);
    if (cob.pendientes > 0) {
      const faltan = cob.filas.filter(f => !f.registrado).map(f => f.obraSocial).join(', ');
      L.push('');
      L.push(`🔔 *Cobros pendientes:* ${cob.pendientes} OS sin registrar (${faltan})`);
    }
  }
  return L.join('\n');
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
