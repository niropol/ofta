// Pagos a médicos con valores fijos: valor vigente (general/override/versionado),
// realizador + derivador, extra al médico, faltantes, y agregación por médico/mes.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 502, nombre: 'Dra. Derivadora', estado: 'Activo', sedeId: 1 });
});
function nom(cat) { return app.crearPrestacion({ categoria: cat, descripcion: cat, vigenciaDesde: '2026-01-01' }); }
function reg(datos) { return app.registrarPrestacion({ fecha: '2026-03-10', medicoRealizadorId: 501, ...datos }); }

describe('Valores fijos a médicos', () => {
  it('override por médico gana sobre el general; sin override cae al general', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-01-01');
    app.setValorMedico('cirugia', 501, 150000, '2026-01-01');
    expect(app.valorMedicoVigente('cirugia', 501, '2026-03-10')).toEqual({ valor: 150000, origen: 'medico' });
    expect(app.valorMedicoVigente('cirugia', 502, '2026-03-10')).toEqual({ valor: 120000, origen: 'general' });
  });

  it('versionado: un cambio no recalcula el pasado', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-01-01');
    app.setValorMedico('cirugia', null, 200000, '2026-06-01');
    expect(app.valorMedicoVigente('cirugia', null, '2026-03-10').valor).toBe(120000);
    expect(app.valorMedicoVigente('cirugia', null, '2026-07-10').valor).toBe(200000);
  });

  it('rechaza vigencia anterior o igual a la actual, y valor negativo', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-06-01');
    expect(() => app.setValorMedico('cirugia', null, 100000, '2026-05-01')).toThrow();
    expect(() => app.setValorMedico('cirugia', null, -5, '2027-01-01')).toThrow();
  });
});

describe('Cálculo de honorarios (valores fijos)', () => {
  it('consulta = valor fijo', () => {
    app.setValorMedico('consulta', null, 8000, '2026-01-01');
    const c = nom('consulta');
    const r = reg({ categoria: 'consulta', grupoNomenclador: c.grupo });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(8000);
  });

  it('cirugía = valor fijo del médico (override)', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-01-01');
    app.setValorMedico('cirugia', 501, 150000, '2026-01-01');
    const faco = nom('cirugia');
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(150000);
  });

  it('derivador cobra un valor fijo de derivación', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-01-01');
    app.setValorMedico('derivacion', null, 20000, '2026-01-01');
    const faco = nom('cirugia');
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoDerivadorId: 502 });
    const h = app.honorariosDePrestacion(r);
    expect(h.realizador.monto).toBe(120000);
    expect(h.derivador.medicoId).toBe(502);
    expect(h.derivador.monto).toBe(20000);
  });

  it('extra al médico se suma al valor fijo', () => {
    app.setValorMedico('consulta', null, 8000, '2026-01-01');
    const c = nom('consulta');
    const r = reg({ categoria: 'consulta', grupoNomenclador: c.grupo, extraMedico: 5000 });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(13000);
  });

  it('sin valor configurado: monto 0 y faltaValor informado', () => {
    const faco = nom('cirugia');
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo });
    const h = app.honorariosDePrestacion(r);
    expect(h.realizador.monto).toBe(0);
    expect(h.realizador.faltaValor).toContain('cirugia');
  });

  it('usa el valor de la fecha (cambio futuro no la afecta)', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-01-01');
    app.setValorMedico('cirugia', null, 200000, '2026-06-01');
    const faco = nom('cirugia');
    const r = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, fecha: '2026-03-10' });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(120000);
  });
});

describe('Agregación por médico / mes', () => {
  it('suma realizador + derivador e ignora anuladas', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-01-01');
    app.setValorMedico('derivacion', null, 20000, '2026-01-01');
    const faco = nom('cirugia');
    reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoDerivadorId: 502 }); // 501:120000, 502:20000
    const anul = reg({ categoria: 'cirugia', grupoNomenclador: faco.grupo });
    app.anularPrestacion(anul.id, 'test');
    expect(app.honorariosDeMedico(501, '2026-03').total).toBe(120000);
    expect(app.honorariosDeMedico(502, '2026-03').total).toBe(20000);
    expect(app.honorariosDelMes('2026-03').length).toBe(2);
  });
});
