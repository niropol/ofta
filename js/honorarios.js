// ═══════════════════════════════════════════════════════════════════════════
//  SAM — MOTOR DE CÁLCULO DE HONORARIOS (Etapa 4)
// ───────────────────────────────────────────────────────────────────────────
//  Honorario = precio de nomenclador × % del médico (por categoría), SNAPSHOT a
//  la fecha de la prestación (el % vigente a esa fecha; un cambio posterior no
//  recalcula lo ya hecho, igual que los precios).
//
//  Reglas (Etapa 0):
//   - Consulta: 100% fijo al médico (no lleva regla).
//   - Cirugía / práctica / estudio: precio × % del realizador.
//   - Insumo (dentro de cirugía/práctica): (precio − costo) neto × % del insumo,
//     al realizador (exclusivo). Neto nunca negativo.
//   - Derivador: precio × % de derivación, EN PARALELO (misma base, otro médico).
//   - Redondeo HACIA ABAJO al peso entero, a favor de la clínica.
//   - Dólar: se convierte a pesos con la cotización pedida al liquidar. Si un
//     monto está en USD y no hay cotización, se marca `requiereCotizacion`.
//
//  El % es GENERAL (medicoId=null) con override POR MÉDICO, ambos versionados.
// ═══════════════════════════════════════════════════════════════════════════

function redondearAbajo(monto) { return Math.floor(Number(monto) || 0); }

// Convierte a pesos. USD → monto × cotización (ARS por USD). Sin cotización marca la bandera.
function _aPesos(monto, moneda, cotizacion, flags) {
  const n = Number(monto) || 0;
  if (n === 0) return 0;
  if (moneda === 'USD') {
    if (!cotizacion) { flags.requiereCotizacion = true; return 0; }
    return n * cotizacion;
  }
  return n;
}

// ── Reglas de reparto (versionadas por categoría + médico) ──
function _reglasDe(categoria, medicoId) {
  const mid = medicoId != null ? Number(medicoId) : null;
  return DB.reglasReparto
    .filter(r => r.categoria === categoria && (r.medicoId != null ? Number(r.medicoId) : null) === mid)
    .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1));
}
function _reglaActual(categoria, medicoId) {
  const rs = _reglasDe(categoria, medicoId);
  return rs.find(r => !r.vigenciaHasta) || rs[0] || null;
}

// % vigente a una fecha: primero la regla específica del médico, si no la general.
function porcentajeReglaVigente(categoria, medicoId, fecha) {
  const f = fecha || hoyISO();
  const buscar = (mid) => DB.reglasReparto.find(r =>
    r.categoria === categoria &&
    (r.medicoId != null ? Number(r.medicoId) : null) === mid &&
    r.estado !== 'Inactivo' &&
    r.vigenciaDesde <= f && (!r.vigenciaHasta || r.vigenciaHasta >= f));
  const esp = medicoId != null ? buscar(Number(medicoId)) : null;
  if (esp) return { porcentaje: esp.porcentaje, origen: 'medico' };
  const gen = buscar(null);
  if (gen) return { porcentaje: gen.porcentaje, origen: 'general' };
  return null;
}

// Define / cambia un % (general si medicoId=null). Versiona: cierra el vigente y abre uno nuevo.
function setReglaReparto(categoria, medicoId, porcentaje, vigenciaDesde) {
  if (!CATEGORIAS_REGLA.some(c => c.id === categoria)) throw new Error('Esa categoría no lleva regla de %.');
  const pct = Number(porcentaje);
  if (isNaN(pct) || pct < 0) throw new Error('El porcentaje debe ser un número ≥ 0.');
  const mid = medicoId != null && medicoId !== '' ? Number(medicoId) : null;
  const desde = vigenciaDesde || hoyISO();
  const actual = _reglaActual(categoria, mid);
  if (actual && desde <= actual.vigenciaDesde) {
    throw new Error('La vigencia debe ser posterior a la del % actual (' + actual.vigenciaDesde + ').');
  }
  const antes = actual ? JSON.parse(JSON.stringify(actual)) : null;
  if (actual) actual.vigenciaHasta = _diaAnterior(desde);
  const nueva = { id: nuevoId(), categoria, medicoId: mid, porcentaje: pct, vigenciaDesde: desde, vigenciaHasta: null, estado: 'Activo' };
  DB.reglasReparto.push(nueva);
  registrarAuditoria(actual ? 'edicion' : 'alta', 'reglaReparto', nueva.id, antes, nueva);
  marcarCambios('reglasReparto');
  return nueva;
}

// Reglas "actuales" (una por categoría+médico) para mostrar en la config.
function listarReglasActuales() {
  const claves = new Set(DB.reglasReparto.map(r => r.categoria + '|' + (r.medicoId != null ? r.medicoId : '')));
  return [...claves].map(k => {
    const [cat, mid] = k.split('|');
    return _reglaActual(cat, mid === '' ? null : Number(mid));
  }).filter(Boolean);
}

