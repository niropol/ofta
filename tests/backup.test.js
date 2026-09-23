// Copia de seguridad: exportar todo a un objeto y restaurarlo (round-trip).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => { ctx = loadApp(); app = ctx.app; resetDatos(app); });

describe('Backup / restore', () => {
  it('exporta e importa restaurando las colecciones', () => {
    app.DB.medicos.push({ id: 501, nombre: 'Dr. X', estado: 'Activo', sedeId: 1 });
    app.DB.obrasSociales.push({ id: 1, nombre: 'IOMA', estado: 'Activo' });
    const faco = app.crearPrestacion({ categoria: 'cirugia', descripcion: 'Faco', vigenciaDesde: '2026-01-01' });
    app.setContrato('IOMA', faco.grupo, 200000, '2026-01-01');

    const dump = app.exportarBackupObj();
    expect(dump._tipo).toBe('OFTA_BACKUP');
    expect(Array.isArray(dump.contratos)).toBe(true);

    // Vaciar todo y restaurar desde el dump
    resetDatos(app);
    expect(app.DB.contratos.length).toBe(0);
    const r = app.importarBackupObj(dump);
    expect(r.colecciones).toBeGreaterThan(0);
    expect(app.DB.medicos.some(m => m.id === 501)).toBe(true);
    expect(app.valorContrato('IOMA', faco.grupo, '2026-03-01')).toBe(200000);
  });

  it('rechaza un archivo que no es una copia válida', () => {
    expect(() => app.importarBackupObj({ cualquier: 'cosa' })).toThrow();
    expect(() => app.importarBackupObj(null)).toThrow();
  });
});
