// ═══════════════════════════════════════════════════════════════════════════
//  SAM/OFTA — MATCHEO DE CONTRATOS AL CATÁLOGO CANÓNICO
// ───────────────────────────────────────────────────────────────────────────
//  Cada OS nombra distinto la misma práctica (código/texto). El pago al médico
//  es estandarizado por prestación CANÓNICA (nomenclador). Para no fragmentar el
//  catálogo al importar contratos de varias OS:
//    1) alias aprendido (OS + código/texto → grupo) — match seguro y recordado;
//    2) match exacto por código o por texto normalizado;
//    3) sugerencia por similitud (Dice de bigramas) — se confirma a mano;
//    4) sin match → queda para que el usuario asigne o cree.
//  Nada se aplica hasta confirmar (planImportarContratos → aplicarImportacionContratos).
// ═══════════════════════════════════════════════════════════════════════════

// Normaliza texto: minúsculas, sin acentos, sin puntuación, espacios colapsados.
function _normContrato(t) {
  return String(t == null ? '' : t)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function _codigoNorm(c) { return String(c == null ? '' : c).trim().toLowerCase(); }

// Similitud 0..1 (coeficiente de Sørensen–Dice sobre bigramas del texto normalizado).
function _bigramas(s) { const b = []; for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2)); return b; }
function similitudTexto(a, b) {
  const na = _normContrato(a), nb = _normContrato(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = _bigramas(na), bb = _bigramas(nb);
  if (!ba.length || !bb.length) return na === nb ? 1 : 0;
  const map = new Map();
  ba.forEach(x => map.set(x, (map.get(x) || 0) + 1));
  let inter = 0;
  bb.forEach(x => { const c = map.get(x) || 0; if (c > 0) { inter++; map.set(x, c - 1); } });
  return (2 * inter) / (ba.length + bb.length);
}

// ── Alias por OS ──
function buscarAliasContrato(obraSocial, codigo, descripcion) {
  const cod = _codigoNorm(codigo), txt = _normContrato(descripcion);
  return DB.aliasContrato.find(a => a.obraSocial === obraSocial &&
    ((cod && _codigoNorm(a.codigo) === cod) || (txt && a.textoNorm === txt))) || null;
}
function guardarAliasContrato(obraSocial, codigo, descripcion, grupo) {
  const cod = String(codigo || '').trim(), txt = _normContrato(descripcion);
  const g = Number(grupo);
  if (!obraSocial || (!cod && !txt) || !g) return null;
  let a = DB.aliasContrato.find(x => x.obraSocial === obraSocial &&
    ((cod && _codigoNorm(x.codigo) === _codigoNorm(cod)) || (txt && x.textoNorm === txt)));
  if (a) {
    a.grupoNomenclador = g;
    if (cod && !a.codigo) a.codigo = cod;
  } else {
    a = { id: nuevoId(), obraSocial, codigo: cod, textoNorm: txt, textoOrig: String(descripcion || '').trim(), grupoNomenclador: g };
    DB.aliasContrato.push(a);
  }
  marcarCambios('aliasContrato');
  return a;
}
function olvidarAliasContrato(id) {
  const n = DB.aliasContrato.length;
  DB.aliasContrato = DB.aliasContrato.filter(a => a.id !== Number(id));
  if (DB.aliasContrato.length !== n) marcarCambios('aliasContrato');
}

// Umbral por debajo del cual NO se sugiere (queda "sin match" para decidir a mano).
const UMBRAL_SUGERENCIA = 0.55;

// Resuelve una línea de contrato contra el catálogo. No muta nada.
// estado: 'alias' | 'codigo' | 'exacto' | 'sugerido' | 'sinMatch'
function sugerirPrestacionContrato(obraSocial, codigo, descripcion, categoria) {
  const items = listarPrestaciones({ incluirInactivos: false }).filter(n => n.categoria !== 'insumo');
  const fmtIt = n => ({ grupo: n.grupo, descripcion: n.descripcion, codigo: n.codigo || '', categoria: n.categoria });

  // 1) alias aprendido
  const alias = buscarAliasContrato(obraSocial, codigo, descripcion);
  if (alias) {
    const it = items.find(n => n.grupo === alias.grupoNomenclador);
    if (it) return { estado: 'alias', grupo: it.grupo, candidato: fmtIt(it), score: 1, alternativas: [] };
  }
  // 2) exacto por código
  const cod = _codigoNorm(codigo);
  if (cod) {
    const it = items.find(n => _codigoNorm(n.codigo) === cod);
    if (it) return { estado: 'codigo', grupo: it.grupo, candidato: fmtIt(it), score: 1, alternativas: [] };
  }
  // 3) exacto por texto normalizado
  const txt = _normContrato(descripcion);
  if (txt) {
    const it = items.find(n => _normContrato(n.descripcion) === txt);
    if (it) return { estado: 'exacto', grupo: it.grupo, candidato: fmtIt(it), score: 1, alternativas: [] };
  }
  // 4) similitud (prioriza la misma categoría si vino informada)
  const pool = (categoria ? items.filter(n => n.categoria === categoria) : items);
  const base = pool.length ? pool : items;
  const rank = base.map(n => ({ it: n, score: similitudTexto(descripcion, n.descripcion) }))
    .sort((a, b) => b.score - a.score);
  const alternativas = rank.slice(0, 5).map(r => ({ ...fmtIt(r.it), score: Math.round(r.score * 100) / 100 }));
  const best = rank[0];
  if (best && best.score >= UMBRAL_SUGERENCIA) {
    return { estado: 'sugerido', grupo: best.it.grupo, candidato: fmtIt(best.it), score: best.score, alternativas };
  }
  return { estado: 'sinMatch', grupo: null, candidato: null, score: best ? best.score : 0, alternativas };
}

// Arma el PLAN de importación (una fila por línea del archivo). No aplica nada.
// filas: [{obraSocial, codigo?, descripcion?/ref?, categoria?, valor}]
function planImportarContratos(filas) {
  return (filas || []).map((f, i) => {
    const os = (f.obraSocial || '').trim();
    const codigo = (f.codigo != null ? String(f.codigo) : '').trim();
    const descripcion = (f.descripcion != null ? String(f.descripcion) : (f.ref != null ? String(f.ref) : '')).trim();
    const categoria = (f.categoria || '').trim();
    const valorNum = Number(f.valor);
    const problemas = [];
    if (!os) problemas.push('falta obra social');
    if (!descripcion && !codigo) problemas.push('falta prestación (código o descripción)');
    if (f.valor === '' || f.valor == null || isNaN(valorNum) || valorNum < 0) problemas.push('valor inválido');
    const match = (os && (descripcion || codigo)) ? sugerirPrestacionContrato(os, codigo, descripcion, categoria)
      : { estado: 'sinMatch', grupo: null, candidato: null, score: 0, alternativas: [] };
    return { fila: i + 1, obraSocial: os, codigo, descripcion, categoria, valor: isNaN(valorNum) ? null : valorNum, match, problemas };
  });
}

// Aplica las decisiones confirmadas por el usuario y aprende los alias.
// decisiones: [{obraSocial, codigo, descripcion, categoria, valor, accion:'asignar'|'crear'|'omitir', grupo?, recordar?}]
function aplicarImportacionContratos(decisiones, vigenciaDesde) {
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');
  const res = { ok: 0, creadas: 0, aliasGuardados: 0, omitidas: 0, errores: [] };
  (decisiones || []).forEach((d, i) => {
    const nfila = d.fila != null ? d.fila : i + 1;
    try {
      if (d.accion === 'omitir') { res.omitidas++; return; }
      const os = (d.obraSocial || '').trim();
      const val = Number(d.valor);
      if (!os) throw new Error('falta obra social');
      if (isNaN(val) || val < 0) throw new Error('valor inválido');
      let grupo = d.grupo != null ? Number(d.grupo) : null;
      if (d.accion === 'crear') {
        const cat = d.categoria || 'consulta';
        if (!CATEGORIAS_NOMENCLADOR.some(c => c.id === cat) || cat === 'insumo') throw new Error('categoría inválida para crear');
        const desc = (d.descripcion || '').trim();
        if (!desc) throw new Error('falta descripción para crear la prestación');
        const it = crearPrestacion({ categoria: cat, codigo: (d.codigo || '').trim(), descripcion: desc, precio: 0, vigenciaDesde: desde });
        grupo = it.grupo; res.creadas++;
      }
      if (grupo == null) throw new Error('sin prestación asignada');
      _upsertContrato(os, grupo, val, desde);
      if (d.recordar !== false) { if (guardarAliasContrato(os, d.codigo, d.descripcion, grupo)) res.aliasGuardados++; }
      res.ok++;
    } catch (e) { res.errores.push({ fila: nfila, motivo: e.message }); }
  });
  return res;
}
