// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de CAJA (Etapa 5) · zona restringida
// ───────────────────────────────────────────────────────────────────────────
//  Saldos neteados por moneda × medio, libro de movimientos con filtros, alta/
//  edición/baja de movimientos manuales y gastos, y cierre/arqueo diario.
// ═══════════════════════════════════════════════════════════════════════════

function _labelOrigen(o) {
  return { manual: 'Manual', gasto: 'Gasto', pago_medico: 'Pago médico (auto)', cobro_sam: 'Cobro SAM (auto)', costo_insumos: 'Costo insumos (auto)' }[o] || o;
}

function renderCaja() {
  renderSaldosCaja();
  renderMovimientosCaja();
  renderCierresCaja();
}

// ── Saldos ──
function renderSaldosCaja() {
  const cont = document.getElementById('cajaSaldos');
  if (!cont) return;
  const s = saldosCaja();
  const card = (titulo, sub, cls) => `
    <div class="saldo-card ${cls || ''}">
      <div class="saldo-titulo">${escHtml(titulo)}</div>
      <div class="saldo-monto ${sub < 0 ? 'neg' : ''}">${fmtMoneda(sub, 'ARS')}</div>
    </div>`;
  // Caja en pesos: efectivo + transferencia.
  cont.innerHTML =
    card('Efectivo', s.ARS.efectivo) +
    card('Transferencia', s.ARS.transferencia) +
    card('Total en caja', s.ARS.total, 'total');
}