// ── Honorarios de UNA prestación ──
//  Devuelve { realizador:{medicoId, base, insumos, monto, faltaPct[], requiereCotizacion},
//             derivador:{medicoId, monto, faltaPct[], requiereCotizacion} | null }
function honorariosDePrestacion(reg, cotizacion) {
  const cat = categoriaInfo(reg.categoria) || {};
  const rflags = { requiereCotizacion: false, faltaPct: [] };
  const precioPesos = _aPesos(reg.precioNomenclador, reg.moneda, cotizacion, rflags);

  // Base del realizador.
  let base = 0;
  if (cat.porcentajeFijo === 100) {
    base = precioPesos;                                  // consulta: 100%
  } else {
    const r = porcentajeReglaVigente(reg.categoria, reg.medicoRealizadorId, reg.fecha);
    if (r == null) rflags.faltaPct.push(reg.categoria);
    else base = precioPesos * r.porcentaje / 100;
  }

  // Insumos (neto × % insumo) → realizador.
  let insumosMonto = 0;
  (reg.insumos || []).forEach(ins => {
    const p = _aPesos(ins.precio, ins.moneda, cotizacion, rflags);
    const c = _aPesos(ins.costo, ins.costoMoneda, cotizacion, rflags);
    const neto = Math.max(0, p - c);
    const r = porcentajeReglaVigente('insumo', reg.medicoRealizadorId, reg.fecha);
    if (r == null) rflags.faltaPct.push('insumo');
    else insumosMonto += neto * r.porcentaje / 100;
  });

  const realizador = {
    medicoId: reg.medicoRealizadorId,
    base: base,
    insumos: insumosMonto,
    monto: redondearAbajo(base + insumosMonto),
    faltaPct: [...new Set(rflags.faltaPct)],
    requiereCotizacion: rflags.requiereCotizacion,
  };

  // Derivador (en paralelo).
  let derivador = null;
  if (reg.medicoDerivadorId) {
    const dflags = { requiereCotizacion: false, faltaPct: [] };
    const precioPesosD = _aPesos(reg.precioNomenclador, reg.moneda, cotizacion, dflags);
    let monto = 0;
    const r = porcentajeReglaVigente(reg.derivaCategoria, reg.medicoDerivadorId, reg.fecha);
    if (r == null) dflags.faltaPct.push(reg.derivaCategoria);
    else monto = precioPesosD * r.porcentaje / 100;
    derivador = {
      medicoId: reg.medicoDerivadorId,
      monto: redondearAbajo(monto),
      faltaPct: dflags.faltaPct,
      requiereCotizacion: dflags.requiereCotizacion,
    };
  }

  return { realizador, derivador };
}

// ── Honorarios de un médico en un mes ('YYYY-MM') — precursor de la liquidación (Etapa 6) ──
//  Suma lo que le toca como realizador y como derivador. Ignora prestaciones anuladas.
function honorariosDeMedico(medicoId, mes, cotizacion) {
  const mid = Number(medicoId);
  let total = 0, requiereCotizacion = false;
  const faltaPct = new Set();
  const detalle = [];
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => {
      const h = honorariosDePrestacion(r, cotizacion);
      if (h.realizador.medicoId === mid) {
        total += h.realizador.monto;
        if (h.realizador.requiereCotizacion) requiereCotizacion = true;
        h.realizador.faltaPct.forEach(c => faltaPct.add(c));
        detalle.push({ prestacionId: r.id, fecha: r.fecha, rol: 'realizador', descripcion: r.descripcion, monto: h.realizador.monto });
      }
      if (h.derivador && h.derivador.medicoId === mid) {
        total += h.derivador.monto;
        if (h.derivador.requiereCotizacion) requiereCotizacion = true;
        h.derivador.faltaPct.forEach(c => faltaPct.add(c));
        detalle.push({ prestacionId: r.id, fecha: r.fecha, rol: 'derivador', descripcion: r.descripcion, monto: h.derivador.monto });
      }
    });
  return { medicoId: mid, mes, total, requiereCotizacion, faltaPct: [...faltaPct], detalle };
}

// Todos los médicos con honorarios en el mes (para la vista previa / liquidación).
function honorariosDelMes(mes, cotizacion) {
  const ids = new Set();
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => { ids.add(r.medicoRealizadorId); if (r.medicoDerivadorId) ids.add(r.medicoDerivadorId); });
  return [...ids].map(id => honorariosDeMedico(id, mes, cotizacion))
    .filter(h => h.detalle.length > 0)
    .sort((a, b) => b.total - a.total);
}
