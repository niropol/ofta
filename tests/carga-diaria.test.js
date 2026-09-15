// Carga diaria (parte visible): alta rápida de consulta/estudio y práctica desde
// el formulario del día, reusando registrarPrestacion. Verifica que la UI arma
// bien el registro (día, médico, categoría desde el ítem, derivador).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let ctx, app, win;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; win = ctx.window; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 502, nombre: 'Dra. Derivadora', estado: 'Activo', sedeId: 1 });
  app.DB.obrasSociales.push({ id: 701, nombre: 'OSDE', estado: 'Activa' });
});

function seedNom(cat, desc, precio) {
  return app.crearPrestacion({ categoria: cat, descripcion: desc, precio, vigenciaDesde: '2026-01-01' });
}

describe('Carga diaria', () => {
  it('agrega una consulta rápida con el día, médico y paciente elegidos', () => {
    const cons = seedNom('consulta', 'Consulta', 20000);
    app.renderCargaDiaria();                       // puebla los selects
    setInput(win, 'cd_fecha', '2026-03-10');
    app.renderCargaDiaria();
    setInput(win, 'cd_medico', '501');
    setInput(win, 'cd_ce_tipo', String(cons.grupo));
    setInput(win, 'cd_ce_os', 'OSDE');
    setInput(win, 'cd_ce_ap', 'Gómez');
    setInput(win, 'cd_ce_nom', 'Luis');
    app.cdAgregarCE();

    expect(app.DB.prestacionesRealizadas.length).toBe(1);
    const r = app.DB.prestacionesRealizadas[0];
    expect(r.categoria).toBe('consulta');          // categoría deducida del ítem
    expect(r.fecha).toBe('2026-03-10');
    expect(r.medicoRealizadorId).toBe(501);
    expect(r.obraSocial).toBe('OSDE');
    expect(r.pacienteNombre).toBe('Gómez, Luis');
    // el ingreso de SAM es el 40% del valor único
    expect(app.ingresoSAMDePrestacion(r).ingreso).toBe(8000);
    // limpió el paciente pero conservó el tipo para seguir cargando
    expect(win.document.getElementById('cd_ce_ap').value).toBe('');
    expect(win.document.getElementById('cd_ce_tipo').value).toBe(String(cons.grupo));
  });

  it('agrega una práctica con médico derivador', () => {
    const prac = seedNom('practica', 'Campo visual', 30000);
    app.renderCargaDiaria();
    setInput(win, 'cd_fecha', '2026-03-11');
    app.renderCargaDiaria();
    setInput(win, 'cd_medico', '501');
    setInput(win, 'cd_pr_tipo', String(prac.grupo));
    setInput(win, 'cd_pr_deriv', '502');
    setInput(win, 'cd_pr_ap', 'Pérez');
    app.cdAgregarPractica();

    expect(app.DB.prestacionesRealizadas.length).toBe(1);
    const r = app.DB.prestacionesRealizadas[0];
    expect(r.categoria).toBe('practica');
    expect(r.medicoRealizadorId).toBe(501);
    expect(r.medicoDerivadorId).toBe(502);
  });

  it('exige médico: sin médico elegido no crea nada', () => {
    const cons = seedNom('consulta', 'Consulta', 20000);
    app.renderCargaDiaria();
    setInput(win, 'cd_fecha', '2026-03-10');
    app.renderCargaDiaria();
    setInput(win, 'cd_medico', '');               // sin médico
    setInput(win, 'cd_ce_tipo', String(cons.grupo));
    app.cdAgregarCE();
    expect(app.DB.prestacionesRealizadas.length).toBe(0);
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
