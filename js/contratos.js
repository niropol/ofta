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

// Valores de contrato ACTUALES de una OS, uno por CIRUGÍA del nomenclador.
// (Solo las cirugías facturan por contrato de OS; consulta/estudio/práctica van
// por valor único y se configuran con el precio del nomenclador.)
function contratosDeOS(obraSocial) {
  const grupos = [...new Set(DB.nomenclador.map(n => n.grupo))];
  return grupos.map(g => {
    const item = versionActual(g);
    const actual = _contratoActual(obraSocial, g);
    return { grupo: g, descripcion: item ? item.descripcion : '', categoria: item ? item.categoria : '',
             valor: actual ? actual.valor : null, vigenciaDesde: actual ? actual.vigenciaDesde : null };
  }).filter(x => x.descripcion && x.categoria === 'cirugia');
}

// ── Ingreso de SAM ──
// SAM factura TODA prestación (incluido Particular) y nos paga el porcentajeSAM%
// (40%) de lo facturado. Hay DOS motores de facturación según la categoría:
//   • CIRUGÍA → valor de CONTRATO por obra social (cambia según la OS) + insumos.
//     Si la OS no tiene contrato cargado, faltaContrato = true (no se puede facturar).
//   • CONSULTA / ESTUDIO / PRÁCTICA → VALOR ÚNICO = precio del nomenclador (igual
//     para todas las OS; snapshot pinneado a la fecha) + insumos si hubiera.
// En ambos casos los insumos usados suman su ingreso (en pesos, lo factura SAM).
function ingresoSAMDePrestacion(reg) {
  const cant = Math.max(1, Math.floor(Number(reg.cantidad) || 1));  // consulta/estudio se cargan por cantidad
  const insIngresoU = (reg.insumos || []).reduce((s, i) => s + (Number(i.ingreso) || 0), 0);  // pesos, por unidad
  if (reg.categoria === 'cirugia') {
    const vc = valorContrato(reg.obraSocial, reg.grupoNomenclador, reg.fecha);
    const factU = (vc || 0) + insIngresoU;
    const ingU = Math.floor(factU * porcentajeSAM() / 100);
    return {
      ingreso: ingU * cant, facturado: factU * cant, base: (vc || 0) * cant,
      valorContrato: vc, insumos: insIngresoU * cant, faltaContrato: vc == null, modo: 'contrato', cantidad: cant,
    };
  }
  // consulta / estudio / práctica → valor único (precio del nomenclador, sin depender de la OS)
  const baseU = Number(reg.precioNomenclador) || 0;
  const factU = baseU + insIngresoU;
  const ingU = Math.floor(factU * porcentajeSAM() / 100);
  return {
    ingreso: ingU * cant, facturado: factU * cant, base: baseU * cant,
    valorContrato: null, insumos: insIngresoU * cant, faltaContrato: false, modo: 'valor_unico', cantidad: cant,
  };
}

// Ingreso de SAM del mes (suma). Si se pasa obraSocial, filtra por esa OS —
// clave para cerrar el cobro de cada obra social por separado.
function ingresoSAMDelMes(mes, obraSocial) {
  let facturado = 0, ingreso = 0, sinContrato = 0, cantidad = 0;
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes) && (!obraSocial || r.obraSocial === obraSocial))
    .forEach(r => {
      const i = ingresoSAMDePrestacion(r);
      if (i.faltaContrato) sinContrato++;
      facturado += i.facturado;
      ingreso += i.ingreso;
      cantidad++;
    });
  return { mes, obraSocial: obraSocial || null, facturado, ingreso, porcentaje: porcentajeSAM(), sinContrato, cantidad };
}

