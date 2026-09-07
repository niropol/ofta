// ═══════════════════════════════════════════════════════════════════════════
//  SAM — NOMENCLADOR: lógica de precios con versionado por vigencia
// ───────────────────────────────────────────────────────────────────────────
//  Cada PRESTACIÓN lógica se identifica por `grupo`. Sus cambios de precio son
//  VERSIONES (filas) con vigenciaDesde / vigenciaHasta. Así un aumento rige de
//  una fecha en adelante y las prestaciones/liquidaciones ya cerradas conservan
//  el precio viejo (no se recalculan).
//
//  El nomenclador incluye tanto prestaciones (consulta/cirugía/práctica/estudio)
//  como el catálogo de INSUMOS (categoria 'insumo'), que llevan además costo real.
//
//  Modelo por versión:
//   { id, grupo, codigo, descripcion, categoria, precio, moneda,
//     costo, costoMoneda,            // solo categorías con usaCosto (insumo)
//     vigenciaDesde, vigenciaHasta,  // 'YYYY-MM-DD'; hasta=null → vigente
//     estado }                       // 'Activo' | 'Inactivo'
//
//  Reglas de dinero relevantes (Etapa 0):
//   - Consulta: valor fijo (100% al médico). Sin costo.
//   - Insumo: precio y costo real, cada uno en ARS o USD; el % del realizador se
//     calcula (Etapa 4) sobre el neto (precio − costo).
//   - Los aumentos rigen desde su vigencia; meses viejos quedan intactos.
// ═══════════════════════════════════════════════════════════════════════════

function hoyISO() { return new Date().toISOString().slice(0, 10); }

// Devuelve el día anterior a una fecha ISO ('YYYY-MM-DD').
function _diaAnterior(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Todas las versiones de un grupo, ordenadas por vigencia (más nueva primero).
function versionesDe(grupo) {
  return DB.nomenclador
    .filter(n => n.grupo === grupo)
    .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1));
}

// La versión de un grupo vigente a una fecha dada (o null si ninguna cubre esa fecha).
function precioVigente(grupo, fechaISO) {
  const f = fechaISO || hoyISO();
  return DB.nomenclador.find(n =>
    n.grupo === grupo &&
    n.vigenciaDesde <= f &&
    (!n.vigenciaHasta || n.vigenciaHasta >= f)
  ) || null;
}

// La versión "actual" de un grupo: la que tiene vigenciaHasta null (la abierta),
// o la más nueva si todas están cerradas.
function versionActual(grupo) {
  const vs = versionesDe(grupo);
  return vs.find(v => !v.vigenciaHasta) || vs[0] || null;
}

// Lista de grupos (una entrada por prestación lógica) con su versión actual.
// Filtrable por categoría y por texto. No incluye inactivos salvo que se pida.
function listarPrestaciones({ categoria = null, texto = '', incluirInactivos = false } = {}) {
  const grupos = [...new Set(DB.nomenclador.map(n => n.grupo))];
  const filas = grupos.map(g => versionActual(g)).filter(Boolean);
  const t = texto.trim().toLowerCase();
  return filas
    .filter(v => (incluirInactivos || v.estado !== 'Inactivo'))
    .filter(v => (!categoria || v.categoria === categoria))
    .filter(v => (!t || (v.descripcion || '').toLowerCase().includes(t) || (v.codigo || '').toLowerCase().includes(t)))
    .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
}

// ── Alta de una prestación nueva (crea el grupo + su primera versión) ──
function crearPrestacion(datos) {
  const grupo = nuevoId();
  const esLIO = (categoriaInfo(datos.categoria) || {}).usaCosto;
  const v = {
    id: nuevoId(),
    grupo,
    codigo: (datos.codigo || '').trim(),
    descripcion: (datos.descripcion || '').trim(),
    categoria: datos.categoria,
    precio: Number(datos.precio) || 0,
    moneda: datos.moneda || 'ARS',
    costo: esLIO ? (Number(datos.costo) || 0) : null,
    costoMoneda: esLIO ? (datos.costoMoneda || 'ARS') : null,
    vigenciaDesde: datos.vigenciaDesde || hoyISO(),
    vigenciaHasta: null,
    estado: 'Activo',
  };
  DB.nomenclador.push(v);
  registrarAuditoria('alta', 'nomenclador', grupo, null, v);
  marcarCambios('nomenclador');
  return v;
}

