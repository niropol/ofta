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
function renderAdminInsumos() {
  const cont = document.getElementById('adminInsumos');
  if (!cont) return;
  const insumos = listarPrestaciones({ categoria: 'insumo', incluirInactivos: true });
  if (insumos.length === 0) {
    cont.innerHTML = '<p class="vacio">No hay insumos cargados. Cargalos en el Nomenclador (categoría «Insumo»); acá se define su costo real.</p>';
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
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr>
        <th>Insumo</th><th class="num">Precio (cobrado)</th>
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
