// ═══════════════════════════════════════════════════════════════════════════
//  SAM — DIAGNÓSTICO (Etapa 9)
// ───────────────────────────────────────────────────────────────────────────
//  runSelfTests(): verifica el MOTOR DE CÁLCULO con casos controlados. Trabaja
//   sobre una copia de seguridad de las colecciones y las restaura al terminar,
//   así no deja rastro en los datos reales.
//  diagnosticoDatos(): chequea la INTEGRIDAD de los datos reales (sin huérfanos,
//   liquidaciones ↔ caja, honorarios sin % faltante, nextId sano). No muta nada.
// ═══════════════════════════════════════════════════════════════════════════

const _DIAG_COLS = ['medicos', 'obrasSociales', 'pacientes', 'nomenclador', 'contratos', 'valoresMedico',
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
    DB.contratos = []; DB.valoresMedico = [];
    DB.medicos.push({ id: 90001, nombre: 'Test Realizador', estado: 'Activo', sedeId: 1 });
    DB.medicos.push({ id: 90002, nombre: 'Test Derivador', estado: 'Activo', sedeId: 1 });
    // Valores fijos a médicos.
    setValorMedico('consulta', null, 8000, '2026-01-01');
    setValorMedico('cirugia', null, 120000, '2026-01-01');
    setValorMedico('derivacion', null, 20000, '2026-01-01');
    setValorMedico('cirugia', 90001, 150000, '2026-01-01'); // override por médico

    const consulta = crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', vigenciaDesde: '2026-01-01' });
    const faco = crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', vigenciaDesde: '2026-01-01' });

    const rc = registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: consulta.grupo, medicoRealizadorId: 90001 });
    check('Consulta = valor fijo', honorariosDePrestacion(rc).realizador.monto, 8000);

    const rf = registrarPrestacion({ fecha: '2026-03-02', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 90001, medicoDerivadorId: 90002 });
    const h = honorariosDePrestacion(rf);
    check('Cirugía = override del médico (150000)', h.realizador.monto, 150000);
    check('Derivador = valor fijo de derivación', h.derivador.monto, 20000);

    const rGen = registrarPrestacion({ fecha: '2026-03-03', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 90002 });
    check('Cirugía sin override = valor general (120000)', honorariosDePrestacion(rGen).realizador.monto, 120000);

    const rExtra = registrarPrestacion({ fecha: '2026-03-04', categoria: 'consulta', grupoNomenclador: consulta.grupo, medicoRealizadorId: 90001, extraMedico: 5000 });
    check('Extra al médico se suma (8000 + 5000)', honorariosDePrestacion(rExtra).realizador.monto, 13000);

    setValorMedico('cirugia', null, 200000, '2026-06-01');
    check('Valor de la fecha (cambio futuro no recalcula)', honorariosDePrestacion(rGen).realizador.monto, 120000);

    // Ingreso de SAM (40% del contrato).
    setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    const rOS = registrarPrestacion({ fecha: '2026-03-06', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 90001, obraSocial: 'OSDE' });
    check('SAM paga 40% del contrato (cirugía)', ingresoSAMDePrestacion(rOS).ingreso, 400000);

    // Consulta/estudio/práctica: valor único (precio de nomenclador, sin depender de la OS).
    const consVal = crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta valor', precio: 20000, vigenciaDesde: '2026-01-01' });
    const rConVU = registrarPrestacion({ fecha: '2026-03-07', categoria: 'consulta', grupoNomenclador: consVal.grupo, medicoRealizadorId: 90001, obraSocial: 'IOMA' });
    check('SAM paga 40% del valor único (consulta, sin contrato)', ingresoSAMDePrestacion(rConVU).ingreso, 8000);

    registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 't', monto: 1000, moneda: 'ARS', medioPago: 'efectivo' });
    registrarMovimientoCaja({ tipo: 'egreso', descripcion: 't', monto: 300, moneda: 'ARS', medioPago: 'efectivo' });
    check('Caja netea (1000 − 300)', saldosCaja().ARS.efectivo, 700);

    const liq = generarLiquidacion(90001, '2026-03');
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

  let sinValor = 0;
  DB.prestacionesRealizadas.filter(r => r.estado === 'activa').forEach(r => {
    if (honorariosDePrestacion(r).realizador.faltaValor.length) sinValor++;
  });
  if (sinValor) issues.push(`${sinValor} prestación(es) activa(s) sin valor fijo configurado.`);

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
