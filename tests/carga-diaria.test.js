// Carga diaria (parte visible): consultas y estudios por CANTIDAD + OS (sin
// paciente), cirugías por el modal. Verifica que la UI arma bien el registro,
// que suma en la misma línea, y que el ingreso escala por cantidad.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let ctx, app, win;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; win = ctx.window; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.DB.obrasSociales.push({ id: 701, nombre: 'IOMA', estado: 'Activa' });
  app.DB.obrasSociales.push({ id: 702, nombre: 'OSDE', estado: 'Activa' });
});

function seedNom(cat, desc, precio) {
  return app.crearPrestacion({ categoria: cat, descripcion: desc, precio, vigenciaDesde: '2026-01-01' });
}

describe('Carga diaria por cantidad', () => {
  it('agrega consultas por cantidad y obra social (sin paciente); el ingreso escala', () => {
    const cons = seedNom('consulta', 'Consulta', 20000);
    app.renderCargaDiaria();
    setInput(win, 'cd_fecha', '2026-03-10'); app.renderCargaDiaria();
    setInput(win, 'cd_medico', '501');
    setInput(win, 'cd_con_tipo', String(cons.grupo));
    setInput(win, 'cd_con_os', 'IOMA');
    setInput(win, 'cd_con_cant', '5');
    app.cdAgregarConsulta();

    expect(app.DB.prestacionesRealizadas.length).toBe(1);
    const r = app.DB.prestacionesRealizadas[0];
    expect(r.categoria).toBe('consulta');
    expect(r.cantidad).toBe(5);
    expect(r.obraSocial).toBe('IOMA');
    expect(r.pacienteId).toBe(null);
    // 40% de 20.000 = 8.000, por 5 = 40.000
    expect(app.ingresoSAMDePrestacion(r).ingreso).toBe(40000);
  });

  it('sumar de nuevo la misma consulta/OS acumula en la misma línea', () => {
    const cons = seedNom('consulta', 'Consulta', 20000);
    app.renderCargaDiaria();
    setInput(win, 'cd_fecha', '2026-03-10'); app.renderCargaDiaria();
    setInput(win, 'cd_medico', '501'); setInput(win, 'cd_con_tipo', String(cons.grupo)); setInput(win, 'cd_con_os', 'IOMA');
    setInput(win, 'cd_con_cant', '5'); app.cdAgregarConsulta();
    setInput(win, 'cd_con_cant', '3'); app.cdAgregarConsulta();
    expect(app.DB.prestacionesRealizadas.length).toBe(1);  // misma línea
    expect(app.DB.prestacionesRealizadas[0].cantidad).toBe(8);
    // distinta OS abre otra línea
    setInput(win, 'cd_con_os', 'OSDE'); setInput(win, 'cd_con_cant', '2'); app.cdAgregarConsulta();
    expect(app.DB.prestacionesRealizadas.length).toBe(2);
  });

  it('estudios por cantidad; honorarios del médico escalan por cantidad', () => {
    app.setValorMedico('realizacion_estudio', null, 8000, '2026-01-01');
    const oct = seedNom('realizacion_estudio', 'OCT', 45000);
    app.renderCargaDiaria();
    setInput(win, 'cd_fecha', '2026-03-10'); app.renderCargaDiaria();
    setInput(win, 'cd_medico', '501'); setInput(win, 'cd_est_tipo', String(oct.grupo)); setInput(win, 'cd_est_os', 'OSDE');
    setInput(win, 'cd_est_cant', '4'); app.cdAgregarEstudio();
    const r = app.DB.prestacionesRealizadas[0];
    expect(r.cantidad).toBe(4);
    expect(app.honorariosDeMedico(501, '2026-03').total).toBe(32000); // 8.000 × 4
    expect(app.resumenMes('2026-03').totalPrestaciones).toBe(4);       // cuenta unidades
  });

  it('cdEditarCantidad corrige la cantidad de una línea', () => {
    const cons = seedNom('consulta', 'Consulta', 20000);
    app.renderCargaDiaria();
    setInput(win, 'cd_fecha', '2026-03-10'); app.renderCargaDiaria();
    setInput(win, 'cd_medico', '501'); setInput(win, 'cd_con_tipo', String(cons.grupo)); setInput(win, 'cd_con_os', 'IOMA');
    setInput(win, 'cd_con_cant', '5'); app.cdAgregarConsulta();
    const id = app.DB.prestacionesRealizadas[0].id;
    win.prompt = () => '7';
    app.cdEditarCantidad(id);
    expect(app.DB.prestacionesRealizadas[0].cantidad).toBe(7);
  });

  it('renderPanelMes calcula el resumen del mes sin romper', () => {
    const faco = seedNom('cirugia', 'Faco', 0);
    app.setContrato('OSDE', faco.grupo, 1000000, '2026-01-01');
    app.registrarPrestacion({ fecha: '2026-03-05', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, obraSocial: 'OSDE' });
    setInput(win, 'panelMes', '2026-03');
    app.renderPanelMes();
    const html = win.document.getElementById('panelContenido').innerHTML;
    expect(html).toContain('SAM te debe pagar');
    expect(html).toContain('Margen estimado');
  });
});
