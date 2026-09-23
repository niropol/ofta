// ABM de obras sociales: alta, edición con propagación de renombre, inactivar,
// eliminar (bloqueado si está en uso), datalist de activas.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let ctx, app, window;
beforeEach(() => { ctx = loadApp(); app = ctx.app; window = ctx.window; resetDatos(app); });

function altaOS(nombre, codigo = '') {
  app.abrirNuevaOS();
  setInput(window, 'os_nombre', nombre);
  setInput(window, 'os_codigo', codigo);
  return app.guardarOS();
}

describe('Obras sociales', () => {
  it('alta: crea OS activa con auditoría y aparece en el datalist', () => {
    const o = altaOS('OSDE', '6001');
    expect(o.estado).toBe('Activa');
    expect(app.DB.obrasSociales.length).toBe(1);
    expect(app.auditoriaDe('obraSocial', o.id)[0].accion).toBe('alta');
    expect(app.getObrasSocialesActivas().map(x => x.nombre)).toContain('OSDE');
  });

  it('no permite nombres duplicados (case-insensitive)', () => {
    altaOS('OSDE');
    const r = altaOS('osde');
    expect(r).toBe(false);
    expect(app.DB.obrasSociales.length).toBe(1);
  });

  it('renombrar propaga a las prestaciones que la usan', () => {
    const o = altaOS('OSDE');
    app.DB.medicos.push({ id: 501, nombre: 'Dr. X', estado: 'Activo', sedeId: 1 });
    const c = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000, vigenciaDesde: '2026-01-01' });
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    // Editar el nombre de la OS.
    app.editarOS(o.id);
    setInput(window, 'os_nombre', 'OSDE Binaria');
    app.guardarOS();
    expect(app.DB.prestacionesRealizadas[0].obraSocial).toBe('OSDE Binaria');
  });

  it('eliminar: bloqueado si hay prestaciones que la usan; OK si no', () => {
    const o = altaOS('IOMA');
    app.DB.medicos.push({ id: 501, nombre: 'Dr. X', estado: 'Activo', sedeId: 1 });
    const c = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000, vigenciaDesde: '2026-01-01' });
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501, obraSocial: 'IOMA' });
    expect(app.eliminarOS(o.id)).toBe(false); // en uso
    expect(app.DB.obrasSociales.length).toBe(1);
    // Sin uso → elimina.
    app.DB.prestacionesRealizadas = [];
    expect(app.eliminarOS(o.id)).toBe(true);
    expect(app.DB.obrasSociales.length).toBe(0);
  });

  it('inactivar la saca del datalist de activas', () => {
    const o = altaOS('Medifé');
    app.toggleEstadoOS(o.id);
    expect(app.getObrasSocialesActivas().map(x => x.nombre)).not.toContain('Medifé');
  });
});

describe('Admin — costo real de insumos', () => {
  it('setCostoInsumo define el costo de la versión vigente; solo aplica a insumos', () => {
    const ins = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente', precio: 900000, moneda: 'ARS', vigenciaDesde: '2026-01-01' });
    app.setCostoInsumo(ins.grupo, 300000, 'ARS');
    expect(app.versionActual(ins.grupo).costo).toBe(300000);
    expect(app.versionActual(ins.grupo).costoMoneda).toBe('ARS');
    // No aplica a una prestación normal.
    const faco = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' });
    expect(() => app.setCostoInsumo(faco.grupo, 1000, 'ARS')).toThrow();
  });

  it('un aumento de precio conserva el costo real definido por admin', () => {
    const ins = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente', precio: 900000, moneda: 'ARS', vigenciaDesde: '2026-01-01' });
    app.setCostoInsumo(ins.grupo, 300000, 'ARS');
    app.versionarPrecio(ins.grupo, { vigenciaDesde: '2026-06-01', precio: 1100000 });
    expect(app.versionActual(ins.grupo).costo).toBe(300000); // arrastrado
    expect(app.versionActual(ins.grupo).precio).toBe(1100000);
  });
});
