// Avisos automáticos (del estado) + recordatorios manuales.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => { ctx = loadApp(); app = ctx.app; resetDatos(app); });

describe('Recordatorios manuales', () => {
  it('crea, resuelve (toggle) y elimina', () => {
    const a = app.crearAlarma({ texto: 'Llamar a OSDE', fecha: '2026-03-01', tipo: 'importante' });
    expect(app.listarAlarmas().length).toBe(1);
    app.resolverAlarma(a.id);
    expect(app.listarAlarmas().length).toBe(0);        // resuelta no aparece por defecto
    expect(app.listarAlarmas(true).length).toBe(1);
    app.resolverAlarma(a.id);                          // toggle de vuelta a activa
    expect(app.listarAlarmas().length).toBe(1);
    app.eliminarAlarma(a.id);
    expect(app.DB.alarmas.length).toBe(0);
  });
  it('exige texto', () => { expect(() => app.crearAlarma({ texto: '  ' })).toThrow(); });
  it('guarda una nota (como OIP) y la puede editar', () => {
    const a = app.crearAlarma({ texto: 'Contrato PAMI', nota: 'Pedir por Dr. López\nInterno 42', fecha: '2026-03-01' });
    expect(a.nota).toContain('Interno 42');
    app.editarAlarma(a.id, { texto: 'Contrato PAMI 2026', nota: 'Actualizado', tipo: 'urgente' });
    const b = app.DB.alarmas.find(x => x.id === a.id);
    expect(b.texto).toBe('Contrato PAMI 2026');
    expect(b.nota).toBe('Actualizado');
    expect(b.tipo).toBe('urgente');
    expect(b.estado).toBe('activa');            // editar conserva el estado
  });
  it('vencidas = activas con fecha <= hoy', () => {
    app.crearAlarma({ texto: 'vieja', fecha: '2020-01-01' });
    app.crearAlarma({ texto: 'futura', fecha: '2999-01-01' });
    expect(app.alarmasVencidas().length).toBe(1);
  });
});

describe('Avisos automáticos', () => {
  it('avisa derivaciones urgentes pendientes', () => {
    app.DB.medicos.push({ id: 601, nombre: 'D', estado: 'Activo', sedeId: 1 });
    const cir = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Catarata', vigenciaDesde: '2026-01-01' });
    app.crearDerivacion({ grupoNomenclador: cir.grupo, medicoDerivadorId: 601, urgencia: 'urgente' });
    const avisos = app.avisosAutomaticos('2026-03');
    expect(avisos.some(a => a.tipo === 'urgente' && /URGENTE/.test(a.texto))).toBe(true);
  });
  it('avisa liquidaciones en borrador del mes', () => {
    app.DB.pagosMedicos.push({ id: 1, medicoId: 1, mes: '2026-03', estado: 'borrador', total: 1000, detalle: [] });
    const avisos = app.avisosAutomaticos('2026-03');
    expect(avisos.some(a => /borrador/.test(a.texto))).toBe(true);
  });
  it('totalAvisos suma automáticos + recordatorios vencidos', () => {
    app.crearAlarma({ texto: 'vieja', fecha: '2020-01-01' });
    expect(app.totalAvisos('2026-03')).toBeGreaterThanOrEqual(1);
  });
});
