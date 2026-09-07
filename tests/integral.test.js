// Etapa 9 — Testing integral: ciclo completo de punta a punta, casos borde y
// verificación de que no queden datos huérfanos. Usa el motor real.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => { ctx = loadApp(); app = ctx.app; resetDatos(app); });

// Escenario completo reutilizable.
function escenario() {
  app.DB.medicos.push({ id: 701, nombre: 'Dr. Uno', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 702, nombre: 'Dra. Dos', estado: 'Activo', sedeId: 1 });
  ['cirugia:40', 'derivacion_cirugia:10', 'insumo:20', 'sam_insumo:50'].forEach(x => {
    const [c, p] = x.split(':'); app.setReglaReparto(c, null, Number(p), '2026-01-01');
  });
  const faco = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' });
  const ins = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente', precio: 900000, moneda: 'ARS', vigenciaDesde: '2026-01-01' });
  app.setCostoInsumo(ins.grupo, 300000, 'ARS');
  const p = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 701, medicoDerivadorId: 702, insumos: [ins.grupo], paciente: { apellido: 'Gómez' } });
  return { faco, ins, p };
}

describe('Ciclo completo y no-huérfanos', () => {
  it('flujo prestación → liquidación → caja, y reabrir deja todo consistente', () => {
    escenario();
    const l = app.generarLiquidacion(701, '2026-03');
    app.cerrarLiquidacion(l.id, '2026-03-31');
    // Consistencia: sin issues.
    expect(app.diagnosticoDatos().issues).toEqual([]);
    // Reabrir quita el egreso y no deja huérfanos.
    app.reabrirLiquidacion(l.id);
    expect(app.DB.cajaMovimientos.filter(m => m.origen === 'pago_medico').length).toBe(0);
    expect(app.diagnosticoDatos().issues).toEqual([]);
  });

  it('eliminar la prestación no deja referencias colgadas (borrador)', () => {
    const { p } = escenario();
    app.generarLiquidacion(701, '2026-03'); // borrador (no bloquea)
    app.eliminarPrestacionRealizada(p.id);
    expect(app.DB.prestacionesRealizadas.length).toBe(0);
    // Regenerar liquidación queda en 0.
    const l2 = app.generarLiquidacion(701, '2026-03');
    expect(l2.total).toBe(0);
    expect(app.diagnosticoDatos().issues).toEqual([]);
  });

  it('caso borde: anular una prestación la excluye del cálculo', () => {
    const { p } = escenario();
    expect(app.honorariosDeMedico(701, '2026-03').total).toBe(320000);
    app.anularPrestacion(p.id, 'suspendida');
    expect(app.honorariosDeMedico(701, '2026-03').total).toBe(0);
    expect(app.diagnosticoDatos().issues).toEqual([]);
  });

  it('caso borde: no eliminar un nomenclador en uso (sin huérfanos)', () => {
    const { faco } = escenario();
    expect(app.eliminarPrestacion(faco.grupo).ok).toBe(false);
  });

  it('caso borde: no eliminar un médico con prestaciones', () => {
    escenario();
    expect(app.eliminarMedico(701)).toBe(false);
    expect(app.DB.medicos.find(m => m.id === 701)).toBeTruthy();
  });

  it('diagnosticoDatos detecta un egreso de caja huérfano', () => {
    escenario();
    // Plantar un egreso pago_medico sin liquidación.
    app.registrarEgresoPagoMedico(999999, 100, 'huérfano', '2026-03-31', 1);
    const d = app.diagnosticoDatos();
    expect(d.issues.length).toBeGreaterThan(0);
    expect(d.issues.some(s => s.includes('sin liquidación'))).toBe(true);
  });
});

describe('Verificación de cálculos (self-tests) y nube', () => {
  it('runSelfTests pasa todos los casos y no altera los datos reales', () => {
    const { p } = escenario();
    const antesPrest = app.DB.prestacionesRealizadas.length;
    const antesNextId = app.DB.nextId;
    const res = app.runSelfTests();
    expect(res.pasaron).toBe(res.total);
    expect(res.total).toBeGreaterThan(8);
    // No dejó rastro: mismas prestaciones y nextId restaurado.
    expect(app.DB.prestacionesRealizadas.length).toBe(antesPrest);
    expect(app.DB.nextId).toBe(antesNextId);
    expect(app.DB.prestacionesRealizadas[0].id).toBe(p.id);
  });

  it('estadoNube informa modo local cuando no hay credenciales', () => {
    const e = app.estadoNube();
    expect(e.hayCredenciales).toBe(false);
    expect(e.conectado).toBe(false);
  });
});
