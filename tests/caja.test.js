// Caja: libro único, saldos neteados por moneda × medio, gastos, movimientos
// automáticos (pago médico) protegidos, y cierre/arqueo con diferencias.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => { ctx = loadApp(); app = ctx.app; resetDatos(app); });

describe('Caja — movimientos y saldos', () => {
  it('ingreso y egreso netean el saldo del pool correspondiente', () => {
    app.registrarMovimientoCaja({ fecha: '2026-03-01', tipo: 'ingreso', descripcion: 'Pago SAM', monto: 100000, moneda: 'ARS', medioPago: 'transferencia' });
    app.registrarMovimientoCaja({ fecha: '2026-03-02', tipo: 'egreso', descripcion: 'Compra', monto: 30000, moneda: 'ARS', medioPago: 'transferencia' });
    const s = app.saldosCaja();
    expect(s.ARS.transferencia).toBe(70000);
    expect(s.ARS.efectivo).toBe(0);
    expect(s.ARS.total).toBe(70000);
  });

  it('separa por moneda y por medio (4 pools independientes)', () => {
    app.registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 'a', monto: 1000, moneda: 'ARS', medioPago: 'efectivo' });
    app.registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 'b', monto: 2000, moneda: 'ARS', medioPago: 'transferencia' });
    app.registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 'c', monto: 50, moneda: 'USD', medioPago: 'efectivo' });
    const s = app.saldosCaja();
    expect(s.ARS.efectivo).toBe(1000);
    expect(s.ARS.transferencia).toBe(2000);
    expect(s.USD.efectivo).toBe(50);
    expect(s.USD.transferencia).toBe(0);
  });

  it('rechaza monto <= 0 y descripción vacía', () => {
    expect(() => app.registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 'x', monto: 0 })).toThrow();
    expect(() => app.registrarMovimientoCaja({ tipo: 'ingreso', descripcion: '', monto: 100 })).toThrow();
  });

  it('gasto: egreso con categoría, origen gasto', () => {
    const g = app.registrarGasto({ descripcion: 'Alquiler', monto: 200000, moneda: 'ARS', medioPago: 'transferencia', categoriaGasto: 'Alquiler' });
    expect(g.tipo).toBe('egreso');
    expect(g.origen).toBe('gasto');
    expect(g.categoriaGasto).toBe('Alquiler');
    expect(app.saldosCaja().ARS.transferencia).toBe(-200000);
  });

  it('editar y eliminar un movimiento manual; auditoría', () => {
    const m = app.registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 'x', monto: 100, moneda: 'ARS', medioPago: 'efectivo' });
    app.editarMovimientoCaja(m.id, { descripcion: 'y', monto: 250, tipo: 'ingreso', moneda: 'ARS', medioPago: 'efectivo' });
    expect(app.saldosCaja().ARS.efectivo).toBe(250);
    expect(app.eliminarMovimientoCaja(m.id).ok).toBe(true);
    expect(app.saldosCaja().ARS.efectivo).toBe(0);
    expect(app.auditoriaDe('cajaMovimiento', m.id).some(a => a.accion === 'baja')).toBe(true);
  });

  it('el egreso automático de pago médico no se edita ni elimina a mano', () => {
    const mov = app.registrarEgresoPagoMedico(9999, 320000, 'Liquidación Dr. X', '2026-03-31', 1);
    expect(mov.origen).toBe('pago_medico');
    expect(mov.moneda).toBe('ARS');
    expect(mov.medioPago).toBe('transferencia');
    expect(() => app.editarMovimientoCaja(mov.id, { descripcion: 'hack', monto: 1 })).toThrow();
    expect(app.eliminarMovimientoCaja(mov.id)).toEqual({ ok: false, automatico: true });
    // Se quita al reabrir/eliminar la liquidación.
    expect(app.quitarEgresosDeLiquidacion(9999)).toBe(1);
    expect(app.DB.cajaMovimientos.length).toBe(0);
  });

  it('saldo hasta una fecha (corrido en el tiempo)', () => {
    app.registrarMovimientoCaja({ fecha: '2026-03-01', tipo: 'ingreso', descripcion: 'a', monto: 1000, moneda: 'ARS', medioPago: 'efectivo' });
    app.registrarMovimientoCaja({ fecha: '2026-03-10', tipo: 'ingreso', descripcion: 'b', monto: 500, moneda: 'ARS', medioPago: 'efectivo' });
    expect(app.saldoPool('ARS', 'efectivo', '2026-03-05')).toBe(1000);
    expect(app.saldoPool('ARS', 'efectivo', '2026-03-31')).toBe(1500);
  });

  it('filtros del libro (tipo, moneda, medio)', () => {
    app.registrarMovimientoCaja({ tipo: 'ingreso', descripcion: 'a', monto: 1000, moneda: 'ARS', medioPago: 'efectivo' });
    app.registrarGasto({ descripcion: 'b', monto: 200, moneda: 'ARS', medioPago: 'transferencia', categoriaGasto: 'Otros' });
    expect(app.listarMovimientosCaja({ tipo: 'egreso' }).length).toBe(1);
    expect(app.listarMovimientosCaja({ medioPago: 'efectivo' }).length).toBe(1);
    expect(app.listarMovimientosCaja({}).length).toBe(2);
  });
});

describe('Caja — cierre / arqueo', () => {
  it('detecta la diferencia entre lo contado y el sistema', () => {
    app.registrarMovimientoCaja({ fecha: '2026-03-01', tipo: 'ingreso', descripcion: 'a', monto: 10000, moneda: 'ARS', medioPago: 'efectivo' });
    const c = app.registrarCierreCaja({ fecha: '2026-03-01', moneda: 'ARS', medioPago: 'efectivo', saldoContado: 9500, observacion: 'faltan 500' });
    expect(c.saldoSistema).toBe(10000);
    expect(c.saldoContado).toBe(9500);
    expect(c.diferencia).toBe(-500);
    expect(app.listarCierresCaja().length).toBe(1);
  });

  it('diferencia 0 cuando coincide', () => {
    app.registrarMovimientoCaja({ fecha: '2026-03-01', tipo: 'ingreso', descripcion: 'a', monto: 8000, moneda: 'ARS', medioPago: 'efectivo' });
    const c = app.registrarCierreCaja({ fecha: '2026-03-01', moneda: 'ARS', medioPago: 'efectivo', saldoContado: 8000 });
    expect(c.diferencia).toBe(0);
  });
});
