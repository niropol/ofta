// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI del NOMENCLADOR (alta/edición de prestaciones del catálogo)
// ───────────────────────────────────────────────────────────────────────────
//  La tabla de prestaciones vive ahora en «Nomenclador y contratos ▸ Prestaciones»
//  (renderPrestacionesOIP, en ui-contratos.js). Acá quedan solo el modal de
//  alta/edición de una prestación (#modalPrest) y el borrado, que esa tabla usa.
//  La lógica de versionado vive en nomenclador.js.
// ═══════════════════════════════════════════════════════════════════════════

// Categorías del nomenclador SIN insumos (los insumos se cargan en su propia solapa).
function _catsNomenclador() { return CATEGORIAS_NOMENCLADOR.filter(c => c.id !== 'insumo'); }

function _opcionesCategoria(sel) {
  // Solo categorías con precio (las de derivación no son ítems del nomenclador; insumos van aparte).
  return _catsNomenclador().map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${escHtml(c.label)}</option>`).join('');
}

// ── Modal alta / edición ──
function _mostrarModalPrest(on) { const m = document.getElementById('modalPrest'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalPrest() { _mostrarModalPrest(false); }

// El costo real ya no se carga en el Nomenclador general (es admin). Este hook
// queda por compatibilidad de la UI (el <select> lo llama), sin efecto visible.
function onCategoriaChangePrest() {}

function editarPrestacionUI(grupo) {
  const v = versionActual(grupo);
  if (!v) return;
  document.getElementById('modalPrestTitulo').textContent = 'Editar prestación';
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val == null ? '' : val; };
  set('prest_grupo', grupo);
  document.getElementById('prest_categoria').innerHTML = _opcionesCategoria(v.categoria);
  set('prest_codigo', v.codigo); set('prest_descripcion', v.descripcion);
  set('prest_precio', v.precio != null ? v.precio : 0); set('prest_moneda', v.moneda);
  set('prest_costo', v.costo != null ? v.costo : ''); set('prest_costoMoneda', v.costoMoneda || 'ARS');
  // En edición no se elige vigencia: corrige la versión actual.
  const box = document.getElementById('prest_vigencia_box');
  if (box) box.style.display = 'none';
  onCategoriaChangePrest();
  _mostrarModalPrest(true);
}

function guardarPrestacion() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const grupo = val('prest_grupo');
  const datos = {
    categoria: val('prest_categoria'),
    codigo: val('prest_codigo'),
    descripcion: val('prest_descripcion'),
    precio: val('prest_precio') || 0,
    moneda: val('prest_moneda') || 'ARS',
    costo: val('prest_costo'),
    costoMoneda: val('prest_costoMoneda') || 'ARS',
    vigenciaDesde: val('prest_vigencia') || hoyISO(),
  };
  if (!datos.descripcion) { avisoUI('La descripción es obligatoria.'); return false; }

  let r;
  if (grupo) {
    r = editarPrestacion(Number(grupo), { ...datos, corregirPrecio: true });
  } else {
    r = crearPrestacion(datos);
  }
  cerrarModalPrest();
  if (typeof sincronizarUI === 'function') sincronizarUI();
  return r;
}

// ── Inactivar / reactivar (alternativa al borrado cuando la prestación está en uso) ──
function inactivarPrestacionUI(grupo) {
  toggleEstadoPrestacion(grupo);
  if (typeof sincronizarUI === 'function') sincronizarUI();
}

// ── Eliminar ──
function eliminarPrestacionUI(grupo) {
  const v = versionActual(grupo);
  if (!v) return;
  confirmarUI(`¿Eliminar definitivamente "${v.descripcion}" y todo su historial de precios? Queda registrado en auditoría.`).then(ok => {
    if (!ok) return;
    const r = eliminarPrestacion(grupo);
    if (!r.ok) {
      avisoUI(`No se puede eliminar: hay ${r.referencias} prestación(es) realizada(s) que usan este ítem. Inactivalo en su lugar.`);
      return;
    }
    if (typeof sincronizarUI === 'function') sincronizarUI();
  });
}
