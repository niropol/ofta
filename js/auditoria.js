// ═══════════════════════════════════════════════════════════════════════════
//  SAM — AUDITORÍA DE CAMBIOS
// ───────────────────────────────────────────────────────────────────────────
//  Registra cada alta/edición/baja/anulación con: quién, cuándo, entidad,
//  valor anterior y nuevo. Pensado como control de seguridad de caja (detectar
//  manipulaciones internas), no solo como historial.
//
//  Toda mutación de datos con efecto de dinero o de padrón debe pasar por acá.
// ═══════════════════════════════════════════════════════════════════════════

// accion: 'alta' | 'edicion' | 'baja' | 'anulacion'
// entidad: nombre de la colección/tipo ('medico', 'cajaMovimiento', 'nomenclador', …)
// antes/despues: snapshot del objeto (o null en altas/bajas).
function registrarAuditoria(accion, entidad, entidadId, antes, despues) {
  const reg = {
    id: nuevoId(),
    fecha: new Date().toISOString(),
    usuario: usuarioActual().nombre || 'sistema',
    usuarioId: usuarioActual().id || null,
    accion,
    entidad,
    entidadId,
    antes: antes ? JSON.parse(JSON.stringify(antes)) : null,
    despues: despues ? JSON.parse(JSON.stringify(despues)) : null,
  };
  DB.auditoria.push(reg);
  if (typeof marcarCambios === 'function') marcarCambios('auditoria');
  return reg;
}

// Devuelve el historial de auditoría de una entidad/registro puntual, más nuevo primero.
function auditoriaDe(entidad, entidadId) {
  return DB.auditoria
    .filter(a => a.entidad === entidad && String(a.entidadId) === String(entidadId))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}
