// Matcheo de contratos al catálogo canónico: normalización, similitud, alias por OS,
// plan de importación y aplicación con aprendizaje (evitar duplicados por nomenclatura).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
let campo, oct, catarata;   // prestaciones canónicas
beforeEach(() => {
  ctx = loadApp(); app = ctx.app; resetDatos(app);
  campo = app.crearPrestacion({ categoria: 'realizacion_estudio', codigo: '30.01.02', descripcion: 'Campo visual computarizado', vigenciaDesde: '2026-01-01' });
  oct = app.crearPrestacion({ categoria: 'realizacion_estudio', codigo: '88.02.OCT', descripcion: 'OCT de mácula', vigenciaDesde: '2026-01-01' });
  catarata = app.crearPrestacion({ categoria: 'cirugia', codigo: '02.07.01', descripcion: 'Catarata (extracción cristalino)', vigenciaDesde: '2026-01-01' });
});

describe('Similitud de texto', () => {
  it('idéntico = 1; variante de nombre alto; no relacionado bajo', () => {
    expect(app.similitudTexto('Campo visual', 'Campo visual')).toBe(1);
    expect(app.similitudTexto('CAMPO VISUAL', 'Campo visual computarizado')).toBeGreaterThan(0.5);
    expect(app.similitudTexto('Catarata', 'Campo visual')).toBeLessThan(0.3);
  });
  it('ignora acentos, mayúsculas y puntuación', () => {
    expect(app.similitudTexto('ECOGRAFÍA, OFTALMOLÓGICA', 'ecografia oftalmologica')).toBe(1);
  });
});

describe('Sugerencia contra el catálogo', () => {
  it('match exacto por código', () => {
    const r = app.sugerirPrestacionContrato('IOMA', '30.01.02', 'cualquier cosa', '');
    expect(r.estado).toBe('codigo');
    expect(r.grupo).toBe(campo.grupo);
  });
  it('match exacto por texto normalizado (mayúsculas/acentos)', () => {
    const r = app.sugerirPrestacionContrato('IOMA', '', 'CAMPO VISUAL COMPUTARIZADO', '');
    expect(r.estado).toBe('exacto');
    expect(r.grupo).toBe(campo.grupo);
  });
  it('sugerencia por similitud cuando no hay match exacto', () => {
    const r = app.sugerirPrestacionContrato('OSDE', 'ZZ9', 'Campo visual (computado)', 'realizacion_estudio');
    expect(r.estado).toBe('sugerido');
    expect(r.grupo).toBe(campo.grupo);
    expect(r.score).toBeGreaterThan(0.55);
  });
  it('sin match razonable → sinMatch (para decidir a mano)', () => {
    const r = app.sugerirPrestacionContrato('OSDE', '', 'Cirugía refractiva LASIK', '');
    expect(r.estado).toBe('sinMatch');
    expect(r.grupo).toBe(null);
    expect(Array.isArray(r.alternativas)).toBe(true);
  });
});

describe('Alias aprendido por OS', () => {
  it('tras guardar el alias, la misma OS matchea directo (estado alias)', () => {
    app.guardarAliasContrato('IOMA', 'X-77', 'CV computarizado IOMA', campo.grupo);
    const r = app.sugerirPrestacionContrato('IOMA', 'X-77', 'CV computarizado IOMA', '');
    expect(r.estado).toBe('alias');
    expect(r.grupo).toBe(campo.grupo);
  });
  it('el alias es por OS: otra OS con el mismo texto no lo hereda como alias', () => {
    app.guardarAliasContrato('IOMA', 'X-77', 'nombre raro IOMA', oct.grupo);
    const r = app.sugerirPrestacionContrato('OSDE', 'X-77', 'nombre raro IOMA', '');
    expect(r.estado).not.toBe('alias');
  });
});

describe('Plan y aplicación de importación', () => {
  it('el plan no muta datos y marca problemas de filas inválidas', () => {
    const plan = app.planImportarContratos([
      { obraSocial: 'IOMA', codigo: '30.01.02', descripcion: 'CAMPO VISUAL', valor: 40000 },
      { obraSocial: '', codigo: '', descripcion: '', valor: 'x' },
    ]);
    expect(plan[0].match.grupo).toBe(campo.grupo);
    expect(plan[1].problemas.length).toBeGreaterThan(0);
    expect(app.DB.contratos.length).toBe(0);   // no aplicó nada
  });

  it('aplicar asigna contrato al grupo canónico y aprende el alias', () => {
    const res = app.aplicarImportacionContratos([
      { obraSocial: 'IOMA', codigo: '30.01.02', descripcion: 'CAMPO VISUAL', valor: 40000, accion: 'asignar', grupo: campo.grupo, recordar: true },
    ], '2026-01-01');
    expect(res.ok).toBe(1);
    expect(res.aliasGuardados).toBe(1);
    expect(app.valorContrato('IOMA', campo.grupo, '2026-03-01')).toBe(40000);
    // la próxima vez, la misma línea entra como alias (sin preguntar)
    const r = app.sugerirPrestacionContrato('IOMA', '30.01.02', 'CAMPO VISUAL', '');
    expect(r.estado).toBe('alias');
  });

  it('DOS obras sociales con distinto nombre caen en la MISMA prestación (no duplica)', () => {
    app.aplicarImportacionContratos([
      { obraSocial: 'IOMA', codigo: '30.01.02', descripcion: 'CAMPO VISUAL', valor: 40000, accion: 'asignar', grupo: campo.grupo },
      { obraSocial: 'OSDE', codigo: 'CV-01', descripcion: 'Campo visual computado', valor: 52000, accion: 'asignar', grupo: campo.grupo },
    ], '2026-01-01');
    // Un solo ítem de catálogo, dos contratos distintos apuntando a él
    const estudios = app.listarPrestaciones({ categoria: 'realizacion_estudio', incluirInactivos: false });
    expect(estudios.filter(e => e.grupo === campo.grupo).length).toBe(1);
    expect(app.valorContrato('IOMA', campo.grupo, '2026-03-01')).toBe(40000);
    expect(app.valorContrato('OSDE', campo.grupo, '2026-03-01')).toBe(52000);
  });

  it('acción "crear" da de alta la prestación nueva + contrato + alias', () => {
    const antes = app.listarPrestaciones({ incluirInactivos: true }).length;
    const res = app.aplicarImportacionContratos([
      { obraSocial: 'IOMA', codigo: '99.99', descripcion: 'Práctica nueva rara', categoria: 'practica', valor: 15000, accion: 'crear' },
    ], '2026-01-01');
    expect(res.creadas).toBe(1);
    expect(app.listarPrestaciones({ incluirInactivos: true }).length).toBe(antes + 1);
  });

  it('acción "omitir" no aplica esa línea', () => {
    const res = app.aplicarImportacionContratos([
      { obraSocial: 'IOMA', descripcion: 'algo', valor: 1000, accion: 'omitir' },
    ], '2026-01-01');
    expect(res.omitidas).toBe(1);
    expect(app.DB.contratos.length).toBe(0);
  });
});
