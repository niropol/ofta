// ═══════════════════════════════════════════════════════════════════════════
//  SAM — DIAGNÓSTICO (Etapa 9)
// ───────────────────────────────────────────────────────────────────────────
//  runSelfTests(): verifica el MOTOR DE CÁLCULO con casos controlados. Trabaja
//   sobre una copia de seguridad de las colecciones y las restaura al terminar,
//   así no deja rastro en los datos reales.
//  diagnosticoDatos(): chequea la INTEGRIDAD de los datos reales (sin huérfanos,
//   liquidaciones ↔ caja, honorarios sin % faltante, nextId sano). No muta nada.
// ═══════════════════════════════════════════════════════════════════════════

const _DIAG_COLS = ['medicos', 'obrasSociales', 'pacientes', 'nomenclador', 'reglasReparto',
  'prestacionesRealizadas', 'pagosMedicos', 'cajaMovimientos', 'cajaCierres', 'auditoria'];

function runSelfTests() {
  const snap = {};
  _DIAG_COLS.forEach(c => { snap[c] = JSON.parse(JSON.stringify(DB[c])); });
  const snapConfig = JSON.parse(JSON.stringify(DB.config));
  const snapNextId = DB.nextId;

  const r = [];
  const check = (nombre, real, esperado) => r.push({ nombre, ok: real === esperado, real, esperado });

  try {
    _DIAG_COLS.forEach(c => { DB[c] = []; });
    DB.medicos.push({ id: 90001, nombre: 'Test Realizador', estado: 'Activo', sedeId: 1 });
    DB.medicos.push({ id: 90002, nombre: 'Test Derivador', estado: 'Activo', sedeId: 1 });
    setReglaReparto('cirugia', null, 40, '2026-01-01');
    setReglaReparto('derivacion_cirugia', null, 10, '2026-01-01');
    setReglaReparto('insumo', null, 20, '2026-01-01');
    setReglaReparto('sam_insumo', null, 50, '2026-01-01');

    const consulta = crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000, vigenciaDesde: '2026-01-01' });
    const faco = crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' });
    const ins = crearPrestacion({ categoria: 'insumo', descripcion: 'Lente', precio: 900000, moneda: 'ARS', vigenciaDesde: '2026-01-01' });
    setCostoInsumo(ins.grupo, 300000, 'ARS');

    const rc = registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: consulta.grupo, medicoRealizadorId: 90001 });
    check('Consulta = 100% del valor', honorariosDePrestacion(rc).realizador.monto, 11000);

    const rf = registrarPrestacion({ fecha: '2026-03-02', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 90001, medicoDerivadorId: 90002, insumos: [ins.grupo] });
    const h = honorariosDePrestacion(rf);
    check('Cirugía 40% + insumo 20% del neto', h.realizador.monto, 320000);
    check('Derivador 10% en paralelo', h.derivador.monto, 50000);
    check('Comisión SAM = 50% de (neto − médico)', h.sam.monto, 240000);
    check('SAM Oftalmo = sobrante', h.clinica.monto, 240000);

    const faco2 = crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco2', precio: 10001, vigenciaDesde: '2026-01-01' });
    const rr = registrarPrestacion({ fecha: '2026-03-03', categoria: 'cirugia', grupoNomenclador: faco2.grupo, medicoRealizadorId: 90001 });
    check('Redondeo hacia abajo (4000,4 → 4000)', honorariosDePrestacion(rr).realizador.monto, 4000);

    const insU = crearPrestacion({ categoria: 'insumo', descripcion: 'LenteUSD', precio: 400, moneda: 'USD', vigenciaDesde: '2026-01-01' });
    setCostoInsumo(insU.grupo, 100, 'USD');
    const ru = registrarPrestacion({ fecha: '2026-03-04', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 90001, insumos: [insU.grupo] });
    check('USD sin cotización → marca requiere', honorariosDePrestacion(ru).realizador.requiereCotizacion, true);
    check('USD con cotización 1000 → convierte', honorariosDePrestacion(ru, 1000).realizador.monto, 260000);

    const rVieja = registrarPrestacion({ fecha: '2026-03-05', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 90001 });
    setReglaReparto('cirugia', null, 60, '2026-06-01');
    check('% de la fecha (aumento futuro no recalcula)', honorariosDePrestacion(rVieja).realizador.monto, 200000);

    registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 't', monto: 1000, moneda: 'ARS', medioPago: 'efectivo' });
    registrarMovimientoCaja({ tipo: 'egreso', descripcion: 't', monto: 300, moneda: 'ARS', medioPago: 'efectivo' });
    check('Caja netea (1000 − 300)', saldosCaja().ARS.efectivo, 700);

    const liq = generarLiquidacion(90001, '2026-03', 1000);
    cerrarLiquidacion(liq.id, '2026-03-31');
    const eg = DB.cajaMovimientos.find(m => m.origen === 'pago_medico' && m.referenciaId === liq.id);
    check('Cerrar liquidación carga egreso = total', eg ? eg.monto : null, liq.total);
    check('Período liquidado bloquea la prestación', prestacionBloqueada(rf), true);
  } catch (e) {
    r.push({ nombre: 'EXCEPCIÓN: ' + e.message, ok: false });
  } finally {
    _DIAG_COLS.forEach(c => { DB[c] = snap[c]; });
    DB.config = snapConfig;
    DB.nextId = snapNextId;
  }

  return { resultados: r, pasaron: r.filter(x => x.ok).length, total: r.length };
}

