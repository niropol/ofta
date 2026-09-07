// ═══════════════════════════════════════════════════════════════════════════
//  SAM — CAJA: libro único de ingresos/egresos (Etapa 5)
// ───────────────────────────────────────────────────────────────────────────
//  Un solo libro (cajaMovimientos). Todo netea el saldo:
//   - Ingresos manuales (ej. lo que paga SAM) y egresos manuales.
//   - Gastos operativos = egresos manuales con `categoriaGasto` (origen 'gasto').
//   - Pagos a médicos = egresos AUTOMÁTICOS (origen 'pago_medico', Etapa 6): los
//     carga el sistema al liquidar y no se editan a mano acá.
//
//  Multi-moneda (ARS/USD) × multi-medio (efectivo/transferencia) = 4 saldos que
//  se netean por separado (no se mezclan ni se convierten acá).
//  Cierre/arqueo diario: se cuenta la plata real y se compara con el saldo del
//  sistema → detecta diferencias.
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIAS_GASTO = ['Alquiler', 'Servicios', 'Sueldos', 'Insumos', 'Mantenimiento', 'Impuestos', 'Otros'];

// Un movimiento es de carga manual (editable/borrable) salvo los automáticos.
function _movimientoEsManual(m) { return m.origen === 'manual' || m.origen === 'gasto'; }

// ── Alta de un movimiento (ingreso/egreso). origen/referenciaId permiten los automáticos. ──
function registrarMovimientoCaja(datos) {
  const tipo = datos.tipo;
  if (tipo !== 'ingreso' && tipo !== 'egreso') throw new Error('Tipo inválido (ingreso/egreso).');
  const monto = Number(datos.monto);
  if (isNaN(monto) || monto <= 0) throw new Error('El monto debe ser un número mayor a 0.');
  const moneda = datos.moneda || 'ARS';
  if (!MONEDAS.includes(moneda)) throw new Error('Moneda inválida.');
  const medioPago = datos.medioPago || 'efectivo';
  if (!MEDIOS_PAGO.includes(medioPago)) throw new Error('Medio de pago inválido.');
  if (!datos.descripcion || !datos.descripcion.trim()) throw new Error('La descripción es obligatoria.');

  const mov = {
    id: nuevoId(),
    fecha: datos.fecha || hoyISO(),
    tipo,
    descripcion: datos.descripcion.trim(),
    monto,
    moneda,
    medioPago,
    sedeId: datos.sedeId || sedeActiva(),
    origen: datos.origen || 'manual',
    referenciaId: datos.referenciaId != null ? datos.referenciaId : null,
    categoriaGasto: (datos.origen === 'gasto' || datos.categoriaGasto) ? (datos.categoriaGasto || 'Otros') : null,
    estado: 'activo',
    creadoEn: new Date().toISOString(),
  };
  DB.cajaMovimientos.push(mov);
  registrarAuditoria('alta', 'cajaMovimiento', mov.id, null, mov);
  marcarCambios('cajaMovimientos');
  return mov;
}

// Atajo para gastos operativos (egreso con categoría).
function registrarGasto(datos) {
  return registrarMovimientoCaja({ ...datos, tipo: 'egreso', origen: 'gasto', categoriaGasto: datos.categoriaGasto || 'Otros' });
}

function editarMovimientoCaja(id, datos) {
  const m = DB.cajaMovimientos.find(x => x.id === Number(id));
  if (!m) return false;
  if (!_movimientoEsManual(m)) throw new Error('Este movimiento es automático (pago a médico): se corrige desde la liquidación, no acá.');
  const monto = Number(datos.monto);
  if (isNaN(monto) || monto <= 0) throw new Error('El monto debe ser un número mayor a 0.');
  if (!datos.descripcion || !datos.descripcion.trim()) throw new Error('La descripción es obligatoria.');
  const antes = JSON.parse(JSON.stringify(m));
  Object.assign(m, {
    fecha: datos.fecha || m.fecha,
    tipo: datos.tipo || m.tipo,
    descripcion: datos.descripcion.trim(),
    monto,
    moneda: datos.moneda || m.moneda,
    medioPago: datos.medioPago || m.medioPago,
    categoriaGasto: m.origen === 'gasto' ? (datos.categoriaGasto || m.categoriaGasto || 'Otros') : m.categoriaGasto,
  });
  registrarAuditoria('edicion', 'cajaMovimiento', m.id, antes, m);
  marcarCambios('cajaMovimientos');
  return m;
}

