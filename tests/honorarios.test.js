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

  it('valor por cirugía puntual gana sobre el valor de la categoría', () => {
    const catarata = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Catarata', vigenciaDesde: '2026-01-01' });
    const pterigion = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Pterigión', vigenciaDesde: '2026-01-01' });
    app.setValorMedico('cirugia', null, 100000, '2026-01-01');                 // valor general de cirugía
    app.setValorMedico('cirugia', null, 160000, '2026-01-01', catarata.grupo); // valor puntual catarata
    // Catarata usa su valor puntual; pterigión (sin puntual) cae al general.
    expect(app.valorMedicoVigente('cirugia', 501, '2026-03-10', catarata.grupo)).toEqual({ valor: 160000, origen: 'item' });
    expect(app.valorMedicoVigente('cirugia', 501, '2026-03-10', pterigion.grupo)).toEqual({ valor: 100000, origen: 'general' });
    const rc = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: catarata.grupo, medicoRealizadorId: 501 });
    expect(app.honorariosDePrestacion(rc).realizador.monto).toBe(160000);
  });

  it('override por médico sobre una cirugía puntual gana sobre el valor puntual general', () => {
    const catarata = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Catarata', vigenciaDesde: '2026-01-01' });
    app.setValorMedico('cirugia', null, 160000, '2026-01-01', catarata.grupo);
    app.setValorMedico('cirugia', 501, 180000, '2026-01-01', catarata.grupo);
    expect(app.valorMedicoVigente('cirugia', 501, '2026-03-10', catarata.grupo)).toEqual({ valor: 180000, origen: 'medico_item' });
    expect(app.valorMedicoVigente('cirugia', 502, '2026-03-10', catarata.grupo)).toEqual({ valor: 160000, origen: 'item' });
  });

  it('rechaza vigencia anterior o igual a la actual, y valor negativo', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-06-01');
    expect(() => app.setValorMedico('cirugia', null, 100000, '2026-05-01')).toThrow();
    expect(() => app.setValorMedico('cirugia', null, -5, '2027-01-01')).toThrow();
  });
});

describe('Cálculo de honorarios (valores fijos)', () => {
  it('setValorMedicoActual corrige el valor vigente en el lugar (sin versionar) y se refleja', () => {
    app.setValorMedico('consulta', null, 10000, '2026-01-01');
    const c = nom('consulta');
    const r = reg({ categoria: 'consulta', grupoNomenclador: c.grupo });
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(10000);
    app.setValorMedicoActual('consulta', null, 12000);   // corrige
    expect(app.valorMedicoVigente('consulta', null, '2026-03-10').valor).toBe(12000);
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(12000);  // impacta el cálculo
    expect(app.DB.valoresMedico.filter(v => v.categoria === 'consulta' && v.medicoId == null).length).toBe(1); // no versionó
  });

  it('el pago fijo por insumo se suma al honorario del médico realizador', () => {
    app.setValorMedico('cirugia', null, 100000, '2026-01-01');
    const faco = nom('cirugia');
    const lenteA = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente A', precio: 500000, costo: 250000, honorarioMedico: 30000, vigenciaDesde: '2026-01-01' });
    const lenteB = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente B', precio: 700000, costo: 300000, honorarioMedico: 50000, vigenciaDesde: '2026-01-01' });
    const rA = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, insumos: [lenteA.grupo] });
    expect(app.honorariosDePrestacion(rA).realizador.monto).toBe(130000); // 100.000 + 30.000
    const rB = app.registrarPrestacion({ fecha: '2026-03-11', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, insumos: [lenteB.grupo] });
    expect(app.honorariosDePrestacion(rB).realizador.monto).toBe(150000); // 100.000 + 50.000
  });

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
