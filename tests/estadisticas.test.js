// Estadísticas: resumen del mes (prestaciones/consultas/caja/honorarios), resumen
// por médico, control interno (anulaciones, diferencias, pendientes) y exportes.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.setValorMedico('consulta', null, 8000, '2026-01-01');
  app.setValorMedico('cirugia', null, 120000, '2026-01-01');
});
function nom(cat) { return app.crearPrestacion({ categoria: cat, descripcion: cat, vigenciaDesde: '2026-01-01' }); }

describe('Estadísticas — resumen del mes', () => {
  it('cuenta prestaciones, consultas y por categoría; ingresos/egresos de caja', () => {
    const c = nom('consulta'); const faco = nom('cirugia');
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    app.registrarPrestacion({ fecha: '2026-03-02', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    app.registrarMovimientoCaja({ fecha: '2026-03-05', tipo: 'ingreso', descripcion: 'SAM', monto: 100000, moneda: 'ARS', medioPago: 'transferencia' });
    app.registrarGasto({ fecha: '2026-03-06', descripcion: 'Alquiler', monto: 20000, moneda: 'ARS', medioPago: 'transferencia', categoriaGasto: 'Alquiler' });

    const r = app.resumenMes('2026-03');
    expect(r.totalPrestaciones).toBe(3);
    expect(r.consultas).toBe(2);
    expect(r.porCategoria.consulta).toBe(2);
    expect(r.porCategoria.cirugia).toBe(1);
    expect(r.porDia['2026-03-01']).toBe(2);
    expect(r.ingresosMes).toBe(100000);
    expect(r.egresosMes).toBe(20000);
    expect(r.gastosMes).toBe(20000);
    expect(r.honorariosCalc).toBe(136000); // 120000 cirugía + 2×8000 consultas
  });

  it('excluye anuladas del conteo pero las informa', () => {
    const c = nom('consulta');
    const p = app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    app.anularPrestacion(p.id, 'x');
    const r = app.resumenMes('2026-03');
    expect(r.totalPrestaciones).toBe(0);
    expect(r.anuladas).toBe(1);
  });

  it('resumen por médico: cantidad y honorarios', () => {
    const faco = nom('cirugia');
    app.registrarPrestacion({ fecha: '2026-03-02', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const r = app.resumenMedicoMes(501, '2026-03');
    expect(r.cantidad).toBe(1);
    expect(r.total).toBe(120000);
    expect(r.porCategoria.cirugia).toBe(1);
  });

  it('control interno: anulaciones, diferencias de caja y pendientes de liquidar', () => {
    const faco = nom('cirugia');
    app.registrarPrestacion({ fecha: '2026-03-02', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const c = nom('consulta');
    const p = app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    app.anularPrestacion(p.id, 'no vino');
    app.registrarMovimientoCaja({ fecha: '2026-03-01', tipo: 'ingreso', descripcion: 'x', monto: 1000, moneda: 'ARS', medioPago: 'efectivo' });
    app.registrarCierreCaja({ fecha: '2026-03-01', moneda: 'ARS', medioPago: 'efectivo', saldoContado: 900 }); // dif -100

    const ci = app.controlInterno('2026-03');
    expect(ci.anulaciones.length).toBe(1);
    expect(ci.diferenciasCaja.length).toBe(1);
    expect(ci.sinLiquidar).toContain(501); // tiene honorarios sin liquidación cerrada
  });

  it('texto de WhatsApp y CSV contable', () => {
    const c = nom('consulta');
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    app.registrarMovimientoCaja({ fecha: '2026-03-05', tipo: 'ingreso', descripcion: 'Pago SAM', monto: 100000, moneda: 'ARS', medioPago: 'transferencia' });
    const txt = app.resumenMesTextoWhatsApp('2026-03');
    expect(txt).toContain('OFTA');
    expect(txt).toContain('2026-03');
    const csv = app.csvContable('2026-03');
    expect(csv.split('\n')[0]).toContain('Fecha');
    expect(csv).toContain('Pago SAM');
  });
});
