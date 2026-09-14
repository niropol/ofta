// ═══════════════════════════════════════════════════════════════════════════
//  SAM — CONTRATOS (INGRESO): valores reales por obra social + prestación
// ───────────────────────────────────────────────────────────────────────────
//  SAM factura a la obra social el VALOR DE CONTRATO y le paga a SAM Oftalmo el
//  % de config.porcentajeSAM (40%). Ese % × valor de contrato es NUESTRO INGRESO.
//  Versionado por vigencia (un cambio de valor no recalcula lo ya facturado).
//    Contrato: { id, obraSocial, grupoNomenclador, descripcion, valor,
//                vigenciaDesde, vigenciaHasta, estado }
// ═══════════════════════════════════════════════════════════════════════════

function porcentajeSAM() { return Number(DB.config.porcentajeSAM) || 0; }

function _contratosDe(obraSocial, grupo) {
  const g = Number(grupo);
  return DB.contratos
    .filter(c => c.obraSocial === obraSocial && c.grupoNomenclador === g)
    .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1));
}
function _contratoActual(obraSocial, grupo) {
  const cs = _contratosDe(obraSocial, grupo);
  return cs.find(c => !c.vigenciaHasta) || cs[0] || null;
}

// Valor de contrato vigente a una fecha (o null si no hay contrato cargado).
function valorContrato(obraSocial, grupo, fecha) {
  const f = fecha || hoyISO();
  const c = DB.contratos.find(x =>
    x.obraSocial === obraSocial && x.grupoNomenclador === Number(grupo) &&
    x.estado !== 'Inactivo' && x.vigenciaDesde <= f && (!x.vigenciaHasta || x.vigenciaHasta >= f));
  return c ? c.valor : null;
}

// Define / cambia el valor de contrato (versiona: cierra el vigente y abre uno nuevo).
function setContrato(obraSocial, grupo, valor, vigenciaDesde) {
  const g = Number(grupo);
  const item = versionActual(g);
  if (!item) throw new Error('Prestación inexistente.');
  const val = Number(valor);
  if (isNaN(val) || val < 0) throw new Error('El valor debe ser un número ≥ 0.');
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');
  const actual = _contratoActual(obraSocial, g);
  if (actual && desde <= actual.vigenciaDesde) {
    throw new Error('La vigencia debe ser posterior a la del valor actual (' + actual.vigenciaDesde + ').');
  }
  const antes = actual ? JSON.parse(JSON.stringify(actual)) : null;
  if (actual) actual.vigenciaHasta = _diaAnterior(desde);
  const nuevo = {
    id: nuevoId(), obraSocial, grupoNomenclador: g, descripcion: item.descripcion,
    valor: val, vigenciaDesde: desde, vigenciaHasta: null, estado: 'Activo',
  };
  DB.contratos.push(nuevo);
  registrarAuditoria(actual ? 'edicion' : 'alta', 'contrato', nuevo.id, antes, nuevo);
  marcarCambios('contratos');
  return nuevo;
}

function eliminarContrato(obraSocial, grupo) {
  const g = Number(grupo);
  const filas = _contratosDe(obraSocial, g);
  if (filas.length === 0) return false;
  filas.forEach(c => registrarAuditoria('baja', 'contrato', c.id, c, null));
  DB.contratos = DB.contratos.filter(c => !(c.obraSocial === obraSocial && c.grupoNomenclador === g));
  marcarCambios('contratos');
  return true;
}

// Valores de contrato ACTUALES de una OS, uno por prestación del nomenclador.
function contratosDeOS(obraSocial) {
  const grupos = [...new Set(DB.nomenclador.map(n => n.grupo))];
  return grupos.map(g => {
    const item = versionActual(g);
    const actual = _contratoActual(obraSocial, g);
    return { grupo: g, descripcion: item ? item.descripcion : '', categoria: item ? item.categoria : '',
             valor: actual ? actual.valor : null, vigenciaDesde: actual ? actual.vigenciaDesde : null };
  }).filter(x => x.descripcion);
}

// ── Ingreso de SAM ──
// SAM factura la prestación (valor de contrato) MÁS los insumos usados (su ingreso,
// en pesos) y nos paga el porcentajeSAM% de todo. Particular no pasa por SAM.
function ingresoSAMDePrestacion(reg) {
  if (reg.obraSocial === 'Particular') return { ingreso: 0, facturado: 0, valorContrato: null, faltaContrato: false };
  const vc = valorContrato(reg.obraSocial, reg.grupoNomenclador, reg.fecha);
  const insIngreso = (reg.insumos || []).reduce((s, i) => s + (Number(i.ingreso) || 0), 0);  // pesos
  const facturado = (vc || 0) + insIngreso;
  return {
    ingreso: Math.floor(facturado * porcentajeSAM() / 100),
    facturado, valorContrato: vc, insumos: insIngreso, faltaContrato: vc == null,
  };
}

