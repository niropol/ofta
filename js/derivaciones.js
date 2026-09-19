// ═══════════════════════════════════════════════════════════════════════════
//  OFTA — DERIVACIONES QUIRÚRGICAS (motor)
// ───────────────────────────────────────────────────────────────────────────
//  Los 3 médicos derivan cirugías al cirujano. Cada derivación tiene un estado
//  (pendiente → programada → realizada / cancelada) y una urgencia. Al marcarse
//  «realizada» se puede convertir en prestación de la carga diaria para facturar.
// ═══════════════════════════════════════════════════════════════════════════

const DERIV_ESTADOS = ['pendiente', 'programada', 'realizada', 'cancelada'];
const DERIV_URGENCIAS = ['normal', 'urgente'];

function crearDerivacion(datos) {
  if (!datos || !datos.grupoNomenclador) throw new Error('Elegí el tipo de cirugía.');
  if (!datos.medicoDerivadorId) throw new Error('Elegí el médico que deriva.');
  const d = {
    id: nuevoId(),
    fecha: datos.fecha || hoyISO(),
    pacienteApellido: (datos.pacienteApellido || '').trim(),
    pacienteNombre: (datos.pacienteNombre || '').trim(),
    pacienteDni: (datos.pacienteDni || '').trim(),
    obraSocial: (datos.obraSocial || '').trim(),
    grupoNomenclador: Number(datos.grupoNomenclador),
    medicoDerivadorId: Number(datos.medicoDerivadorId),
    medicoCirujanoId: datos.medicoCirujanoId ? Number(datos.medicoCirujanoId) : null,
    urgencia: DERIV_URGENCIAS.includes(datos.urgencia) ? datos.urgencia : 'normal',
    estado: DERIV_ESTADOS.includes(datos.estado) ? datos.estado : 'pendiente',
    fechaProgramada: datos.fechaProgramada || null,
    notas: (datos.notas || '').trim(),
    prestacionId: null,
    creadoEn: new Date().toISOString(),
  };
  DB.derivaciones.push(d);
  registrarAuditoria('alta', 'derivacion', d.id, null, d);
  marcarCambios('derivaciones');
  return d;
}

function editarDerivacion(id, datos) {
  const d = DB.derivaciones.find(x => x.id === Number(id));
  if (!d) return false;
  const antes = JSON.parse(JSON.stringify(d));
  ['pacienteApellido', 'pacienteNombre', 'pacienteDni', 'obraSocial', 'notas'].forEach(k => { if (datos[k] != null) d[k] = String(datos[k]).trim(); });
  if (datos.grupoNomenclador != null) d.grupoNomenclador = Number(datos.grupoNomenclador);
  if (datos.medicoDerivadorId != null) d.medicoDerivadorId = Number(datos.medicoDerivadorId);
  if (datos.medicoCirujanoId !== undefined) d.medicoCirujanoId = datos.medicoCirujanoId ? Number(datos.medicoCirujanoId) : null;
  if (datos.urgencia != null && DERIV_URGENCIAS.includes(datos.urgencia)) d.urgencia = datos.urgencia;
  if (datos.fechaProgramada !== undefined) d.fechaProgramada = datos.fechaProgramada || null;
  if (datos.fecha != null) d.fecha = datos.fecha;
  registrarAuditoria('edicion', 'derivacion', d.id, antes, d);
  marcarCambios('derivaciones');
  return d;
}

// Cambia el estado. Al pasar a 'programada' pide (o toma) la fecha programada.
function cambiarEstadoDerivacion(id, estado, extra) {
  const d = DB.derivaciones.find(x => x.id === Number(id));
  if (!d) return false;
  if (!DERIV_ESTADOS.includes(estado)) throw new Error('Estado inválido.');
  const antes = JSON.parse(JSON.stringify(d));
  d.estado = estado;
  if (estado === 'programada' && extra && extra.fechaProgramada) d.fechaProgramada = extra.fechaProgramada;
  if (estado === 'realizada' && extra && extra.prestacionId != null) d.prestacionId = extra.prestacionId;
  registrarAuditoria('edicion', 'derivacion', d.id, antes, d);
  marcarCambios('derivaciones');
  return d;
}

function eliminarDerivacion(id) {
  const d = DB.derivaciones.find(x => x.id === Number(id));
  if (!d) return false;
  const antes = JSON.parse(JSON.stringify(d));
  DB.derivaciones = DB.derivaciones.filter(x => x.id !== d.id);
  registrarAuditoria('baja', 'derivacion', d.id, antes, null);
  marcarCambios('derivaciones');
  return true;
}

function listarDerivaciones(filtro) {
  const f = filtro || {};
  return DB.derivaciones.filter(d =>
    (!f.estado || d.estado === f.estado) &&
    (!f.urgencia || d.urgencia === f.urgencia) &&
    (!f.medicoDerivadorId || d.medicoDerivadorId === Number(f.medicoDerivadorId))
  ).slice().sort((a, b) => {
    // urgentes primero, luego por fecha de creación
    if ((a.urgencia === 'urgente') !== (b.urgencia === 'urgente')) return a.urgencia === 'urgente' ? -1 : 1;
    return (a.fecha < b.fecha ? 1 : -1);
  });
}

function resumenDerivaciones() {
  const r = { pendiente: 0, programada: 0, realizada: 0, cancelada: 0, urgentesPendientes: 0 };
  DB.derivaciones.forEach(d => {
    r[d.estado] = (r[d.estado] || 0) + 1;
    if (d.urgencia === 'urgente' && d.estado === 'pendiente') r.urgentesPendientes++;
  });
  return r;
}
