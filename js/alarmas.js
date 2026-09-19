// ═══════════════════════════════════════════════════════════════════════════
//  OFTA — AVISOS / ALARMAS
// ───────────────────────────────────────────────────────────────────────────
//  Dos fuentes: (1) avisos AUTOMÁTICOS calculados del estado (cobros pendientes,
//  liquidaciones sin cerrar, derivaciones urgentes, prestaciones sin contrato);
//  (2) recordatorios MANUALES con fecha que el usuario carga.
// ═══════════════════════════════════════════════════════════════════════════

const ALARMA_TIPOS = ['urgente', 'importante', 'info'];

// Avisos automáticos del estado actual (mes dado o el corriente).
function avisosAutomaticos(mes) {
  const m = mes || hoyISO().slice(0, 7);
  const avisos = [];
  if (typeof resumenDerivaciones === 'function') {
    const rd = resumenDerivaciones();
    if (rd.urgentesPendientes) avisos.push({ tipo: 'urgente', texto: rd.urgentesPendientes + ' derivación(es) URGENTE(s) sin programar', area: 'derivaciones' });
    if (rd.pendiente) avisos.push({ tipo: 'info', texto: rd.pendiente + ' derivación(es) pendiente(s) de programar', area: 'derivaciones' });
  }
  const borr = DB.pagosMedicos.filter(p => p.mes === m && p.estado === 'borrador');
  if (borr.length) avisos.push({ tipo: 'importante', texto: borr.length + ' liquidación(es) de ' + m + ' en borrador (sin cerrar)', area: 'finanzas' });
  if (typeof comparacionCobrosMes === 'function') {
    const c = comparacionCobrosMes(m);
    if (c.pendientes) avisos.push({ tipo: 'importante', texto: c.pendientes + ' obra(s) social(es) de ' + m + ' sin cobro registrado', area: 'finanzas' });
  }
  if (typeof ingresoSAMDelMes === 'function') {
    const s = ingresoSAMDelMes(m);
    if (s.sinContrato) avisos.push({ tipo: 'info', texto: s.sinContrato + ' prestación(es) de ' + m + ' sin contrato de OS cargado', area: 'config' });
  }
  return avisos;
}

// ── Recordatorios manuales ──
function crearAlarma(datos) {
  if (!datos || !(datos.texto || '').trim()) throw new Error('Escribí el texto del recordatorio.');
  const a = {
    id: nuevoId(),
    texto: String(datos.texto).trim(),
    fecha: datos.fecha || hoyISO(),
    tipo: ALARMA_TIPOS.includes(datos.tipo) ? datos.tipo : 'importante',
    estado: 'activa',
    creadoEn: new Date().toISOString(),
  };
  DB.alarmas.push(a);
  registrarAuditoria('alta', 'alarma', a.id, null, a);
  marcarCambios('alarmas');
  return a;
}
function resolverAlarma(id) {
  const a = DB.alarmas.find(x => x.id === Number(id));
  if (!a) return false;
  const antes = JSON.parse(JSON.stringify(a));
  a.estado = a.estado === 'resuelta' ? 'activa' : 'resuelta';
  registrarAuditoria('edicion', 'alarma', a.id, antes, a);
  marcarCambios('alarmas');
  return a;
}
function eliminarAlarma(id) {
  const a = DB.alarmas.find(x => x.id === Number(id));
  if (!a) return false;
  const antes = JSON.parse(JSON.stringify(a));
  DB.alarmas = DB.alarmas.filter(x => x.id !== a.id);
  registrarAuditoria('baja', 'alarma', a.id, antes, null);
  marcarCambios('alarmas');
  return true;
}
function listarAlarmas(incluirResueltas) {
  return DB.alarmas
    .filter(a => incluirResueltas || a.estado !== 'resuelta')
    .slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}
// Recordatorios activos ya vencidos (fecha <= hoy).
function alarmasVencidas() {
  const hoy = hoyISO();
  return DB.alarmas.filter(a => a.estado === 'activa' && a.fecha && a.fecha <= hoy);
}
// Total de avisos "que requieren atención" (para el badge del header).
function totalAvisos(mes) {
  return avisosAutomaticos(mes).length + alarmasVencidas().length;
}
