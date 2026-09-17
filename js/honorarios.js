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

// ── Valores fijos por categoría + médico + (opcional) cirugía puntual ──
//  `grupo` = ítem del nomenclador (ej. Catarata). null = valor de la categoría.
//  Permite pagar distinto por tipo de cirugía (catarata ≠ chalazión ≠ …) sin
//  perder el valor por categoría como respaldo.
function _valoresDe(categoria, medicoId, grupo) {
  const mid = medicoId != null ? Number(medicoId) : null;
  const g = grupo != null ? Number(grupo) : null;
  return DB.valoresMedico
    .filter(v => v.categoria === categoria
      && (v.medicoId != null ? Number(v.medicoId) : null) === mid
      && (v.grupo != null ? Number(v.grupo) : null) === g)
    .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1));
}
function _valorActual(categoria, medicoId, grupo) {
  const vs = _valoresDe(categoria, medicoId, grupo);
  return vs.find(v => !v.vigenciaHasta) || vs[0] || null;
}

// Valor fijo vigente a una fecha. Preferencia (más específico → más general):
//   grupo+médico → grupo(general) → categoría+médico → categoría(general).
function valorMedicoVigente(categoria, medicoId, fecha, grupo) {
  const f = fecha || hoyISO();
  const g = (grupo != null && grupo !== '') ? Number(grupo) : null;
  const mid = (medicoId != null && medicoId !== '') ? Number(medicoId) : null;
  const buscar = (m, gg) => DB.valoresMedico.find(v =>
    v.categoria === categoria &&
    (v.medicoId != null ? Number(v.medicoId) : null) === m &&
    (v.grupo != null ? Number(v.grupo) : null) === gg &&
    v.estado !== 'Inactivo' &&
    v.vigenciaDesde <= f && (!v.vigenciaHasta || v.vigenciaHasta >= f));
  if (g != null) {
    const im = mid != null ? buscar(mid, g) : null;
    if (im) return { valor: im.valor, origen: 'medico_item' };
    const ig = buscar(null, g);
    if (ig) return { valor: ig.valor, origen: 'item' };
  }
  const em = mid != null ? buscar(mid, null) : null;
  if (em) return { valor: em.valor, origen: 'medico' };
  const gen = buscar(null, null);
  if (gen) return { valor: gen.valor, origen: 'general' };
  return null;
}

// Define / cambia un valor fijo. medicoId=null → general; grupo=ítem del
// nomenclador → valor por esa cirugía puntual. Versiona por (categoría, médico, grupo).
function setValorMedico(categoria, medicoId, valor, vigenciaDesde, grupo) {
  if (!CATEGORIAS_VALOR_MEDICO.some(c => c.id === categoria)) throw new Error('Categoría de valor inválida.');
  const val = Number(valor);
  if (isNaN(val) || val < 0) throw new Error('El valor debe ser un número ≥ 0.');
  const mid = (medicoId != null && medicoId !== '') ? Number(medicoId) : null;
  const g = (grupo != null && grupo !== '') ? Number(grupo) : null;
  if (g != null) {
    const item = (typeof versionActual === 'function') ? versionActual(g) : null;
    if (!item) throw new Error('Prestación del nomenclador inexistente para el valor por ítem.');
    if (item.categoria !== categoria) throw new Error('La prestación elegida no es de la categoría "' + categoria + '".');
  }
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');
  const actual = _valorActual(categoria, mid, g);
  if (actual && desde <= actual.vigenciaDesde) {
    throw new Error('La vigencia debe ser posterior a la del valor actual (' + actual.vigenciaDesde + ').');
  }
  const antes = actual ? JSON.parse(JSON.stringify(actual)) : null;
  if (actual) actual.vigenciaHasta = _diaAnterior(desde);
  const nuevo = { id: nuevoId(), categoria, medicoId: mid, grupo: g, valor: val, vigenciaDesde: desde, vigenciaHasta: null, estado: 'Activo' };
  DB.valoresMedico.push(nuevo);
  registrarAuditoria(actual ? 'edicion' : 'alta', 'valorMedico', nuevo.id, antes, nuevo);
  marcarCambios('valoresMedico');
  return nuevo;
}

// Corrige EN EL LUGAR el valor vigente (no versiona) — edición rápida / typo.
// Si no existe, lo crea con vigencia el 1° del mes actual. Devuelve el registro.
function setValorMedicoActual(categoria, medicoId, valor, grupo) {
  if (!CATEGORIAS_VALOR_MEDICO.some(c => c.id === categoria)) throw new Error('Categoría de valor inválida.');
  const val = Number(valor);
  if (isNaN(val) || val < 0) throw new Error('El valor debe ser un número ≥ 0.');
  const mid = (medicoId != null && medicoId !== '') ? Number(medicoId) : null;
  const g = (grupo != null && grupo !== '') ? Number(grupo) : null;
  const actual = _valorActual(categoria, mid, g);
  if (actual) {
    const antes = JSON.parse(JSON.stringify(actual));
    actual.valor = val;
    registrarAuditoria('edicion', 'valorMedico', actual.id, antes, actual);
    marcarCambios('valoresMedico');
    return actual;
  }
  return setValorMedico(categoria, mid, val, hoyISO().slice(0, 7) + '-01', g);
}

// Valores "actuales" (uno por categoría+médico+grupo) para la config.
function listarValoresMedicoActuales() {
  const claves = new Set(DB.valoresMedico.map(v => v.categoria + '|' + (v.medicoId != null ? v.medicoId : '') + '|' + (v.grupo != null ? v.grupo : '')));
  return [...claves].map(k => {
    const [cat, mid, g] = k.split('|');
    return _valorActual(cat, mid === '' ? null : Number(mid), g === '' ? null : Number(g));
  }).filter(Boolean);
}

// ── Honorarios de UNA prestación (valores fijos + extra opcional al médico) ──
function honorariosDePrestacion(reg) {
  const cant = Math.max(1, Math.floor(Number(reg.cantidad) || 1));  // consulta/estudio se cargan por cantidad
  const v = valorMedicoVigente(reg.categoria, reg.medicoRealizadorId, reg.fecha, reg.grupoNomenclador);
  const faltaValor = v ? [] : [reg.categoria];
  const base = v ? v.valor : 0;
  const extra = Number(reg.extraMedico) || 0;
  // Fijo al médico por cada insumo colocado (lente A → $X, lente B → $B…).
  const insHon = (reg.insumos || []).reduce((s, i) => s + (Number(i.honorarioMedico) || 0), 0);
  const realizador = { medicoId: reg.medicoRealizadorId, monto: (redondearAbajo(base + extra) + insHon) * cant, extra, insumos: insHon, cantidad: cant, faltaValor };

  let derivador = null;
  if (reg.medicoDerivadorId) {
    const vd = valorMedicoVigente('derivacion', reg.medicoDerivadorId, reg.fecha);
    derivador = { medicoId: reg.medicoDerivadorId, monto: redondearAbajo(vd ? vd.valor : 0) * cant, faltaValor: vd ? [] : ['derivacion'] };
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
        detalle.push({ prestacionId: r.id, fecha: r.fecha, rol: 'realizador', descripcion: r.descripcion, cantidad: h.realizador.cantidad, monto: h.realizador.monto });
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
