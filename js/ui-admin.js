// ═══════════════════════════════════════════════════════════════════════════
//  SAM — ÁREA ADMIN (acceso restringido)
// ───────────────────────────────────────────────────────────────────────────
//  Zona sensible: solo el admin. Hoy sin login (la restricción real llega en la
//  Etapa 8/10); por ahora es una sección aparte, marcada como Admin.
//  Aloja el COSTO REAL de los insumos (no visible en el Nomenclador general) y,
//  cuando lleguen, la CAJA (Etapa 5) y las LIQUIDACIONES a médicos (Etapa 6).
// ═══════════════════════════════════════════════════════════════════════════

function renderAdmin() {
  renderAdminInsumos();
}

// ── Costo real de insumos ──
// Selector del mecanismo global de reparto de insumos.
function _bloqueModoInsumo() {
  const modo = (typeof insumoModo === 'function') ? insumoModo() : 'total';
  return `
    <div class="cd-card" style="margin-bottom:16px">
      <h4 style="margin-top:0">Mecanismo de reparto de insumos (global)</h4>
      <p class="muted" style="margin-top:0">SAM siempre cobra. En ambos, SAM Oftalmo <strong>no</strong> paga el costo del insumo.</p>
      <label style="display:block;margin-bottom:6px"><input type="radio" name="insModo" value="total" ${modo === 'total' ? 'checked' : ''} onchange="setInsumoModoUI('total')"> <strong>Mecanismo 1 — reparto del total:</strong> se reparte lo facturado 60/40; el costo lo absorbe SAM.</label>
      <label style="display:block"><input type="radio" name="insModo" value="margen" ${modo === 'margen' ? 'checked' : ''} onchange="setInsumoModoUI('margen')"> <strong>Mecanismo 2 — descontar costo:</strong> se descuenta el costo del insumo y se reparte el margen 60/40.</label>
    </div>`;
}

function setInsumoModoUI(modo) {
  setInsumoModo(modo);
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderAdminInsumos();
  if (typeof renderPanelMes === 'function') renderPanelMes();
}

function renderAdminInsumos() {
  const cont = document.getElementById('adminInsumos');
  if (!cont) return;
  const insumos = listarPrestaciones({ categoria: 'insumo', incluirInactivos: true });
  if (insumos.length === 0) {
    cont.innerHTML = _bloqueModoInsumo() + '<p class="vacio">No hay insumos cargados. Cargalos con «+ Nuevo insumo»; acá se define su costo real.</p>';
    return;
  }
  const rows = insumos.map(v => {
    const inactivo = v.estado === 'Inactivo';
    return `
    <tr class="${inactivo ? 'fila-inactiva' : ''}">
      <td>${escHtml(v.descripcion)}${inactivo ? ' <span class="badge-inactivo">Inactivo</span>' : ''}</td>
      <td class="num">${fmtMoneda(v.precio, v.moneda)}</td>
      <td><input type="number" step="0.01" id="costo_${v.grupo}" value="${v.costo != null ? v.costo : ''}" style="width:130px"></td>
      <td>
        <select id="costoMon_${v.grupo}">
          <option value="ARS"${(v.costoMoneda || 'ARS') === 'ARS' ? ' selected' : ''}>Pesos (ARS)</option>
          <option value="USD"${v.costoMoneda === 'USD' ? ' selected' : ''}>Dólares (USD)</option>
        </select>
      </td>
      <td class="num">${_netoInsumo(v)}</td>
      <td class="acc"><button onclick="guardarCostoInsumoUI(${v.grupo})">Guardar</button></td>
    </tr>`;
  }).join('');
  cont.innerHTML = _bloqueModoInsumo() + `
    <table class="tabla">
      <thead><tr>
        <th>Insumo</th><th class="num">Precio (factura SAM)</th>
        <th>Costo real</th><th>Moneda</th><th class="num">Neto</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Neto del insumo (precio − costo) si están en la misma moneda; si no, avisa.
function _netoInsumo(v) {
  if (v.costo == null) return '—';
  if (v.moneda !== v.costoMoneda) return '<span class="muted">a convertir</span>';
  return fmtMoneda(v.precio - v.costo, v.moneda);
}

// ── Alta de insumo desde el Admin (crea el ítem + su costo, en un solo paso) ──
function _mostrarModalInsumo(on) { const m = document.getElementById('modalInsumo'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalInsumo() { _mostrarModalInsumo(false); }

function abrirNuevoInsumo() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('insu_desc', ''); set('insu_precio', ''); set('insu_moneda', 'ARS');
  set('insu_costo', ''); set('insu_costoMoneda', 'ARS');
  set('insu_vigencia', hoyISO().slice(0, 7) + '-01');
  _mostrarModalInsumo(true);
}

function guardarNuevoInsumo() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const desc = val('insu_desc');
  if (!desc) { alert('La descripción es obligatoria.'); return false; }
  if (val('insu_precio') === '' || isNaN(Number(val('insu_precio')))) { alert('El precio cobrado debe ser un número.'); return false; }
  if (val('insu_costo') === '' || isNaN(Number(val('insu_costo')))) { alert('El costo real debe ser un número.'); return false; }
  const v = crearPrestacion({
    categoria: 'insumo', descripcion: desc,
    precio: val('insu_precio'), moneda: val('insu_moneda') || 'ARS',
    costo: val('insu_costo'), costoMoneda: val('insu_costoMoneda') || 'ARS',
    vigenciaDesde: val('insu_vigencia') || (hoyISO().slice(0, 7) + '-01'),
  });
  cerrarModalInsumo();
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderAdminInsumos();
  return v;
}

function guardarCostoInsumoUI(grupo) {
  const costo = document.getElementById('costo_' + grupo).value;
  const moneda = document.getElementById('costoMon_' + grupo).value;
  if (costo === '' || isNaN(Number(costo))) { alert('El costo debe ser un número.'); return false; }
  try {
    setCostoInsumo(grupo, costo, moneda);
  } catch (e) { alert(e.message); return false; }
  renderAdminInsumos();
  return true;
}
