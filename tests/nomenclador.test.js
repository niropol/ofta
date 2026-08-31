// Nomenclador con versionado de precios: alta, precio vigente por fecha, aumento
// con vigencia (historial intacto), corrección en el lugar, LIO con costo,
// inactivar/eliminar y regla "sin huérfanos".
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx;
beforeEach(() => { ctx = loadApp(); resetDatos(ctx.app); });

describe('Nomenclador — versionado de precios', () => {
  it('alta: crea grupo + primera versión vigente, con auditoría', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000, vigenciaDesde: '2026-01-01' });
    expect(app.DB.nomenclador.length).toBe(1);
    expect(v.precio).toBe(11000);
    expect(v.vigenciaHasta).toBe(null);
    expect(app.auditoriaDe('nomenclador', v.grupo)[0].accion).toBe('alta');
  });

  it('consulta guarda su valor fijo (100% al médico se resuelve en Etapa 4)', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000 });
    expect(app.precioVigente(v.grupo).precio).toBe(11000);
  });

  it('aumento: versiona sin recalcular el pasado (precio vigente por fecha)', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' });
    app.versionarPrecio(v.grupo, { vigenciaDesde: '2026-06-01', precio: 650000 });

    // Antes del aumento sigue valiendo el precio viejo.
    expect(app.precioVigente(v.grupo, '2026-03-15').precio).toBe(500000);
    // Desde la vigencia nueva, el precio nuevo.
    expect(app.precioVigente(v.grupo, '2026-06-01').precio).toBe(650000);
    expect(app.precioVigente(v.grupo, '2026-09-01').precio).toBe(650000);
    // La versión vieja quedó cerrada el día anterior.
    const vieja = app.versionesDe(v.grupo).find(x => x.vigenciaDesde === '2026-01-01');
    expect(vieja.vigenciaHasta).toBe('2026-05-31');
    // Hay dos versiones en el historial.
    expect(app.versionesDe(v.grupo).length).toBe(2);
  });

  it('rechaza un aumento con vigencia anterior o igual a la actual', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-06-01' });
    expect(() => app.versionarPrecio(v.grupo, { vigenciaDesde: '2026-05-01', precio: 700000 })).toThrow();
    expect(() => app.versionarPrecio(v.grupo, { vigenciaDesde: '2026-06-01', precio: 700000 })).toThrow();
    expect(app.versionesDe(v.grupo).length).toBe(1); // no cambió nada
  });

  it('corrección en el lugar: no crea versión nueva, arregla el precio actual', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'realizacion_estudio', descripcion: 'OCT', precio: 15000 });
    app.editarPrestacion(v.grupo, { precio: 18000, corregirPrecio: true });
    expect(app.versionesDe(v.grupo).length).toBe(1);
    expect(app.precioVigente(v.grupo).precio).toBe(18000);
  });

  it('editar metadatos aplica a todas las versiones del grupo', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' });
    app.versionarPrecio(v.grupo, { vigenciaDesde: '2026-06-01', precio: 650000 });
    app.editarPrestacion(v.grupo, { descripcion: 'Facoemulsificación', codigo: '20167' });
    for (const ver of app.versionesDe(v.grupo)) {
      expect(ver.descripcion).toBe('Facoemulsificación');
      expect(ver.codigo).toBe('20167');
    }
  });

  it('LIO: guarda precio y costo, cada uno con su moneda', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'lio', descripcion: 'Lente monofocal', precio: 900000, moneda: 'ARS', costo: 300, costoMoneda: 'USD' });
    expect(v.costo).toBe(300);
    expect(v.costoMoneda).toBe('USD');
    expect(v.precio).toBe(900000);
    expect(v.moneda).toBe('ARS');
  });

  it('no-LIO no guarda costo (queda null)', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000, costo: 999 });
    expect(v.costo).toBe(null);
    expect(v.costoMoneda).toBe(null);
  });

  it('inactivar/reactivar afecta a todo el grupo', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' });
    app.versionarPrecio(v.grupo, { vigenciaDesde: '2026-06-01', precio: 650000 });
    app.toggleEstadoPrestacion(v.grupo);
    expect(app.versionesDe(v.grupo).every(x => x.estado === 'Inactivo')).toBe(true);
    app.toggleEstadoPrestacion(v.grupo);
    expect(app.versionesDe(v.grupo).every(x => x.estado === 'Activo')).toBe(true);
  });

  it('eliminar: OK sin referencias; bloqueado si hay prestaciones realizadas', () => {
    const { app } = ctx;
    const v = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000 });
    // Con una prestación realizada que la referencia → bloquea.
    app.DB.prestacionesRealizadas.push({ id: app.nuevoId(), nomencladorId: app.versionActual(v.grupo).id });
    let r = app.eliminarPrestacion(v.grupo);
    expect(r.ok).toBe(false);
    expect(r.referencias).toBe(1);
    // Sin la referencia → elimina.
    app.DB.prestacionesRealizadas = [];
    r = app.eliminarPrestacion(v.grupo);
    expect(r.ok).toBe(true);
    expect(app.DB.nomenclador.length).toBe(0);
  });

  it('listarPrestaciones: una fila por grupo (la versión actual) + filtro por categoría', () => {
    const { app } = ctx;
    const faco = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' });
    app.versionarPrecio(faco.grupo, { vigenciaDesde: '2026-06-01', precio: 650000 });
    app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000 });

    const todas = app.listarPrestaciones({});
    expect(todas.length).toBe(2); // no duplica por versión
    const soloCx = app.listarPrestaciones({ categoria: 'cirugia' });
    expect(soloCx.length).toBe(1);
    expect(soloCx[0].precio).toBe(650000); // muestra la versión actual
  });
});
