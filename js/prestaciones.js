// ═══════════════════════════════════════════════════════════════════════════
//  SAM — PRESTACIONES REALIZADAS (Etapa 3)
// ───────────────────────────────────────────────────────────────────────────
//  Carga de consultas / cirugías / prácticas / estudios / LIO, vinculadas a
//  médico realizador, médico derivador (cuando aplica) y paciente.
//
//  Al registrar se toma el PRECIO VIGENTE del nomenclador a la fecha y se guarda
//  como SNAPSHOT en el registro (precioNomenclador, moneda, costo…). Así, aunque
//  después cambie el precio, el honorario de esta prestación (Etapa 4) usa el
//  valor que regía cuando se hizo.
//
//  Derivación: es UN registro con realizador + derivador. El derivador cobra su %
//  (derivacion_*) sobre el mismo precio de nomenclador, en paralelo (Etapa 4).
//
//  Anulación (Etapa 0): contra-movimiento — el registro queda visible como
//  'anulada' con motivo. La reversión en caja/liquidación se engancha en Etapas 5/6.
// ═══════════════════════════════════════════════════════════════════════════

// Busca un paciente por DNI (o por nombre+apellido si no hay DNI); si no existe, lo crea.
function pacienteFindOrCreate(p) {
  const nombre = (p.nombre || '').trim();
  const apellido = (p.apellido || '').trim();
  const dni = (p.dni || '').trim();
  if (!nombre && !apellido && !dni) return null;

  let existente = null;
  if (dni) existente = DB.pacientes.find(x => (x.dni || '') === dni);
  if (!existente) existente = DB.pacientes.find(x =>
    (x.nombre || '').toLowerCase() === nombre.toLowerCase() &&
    (x.apellido || '').toLowerCase() === apellido.toLowerCase() &&
    (nombre || apellido));
  if (existente) {
    // Completar datos faltantes sin pisar.
    if (!existente.dni && dni) existente.dni = dni;
    if (!existente.nombre && nombre) existente.nombre = nombre;
    if (!existente.apellido && apellido) existente.apellido = apellido;
    return existente;
  }
  const nuevo = { id: nuevoId(), nombre, apellido, dni };
  DB.pacientes.push(nuevo);
  marcarCambios('pacientes');
  return nuevo;
}

function pacienteLabel(pac) {
  if (!pac) return '—';
  const nom = [pac.apellido, pac.nombre].filter(Boolean).join(', ');
  return nom || pac.dni || '—';
}
function medicoNombre(id) { const m = DB.medicos.find(x => x.id === Number(id)); return m ? m.nombre : '—'; }

// ── Registrar una prestación realizada ──
function registrarPrestacion(datos) {
  const cat = categoriaInfo(datos.categoria);
  if (!cat || cat.tipo !== 'realizada') throw new Error('Categoría inválida.');
  if (!datos.fecha) throw new Error('La fecha es obligatoria.');

  const item = versionActual(Number(datos.grupoNomenclador));
  if (!item) throw new Error('Elegí una prestación del nomenclador.');
  if (item.categoria !== datos.categoria) throw new Error('La prestación no corresponde a la categoría elegida.');

  const version = precioVigente(item.grupo, datos.fecha);
  if (!version) throw new Error('No hay un precio vigente para "' + item.descripcion + '" en la fecha ' + datos.fecha + '. Cargá su precio con una vigencia anterior o igual.');

  if (!datos.medicoRealizadorId) throw new Error('Elegí el médico realizador.');
  const realizador = DB.medicos.find(m => m.id === Number(datos.medicoRealizadorId));
  if (!realizador) throw new Error('Médico realizador inexistente.');

  let derivadorId = datos.medicoDerivadorId ? Number(datos.medicoDerivadorId) : null;
  if (derivadorId) {
    if (!cat.permiteDerivador) throw new Error('La categoría "' + cat.label + '" no admite médico derivador.');
    if (!DB.medicos.find(m => m.id === derivadorId)) throw new Error('Médico derivador inexistente.');
    if (derivadorId === Number(datos.medicoRealizadorId)) throw new Error('El derivador no puede ser el mismo que el realizador.');
  }

  const pac = pacienteFindOrCreate(datos.paciente || {});

  const reg = {
    id: nuevoId(),
    fecha: datos.fecha,
    sedeId: datos.sedeId || sedeActiva(),
    categoria: datos.categoria,
    grupoNomenclador: item.grupo,
    nomencladorId: version.id,           // versión concreta usada (precio pinneado)
    codigo: version.codigo || '',
    descripcion: version.descripcion,
    precioNomenclador: version.precio,   // snapshot: base del honorario
    moneda: version.moneda,
    costoLIO: cat.usaCosto ? version.costo : null,
    costoLIOMoneda: cat.usaCosto ? version.costoMoneda : null,
    medicoRealizadorId: Number(datos.medicoRealizadorId),
    medicoDerivadorId: derivadorId,
    derivaCategoria: derivadorId ? cat.derivaCategoria : null,
    obraSocial: (datos.obraSocial || 'Particular').trim() || 'Particular',
    pacienteId: pac ? pac.id : null,
    pacienteNombre: pacienteLabel(pac),
    estado: 'activa',
    motivoAnulacion: null,
    creadoEn: new Date().toISOString(),
  };
  DB.prestacionesRealizadas.push(reg);
  registrarAuditoria('alta', 'prestacionRealizada', reg.id, null, reg);
  marcarCambios('prestacionesRealizadas');
  return reg;
}

