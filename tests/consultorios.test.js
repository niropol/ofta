// Consultorios (dentro de sede), horarios de médicos, y campos nuevos de la
// prestación (hora, consultorio, extra al médico, ingreso de insumo).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let ctx, app, window;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; window = ctx.window; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. X', estado: 'Activo', sedeId: 1 });
  app.DB.consultorios.push({ id: 1, sedeId: 1, nombre: 'Consultorio 1', estado: 'Activa' });
});

describe('Consultorios', () => {
  it('alta de consultorio en una sede', () => {
    app.abrirNuevoConsultorio();
    setInput(window, 'cons_nombre', 'Consultorio 2');
    app.guardarConsultorio();
    expect(app.DB.consultorios.some(c => c.nombre === 'Consultorio 2')).toBe(true);
    expect(app.getConsultoriosDeSede(1).length).toBe(2);
  });

  it('no elimina un consultorio en uso', () => {
    const faco = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', vigenciaDesde: '2026-01-01' });
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, consultorioId: 1 });
    app.eliminarConsultorio(1);
    expect(app.DB.consultorios.find(c => c.id === 1)).toBeTruthy();
  });
});

describe('Horarios', () => {
  it('alta y baja de un horario de médico', () => {
    app.abrirNuevoHorario();
    setInput(window, 'hor_medico', '501');
    setInput(window, 'hor_dia', 'Lunes');
    setInput(window, 'hor_desde', '09:00');
    setInput(window, 'hor_hasta', '13:00');
    app.guardarHorario();
    expect(app.DB.horarios.length).toBe(1);
    expect(app.DB.horarios[0].medicoId).toBe(501);
    app.eliminarHorario(app.DB.horarios[0].id);
    expect(app.DB.horarios.length).toBe(0);
  });

  it('la grilla de agenda muestra los días con turnos y el médico, y filtra por consultorio', () => {
    app.DB.medicos.push({ id: 502, nombre: 'Dra. Y', estado: 'Activo', sedeId: 1, color: '#ff0000' });
    app.DB.consultorios.push({ id: 2, sedeId: 1, nombre: 'Consultorio 2', estado: 'Activa' });
    app.DB.horarios.push({ id: 9001, medicoId: 501, consultorioId: 1, dia: 'Lunes', horaDesde: '09:00', horaHasta: '13:00' });
    app.DB.horarios.push({ id: 9002, medicoId: 502, consultorioId: 2, dia: 'Sábado', horaDesde: '10:00', horaHasta: '12:00' });
    app.renderHorarios();
    const html = window.document.getElementById('horariosTabla').innerHTML;
    expect(html).toContain('Lunes');
    expect(html).toContain('Sábado');          // sábado se muestra porque tiene turno
    expect(html).not.toContain('Domingo');      // domingo sin turnos: oculto
    expect(html).toContain('Dr. X');
    expect(html).toContain('09:00–13:00');
    // Filtrar por consultorio 1 deja fuera a la Dra. Y (consultorio 2).
    setInput(window, 'agFiltroConsultorio', '1');
    app.renderHorarios();
    const html2 = window.document.getElementById('horariosTabla').innerHTML;
    expect(html2).toContain('Dr. X');
    expect(html2).not.toContain('Dra. Y');
  });
});

describe('Prestación: hora, consultorio, extra e insumo con ingreso', () => {
  it('guarda hora, consultorio y extra al médico', () => {
    app.setValorMedico('cirugia', null, 120000, '2026-01-01');
    const faco = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', vigenciaDesde: '2026-01-01' });
    const r = app.registrarPrestacion({ fecha: '2026-03-10', hora: '10:30', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, consultorioId: 1, extraMedico: 5000 });
    expect(r.hora).toBe('10:30');
    expect(r.consultorioId).toBe(1);
    expect(r.extraMedico).toBe(5000);
    // El extra se suma al pago del médico.
    expect(app.honorariosDePrestacion(r).realizador.monto).toBe(125000);
  });

  it('insumo con ingreso customizable (por defecto el precio del catálogo)', () => {
    const faco = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', vigenciaDesde: '2026-01-01' });
    const ins = app.crearPrestacion({ categoria: 'insumo', descripcion: 'Lente', precio: 900000, costo: 300000, vigenciaDesde: '2026-01-01' });
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, insumos: [{ grupo: ins.grupo, ingreso: 1000000 }] });
    expect(r.insumos[0].ingreso).toBe(1000000); // custom
    expect(r.insumos[0].costo).toBe(300000);
  });
});
