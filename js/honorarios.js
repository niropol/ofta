// ═══════════════════════════════════════════════════════════════════════════
//  SAM — PAGOS A MÉDICOS (valores fijos)
// ───────────────────────────────────────────────────────────────────────────
//  El médico cobra un VALOR FIJO por tipo de prestación (consulta, estudio,
//  cirugía, práctica) — no un %. La DERIVACIÓN paga un valor fijo al médico
//  derivador. Los valores son GENERALES (medicoId=null) con override POR MÉDICO,
//  ambos versionados por vigencia (un cambio no recalcula lo ya liquidado).
//  Además, cada prestación puede sumar un EXTRA al médico (ej. si paga el paciente).
// ═══════════════════════════════════════════════════════════════════════════

function redondearAbajo(monto) { return Math.floor(Number(monto) || 0); }

// ── Valores fijos por categoría + médico (versionados) ──
function _valoresDe(categoria, medicoId) {
  const mid = medicoId != null ? Number(medicoId) : null;
  return DB.valoresMedico
    .filter(v => v.categoria === categoria && (v.medicoId != null ? Number(v.medicoId) : null) === mid)
    .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1));
}
function _valorActual(categoria, medicoId) {
  const vs = _valoresDe(categoria, medicoId);
  return vs.find(v => !v.vigenciaHasta) || vs[0] || null;
}

// Valor fijo vigente a una fecha: primero el del médico, si no el general.
function valorMedicoVigente(categoria, medicoId, fecha) {
  const f = fecha || hoyISO();
  const buscar = (mid) => DB.valoresMedico.find(v =>
    v.categoria === categoria &&
    (v.medicoId != null ? Number(v.medicoId) : null) === mid &&
    v.estado !== 'Inactivo' &&
    v.vigenciaDesde <= f && (!v.vigenciaHasta || v.vigenciaHasta >= f));
  const esp = medicoId != null ? buscar(Number(medicoId)) : null;
  if (esp) return { valor: esp.valor, origen: 'medico' };
  const gen = buscar(null);
  if (gen) return { valor: gen.valor, origen: 'general' };
  return null;
}

// Define / cambia un valor fijo (general si medicoId=null). Versiona.
function setValorMedico(categoria, medicoId, valor, vigenciaDesde) {
  if (!CATEGORIAS_VALOR_MEDICO.some(c => c.id === categoria)) throw new Error('Categoría de valor inválida.');
  const val = Number(valor);
  if (isNaN(val) || val < 0) throw new Error('El valor debe ser un número ≥ 0.');
  const mid = (medicoId != null && medicoId !== '') ? Number(medicoId) : null;
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');
  const actual = _valorActual(categoria, mid);
  if (actual && desde <= actual.vigenciaDesde) {
    throw new Error('La vigencia debe ser posterior a la del valor actual (' + actual.vigenciaDesde + ').');
  }
  const antes = actual ? JSON.parse(JSON.stringify(actual)) : null;
  if (actual) actual.vigenciaHasta = _diaAnterior(desde);
  const nuevo = { id: nuevoId(), categoria, medicoId: mid, valor: val, vigenciaDesde: desde, vigenciaHasta: null, estado: 'Activo' };
  DB.valoresMedico.push(nuevo);
  registrarAuditoria(actual ? 'edicion' : 'alta', 'valorMedico', nuevo.id, antes, nuevo);
  marcarCambios('valoresMedico');
  return nuevo;
}

// Valores "actuales" (uno por categoría+médico) para la config.
function listarValoresMedicoActuales() {
  const claves = new Set(DB.valoresMedico.map(v => v.categoria + '|' + (v.medicoId != null ? v.medicoId : '')));
  return [...claves].map(k => {
    const [cat, mid] = k.split('|');
    return _valorActual(cat, mid === '' ? null : Number(mid));
  }).filter(Boolean);
}

// ── Honorarios de UNA prestación (valores fijos + extra opcional al médico) ──
function honorariosDePrestacion(reg) {
  const v = valorMedicoVigente(reg.categoria, reg.medicoRealizadorId, reg.fecha);
  const faltaValor = v ? [] : [reg.categoria];
  const base = v ? v.valor : 0;
  const extra = Number(reg.extraMedico) || 0;
  const realizador = { medicoId: reg.medicoRealizadorId, monto: redondearAbajo(base + extra), extra, faltaValor };

  let derivador = null;
  if (reg.medicoDerivadorId) {
    const vd = valorMedicoVigente('derivacion', reg.medicoDerivadorId, reg.fecha);
    derivador = { medicoId: reg.medicoDerivadorId, monto: redondearAbajo(vd ? vd.valor : 0), faltaValor: vd ? [] : ['derivacion'] };
  }
  return { realizador, derivador };
}

// ── Honorarios de un médico en un mes (realizador + derivador) ──
function honorariosDeMedico(medicoId, mes) {
  const mid = Number(medicoId);
  let total = 0;
  const faltaValor = new Set();
  const detalle = [];
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => {
      const h = honorariosDePrestacion(r);
      if (h.realizador.medicoId === mid) {
        total += h.realizador.monto;
        h.realizador.faltaValor.forEach(c => faltaValor.add(c));
        detalle.push({ prestacionId: r.id, fecha: r.fecha, rol: 'realizador', descripcion: r.descripcion, monto: h.realizador.monto });
      }
      if (h.derivador && h.derivador.medicoId === mid) {
        total += h.derivador.monto;
        h.derivador.faltaValor.forEach(c => faltaValor.add(c));
        detalle.push({ prestacionId: r.id, fecha: r.fecha, rol: 'derivador', descripcion: r.descripcion, monto: h.derivador.monto });
      }
    });
  return { medicoId: mid, mes, total, faltaValor: [...faltaValor], detalle };
}

// Todos los médicos con honorarios en el mes.
function honorariosDelMes(mes) {
  const ids = new Set();
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => { ids.add(r.medicoRealizadorId); if (r.medicoDerivadorId) ids.add(r.medicoDerivadorId); });
  return [...ids].map(id => honorariosDeMedico(id, mes))
    .filter(h => h.detalle.length > 0)
    .sort((a, b) => b.total - a.total);
}