// ── Editar una prestación realizada (recalcula snapshot de precio a la fecha) ──
function editarPrestacionRealizada(id, datos) {
  const reg = DB.prestacionesRealizadas.find(r => r.id === Number(id));
  if (!reg) return false;
  if (reg.estado === 'anulada') throw new Error('No se puede editar una prestación anulada.');
  const antes = JSON.parse(JSON.stringify(reg));

  const nueva = registrarPrestacion({
    fecha: datos.fecha ?? reg.fecha,
    sedeId: datos.sedeId ?? reg.sedeId,
    categoria: datos.categoria ?? reg.categoria,
    grupoNomenclador: datos.grupoNomenclador ?? reg.grupoNomenclador,
    medicoRealizadorId: datos.medicoRealizadorId ?? reg.medicoRealizadorId,
    medicoDerivadorId: datos.medicoDerivadorId !== undefined ? datos.medicoDerivadorId : reg.medicoDerivadorId,
    obraSocial: datos.obraSocial ?? reg.obraSocial,
    paciente: datos.paciente ?? { nombre: '', apellido: '', dni: '' },
  });
  // registrarPrestacion agregó uno nuevo: lo fusionamos sobre el existente y quitamos el temporal.
  DB.prestacionesRealizadas = DB.prestacionesRealizadas.filter(r => r.id !== nueva.id);
  Object.assign(reg, nueva, { id: reg.id, creadoEn: reg.creadoEn });
  // Si no vino paciente nuevo, conservar el anterior.
  if (!datos.paciente) { reg.pacienteId = antes.pacienteId; reg.pacienteNombre = antes.pacienteNombre; }
  registrarAuditoria('edicion', 'prestacionRealizada', reg.id, antes, reg);
  marcarCambios('prestacionesRealizadas');
  return reg;
}

// ── Anular (default para deshacer): queda visible como 'anulada' + motivo ──
function anularPrestacion(id, motivo) {
  const reg = DB.prestacionesRealizadas.find(r => r.id === Number(id));
  if (!reg) return false;
  if (reg.estado === 'anulada') return reg;
  const antes = JSON.parse(JSON.stringify(reg));
  reg.estado = 'anulada';
  reg.motivoAnulacion = (motivo || '').trim() || 'Sin especificar';
  reg.anuladaEn = new Date().toISOString();
  registrarAuditoria('anulacion', 'prestacionRealizada', reg.id, antes, reg);
  marcarCambios('prestacionesRealizadas');
  // NOTA: la reversión del honorario/caja se engancha en Etapas 5/6 (contra-movimiento).
  return reg;
}

// Reactivar una prestación anulada por error.
function reactivarPrestacion(id) {
  const reg = DB.prestacionesRealizadas.find(r => r.id === Number(id));
  if (!reg || reg.estado !== 'anulada') return false;
  const antes = JSON.parse(JSON.stringify(reg));
  reg.estado = 'activa';
  reg.motivoAnulacion = null;
  registrarAuditoria('edicion', 'prestacionRealizada', reg.id, antes, reg);
  marcarCambios('prestacionesRealizadas');
  return reg;
}

// ── Eliminar físicamente (corrección de una carga equivocada) ──
function eliminarPrestacionRealizada(id) {
  const reg = DB.prestacionesRealizadas.find(r => r.id === Number(id));
  if (!reg) return false;
  const antes = JSON.parse(JSON.stringify(reg));
  DB.prestacionesRealizadas = DB.prestacionesRealizadas.filter(r => r.id !== reg.id);
  registrarAuditoria('baja', 'prestacionRealizada', reg.id, antes, null);
  marcarCambios('prestacionesRealizadas');
  // NOTA: al existir caja/liquidaciones (Etapas 5/6), acá se limpiarán sus rastros.
  return true;
}

// ── Listado con filtros (mes 'YYYY-MM', médico, categoría, estado) ──
function listarPrestacionesRealizadas({ mes = '', medicoId = null, categoria = null, incluirAnuladas = true } = {}) {
  return DB.prestacionesRealizadas
    .filter(r => (!mes || (r.fecha || '').slice(0, 7) === mes))
    .filter(r => (!medicoId || r.medicoRealizadorId === Number(medicoId) || r.medicoDerivadorId === Number(medicoId)))
    .filter(r => (!categoria || r.categoria === categoria))
    .filter(r => (incluirAnuladas || r.estado !== 'anulada'))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : (a.fecha > b.fecha ? -1 : b.id - a.id)));
}