// ── Integridad de los datos reales (no muta) ──
function diagnosticoDatos() {
  const issues = [];

  DB.cajaMovimientos.filter(m => m.origen === 'pago_medico').forEach(m => {
    const l = DB.pagosMedicos.find(p => p.id === m.referenciaId);
    if (!l) issues.push(`Egreso de caja #${m.id} sin liquidación de origen.`);
    else if (l.estado !== 'cerrada') issues.push(`Egreso de caja #${m.id} de una liquidación no cerrada.`);
  });

  DB.pagosMedicos.filter(p => p.estado === 'cerrada').forEach(p => {
    const eg = DB.cajaMovimientos.find(m => m.origen === 'pago_medico' && m.referenciaId === p.id);
    if (!eg) issues.push(`Liquidación cerrada #${p.id} sin su egreso en caja.`);
    else if (eg.monto !== p.total) issues.push(`Liquidación #${p.id}: egreso (${eg.monto}) ≠ total (${p.total}).`);
  });

  DB.prestacionesRealizadas.forEach(r => {
    if (!DB.nomenclador.find(n => n.id === r.nomencladorId)) issues.push(`Prestación #${r.id}: precio de nomenclador inexistente.`);
    if (!DB.medicos.find(mm => mm.id === r.medicoRealizadorId)) issues.push(`Prestación #${r.id}: médico realizador inexistente.`);
    if (r.medicoDerivadorId && !DB.medicos.find(mm => mm.id === r.medicoDerivadorId)) issues.push(`Prestación #${r.id}: médico derivador inexistente.`);
    (r.insumos || []).forEach(i => { if (!DB.nomenclador.find(n => n.id === i.nomencladorId)) issues.push(`Prestación #${r.id}: insumo inexistente.`); });
  });

  let sinPct = 0;
  DB.prestacionesRealizadas.filter(r => r.estado === 'activa').forEach(r => {
    if (honorariosDePrestacion(r, 1).realizador.faltaPct.length) sinPct++;
  });
  if (sinPct) issues.push(`${sinPct} prestación(es) activa(s) sin % de reparto configurado.`);

  let maxId = 0;
  COLECCIONES.forEach(c => (DB[c] || []).forEach(x => { if (Number(x.id) > maxId) maxId = Number(x.id); }));
  if (DB.nextId <= maxId) issues.push(`nextId (${DB.nextId}) ≤ id máximo en uso (${maxId}).`);

  const resumen = [
    `Médicos: ${DB.medicos.length}`,
    `Prestaciones: ${DB.prestacionesRealizadas.length} (anuladas: ${DB.prestacionesRealizadas.filter(r => r.estado === 'anulada').length})`,
    `Nomenclador: ${DB.nomenclador.length} versiones`,
    `Movimientos de caja: ${DB.cajaMovimientos.length}`,
    `Liquidaciones: ${DB.pagosMedicos.length}`,
    `Registros de auditoría: ${DB.auditoria.length}`,
  ];
  return { issues, resumen };
}