function eliminarMovimientoCaja(id) {
  const m = DB.cajaMovimientos.find(x => x.id === Number(id));
  if (!m) return { ok: false };
  if (!_movimientoEsManual(m)) return { ok: false, automatico: true };
  const antes = JSON.parse(JSON.stringify(m));
  DB.cajaMovimientos = DB.cajaMovimientos.filter(x => x.id !== m.id);
  registrarAuditoria('baja', 'cajaMovimiento', m.id, antes, null);
  marcarCambios('cajaMovimientos');
  return { ok: true };
}

// ── Egreso automático por pago a médico (lo llama la liquidación, Etapa 6) ──
function registrarEgresoPagoMedico(pagoId, monto, descripcion, fecha, sedeId) {
  return registrarMovimientoCaja({
    fecha: fecha || hoyISO(), tipo: 'egreso', descripcion, monto,
    moneda: 'ARS', medioPago: 'transferencia',   // liquidación: siempre pesos, por transferencia
    sedeId, origen: 'pago_medico', referenciaId: pagoId,
  });
}
// Quita el/los egreso(s) automático(s) de una liquidación (al reabrir/eliminar, Etapa 6).
function quitarEgresosDeLiquidacion(pagoId) {
  const quitados = DB.cajaMovimientos.filter(m => m.origen === 'pago_medico' && m.referenciaId === pagoId);
  if (quitados.length) {
    DB.cajaMovimientos = DB.cajaMovimientos.filter(m => !(m.origen === 'pago_medico' && m.referenciaId === pagoId));
    quitados.forEach(m => registrarAuditoria('baja', 'cajaMovimiento', m.id, m, null));
    marcarCambios('cajaMovimientos');
  }
  return quitados.length;
}

// ── Saldos neteados por moneda × medio (opcionalmente hasta una fecha inclusive) ──
function saldosCaja(hasta) {
  const res = { ARS: { efectivo: 0, transferencia: 0, total: 0 }, USD: { efectivo: 0, transferencia: 0, total: 0 } };
  DB.cajaMovimientos
    .filter(m => m.estado === 'activo' && (!hasta || m.fecha <= hasta))
    .forEach(m => {
      const pool = res[m.moneda];
      if (!pool) return;
      pool[m.medioPago] += (m.tipo === 'ingreso' ? 1 : -1) * (Number(m.monto) || 0);
    });
  ['ARS', 'USD'].forEach(mon => { res[mon].total = res[mon].efectivo + res[mon].transferencia; });
  return res;
}

// Saldo de un pool (moneda+medio) hasta una fecha — para el cierre/arqueo.
function saldoPool(moneda, medioPago, hasta) {
  return DB.cajaMovimientos
    .filter(m => m.estado === 'activo' && m.moneda === moneda && m.medioPago === medioPago && (!hasta || m.fecha <= hasta))
    .reduce((s, m) => s + (m.tipo === 'ingreso' ? 1 : -1) * (Number(m.monto) || 0), 0);
}

// ── Listado con filtros ──
function listarMovimientosCaja({ mes = '', tipo = '', moneda = '', medioPago = '', origen = '' } = {}) {
  return DB.cajaMovimientos
    .filter(m => (!mes || (m.fecha || '').slice(0, 7) === mes))
    .filter(m => (!tipo || m.tipo === tipo))
    .filter(m => (!moneda || m.moneda === moneda))
    .filter(m => (!medioPago || m.medioPago === medioPago))
    .filter(m => (!origen || m.origen === origen))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : (a.fecha > b.fecha ? -1 : b.id - a.id)));
}

// ── Cierre / arqueo diario: compara lo contado con el saldo del sistema ──
function registrarCierreCaja({ fecha, moneda, medioPago, saldoContado, observacion, sedeId }) {
  if (!fecha) throw new Error('La fecha del cierre es obligatoria.');
  moneda = moneda || 'ARS'; medioPago = medioPago || 'efectivo';
  const contado = Number(saldoContado);
  if (isNaN(contado)) throw new Error('El monto contado debe ser un número.');
  const saldoSistema = saldoPool(moneda, medioPago, fecha);
  const cierre = {
    id: nuevoId(), fecha, moneda, medioPago,
    sedeId: sedeId || sedeActiva(),
    saldoSistema, saldoContado: contado, diferencia: contado - saldoSistema,
    observacion: (observacion || '').trim(),
    creadoEn: new Date().toISOString(),
  };
  DB.cajaCierres.push(cierre);
  registrarAuditoria('alta', 'cajaCierre', cierre.id, null, cierre);
  marcarCambios('cajaCierres');
  return cierre;
}

function listarCierresCaja() {
  return [...DB.cajaCierres].sort((a, b) => (a.fecha < b.fecha ? 1 : (a.fecha > b.fecha ? -1 : b.id - a.id)));
}
