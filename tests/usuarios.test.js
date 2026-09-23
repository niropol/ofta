// Usuarios, roles, permisos y auditoría.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => { ctx = loadApp(); app = ctx.app; resetDatos(app); });

describe('Usuarios y roles', () => {
  it('alta de usuario con rol y auditoría', () => {
    const u = app.guardarUsuarioDatos({ nombre: 'Ana', email: 'ana@x.com', rol: 'secretaria_1' });
    expect(u.rol).toBe('secretaria_1');
    expect(u.estado).toBe('Activo');
    expect(app.auditoriaDe('usuario', u.id)[0].accion).toBe('alta');
  });

  it('no permite email duplicado', () => {
    app.guardarUsuarioDatos({ nombre: 'Ana', email: 'a@x.com', rol: 'secretaria_1' });
    expect(() => app.guardarUsuarioDatos({ nombre: 'Otra', email: 'a@x.com', rol: 'secretaria_2' })).toThrow();
  });

  it('debe quedar al menos un admin activo', () => {
    const admin = app.DB.usuarios.find(u => u.rol === 'admin');
    // cambiar el único admin a secretaria → bloqueado
    expect(() => app.guardarUsuarioDatos({ nombre: admin.nombre, rol: 'secretaria_1' }, admin.id)).toThrow();
    // inactivarlo → bloqueado
    expect(() => app.toggleEstadoUsuario(admin.id)).toThrow();
  });

  it('no elimina un usuario con historial de auditoría (inactivar)', () => {
    const u = app.guardarUsuarioDatos({ nombre: 'Ana', rol: 'secretaria_1' });
    app.setUsuarioActual(u.id);
    app.DB.medicos.push({ id: 900, nombre: 'x', estado: 'Activo', sedeId: 1 }); // acción sin auditar
    app.crearPrestacion({ categoria: 'consulta', descripcion: 'C', precio: 1 });  // esta sí audita como Ana
    app.setUsuarioActual(null);
    const r = app.eliminarUsuario(u.id);
    expect(r.ok).toBe(false);
  });
});

describe('Permisos por rol', () => {
  it('admin ve todo; secretarias no ven caja/liquidaciones/admin', () => {
    const admin = app.DB.usuarios.find(u => u.rol === 'admin');
    app.setUsuarioActual(admin.id);
    expect(app.puedeVerSeccion('section-caja')).toBe(true);
    expect(app.puedeVerSeccion('section-admin')).toBe(true);

    // Ahora solo "Carga diaria" es visible para las secretarias; todo lo demás es admin.
    const s1 = app.guardarUsuarioDatos({ nombre: 'Sec1', rol: 'secretaria_1' });
    app.setUsuarioActual(s1.id);
    expect(app.puedeVerSeccion('section-prestaciones')).toBe(true);
    expect(app.puedeVerSeccion('section-admin')).toBe(false);

    const s2 = app.guardarUsuarioDatos({ nombre: 'Sec2', rol: 'secretaria_2' });
    app.setUsuarioActual(s2.id);
    expect(app.puedeVerSeccion('section-prestaciones')).toBe(true);
    expect(app.puedeVerSeccion('section-admin')).toBe(false);
  });
});

describe('Auditoría atribuida y filtros', () => {
  it('cada cambio se atribuye al usuario "actuando como"', () => {
    const ana = app.guardarUsuarioDatos({ nombre: 'Ana', rol: 'secretaria_1' });
    app.setUsuarioActual(ana.id);
    const c = app.crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta', precio: 11000 });
    const aud = app.auditoriaDe('nomenclador', c.grupo)[0];
    expect(aud.usuario).toBe('Ana');
    expect(aud.usuarioId).toBe(ana.id);
  });

  it('listarAuditoria filtra por entidad y acción', () => {
    app.DB.medicos.push({ id: 901, nombre: 'x', estado: 'Activo', sedeId: 1 });
    app.crearPrestacion({ categoria: 'consulta', descripcion: 'C', precio: 1 });
    const g = app.DB.nomenclador[0].grupo;
    app.versionarPrecio(g, { vigenciaDesde: '2030-01-01', precio: 2 });
    expect(app.listarAuditoria({ entidad: 'nomenclador' }).length).toBe(2); // alta + edición
    expect(app.listarAuditoria({ entidad: 'nomenclador', accion: 'edicion' }).length).toBe(1);
  });
});
