// Pegar resumen: parseo tolerante (cantidad + prestación + OS) y aplicación.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app, cons, oct, cata;
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  app.DB.medicos.push({ id: 501, nombre: 'Dr. X', estado: 'Activo', sedeId: 1 });
  app.DB.obrasSociales.push({ id: 1, nombre: 'IOMA', estado: 'Activo' }, { id: 2, nombre: 'OSDE', estado: 'Activo' });
  cons = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta oftalmológica', vigenciaDesde: '2026-01-01' });
  oct = app.crearPrestacion({ categoria: 'realizacion_estudio', descripcion: 'OCT de mácula', vigenciaDesde: '2026-01-01' });
  cata = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Catarata', vigenciaDesde: '2026-01-01' });
});

describe('Parseo del resumen', () => {
  it('detecta cantidad, prestación y obra social', () => {
    const plan = app.parsearResumenDiario('5 consultas IOMA\n3 OCT OSDE');
    expect(plan[0].cantidad).toBe(5);
    expect(plan[0].grupo).toBe(cons.grupo);
    expect(plan[0].obraSocial).toBe('IOMA');
    expect(plan[1].cantidad).toBe(3);
    expect(plan[1].grupo).toBe(oct.grupo);
    expect(plan[1].obraSocial).toBe('OSDE');
  });
  it('sin cantidad = 1; sin OS = Particular', () => {
    const plan = app.parsearResumenDiario('consulta');
    expect(plan[0].cantidad).toBe(1);
    expect(plan[0].obraSocial).toBe('Particular');
  });
  it('marca las cirugías como problema (se cargan aparte)', () => {
    const plan = app.parsearResumenDiario('2 catarata IOMA');
    expect(plan[0].problema).toMatch(/cirug/i);
  });
  it('marca prestación no reconocida', () => {
    const plan = app.parsearResumenDiario('4 zaraza rara OSDE');
    expect(plan[0].problema).toMatch(/no reconocida/);
  });
});

describe('Aplicación del resumen', () => {
  it('carga las líneas OK como prestaciones y omite las problemáticas', () => {
    const plan = app.parsearResumenDiario('5 consultas IOMA\n3 OCT OSDE\n2 catarata IOMA');
    const r = app.aplicarResumenDiario(plan, { fecha: '2026-05-10', medicoRealizadorId: 501 });
    expect(r.ok).toBe(2);
    expect(r.unidades).toBe(8);        // 5 + 3
    expect(r.omitidas).toBe(1);        // catarata
    expect(app.DB.prestacionesRealizadas.filter(p => p.estado === 'activa').length).toBe(2);
  });
});
