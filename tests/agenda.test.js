// Agenda de médicos: día + horario + frecuencia del mes (todo el mes / cada 15
// días / una sola vez). Se administra en Configuración; en Carga diaria es solo
// lectura. Sábado es un día válido.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Uno', estado: 'Activo', sedeId: 1 });
});

describe('Agenda / horarios', () => {
  it('crea un horario con día, hora y frecuencia por defecto (todas las semanas)', () => {
    const h = app.crearHorario({ medicoId: 501, dia: 'Sábado', horaDesde: '09:00', horaHasta: '13:00' });
    expect(h.dia).toBe('Sábado');
    expect(h.frecuencia).toBe('todas');
    expect(app.frecuenciaLabel(h)).toBe('');   // "todas" no muestra badge
    expect(app.DB.horarios.length).toBe(1);
  });

  it('acepta cada 15 días y muestra la etiqueta corta', () => {
    const h = app.crearHorario({ medicoId: 501, dia: 'Martes', frecuencia: '1-3' });
    expect(h.frecuencia).toBe('1-3');
    expect(app.frecuenciaLabel(h)).toBe('1ª y 3ª sem.');
  });

  it('una sola vez guarda la fecha y la muestra; otras frecuencias la descartan', () => {
    const h = app.crearHorario({ medicoId: 501, dia: 'Jueves', frecuencia: 'unica', fecha: '2026-09-17' });
    expect(h.frecuencia).toBe('unica');
    expect(h.fecha).toBe('2026-09-17');
    expect(app.frecuenciaLabel(h)).toBe('1 vez: 17/09');
    const h2 = app.crearHorario({ medicoId: 501, dia: 'Lunes', frecuencia: 'todas', fecha: '2026-09-17' });
    expect(h2.fecha).toBe('');   // sin "unica", no se guarda fecha
  });

  it('una frecuencia inválida cae en "todas"', () => {
    const h = app.crearHorario({ medicoId: 501, dia: 'Lunes', frecuencia: 'xxx' });
    expect(h.frecuencia).toBe('todas');
  });

  it('editar cambia día/frecuencia y conserva el id', () => {
    const h = app.crearHorario({ medicoId: 501, dia: 'Lunes', frecuencia: 'todas' });
    app.editarHorario(h.id, { medicoId: 501, dia: 'Sábado', frecuencia: '2-4' });
    const b = app.DB.horarios.find(x => x.id === h.id);
    expect(b.dia).toBe('Sábado');
    expect(b.frecuencia).toBe('2-4');
  });

  it('exige médico', () => {
    expect(() => app.crearHorario({ dia: 'Lunes' })).toThrow();
  });
});