// ── Editar METADATOS del grupo (código/descripción/categoría) en todas sus
//    versiones, y opcionalmente CORREGIR el precio/costo de la versión actual
//    (corrección de un error de carga, sin crear una vigencia nueva). ──
function editarPrestacion(grupo, datos) {
  const versiones = versionesDe(grupo);
  if (versiones.length === 0) return false;
  const antes = versiones.map(v => JSON.parse(JSON.stringify(v)));
  const esLIO = (categoriaInfo(datos.categoria || versiones[0].categoria) || {}).usaCosto;

  versiones.forEach(v => {
    if (datos.codigo != null) v.codigo = String(datos.codigo).trim();
    if (datos.descripcion != null) v.descripcion = String(datos.descripcion).trim();
    if (datos.categoria != null) {
      v.categoria = datos.categoria;
      if (!esLIO) { v.costo = null; v.costoMoneda = null; }
    }
  });

  // Corrección en el lugar de la versión actual (no versiona).
  const actual = versionActual(grupo);
  if (actual && datos.corregirPrecio) {
    if (datos.precio != null) actual.precio = Number(datos.precio) || 0;
    if (datos.moneda != null) actual.moneda = datos.moneda;
    if (esLIO) {
      if (datos.costo != null) actual.costo = Number(datos.costo) || 0;
      if (datos.costoMoneda != null) actual.costoMoneda = datos.costoMoneda;
    }
  }

  registrarAuditoria('edicion', 'nomenclador', grupo, antes, versionesDe(grupo));
  marcarCambios('nomenclador');
  return true;
}

// ── Nuevo precio (aumento): rige desde `vigenciaDesde` en adelante. Cierra la
//    versión vigente y crea una nueva. Las anteriores quedan intactas. ──
function versionarPrecio(grupo, { vigenciaDesde, precio, moneda, costo, costoMoneda }) {
  const actual = versionActual(grupo);
  if (!actual) return false;
  const desde = vigenciaDesde || hoyISO();
  if (desde <= actual.vigenciaDesde) {
    throw new Error('La vigencia del nuevo precio debe ser posterior a la del precio actual (' + actual.vigenciaDesde + ').');
  }
  const antes = JSON.parse(JSON.stringify(actual));
  actual.vigenciaHasta = _diaAnterior(desde);   // cierra la versión vigente

  const esLIO = (categoriaInfo(actual.categoria) || {}).usaCosto;
  const nueva = {
    id: nuevoId(),
    grupo,
    codigo: actual.codigo,
    descripcion: actual.descripcion,
    categoria: actual.categoria,
    precio: Number(precio) || 0,
    moneda: moneda || actual.moneda || 'ARS',
    costo: esLIO ? (costo != null ? Number(costo) : actual.costo) : null,
    costoMoneda: esLIO ? (costoMoneda || actual.costoMoneda || 'ARS') : null,
    vigenciaDesde: desde,
    vigenciaHasta: null,
    estado: actual.estado,
  };
  DB.nomenclador.push(nueva);
  registrarAuditoria('edicion', 'nomenclador', grupo, antes, nueva);
  marcarCambios('nomenclador');
  return nueva;
}

// ── Inactivar / reactivar todo el grupo (baja lógica reversible) ──
function toggleEstadoPrestacion(grupo) {
  const versiones = versionesDe(grupo);
  if (versiones.length === 0) return false;
  const antes = versiones.map(v => JSON.parse(JSON.stringify(v)));
  const nuevo = versionActual(grupo).estado === 'Inactivo' ? 'Activo' : 'Inactivo';
  versiones.forEach(v => { v.estado = nuevo; });
  registrarAuditoria('edicion', 'nomenclador', grupo, antes, versionesDe(grupo));
  marcarCambios('nomenclador');
  return nuevo;
}

// Cuántas prestaciones realizadas referencian alguna versión de un grupo
// (como prestación en sí o como insumo usado dentro de una cirugía/práctica).
function _referenciasNomenclador(grupo) {
  const ids = new Set(versionesDe(grupo).map(v => v.id));
  return DB.prestacionesRealizadas.filter(p =>
    ids.has(p.nomencladorId) || (p.insumos || []).some(i => ids.has(i.nomencladorId))
  ).length;
}

// ── Eliminar (baja física). Bloquea si hay prestaciones que lo usan. ──
function eliminarPrestacion(grupo) {
  const ref = _referenciasNomenclador(grupo);
  if (ref > 0) return { ok: false, referencias: ref };
  const antes = versionesDe(grupo);
  DB.nomenclador = DB.nomenclador.filter(n => n.grupo !== grupo);
  registrarAuditoria('baja', 'nomenclador', grupo, antes, null);
  marcarCambios('nomenclador');
  return { ok: true };
}

// Formato de dinero para la UI.
function fmtMoneda(monto, moneda) {
  const n = Number(monto) || 0;
  const s = n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return (moneda === 'USD' ? 'US$ ' : '$ ') + s;
}
