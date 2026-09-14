// Contratos (ingreso): valor por OS + prestación, 40% de SAM, cobro en caja.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. X', estado: 'Activo', sedeId: 1 });
});
function nomFaco() { return app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 0, vigenciaDesde: '2026-01-01' }); }

describe('Contratos e ingreso de SAM', () => {
  it('setContrato guarda el valor por OS + prestación y lo devuelve vigente', () => {
    const faco = nomFaco();
    app.setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    expect(app.valorContrato('OSDE', faco.grupo, '2026-03-10')).toBe(1000000);
    expect(app.valorContrato('IOMA', faco.grupo, '2026-03-10')).toBe(null); // otra OS, sin contrato
  });

  it('versiona el valor sin recalcular el pasado', () => {
    const faco = nomFaco();
    app.setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    app.setContrato('OSDE', faco.grupo, 1200000, '2026-06-01');
    expect(app.valorContrato('OSDE', faco.grupo, '2026-03-10')).toBe(1000000);
    expect(app.valorContrato('OSDE', faco.grupo, '2026-07-10')).toBe(1200000);
  });

  it('ingreso de SAM = 40% del valor de contrato (redondeo abajo)', () => {
    const faco = nomFaco();
    app.setContrato('OSDE', faco.grupo, 1000001, '2026-01-01'); // 40% = 400000.4 → 400000
    const reg = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    const i = app.ingresoSAMDePrestacion(reg);
    expect(i.valorContrato).toBe(1000001);
    expect(i.ingreso).toBe(400000);
    expect(i.faltaContrato).toBe(false);
  });

  it('marca faltaContrato cuando la OS no tiene contrato cargado (no Particular)', () => {
    const faco = nomFaco();
    const reg = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'IOMA' });
    const i = app.ingresoSAMDePrestacion(reg);
    expect(i.ingreso).toBe(0);
    expect(i.faltaContrato).toBe(true);
  });

  it('ingresoSAMDelMes suma facturado e ingreso y cuenta faltantes', () => {
    const faco = nomFaco();
    app.setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    app.registrarPrestacion({ fecha: '2026-03-02', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    app.registrarPrestacion({ fecha: '2026-03-03', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'IOMA' }); // sin contrato
    const r = app.ingresoSAMDelMes('2026-03');
    expect(r.facturado).toBe(2000000);
    expect(r.ingreso).toBe(800000); // 40%
    expect(r.sinContrato).toBe(1);
  });

  it('SAM también factura los insumos: el 40% incluye el ingreso de los insumos', () => {
    const faco = nomFaco();
    app.setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    const ins = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente', precio: 500000, moneda: 'ARS', costo: 200000, costoMoneda: 'ARS', vigenciaDesde: '2026-01-01' });
    const reg = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE', insumos: [ins.grupo] });
    const i = app.ingresoSAMDePrestacion(reg);
    expect(i.facturado).toBe(1500000);          // contrato 1.000.000 + insumo 500.000
    expect(i.ingreso).toBe(600000);             // 40%
  });

  it('costoInsumosDelMes suma el costo (USD con cotización) y se registra como egreso', () => {
    const faco = nomFaco();
    const insA = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Sutura', precio: 20000, moneda: 'ARS', costo: 8000, costoMoneda: 'ARS', vigenciaDesde: '2026-01-01' });
    const insU = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente USD', precio: 0, moneda: 'ARS', costo: 500, costoMoneda: 'USD', vigenciaDesde: '2026-01-01' });
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE', insumos: [insA.grupo, insU.grupo] });
    expect(app.costoInsumosDelMes('2026-03').requiereCotizacion).toBe(true);
    const c = app.costoInsumosDelMes('2026-03', 1000);
    expect(c.costo).toBe(508000); // 8000 + 500×1000
    const mov = app.registrarCostoInsumos('2026-03', 1000, '2026-03-31');
    expect(mov.monto).toBe(508000);
    expect(app.saldosCaja().ARS.transferencia).toBe(-508000);
    expect(app.quitarCostoInsumos('2026-03')).toBe(1);
  });

  it('registrarCobroSAM carga el ingreso en caja y no duplica; quitarCobroSAM lo deshace', () => {
    const faco = nomFaco();
    app.setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    const mov = app.registrarCobroSAM('2026-03', '2026-03-31');
    expect(mov.tipo).toBe('ingreso');
    expect(mov.monto).toBe(400000);
    expect(app.saldosCaja().ARS.transferencia).toBe(400000);
    expect(() => app.registrarCobroSAM('2026-03')).toThrow(); // no duplica
    expect(app.quitarCobroSAM('2026-03')).toBe(1);
    expect(app.saldosCaja().ARS.transferencia).toBe(0);
  });

  // ── Motor "valor único": consulta / estudio / práctica no dependen de la OS ──
  it('consulta/estudio/práctica facturan el VALOR ÚNICO del nomenclador (sin contrato, igual para toda OS)', () => {
    const cons = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 20000, vigenciaDesde: '2026-01-01' });
    // Misma consulta, dos OS distintas → mismo facturado, no hace falta contrato.
    const rA = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    const rB = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 501, obraSocial: 'IOMA' });
    const iA = app.ingresoSAMDePrestacion(rA);
    const iB = app.ingresoSAMDePrestacion(rB);
    expect(iA.modo).toBe('valor_unico');
    expect(iA.facturado).toBe(20000);
    expect(iA.ingreso).toBe(8000);          // 40%
    expect(iA.faltaContrato).toBe(false);   // valor único no exige contrato
    expect(iB.ingreso).toBe(8000);          // otra OS, mismo valor
  });

  it('la práctica valor único suma el insumo a lo facturado', () => {
    const prac = app.crearPrestacion({ categoria: 'practica', descripcion: 'Práctica', precio: 30000, vigenciaDesde: '2026-01-01' });
    const ins = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Descartable', precio: 10000, moneda: 'ARS', costo: 4000, costoMoneda: 'ARS', vigenciaDesde: '2026-01-01' });
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'practica', grupoNomenclador: prac.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE', insumos: [ins.grupo] });
    const i = app.ingresoSAMDePrestacion(r);
    expect(i.facturado).toBe(40000);        // 30.000 valor único + 10.000 insumo
    expect(i.ingreso).toBe(16000);          // 40%
  });

  it('particular no factura por SAM (ingreso 0) aunque tenga valor de nomenclador', () => {
    const cons = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 20000, vigenciaDesde: '2026-01-01' });
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 501, obraSocial: 'Particular' });
    expect(app.ingresoSAMDePrestacion(r).ingreso).toBe(0);
  });

  it('valor único NO cuenta como "sin contrato" en el resumen del mes', () => {
    const cons = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 20000, vigenciaDesde: '2026-01-01' });
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    const faco = nomFaco();
    app.registrarPrestacion({ fecha: '2026-03-02', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'IOMA' }); // cirugía sin contrato
    const r = app.ingresoSAMDelMes('2026-03');
    expect(r.sinContrato).toBe(1);          // solo la cirugía, no la consulta
    expect(r.ingreso).toBe(8000);           // 40% de la consulta (la cirugía sin contrato aporta 0)
  });

  // ── Control: comparar el 40% esperado contra lo que SAM efectivamente transfirió ──
  it('registrarCobroSAM acepta el monto recibido y calcula la diferencia; comparacionCobroSAM la reporta', () => {
    const faco = nomFaco();
    app.setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    app.registrarPrestacion({ fecha: '2026-03-01', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    // Esperado 400.000, pero SAM transfirió 380.000.
    const mov = app.registrarCobroSAM('2026-03', '2026-03-31', 380000);
    expect(mov.monto).toBe(380000);         // en caja entra lo que realmente cobramos
    expect(mov.esperado).toBe(400000);
    expect(mov.diferencia).toBe(-20000);    // nos pagaron de menos
    const c = app.comparacionCobroSAM('2026-03');
    expect(c.esperado).toBe(400000);
    expect(c.recibido).toBe(380000);
    expect(c.diferencia).toBe(-20000);
    expect(c.registrado).toBe(true);
  });
});
