// ABM de sedes: alta, edición, sede activa, no eliminar en uso ni dejar sin sede.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let ctx, app, window;
beforeEach(() => { ctx = loadApp(); app = ctx.app; window = ctx.window; resetDatos(app); });

describe('Sedes', () => {
  it('arranca con la sede base SAM', () => {
    expect(app.DB.sedes.length).toBeGreaterThanOrEqual(1);
    expect(app.DB.sedes.some(s => s.nombre === 'SAM')).toBe(true);
  });

  it('alta de sede con auditoría', () => {
    app.abrirNuevaSede();
    setInput(window, 'sede_nombre', 'Sucursal Norte');
    app.guardarSede();
    const s = app.DB.sedes.find(x => x.nombre === 'Sucursal Norte');
    expect(s).toBeTruthy();
    expect(app.auditoriaDe('sede', s.id)[0].accion).toBe('alta');
  });

  it('no permite nombre duplicado', () => {
    app.abrirNuevaSede(); setInput(window, 'sede_nombre', 'SAM'); expect(app.guardarSede()).toBe(false);
  });

  it('no elimina una sede con médicos/prestaciones (sin huérfanos)', () => {
    app.abrirNuevaSede(); setInput(window, 'sede_nombre', 'Sur'); app.guardarSede();
    const sur = app.DB.sedes.find(s => s.nombre === 'Sur');
    app.DB.medicos.push({ id: 800, nombre: 'x', estado: 'Activo', sedeId: sur.id });
    app.eliminarSede(sur.id);
    expect(app.DB.sedes.find(s => s.id === sur.id)).toBeTruthy(); // no se eliminó
  });

  it('marcar sede activa cambia config.sedeActiva', () => {
    app.abrirNuevaSede(); setInput(window, 'sede_nombre', 'Centro'); app.guardarSede();
    const c = app.DB.sedes.find(s => s.nombre === 'Centro');
    app.marcarSedeActiva(c.id);
    expect(app.sedeActiva()).toBe(c.id);
  });
});
