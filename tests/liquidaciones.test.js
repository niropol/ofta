// Liquidaciones: generación con detalle, cierre (egreso automático en caja +
// bloqueo del período), reabrir (quita egreso + desbloquea), eliminar, cotización
// obligatoria si hay USD, comisión SAM, y mensaje de WhatsApp.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 502, nombre: 'Dra. Derivadora', estado: 'Activo', sedeId: 1 });
  app.setReglaReparto('cirugia', null, 40, '2026-01-01');
  app.setReglaReparto('derivacion_cirugia', null, 10, '2026-01-01');
  app.setReglaReparto('insumo', null, 20, '2026-01-01');
  app.setReglaReparto('sam_insumo', null, 50, '2026-01-01');
});
function nom(cat, precio, extra = {}) { return app.crearPrestacion({ categoria: cat, descripcion: cat, precio, vigenciaDesde: '2026-01-01', ...extra }); }

describe('Liquidaciones a médicos', () => {
  it('genera borrador con detalle y total; no toca la caja', () => {
    const faco = nom('cirugia', 500000);
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, paciente: { apellido: 'Gómez' } });
    const l = app.generarLiquidacion(501, '2026-03');
    expect(l.estado).toBe('borrador');
    expect(l.total).toBe(200000);
    expect(l.detalle.length).toBe(1);
    expect(l.detalle[0].paciente).toBe('Gómez');
    expect(app.DB.cajaMovimientos.length).toBe(0); // borrador no toca caja
  });

  it('cerrar carga el egreso automático en caja y bloquea el período', () => {
    const faco = nom('cirugia', 500000);
    const p = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    app.cerrarLiquidacion(l.id, '2026-03-31');
    expect(l.estado).toBe('cerrada');
    // Egreso automático en caja.
    const mov = app.DB.cajaMovimientos.find(m => m.origen === 'pago_medico' && m.referenciaId === l.id);
    expect(mov).toBeTruthy();
    expect(mov.monto).toBe(200000);
    expect(mov.moneda).toBe('ARS');
    expect(mov.medioPago).toBe('transferencia');
    expect(app.saldosCaja().ARS.transferencia).toBe(-200000);
    // Período bloqueado: no se puede editar/anular/eliminar la prestación.
    expect(app.prestacionBloqueada(app.DB.prestacionesRealizadas[0])).toBe(true);
    expect(() => app.anularPrestacion(p.id, 'x')).toThrow();
    expect(() => app.eliminarPrestacionRealizada(p.id)).toThrow();
  });

  it('reabrir quita el egreso de caja y desbloquea', () => {
    const faco = nom('cirugia', 500000);
    const p = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    app.cerrarLiquidacion(l.id);
    app.reabrirLiquidacion(l.id);
    expect(l.estado).toBe('borrador');
    expect(app.DB.cajaMovimientos.filter(m => m.origen === 'pago_medico').length).toBe(0);
    expect(app.prestacionBloqueada(p)).toBe(false);
    expect(() => app.anularPrestacion(p.id, 'x')).not.toThrow();
  });

  it('eliminar liquidación limpia su egreso de caja', () => {
    const faco = nom('cirugia', 500000);
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    app.cerrarLiquidacion(l.id);
    app.eliminarLiquidacion(l.id);
    expect(app.DB.pagosMedicos.length).toBe(0);
    expect(app.DB.cajaMovimientos.length).toBe(0);
  });

  it('no cierra si hay USD sin cotización; sí con cotización', () => {
    const faco = nom('cirugia', 500000);
    const ins = nom('insumo', 400, { moneda: 'USD' }); app.setCostoInsumo(ins.grupo, 100, 'USD');
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, insumos: [ins.grupo] });
    const sinCotiz = app.generarLiquidacion(501, '2026-03');
    expect(sinCotiz.requiereCotizacion).toBe(true);
    expect(() => app.cerrarLiquidacion(sinCotiz.id)).toThrow();
    // Con cotización: regenerar y cerrar.
    const conCotiz = app.generarLiquidacion(501, '2026-03', 1000);
    expect(conCotiz.requiereCotizacion).toBe(false);
    expect(() => app.cerrarLiquidacion(conCotiz.id)).not.toThrow();
  });

  it('derivador cobra su liquidación por separado', () => {
    const faco = nom('cirugia', 500000);
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, medicoDerivadorId: 502 });
    expect(app.generarLiquidacion(501, '2026-03').total).toBe(200000);
    expect(app.generarLiquidacion(502, '2026-03').total).toBe(50000);
  });

  it('pagarComisionSAM registra el egreso a SAM en caja', () => {
    const faco = nom('cirugia', 500000);
    const ins = nom('insumo', 900000); app.setCostoInsumo(ins.grupo, 300000, 'ARS');
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, insumos: [ins.grupo] });
    const mov = app.pagarComisionSAM('2026-03');
    expect(mov.descripcion).toBe('Comisión SAM 2026-03');
    expect(mov.monto).toBe(240000);
    expect(mov.tipo).toBe('egreso');
  });

  it('mensaje de WhatsApp incluye médico, mes y total', () => {
    const faco = nom('cirugia', 500000);
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    const msg = app.mensajeLiquidacionWhatsApp(l);
    expect(msg).toContain('Dr. Realizador');
    expect(msg).toContain('2026-03');
    expect(msg).toContain('200.000');
  });
});