// ── Movimientos ──
function renderMovimientosCaja() {
  const cont = document.getElementById('cajaMovsTabla');
  if (!cont) return;
  const gv = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const movs = listarMovimientosCaja({ mes: gv('cajaFMes'), tipo: gv('cajaFTipo'), moneda: gv('cajaFMoneda'), medioPago: gv('cajaFMedio') });
  if (movs.length === 0) { cont.innerHTML = '<p class="vacio">No hay movimientos para este filtro.</p>'; return; }
  const rows = movs.map(m => {
    const auto = !(m.origen === 'manual' || m.origen === 'gasto');
    const signo = m.tipo === 'ingreso' ? '+' : '−';
    return `
    <tr>
      <td>${escHtml(m.fecha)}</td>
      <td>${m.tipo === 'ingreso' ? '<span class="pos">Ingreso</span>' : '<span class="neg">Egreso</span>'}</td>
      <td>${escHtml(m.descripcion)}${m.categoriaGasto ? ` <span class="muted">· ${escHtml(m.categoriaGasto)}</span>` : ''}</td>
      <td class="num ${m.tipo === 'ingreso' ? 'pos' : 'neg'}">${signo} ${fmtMoneda(m.monto, m.moneda)}</td>
      <td>${m.medioPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
      <td class="muted">${escHtml(_labelOrigen(m.origen))}</td>
      <td class="acc">
        ${auto
          ? '<span class="muted">—</span>'
          : `<button onclick="editarMovimientoCajaUI(${m.id})">Editar</button>
             <button class="danger" onclick="eliminarMovimientoCajaUI(${m.id})">Eliminar</button>`}
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th class="num">Monto</th><th>Medio</th><th>Origen</th><th>Acciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Modal movimiento ──
function _mostrarModalMov(on) { const m = document.getElementById('modalMov'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalMov() { _mostrarModalMov(false); }

function onTipoChangeMov() {
  const tipo = document.getElementById('mov_tipo').value;
  const box = document.getElementById('mov_gasto_box');
  if (box) box.style.display = (tipo === 'egreso') ? 'block' : 'none';
}

function abrirMovimientoCaja(tipo, esGasto) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  document.getElementById('modalMovTitulo').textContent = tipo === 'ingreso' ? 'Nuevo ingreso' : (esGasto ? 'Nuevo gasto' : 'Nuevo egreso');
  set('mov_id', '');
  set('mov_fecha', hoyISO());
  set('mov_tipo', tipo || 'ingreso');
  set('mov_desc', '');
  set('mov_monto', '');
  set('mov_moneda', 'ARS');
  set('mov_medio', 'efectivo');
  document.getElementById('mov_categoria').innerHTML = '<option value="">(sin categoría)</option>' +
    CATEGORIAS_GASTO.map(c => `<option value="${c}">${escHtml(c)}</option>`).join('');
  set('mov_categoria', esGasto ? 'Otros' : '');
  onTipoChangeMov();
  _mostrarModalMov(true);
}

function editarMovimientoCajaUI(id) {
  const m = DB.cajaMovimientos.find(x => x.id === Number(id));
  if (!m) return;
  const set = (idf, v) => { const el = document.getElementById(idf); if (el) el.value = v == null ? '' : v; };
  document.getElementById('modalMovTitulo').textContent = 'Editar movimiento';
  set('mov_id', m.id); set('mov_fecha', m.fecha); set('mov_tipo', m.tipo);
  set('mov_desc', m.descripcion); set('mov_monto', m.monto); set('mov_moneda', m.moneda); set('mov_medio', m.medioPago);
  document.getElementById('mov_categoria').innerHTML = '<option value="">(sin categoría)</option>' +
    CATEGORIAS_GASTO.map(c => `<option value="${c}"${c === m.categoriaGasto ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
  onTipoChangeMov();
  _mostrarModalMov(true);
}

function guardarMovimientoCaja() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const datos = {
    fecha: val('mov_fecha'), tipo: val('mov_tipo'), descripcion: val('mov_desc'),
    monto: val('mov_monto'), moneda: val('mov_moneda'), medioPago: val('mov_medio'),
    categoriaGasto: val('mov_categoria') || null,
  };
  const idEdit = val('mov_id');
  try {
    if (idEdit) {
      editarMovimientoCaja(Number(idEdit), datos);
    } else if (datos.tipo === 'egreso' && datos.categoriaGasto) {
      registrarGasto(datos);
    } else {
      registrarMovimientoCaja(datos);
    }
  } catch (e) { alert(e.message); return false; }
  cerrarModalMov();
  renderCaja();
  return true;
}

function eliminarMovimientoCajaUI(id) {
  confirmarUI('¿Eliminar este movimiento de caja? Queda registrado en auditoría.').then(ok => {
    if (!ok) return;
    const r = eliminarMovimientoCaja(id);
    if (!r.ok && r.automatico) { alert('Es un pago a médico automático: se corrige desde la liquidación (Etapa 6).'); return; }
    if (typeof sincronizarUI === 'function') sincronizarUI(); else renderCaja();
  });
}

// ── Cierre / arqueo ──
function _mostrarModalCierre(on) { const m = document.getElementById('modalCierre'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalCierre() { _mostrarModalCierre(false); }

function abrirCierreCaja() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('cierre_fecha', hoyISO()); set('cierre_moneda', 'ARS'); set('cierre_medio', 'efectivo');
  set('cierre_contado', ''); set('cierre_obs', '');
  _actualizarSaldoSistemaCierre();
  _mostrarModalCierre(true);
}

// Muestra el saldo del sistema para el pool/fecha elegidos (referencia para el arqueo).
function _actualizarSaldoSistemaCierre() {
  const f = document.getElementById('cierre_fecha').value;
  const mon = document.getElementById('cierre_moneda').value;
  const med = document.getElementById('cierre_medio').value;
  const s = saldoPool(mon, med, f);
  const el = document.getElementById('cierre_sistema');
  if (el) el.textContent = fmtMoneda(s, mon);
}

function guardarCierreCaja() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  try {
    const c = registrarCierreCaja({
      fecha: val('cierre_fecha'), moneda: val('cierre_moneda'), medioPago: val('cierre_medio'),
      saldoContado: val('cierre_contado'), observacion: val('cierre_obs'),
    });
    if (c.diferencia !== 0) {
      alert(`Cierre guardado con DIFERENCIA de ${fmtMoneda(c.diferencia, c.moneda)} (contado − sistema).`);
    }
  } catch (e) { alert(e.message); return false; }
  cerrarModalCierre();
  renderCierresCaja();
  return true;
}

function renderCierresCaja() {
  const cont = document.getElementById('cajaCierresTabla');
  if (!cont) return;
  const cierres = listarCierresCaja().slice(0, 15);
  if (cierres.length === 0) { cont.innerHTML = '<p class="muted">Sin cierres registrados.</p>'; return; }
  const rows = cierres.map(c => `
    <tr>
      <td>${escHtml(c.fecha)}</td>
      <td>${c.moneda} · ${c.medioPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
      <td class="num">${fmtMoneda(c.saldoSistema, c.moneda)}</td>
      <td class="num">${fmtMoneda(c.saldoContado, c.moneda)}</td>
      <td class="num ${c.diferencia === 0 ? 'pos' : 'neg'}">${fmtMoneda(c.diferencia, c.moneda)}</td>
      <td class="muted">${escHtml(c.observacion || '')}</td>
    </tr>`).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Fecha</th><th>Pool</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Obs.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
