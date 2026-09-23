// Autenticación por email → rol. La lista ACCESOS decide QUIÉN entra y con qué
// permisos. Un email fuera de la lista no puede entrar. El rol manda sobre
// PERMISOS_SECCIONES (admin = todo, secretaria = solo Carga diaria).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let ctx, app;
beforeEach(() => { ctx = loadApp(); app = ctx.app; resetDatos(app); });

describe('Accesos por email y rol', () => {
  it('con credenciales de nube configuradas, el login queda activo', () => {
    // En los tests (jsdom sin el SDK de Supabase) la app igual corre en modo local:
    // initSupabase() corta y no se pisa nada. loginActivo() refleja que hay proyecto.
    expect(app.loginActivo()).toBe(true);
  });

  it('resuelve el rol de un email autorizado (case-insensitive) y rechaza los demás', () => {
    app.ACCESOS['dra.lopez@gmail.com'] = 'admin';
    app.ACCESOS['recepcion@gmail.com'] = 'secretaria_1';
    expect(app.resolverRolPorEmail('DRA.LOPEZ@Gmail.com ')).toBe('admin');
    expect(app.resolverRolPorEmail('recepcion@gmail.com')).toBe('secretaria_1');
    expect(app.resolverRolPorEmail('intruso@gmail.com')).toBe(null);
    expect(app.resolverRolPorEmail('')).toBe(null);
  });

  it('crea el usuario para un email nuevo con su rol y lo deja como actual', () => {
    const u = app._usuarioParaEmail('nueva@gmail.com', 'secretaria_1', 'Nueva Secre');
    expect(u.email).toBe('nueva@gmail.com');
    expect(u.rol).toBe('secretaria_1');
    expect(u.estado).toBe('Activo');
    expect(app.DB.config.usuarioActualId).toBe(u.id);
    expect(app.DB.usuarios.filter(x => x.email === 'nueva@gmail.com').length).toBe(1);
  });

  it('para un email ya existente no duplica y corrige el rol según ACCESOS', () => {
    app.DB.usuarios.push({ id: 900, nombre: 'Vieja', email: 'jefa@gmail.com', rol: 'secretaria_1', estado: 'Inactivo' });
    const u = app._usuarioParaEmail('JEFA@gmail.com', 'admin', '');
    expect(u.id).toBe(900);
    expect(u.rol).toBe('admin');          // el rol lo manda la lista de accesos
    expect(u.estado).toBe('Activo');      // se reactiva
    expect(app.DB.usuarios.filter(x => String(x.email).toLowerCase() === 'jefa@gmail.com').length).toBe(1);
  });

  it('el rol resuelto define los permisos (admin ve todo, secretaria solo carga diaria)', () => {
    app._usuarioParaEmail('admin@gmail.com', 'admin', '');
    expect(app.puedeVerSeccion('section-prestaciones')).toBe(true);
    expect(app.puedeVerSeccion('section-admin')).toBe(true);
    app._usuarioParaEmail('secre@gmail.com', 'secretaria_1', '');
    expect(app.puedeVerSeccion('section-prestaciones')).toBe(true);
    expect(app.puedeVerSeccion('section-admin')).toBe(false);
  });
});