// Obras sociales con prestaciones activas en el mes (incluye 'Particular').
function _osDelMes(mes) {
  return [...new Set(DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (r.fecha || '').slice(0, 7) === mes)
    .map(r => r.obraSocial || 'Particular'))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

// Ingreso del mes desglosado por obra social (una fila por OS).
function ingresoSAMPorOS(mes) {
  return _osDelMes(mes).map(os => ingresoSAMDelMes(mes, os));
}

// Costo de los insumos del mes (lo que nos cuesta comprarlos) — para registrar el egreso.
function costoInsumosDelMes(mes, cotizacion) {
  const cot = Number(cotizacion) || null;
  let costo = 0, requiereCotizacion = false;
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => { const cant = Math.max(1, Math.floor(Number(r.cantidad) || 1)); (r.insumos || []).forEach(i => {
      if (i.costoMoneda === 'USD') { if (cot) costo += (Number(i.costo) || 0) * cot * cant; else requiereCotizacion = true; }
      else costo += (Number(i.costo) || 0) * cant;
    }); });
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

// Cada obra social paga en su momento → cada una cierra su cobro por separado.
// La referencia del movimiento es "mes|obraSocial" para no mezclarlas.
function _refCobro(mes, obraSocial) { return mes + '|' + obraSocial; }
function _movCobro(mes, obraSocial) {
  const ref = _refCobro(mes, obraSocial);
  return DB.cajaMovimientos.find(m => m.origen === 'cobro_sam' && m.referenciaId === ref) || null;
}

// Compara, para UNA obra social y mes, lo que SAM DEBERÍA pagarte (40% de lo
// facturado) contra lo efectivamente cobrado. diferencia = recibido − esperado.
function comparacionCobroSAM(mes, obraSocial) {
  const esperado = ingresoSAMDelMes(mes, obraSocial).ingreso;
  const mov = _movCobro(mes, obraSocial);
  return {
    mes, obraSocial, esperado, recibido: mov ? mov.monto : null,
    registrado: !!mov, diferencia: mov ? mov.monto - esperado : null, fecha: mov ? mov.fecha : null,
  };
}

// Resumen del mes: una fila por obra social (esperado / recibido / diferencia /
// estado) + totales, para el control de cobros y el panel.
function comparacionCobrosMes(mes) {
  const filas = ingresoSAMPorOS(mes).map(g => {
    const c = comparacionCobroSAM(mes, g.obraSocial);
    return {
      obraSocial: g.obraSocial, facturado: g.facturado, esperado: g.ingreso,
      cantidad: g.cantidad, sinContrato: g.sinContrato,
      recibido: c.recibido, diferencia: c.diferencia, registrado: c.registrado, fecha: c.fecha,
    };
  }).filter(f => f.esperado > 0 || f.facturado > 0);
  let esperado = 0, recibido = 0, esperadoCobrado = 0, registradas = 0;
  filas.forEach(f => {
    esperado += f.esperado;
    if (f.registrado) { recibido += f.recibido; esperadoCobrado += f.esperado; registradas++; }
  });
  return {
    mes, filas, esperado, recibido, esperadoCobrado, registradas,
    total: filas.length, pendientes: filas.length - registradas,
    diferenciaCobrada: recibido - esperadoCobrado,
  };
}

// Registra en caja el cobro de SAM de UNA obra social para el mes. Evita duplicar.
// montoRecibido: lo que SAM efectivamente transfirió (si se omite, usa el esperado).
function registrarCobroSAM(mes, obraSocial, fechaCobro, montoRecibido) {
  if (!obraSocial) throw new Error('Indicá la obra social del cobro.');
  const ref = _refCobro(mes, obraSocial);
  if (DB.cajaMovimientos.some(m => m.origen === 'cobro_sam' && m.referenciaId === ref)) {
    throw new Error('El cobro de ' + obraSocial + ' de ' + mes + ' ya está registrado.');
  }
  const esperado = ingresoSAMDelMes(mes, obraSocial).ingreso;
  if (!(esperado > 0)) throw new Error('No hay ingreso de SAM para ' + obraSocial + ' en ' + mes + ' (cargá los contratos / valores).');
  const recibido = (montoRecibido == null || montoRecibido === '') ? esperado : Number(montoRecibido);
  if (isNaN(recibido) || recibido < 0) throw new Error('El monto recibido debe ser un número ≥ 0.');
  const dif = recibido - esperado;
  const desc = 'Cobro SAM · ' + obraSocial + ' ' + mes + ' (' + porcentajeSAM() + '%)' +
    (dif !== 0 ? ' · dif ' + (dif > 0 ? '+' : '') + dif : '');
  const mov = registrarMovimientoCaja({
    fecha: fechaCobro || hoyISO(), tipo: 'ingreso', descripcion: desc,
    monto: recibido, moneda: 'ARS', medioPago: 'transferencia',
    origen: 'cobro_sam', referenciaId: ref,
  });
  mov.esperado = esperado;
  mov.diferencia = dif;
  mov.obraSocial = obraSocial;
  mov.mesCobro = mes;
  marcarCambios('cajaMovimientos');
  return mov;
}

// Deshace el cobro de una obra social en el mes (quita el ingreso de caja).
function quitarCobroSAM(mes, obraSocial) {
  const ref = _refCobro(mes, obraSocial);
  const movs = DB.cajaMovimientos.filter(m => m.origen === 'cobro_sam' && m.referenciaId === ref);
  if (!movs.length) return 0;
  DB.cajaMovimientos = DB.cajaMovimientos.filter(m => !(m.origen === 'cobro_sam' && m.referenciaId === ref));
  movs.forEach(m => registrarAuditoria('baja', 'cajaMovimiento', m.id, m, null));
  marcarCambios('cajaMovimientos');
  return movs.length;
}
