// Derivaciones quirúrgicas: alta, estados (pendiente→programada→realizada/cancelada),
// urgencia, orden y resumen.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app, cir;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 601, nombre: 'Dra. Deriva', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 600, nombre: 'Dr. Cirujano', estado: 'Activo', sedeId: 1 });
  cir = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Catarata', vigenciaDesde: '2026-01-01' });
});
function nueva(extra) {
  return app.crearDerivacion({ grupoNomenclador: cir.grupo, medicoDerivadorId: 601, pacienteApellido: 'Pérez', obraSocial: 'IOMA', ...extra });
}

describe('Derivaciones — alta y validación', () => {
  it('crea una derivación pendiente por defecto', () => {
    const d = nueva();
    expect(d.estado).toBe('pendiente');
    expect(d.urgencia).toBe('normal');
    expect(app.DB.derivaciones.length).toBe(1);
  });
  it('exige tipo de cirugía y médico que deriva', () => {
    expect(() => app.crearDerivacion({ medicoDerivadorId: 601 })).toThrow();
    expect(() => app.crearDerivacion({ grupoNomenclador: cir.grupo })).toThrow();
  });
});

describe('Derivaciones — estados', () => {
  it('pendiente → programada guarda la fecha; → realizada', () => {
    const d = nueva();
    app.cambiarEstadoDerivacion(d.id, 'programada', { fechaProgramada: '2026-04-10' });
    expect(app.DB.derivaciones[0].estado).toBe('programada');
    expect(app.DB.derivaciones[0].fechaProgramada).toBe('2026-04-10');
    app.cambiarEstadoDerivacion(d.id, 'realizada', { prestacionId: 999 });
    expect(app.DB.derivaciones[0].estado).toBe('realizada');
    expect(app.DB.derivaciones[0].prestacionId).toBe(999);
  });
  it('rechaza un estado inválido', () => {
    const d = nueva();
    expect(() => app.cambiarEstadoDerivacion(d.id, 'cualquiera')).toThrow();
  });
});

describe('Derivaciones — orden, filtros y resumen', () => {
  it('las urgentes van primero', () => {
    nueva({ fecha: '2026-03-01' });
    nueva({ urgencia: 'urgente', fecha: '2026-02-01' });
    const lista = app.listarDerivaciones();
    expect(lista[0].urgencia).toBe('urgente');
  });
  it('resumen cuenta por estado y urgentes pendientes', () => {
    nueva({ urgencia: 'urgente' });          // pendiente urgente
    const d2 = nueva();
    app.cambiarEstadoDerivacion(d2.id, 'programada', { fechaProgramada: '2026-04-01' });
    const r = app.resumenDerivaciones();
    expect(r.pendiente).toBe(1);
    expect(r.programada).toBe(1);
    expect(r.urgentesPendientes).toBe(1);
  });
  it('filtra por estado y por médico', () => {
    nueva();
    expect(app.listarDerivaciones({ estado: 'pendiente' }).length).toBe(1);
    expect(app.listarDerivaciones({ estado: 'realizada' }).length).toBe(0);
    expect(app.listarDerivaciones({ medicoDerivadorId: 601 }).length).toBe(1);
    expect(app.listarDerivaciones({ medicoDerivadorId: 999 }).length).toBe(0);
  });
});
