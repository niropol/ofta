// Motor de honorarios: % vigente (general/override/versionado), consulta 100%,
// cirugía × %, derivador en paralelo, insumo sobre el neto, redondeo hacia abajo,
// USD con cotización, faltantes de %, y agregación por médico/mes.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 502, nombre: 'Dra. Derivadora', estado: 'Activo', sedeId: 1 });
});
function nom(cat, precio, extra = {}) { return app.crearPrestacion({ categoria: cat, descripcion: cat, precio, vigenciaDesde: '2026-01-01', ...extra }); }
function reg(datos) { return app.registrarPrestacion({ fecha: '2026-03-10', medicoRealizadorId: 501, ...datos }); }

describe('Reglas de reparto (%)', () => {
  it('override por médico gana sobre el general; sin override cae al general', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('cirugia', 501, 55, '2026-01-01');
    expect(app.porcentajeReglaVigente('cirugia', 501, '2026-03-10')).toEqual({ porcentaje: 55, origen: 'medico' });
    expect(app.porcentajeReglaVigente('cirugia', 502, '2026-03-10')).toEqual({ porcentaje: 40, origen: 'general' });
  });

  it('% versionado: un cambio no recalcula el pasado', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('cirugia', null, 45, '2026-06-01');
    expect(app.porcentajeReglaVigente('cirugia', null, '2026-03-10').porcentaje).toBe(40);
    expect(app.porcentajeReglaVigente('cirugia', null, '2026-07-10').porcentaje).toBe(45);
  });

  it('rechaza una vigencia anterior o igual a la actual', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-06-01');
    expect(() => app.setReglaReparto('cirugia', null, 50, '2026-05-01')).toThrow();
  });

  it('la consulta no lleva regla', () => {
    expect(() => app.setReglaReparto('consulta', null, 100, '2026-01-01')).toThrow();
  });
});

describe('Cálculo de honorarios', () => {
  it('consulta: 100% del precio, sin regla', () => {
    const c = nom('consulta', 11000);
    const r = reg({ categoria: 'consulta', grupoNomenclador: c.grupo });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(11000);
  });

  it('cirugía: precio × % del realizador', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    const faco = nom('cirugia', 500000);
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(200000);
  });

  it('redondeo hacia abajo al peso', () => {
    app.setReglaReparto('cirugia', null, 50, '2026-01-01');
    const faco = nom('cirugia', 10001); // 50% = 5000,5
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(5000);
  });

  it('derivador cobra en paralelo sobre la misma base', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('derivacion_cirugia', null, 10, '2026-01-01');
    const faco = nom('cirugia', 500000);
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoDerivadorId: 502 });
    const h = app.honorariosDePrestacion(r);
    expect(h.realizador.monto).toBe(200000);   // 40%
    expect(h.derivador.medicoId).toBe(502);
    expect(h.derivador.monto).toBe(50000);      // 10% sobre 500000, en paralelo
  });

  it('insumo: (precio − costo) neto × % del insumo, al realizador', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('insumo', null, 20, '2026-01-01');
    const faco = nom('cirugia', 500000);
    const ins = nom('insumo', 900000); app.setCostoInsumo(ins.grupo, 300000, 'ARS'); // neto 600000
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, insumos: [ins.grupo] });
    // base 200000 + insumo 20% de 600000 = 120000 → 320000
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(320000);
  });

  it('neto de insumo nunca negativo (costo > precio → 0)', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('insumo', null, 20, '2026-01-01');
    const faco = nom('cirugia', 500000);
    const ins = nom('insumo', 100000); app.setCostoInsumo(ins.grupo, 300000, 'ARS'); // neto negativo → 0
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, insumos: [ins.grupo] });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(200000); // solo la base
  });

  it('USD: sin cotización marca requiereCotizacion; con cotización convierte', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('insumo', null, 20, '2026-01-01');
    const faco = nom('cirugia', 500000);
    const ins = nom('insumo', 400, { moneda: 'USD' }); app.setCostoInsumo(ins.grupo, 100, 'USD'); // neto 300 USD
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, insumos: [ins.grupo] });
    const sin = app.honorariosDePrestacion(r);
    expect(sin.realizador.requiereCotizacion).toBe(true);
    expect(sin.realizador.monto).toBe(200000); // insumo no sumado sin cotización
    const con = app.honorariosDePrestacion(r, 1000); // 1 USD = 1000 ARS → neto 300000; 20% = 60000
    expect(con.realizador.requiereCotizacion).toBe(false);
    expect(con.realizador.monto).toBe(260000);
  });

  it('sin % definido: monto 0 y faltaPct informado', () => {
    const faco = nom('cirugia', 500000);
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo });
    const h = app.honorariosDePrestacion(r);
    expect(h.realizador.monto).toBe(0);
    expect(h.realizador.faltaPct).toContain('cirugia');
  });

  it('% de la fecha de la prestación (aumento posterior no la afecta)', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('cirugia', null, 60, '2026-06-01');
    const faco = nom('cirugia', 500000);
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, fecha: '2026-03-10' });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(200000); // 40%, no 60%
  });
});

describe('Agregación por médico / mes', () => {
  it('suma realizador + derivador e ignora anuladas', () => {
    app.setReglaReparto('cirugia', null, 40, '2026-01-01');
    app.setReglaReparto('derivacion_cirugia', null, 10, '2026-01-01');
    const faco = nom('cirugia', 500000);
    reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoDerivadorId: 502 }); // 501:200000, 502:50000
    const anul = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo });
    app.anularPrestacion(anul.id, 'test');
    expect(app.honorariosDeMedico(501, '2026-03').total).toBe(200000);
    expect(app.honorariosDeMedico(502, '2026-03').total).toBe(50000);
    const mes = app.honorariosDelMes('2026-03');
    expect(mes.length).toBe(2);
  });
});
