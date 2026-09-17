// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI del NOMENCLADOR (Etapa 2)
// ───────────────────────────────────────────────────────────────────────────
//  Tabla de prestaciones (una fila por prestación lógica, mostrando su precio
//  vigente) + alta/edición, "nuevo precio" (aumento con vigencia), historial de
//  precios, inactivar y eliminar. La lógica de versionado vive en nomenclador.js.
// ═══════════════════════════════════════════════════════════════════════════

function _labelCategoria(id) { return (CATEGORIAS.find(c => c.id === id) || {}).label || id; }
function _primerDiaMesActual() { return hoyISO().slice(0, 7) + '-01'; }

// Categorías del nomenclador SIN insumos (los insumos se cargan en su propia solapa).
function _catsNomenclador() { return CATEGORIAS_NOMENCLADOR.filter(c => c.id !== 'insumo'); }

function _opcionesCategoria(sel) {
  // Solo categorías con precio (las de derivación no son ítems del nomenclador; insumos van aparte).
  return _catsNomenclador().map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${escHtml(c.label)}</option>`).join('');
}

// ── Render de la tabla ──
function renderNomenclador() {
  const cont = document.getElementById('nomencladorTabla');
  if (!cont) return;
  const catSel = document.getElementById('nomFiltroCat');
  const txtSel = document.getElementById('nomBuscar');
  const categoria = catSel && catSel.value ? catSel.value : null;
  const texto = txtSel ? txtSel.value : '';

  const filas = listarPrestaciones({ categoria, texto, incluirInactivos: true })
    .filter(v => v.categoria !== 'insumo'); // los insumos se gestionan en la solapa «Insumos»

  const nota = '<p class="muted" style="margin-top:0">Catálogo de prestaciones (qué se hace). El <strong>valor de cada una se carga por obra social en «Contratos»</strong> — acá solo el código, la descripción y la categoría.</p>';
  if (filas.length === 0) {
    cont.innerHTML = nota + '<p class="vacio">No hay prestaciones cargadas. Usá «+ Nueva prestación».</p>';
    return;
  }

  const rows = filas.map(v => {
    const inactivo = v.estado === 'Inactivo';
    return `
    <tr class="${inactivo ? 'fila-inactiva' : ''}">
      <td>${escHtml(_labelCategoria(v.categoria))}</td>
      <td>${escHtml(v.codigo || '—')}</td>
      <td>${escHtml(v.descripcion)}${inactivo ? ' <span class="badge-inactivo">Inactiva</span>' : ''}</td>
      <td>${escHtml(v.vigenciaDesde)}</td>
      <td class="acc">
        <button onclick="editarPrestacionUI(${v.grupo})">Editar</button>
        <button onclick="inactivarPrestacionUI(${v.grupo})">${inactivo ? 'Reactivar' : 'Inactivar'}</button>
        <button class="danger" onclick="eliminarPrestacionUI(${v.grupo})">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  cont.innerHTML = nota + `
    <table class="tabla">
      <thead><tr>
        <th>Categoría</th><th>Código</th><th>Descripción</th>
        <th>Alta</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Poblar el select de filtro de categoría (una sola vez).
function _poblarFiltroCategoria() {
  const sel = document.getElementById('nomFiltroCat');
  if (!sel || sel.dataset.listo) return;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    _catsNomenclador().map(c => `<option value="${c.id}">${escHtml(c.label)}</option>`).join('');
  sel.dataset.listo = '1';
}

// ── Modal alta / edición ──
function _mostrarModalPrest(on) { const m = document.getElementById('modalPrest'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalPrest() { _mostrarModalPrest(false); }

// El costo real ya no se carga en el Nomenclador general (es admin). Este hook
// queda por compatibilidad de la UI (el <select> lo llama), sin efecto visible.
function onCategoriaChangePrest() {}

function abrirNuevaPrestacion() {
  document.getElementById('modalPrestTitulo').textContent = 'Nueva prestación';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('prest_grupo', '');
  document.getElementById('prest_categoria').innerHTML = _opcionesCategoria('consulta');
  set('prest_codigo', ''); set('prest_descripcion', '');
  set('prest_precio', '0'); set('prest_moneda', 'ARS');
  set('prest_costo', ''); set('prest_costoMoneda', 'ARS');
  set('prest_vigencia', _primerDiaMesActual());   // así cubre prestaciones cargadas del mes
  document.getElementById('prest_vigencia_box').style.display = 'block';
  onCategoriaChangePrest();
  _mostrarModalPrest(true);
}

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
  document.getElementById('prest_vigencia_box').style.display = 'none';
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
  if (!datos.descripcion) { alert('La descripción es obligatoria.'); return false; }

  let r;
  if (grupo) {
    r = editarPrestacion(Number(grupo), { ...datos, corregirPrecio: true });
  } else {
    r = crearPrestacion(datos);
  }
  cerrarModalPrest();
  if (typeof sincronizarUI === "function") sincronizarUI(); else renderNomenclador();
  return r;
}

// ── Modal "Nuevo precio" (aumento con vigencia) ──
function _mostrarModalPrecio(on) { const m = document.getElementById('modalPrecio'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalPrecio() { _mostrarModalPrecio(false); }

function abrirNuevoPrecio(grupo) {
  const v = versionActual(grupo);
  if (!v) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val == null ? '' : val; };
  set('precio_grupo', grupo);
  document.getElementById('precio_prest_nombre').textContent = v.descripcion + '  (actual: ' + fmtMoneda(v.precio, v.moneda) + ' desde ' + v.vigenciaDesde + ')';
  set('precio_valor', v.precio); set('precio_moneda', v.moneda);
  set('precio_vigencia', hoyISO());
  _mostrarModalPrecio(true);
}

function guardarNuevoPrecio() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const grupo = Number(val('precio_grupo'));
  // El costo real no se toca acá (es admin): versionarPrecio conserva el costo actual.
  const datos = {
    vigenciaDesde: val('precio_vigencia') || hoyISO(),
    precio: val('precio_valor'),
    moneda: val('precio_moneda') || 'ARS',
  };
  if (datos.precio === '' || isNaN(Number(datos.precio))) { alert('El precio debe ser un número.'); return false; }
  try {
    versionarPrecio(grupo, datos);
  } catch (e) {
    alert(e.message);
    return false;
  }
  cerrarModalPrecio();
  if (typeof sincronizarUI === "function") sincronizarUI(); else renderNomenclador();
  return true;
}

// ── Modal historial de precios ──
function _mostrarModalHistorial(on) { const m = document.getElementById('modalHistorial'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalHistorial() { _mostrarModalHistorial(false); }

function verHistorialPrestacion(grupo) {
  const vs = versionesDe(grupo);
  if (vs.length === 0) return;
  document.getElementById('historial_nombre').textContent = vs[0].descripcion;
  const rows = vs.map(v => `
    <tr>
      <td>${escHtml(v.vigenciaDesde)}</td>
      <td>${escHtml(v.vigenciaHasta || 'vigente')}</td>
      <td class="num">${fmtMoneda(v.precio, v.moneda)}</td>
    </tr>`).join('');
  document.getElementById('historial_tabla').innerHTML = `
    <table class="tabla">
      <thead><tr><th>Desde</th><th>Hasta</th><th class="num">Precio</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  _mostrarModalHistorial(true);
}

// ── Inactivar / eliminar ──
function inactivarPrestacionUI(grupo) {
  toggleEstadoPrestacion(grupo);
  if (typeof sincronizarUI === "function") sincronizarUI(); else renderNomenclador();
}

function eliminarPrestacionUI(grupo) {
  const v = versionActual(grupo);
  if (!v) return;
  if (typeof confirm === 'function' && !confirm(`¿Eliminar definitivamente "${v.descripcion}" y todo su historial de precios? Queda registrado en auditoría.`)) return;
  const r = eliminarPrestacion(grupo);
  if (!r.ok) {
    alert(`No se puede eliminar: hay ${r.referencias} prestación(es) realizada(s) que usan este ítem. Inactivalo en su lugar.`);
    return;
  }
  if (typeof sincronizarUI === "function") sincronizarUI(); else renderNomenclador();
}
