// Prestaciones realizadas: alta con snapshot de precio vigente, derivador en
// paralelo, LIO (costo + sin derivador), paciente find-or-create, anulación
// (contra-movimiento), edición, eliminación y filtros.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => {
  ctx = loadApp();
  app = ctx.app;
  resetDatos(app);
  // Médicos de prueba.
  app.DB.medicos.push({ id: 501, nombre: 'Dr. Realizador', estado: 'Activo', sedeId: 1 });
  app.DB.medicos.push({ id: 502, nombre: 'Dra. Derivadora', estado: 'Activo', sedeId: 1 });
});

// Helpers para sembrar nomenclador.
function nomConsulta() { return app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000, vigenciaDesde: '2026-01-01' }); }
function nomFaco() { return app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', precio: 500000, vigenciaDesde: '2026-01-01' }); }

describe('Prestaciones realizadas', () => {
  it('alta de consulta: snapshot de precio, paciente creado, estado activa, auditoría', () => {
    const c = nomConsulta();
    const r = app.registrarPrestacion({
      fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo,
      medicoRealizadorId: 501, obraSocial: 'OSDE',
      paciente: { apellido: 'Gómez', nombre: 'Luis', dni: '30111222' },
    });
    expect(r.estado).toBe('activa');
    expect(r.precioNomenclador).toBe(11000);
    expect(r.medicoRealizadorId).toBe(501);
    expect(r.medicoDerivadorId).toBe(null);
    expect(app.DB.pacientes.length).toBe(1);
    expect(r.pacienteNombre).toBe('Gómez, Luis');
    expect(app.auditoriaDe('prestacionRealizada', r.id)[0].accion).toBe('alta');
  });

  it('usa el precio vigente A LA FECHA, no el actual', () => {
    const faco = nomFaco();
    app.versionarPrecio(faco.grupo, { vigenciaDesde: '2026-06-01', precio: 650000 });
    // Prestación hecha en marzo → precio viejo.
    const rMar = app.registrarPrestacion({ fecha: '2026-03-15', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    expect(rMar.precioNomenclador).toBe(500000);
    // Prestación hecha en julio → precio nuevo.
    const rJul = app.registrarPrestacion({ fecha: '2026-07-15', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    expect(rJul.precioNomenclador).toBe(650000);
  });

  it('rechaza si no hay precio vigente a la fecha', () => {
    const faco = nomFaco(); // vigencia desde 2026-01-01
    expect(() => app.registrarPrestacion({ fecha: '2025-12-01', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 })).toThrow();
  });

  it('cirugía con derivador: guarda ambos médicos y la categoría de derivación', () => {
    const faco = nomFaco();
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, medicoDerivadorId: 502 });
    expect(r.medicoRealizadorId).toBe(501);
    expect(r.medicoDerivadorId).toBe(502);
    expect(r.derivaCategoria).toBe('derivacion_cirugia');
  });

  it('consulta NO admite derivador', () => {
    const c = nomConsulta();
    expect(() => app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501, medicoDerivadorId: 502 })).toThrow();
  });

  it('LIO: guarda snapshot de costo y no admite derivador', () => {
    const lio = app.crearPrestacion({ categoria: 'lio', descripcion: 'Lente', precio: 900000, moneda: 'ARS', costo: 300, costoMoneda: 'USD', vigenciaDesde: '2026-01-01' });
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'lio', grupoNomenclador: lio.grupo, medicoRealizadorId: 501 });
    expect(r.costoLIO).toBe(300);
    expect(r.costoLIOMoneda).toBe('USD');
    expect(() => app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'lio', grupoNomenclador: lio.grupo, medicoRealizadorId: 501, medicoDerivadorId: 502 })).toThrow();
  });

  it('derivador no puede ser el mismo que el realizador', () => {
    const faco = nomFaco();
    expect(() => app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, medicoDerivadorId: 501 })).toThrow();
  });

  it('paciente find-or-create: mismo DNI reutiliza la ficha', () => {
    const c = nomConsulta();
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501, paciente: { apellido: 'Gómez', nombre: 'Luis', dni: '30111222' } });
    app.registrarPrestacion({ fecha: '2026-04-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501, paciente: { apellido: 'Gómez', nombre: 'Luis', dni: '30111222' } });
    expect(app.DB.pacientes.length).toBe(1);
  });

  it('anular: queda visible como anulada con motivo (contra-movimiento) y se puede reactivar', () => {
    const c = nomConsulta();
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    app.anularPrestacion(r.id, 'El paciente no vino');
    const anulada = app.DB.prestacionesRealizadas.find(x => x.id === r.id);
    expect(anulada.estado).toBe('anulada');
    expect(anulada.motivoAnulacion).toBe('El paciente no vino');
    expect(app.DB.prestacionesRealizadas.length).toBe(1); // sigue visible
    expect(app.auditoriaDe('prestacionRealizada', r.id).some(a => a.accion === 'anulacion')).toBe(true);
    app.reactivarPrestacion(r.id);
    expect(app.DB.prestacionesRealizadas.find(x => x.id === r.id).estado).toBe('activa');
  });

  it('eliminar: baja física con auditoría', () => {
    const c = nomConsulta();
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    expect(app.eliminarPrestacionRealizada(r.id)).toBe(true);
    expect(app.DB.prestacionesRealizadas.length).toBe(0);
    expect(app.auditoriaDe('prestacionRealizada', r.id).some(a => a.accion === 'baja')).toBe(true);
  });

  it('editar: cambia fecha/médico y recomputa el snapshot de precio; no duplica', () => {
    const faco = nomFaco();
    app.versionarPrecio(faco.grupo, { vigenciaDesde: '2026-06-01', precio: 650000 });
    const r = app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501 });
    expect(r.precioNomenclador).toBe(500000);
    app.editarPrestacionRealizada(r.id, { fecha: '2026-07-10', medicoDerivadorId: 502 });
    const e = app.DB.prestacionesRealizadas.find(x => x.id === r.id);
    expect(app.DB.prestacionesRealizadas.length).toBe(1);
    expect(e.precioNomenclador).toBe(650000); // recomputado a la nueva fecha
    expect(e.medicoDerivadorId).toBe(502);
  });

  it('listar con filtros: mes, médico y categoría', () => {
    const c = nomConsulta(); const faco = nomFaco();
    app.registrarPrestacion({ fecha: '2026-03-10', categoria: 'consulta', grupoNomenclador: c.grupo, medicoRealizadorId: 501 });
    app.registrarPrestacion({ fecha: '2026-04-10', categoria: 'cirugia', grupoNomenclador: faco.grupo, medicoRealizadorId: 501, medicoDerivadorId: 502 });
    expect(app.listarPrestacionesRealizadas({ mes: '2026-03' }).length).toBe(1);
    expect(app.listarPrestacionesRealizadas({ categoria: 'cirugia' }).length).toBe(1);
    expect(app.listarPrestacionesRealizadas({ medicoId: 502 }).length).toBe(1); // como derivadora
    expect(app.listarPrestacionesRealizadas({}).length).toBe(2);
  });
});