// Ingreso de SAM del mes (suma) + facturado + prestaciones sin contrato.
function ingresoSAMDelMes(mes) {
  let facturado = 0, ingreso = 0, sinContrato = 0;
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => {
      const i = ingresoSAMDePrestacion(r);
      if (i.faltaContrato) sinContrato++;
      facturado += i.facturado;
      ingreso += i.ingreso;
    });
  return { mes, facturado, ingreso, porcentaje: porcentajeSAM(), sinContrato };
}

// Costo de los insumos del mes (lo que nos cuesta comprarlos) — para registrar el egreso.
function costoInsumosDelMes(mes, cotizacion) {
  const cot = Number(cotizacion) || null;
  let costo = 0, requiereCotizacion = false;
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => (r.insumos || []).forEach(i => {
      if (i.costoMoneda === 'USD') { if (cot) costo += (Number(i.costo) || 0) * cot; else requiereCotizacion = true; }
      else costo += Number(i.costo) || 0;
    }));
  return { mes, costo: Math.round(costo), requiereCotizacion };
}

// Registra en caja el costo de los insumos del mes (egreso). Evita duplicar.
function registrarCostoInsumos(mes, cotizacion, fecha) {
  if (DB.cajaMovimientos.some(m => m.origen === 'costo_insumos' && m.referenciaId === mes)) {
    throw new Error('El costo de insumos de ' + mes + ' ya está registrado en la caja.');
  }
  const r = costoInsumosDelMes(mes, cotizacion);
  if (r.requiereCotizacion) throw new Error('Hay insumos con costo en USD: cargá la cotización.');
  if (!(r.costo > 0)) throw new Error('No hay costo de insumos para ' + mes + '.');
  return registrarMovimientoCaja({
    fecha: fecha || hoyISO(), tipo: 'egreso', descripcion: 'Costo insumos ' + mes,
    monto: r.costo, moneda: 'ARS', medioPago: 'transferencia', origen: 'costo_insumos', referenciaId: mes,
    categoriaGasto: 'Insumos',
  });
}
function quitarCostoInsumos(mes) {
  const movs = DB.cajaMovimientos.filter(m => m.origen === 'costo_insumos' && m.referenciaId === mes);
  if (!movs.length) return 0;
  DB.cajaMovimientos = DB.cajaMovimientos.filter(m => !(m.origen === 'costo_insumos' && m.referenciaId === mes));
  movs.forEach(m => registrarAuditoria('baja', 'cajaMovimiento', m.id, m, null));
  marcarCambios('cajaMovimientos');
  return movs.length;
}

// Registra en caja el cobro de SAM del mes (ingreso por transferencia). Evita duplicar.
function registrarCobroSAM(mes, fechaCobro) {
  const desc = 'Cobro SAM ' + mes + ' (' + porcentajeSAM() + '% de contrato)';
  if (DB.cajaMovimientos.some(m => m.origen === 'cobro_sam' && m.referenciaId === mes)) {
    throw new Error('El cobro de SAM de ' + mes + ' ya está registrado en la caja.');
  }
  const r = ingresoSAMDelMes(mes);
  if (!(r.ingreso > 0)) throw new Error('No hay ingreso de SAM para ' + mes + ' (cargá los contratos).');
  return registrarMovimientoCaja({
    fecha: fechaCobro || hoyISO(), tipo: 'ingreso', descripcion: desc,
    monto: r.ingreso, moneda: 'ARS', medioPago: 'transferencia',
    origen: 'cobro_sam', referenciaId: mes,
  });
}

// Deshace el cobro de SAM de un mes (quita el ingreso de caja).
function quitarCobroSAM(mes) {
  const movs = DB.cajaMovimientos.filter(m => m.origen === 'cobro_sam' && m.referenciaId === mes);
  if (!movs.length) return 0;
  DB.cajaMovimientos = DB.cajaMovimientos.filter(m => !(m.origen === 'cobro_sam' && m.referenciaId === mes));
  movs.forEach(m => registrarAuditoria('baja', 'cajaMovimiento', m.id, m, null));
  marcarCambios('cajaMovimientos');
  return movs.length;
}
