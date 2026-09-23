// Liquidaciones: generación con detalle, cierre (egreso automático en caja +
// bloqueo del período), reabrir, eliminar, derivador por separado y WhatsApp.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 502, nombre: 'Dra. Derivadora', estado: 'Activo', sedeId: 1 });
  app.setValorMedico('cirugia', null, 120000, '2026-01-01');
  app.setValorMedico('derivacion', null, 20000, '2026-01-01');
});
function nomFaco() { return app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', vigenciaDesde: '2026-01-01' }); }

describe('Liquidaciones a médicos', () => {
  it('genera borrador con detalle y total; no toca la caja', () => {
    const faco = nomFaco();
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, paciente: { apellido: 'Gómez' } });
    const l = app.generarLiquidacion(501, '2026-03');
    expect(l.estado).toBe('borrador');
    expect(l.total).toBe(120000);
    expect(l.detalle.length).toBe(1);
    expect(l.detalle[0].paciente).toBe('Gómez');
    expect(app.DB.cajaMovimientos.length).toBe(0);
  });

  it('cerrar carga el egreso automático en caja y bloquea el período', () => {
    const faco = nomFaco();
    const p = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    app.cerrarLiquidacion(l.id, '2026-03-31');
    expect(l.estado).toBe('cerrada');
    const mov = app.DB.cajaMovimientos.find(m => m.origen === 'pago_medico' && m.referenciaId === l.id);
    expect(mov).toBeTruthy();
    expect(mov.monto).toBe(120000);
    expect(mov.medioPago).toBe('transferencia');
    expect(app.saldosCaja().ARS.transferencia).toBe(-120000);
    expect(app.prestacionBloqueada(app.DB.prestacionesRealizadas[0])).toBe(true);
    expect(() => app.anularPrestacion(p.id, 'x')).toThrow();
    expect(() => app.eliminarPrestacionRealizada(p.id)).toThrow();
  });

  it('reabrir quita el egreso de caja y desbloquea', () => {
    const faco = nomFaco();
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
    const faco = nomFaco();
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    app.cerrarLiquidacion(l.id);
    app.eliminarLiquidacion(l.id);
    expect(app.DB.pagosMedicos.length).toBe(0);
    expect(app.DB.cajaMovimientos.length).toBe(0);
  });

  it('no cierra si falta el valor fijo (total 0)', () => {
    const est = app.crearPrestacion({ categoria: 'realizacion_estudio', descripcion: 'OCT', vigenciaDesde: '2026-01-01' });
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'realizacion_estudio', grupoNomenclador: est.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    expect(l.faltaValor).toContain('realizacion_estudio');
    expect(() => app.cerrarLiquidacion(l.id)).toThrow();
  });

  it('derivador cobra su liquidación por separado', () => {
    const faco = nomFaco();
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, medicoDerivadorId: 502 });
    expect(app.generarLiquidacion(501, '2026-03').total).toBe(120000);
    expect(app.generarLiquidacion(502, '2026-03').total).toBe(20000);
  });

  it('mensaje de WhatsApp incluye médico, mes y total', () => {
    const faco = nomFaco();
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    const l = app.generarLiquidacion(501, '2026-03');
    const msg = app.mensajeLiquidacionWhatsApp(l);
    expect(msg).toContain('Dr. Realizador');
    expect(msg).toContain('2026-03');
    expect(msg).toContain('120.000');
  });
});
