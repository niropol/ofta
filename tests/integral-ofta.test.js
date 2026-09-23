// Integración OFTA: mes completo con IVA + insumos + derivación → prestación,
// liquidación → caja, y reconciliación de facturado/ingreso/honorarios.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => { ctx = loadApp(); app = ctx.app; resetDatos(app); app.DB.config.insumoModo = 'total'; });

describe('Mes completo OFTA (IVA + insumos + derivación)', () => {
  it('reconcilia facturado/ingreso/honorarios y liquida a caja', () => {
    const F = '2026-01-01', fl = Math.floor, rd = Math.round;
    app.DB.medicos.push({ id: 600, nombre: 'Op', estado: 'Activo', sedeId: 1 }, { id: 601, nombre: 'Nu', estado: 'Activo', sedeId: 1 });
    app.DB.obrasSociales.push({ id: 1, nombre: 'IOMA', estado: 'Activo', modalidadIVA: 'ambas' });

    const cons = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', vigenciaDesde: F });        // exenta
    const oct = app.crearPrestacion({ categoria: 'realizacion_estudio', descripcion: 'OCT', ivaExento: false, vigenciaDesde: F }); // gravada
    const cata = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Catarata', vigenciaDesde: F });         // exenta
    const lente = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente', precio: 180000, costo: 90000, honorarioMedico: 25000, vigenciaDesde: F });

    app.setContrato('IOMA', cons.grupo, 22000, F);
    app.setContrato('IOMA', oct.grupo, 40000, F);
    app.setContrato('IOMA', cata.grupo, 265000, F);
    app.setValorMedico('consulta', null, 6000, F);
    app.setValorMedico('realizacion_estudio', null, 12000, F, oct.grupo);
    app.setValorMedico('cirugia', null, 70000, F, cata.grupo);
    app.setValorMedico('derivacion', null, 15000, F, cata.grupo);

    app.registrarPrestacion({ fecha: '2026-05-05', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 601, obraSocial: 'IOMA', cantidad: 10 });
    app.registrarPrestacion({ fecha: '2026-05-06', categoria: 'realizacion_estudio', grupoNomenclador: oct.grupo, medicoRealizadorId: 601, obraSocial: 'IOMA', cantidad: 4 });
    app.registrarPrestacion({ fecha: '2026-05-10', categoria: 'cirugia', grupoNomenclador: cata.grupo, medicoRealizadorId: 600, medicoDerivadorId: 601, obraSocial: 'IOMA', cantidad: 1, insumos: [lente.grupo] });

    // Facturado indep: consulta 10*22000; OCT gravada 4*(40000+IVA10.5%); catarata 265000 + insumo (180000 + IVA21%)
    const ivaOct = rd(40000 * 10.5 / 100);
    const ivaLente = rd(180000 * 21 / 100);   // insumo gravado 21%
    const cataLinea = 265000 + 180000 + ivaLente;
    const facturado = 10 * 22000 + 4 * (40000 + ivaOct) + cataLinea;
    const ingreso = 10 * fl(22000 * 0.4) + 4 * fl((40000 + ivaOct) * 0.4) + fl(cataLinea * 0.4);
    const sam = app.ingresoSAMDelMes('2026-05');
    expect(sam.facturado).toBe(facturado);
    expect(sam.ingreso).toBe(ingreso);

    // Honorarios: consultas 10*6000; OCT 4*12000; catarata 70000 + insumo 25000 (realizador) + derivación 15000
    const hon = 10 * 6000 + 4 * 12000 + 70000 + 25000 + 15000;
    expect(app.honorariosDelMes('2026-05').reduce((s, h) => s + h.total, 0)).toBe(hon);

    // Derivación → estado → (ya facturada arriba, chequeamos el pipeline aparte)
    const d = app.crearDerivacion({ grupoNomenclador: cata.grupo, medicoDerivadorId: 601, medicoCirujanoId: 600, urgencia: 'urgente' });
    app.cambiarEstadoDerivacion(d.id, 'programada', { fechaProgramada: '2026-05-20' });
    expect(app.resumenDerivaciones().programada).toBe(1);

    // Liquidación del cirujano → caja
    const liq = app.generarLiquidacion(600, '2026-05');
    const saldoAntes = app.saldosCaja().ARS.total;
    app.cerrarLiquidacion(liq.id, '2026-05-31');
    expect(saldoAntes - app.saldosCaja().ARS.total).toBe(liq.total);
    expect(app.mensajeLiquidacionWhatsApp(liq)).toMatch(/OFTA/);

    // Cobro de SAM exacto → diferencia 0
    app.registrarCobroSAM('2026-05', 'IOMA', '2026-06-05', app.ingresoSAMDelMes('2026-05', 'IOMA').ingreso);
    expect(app.comparacionCobroSAM('2026-05', 'IOMA').diferencia).toBe(0);
  });
});
