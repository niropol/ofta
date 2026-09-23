// Ciclo completo del ABM de médicos: alta, edición, inactivar/reactivar, baja,
// regla "sin huérfanos" y registro en auditoría.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let ctx;
beforeEach(() => { ctx = loadApp(); resetDatos(ctx.app); });

function altaMedico(window, app, campos = {}) {
  app.abrirNuevoMedico();
  setInput(window, 'med_nombre', campos.nombre ?? 'Dr. Test, Juan');
  if (campos.especialidad != null) setInput(window, 'med_especialidad', campos.especialidad);
  if (campos.email != null) setInput(window, 'med_email', campos.email);
  if (campos.cuit != null) setInput(window, 'med_cuit', campos.cuit);
  return app.guardarMedico();
}

describe('ABM de médicos', () => {
  it('alta: crea el médico con id, color y auditoría', () => {
    const { window, app } = ctx;
    const m = altaMedico(window, app, { nombre: 'Dra. Pérez, Ana', especialidad: 'Retina' });
    expect(m).toBeTruthy();
    expect(app.DB.medicos.length).toBe(1);
    expect(m.nombre).toBe('Dra. Pérez, Ana');
    expect(m.especialidad).toBe('Retina');
    expect(m.color).toBeTruthy();
    expect(m.estado).toBe('Activo');
    const aud = app.auditoriaDe('medico', m.id);
    expect(aud.length).toBe(1);
    expect(aud[0].accion).toBe('alta');
  });

  it('alta sin nombre: no crea nada', () => {
    const { window, app } = ctx;
    app.abrirNuevoMedico();
    setInput(window, 'med_nombre', '   ');
    const r = app.guardarMedico();
    expect(r).toBe(false);
    expect(app.DB.medicos.length).toBe(0);
  });

  it('edición: cambia datos y deja auditoría con antes/después', () => {
    const { window, app } = ctx;
    const m = altaMedico(window, app, { nombre: 'Dr. Gómez, Luis' });
    app.editarMedico(m.id);
    setInput(window, 'med_especialidad', 'Córnea');
    setInput(window, 'med_tel', '11-5555-0000');
    const r = app.guardarMedico();
    expect(r.especialidad).toBe('Córnea');
    expect(r.tel).toBe('11-5555-0000');
    expect(app.DB.medicos.length).toBe(1); // no duplica
    const aud = app.auditoriaDe('medico', m.id);
    expect(aud[0].accion).toBe('edicion');
    expect(aud[0].antes.especialidad).toBe('');
    expect(aud[0].despues.especialidad).toBe('Córnea');
  });

  it('inactivar y reactivar: baja lógica reversible', () => {
    const { window, app } = ctx;
    const m = altaMedico(window, app);
    app.toggleEstadoMedico(m.id);
    expect(app.DB.medicos.find(x => x.id === m.id).estado).toBe('Inactivo');
    app.toggleEstadoMedico(m.id);
    expect(app.DB.medicos.find(x => x.id === m.id).estado).toBe('Activo');
  });

  it('baja física: elimina y registra auditoría (sin referencias)', () => {
    const { window, app } = ctx;
    const m = altaMedico(window, app);
    const ok = app.eliminarMedico(m.id);
    expect(ok).toBe(true);
    expect(app.DB.medicos.length).toBe(0);
    const aud = app.auditoriaDe('medico', m.id);
    expect(aud.some(a => a.accion === 'baja')).toBe(true);
  });

  it('sin huérfanos: no elimina un médico con prestaciones asociadas', () => {
    const { window, app } = ctx;
    const m = altaMedico(window, app);
    app.DB.prestacionesRealizadas.push({ id: app.nuevoId(), medicoRealizadorId: m.id, estado: 'activa' });
    const ok = app.eliminarMedico(m.id);
    expect(ok).toBe(false);
    expect(app.DB.medicos.length).toBe(1); // sigue existiendo
  });

  it('cada alta usa un color distinto de la paleta', () => {
    const { window, app } = ctx;
    const m1 = altaMedico(window, app, { nombre: 'A' });
    const m2 = altaMedico(window, app, { nombre: 'B' });
    expect(m1.color).not.toBe(m2.color);
  });

  it('ids únicos y crecientes (nextId no choca)', () => {
    const { window, app } = ctx;
    const m1 = altaMedico(window, app, { nombre: 'A' });
    const m2 = altaMedico(window, app, { nombre: 'B' });
    expect(m2.id).toBeGreaterThan(m1.id);
  });
});
