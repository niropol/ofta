// ═══════════════════════════════════════════════════════════════════════════
//  OFTA — UI de AVISOS / RECORDATORIOS
// ═══════════════════════════════════════════════════════════════════════════

const _AVISO_ICON = { urgente: '🔴', importante: '🟡', info: '🔵' };

function renderAvisos() {
  _renderAvisosAutomaticos();
  _renderAlarmas();
  actualizarBadgeAvisos();
}

function _renderAvisosAutomaticos() {
  const cont = document.getElementById('avisosAutoLista');
  if (!cont) return;
  const avisos = (typeof avisosAutomaticos === 'function') ? avisosAutomaticos() : [];
  if (!avisos.length) { cont.innerHTML = '<p class="muted">Sin avisos automáticos: todo al día 👍</p>'; return; }
  cont.innerHTML = avisos.map(a => `
    <div class="aviso-item aviso-${a.tipo}">
      <span>${_AVISO_ICON[a.tipo] || '•'}</span>
      <span style="flex:1">${escHtml(a.texto)}</span>
      ${a.area ? `<button class="btn secundario" style="padding:5px 10px;font-size:12px" onclick="adminArea('${a.area}')">Ir</button>` : ''}
    </div>`).join('');
}

function _renderAlarmas() {
  const cont = document.getElementById('alarmasTabla');
  if (!cont) return;
  const filas = listarAlarmas(true);
  if (!filas.length) { cont.innerHTML = '<p class="vacio">Sin recordatorios. Agregá uno arriba.</p>'; return; }
  const hoy = hoyISO();
  const rows = filas.map(a => {
    const vencida = a.estado === 'activa' && a.fecha && a.fecha <= hoy;
    const resuelta = a.estado === 'resuelta';
    const nota = (a.nota || '').trim();
    return `<tr class="${resuelta ? 'fila-inactiva' : ''}">
      <td>${_AVISO_ICON[a.tipo] || '•'} ${escHtml(a.texto)}${nota ? `<div class="muted" style="font-size:12px;margin-top:3px;white-space:pre-line">${escHtml(nota)}</div>` : ''}</td>
      <td>${escHtml(a.fecha || '')}${vencida ? ' <span class="badge-inactivo">vencido</span>' : ''}</td>
      <td>${resuelta ? '<span class="muted">resuelto</span>' : '<span class="badge-warn">activo</span>'}</td>
      <td class="acc">
        <button onclick="editarAlarmaUI(${a.id})">✏️</button>
        <button onclick="resolverAlarmaUI(${a.id})">${resuelta ? 'Reactivar' : 'Resolver'}</button>
        <button class="danger" onclick="eliminarAlarmaUI(${a.id})">🗑</button>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `<table class="tabla"><thead><tr><th>Recordatorio</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function actualizarBadgeAvisos() {
  const b = document.getElementById('avisosBadge');
  if (!b) return;
  const n = (typeof totalAvisos === 'function') ? totalAvisos() : 0;
  b.textContent = n;
  b.style.display = n > 0 ? '' : 'none';
}

// id del recordatorio en edición (null = alta nueva).
let _editAlarmaId = null;

function agregarAlarmaUI() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const datos = { texto: val('alarma_texto'), nota: val('alarma_nota'), fecha: val('alarma_fecha') || hoyISO(), tipo: val('alarma_tipo') };
  try {
    if (_editAlarmaId != null) editarAlarma(_editAlarmaId, datos);
    else crearAlarma(datos);
  } catch (e) { avisoUI(e.message); return; }
  _resetFormAlarma();
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderAvisos();
}

function editarAlarmaUI(id) {
  const a = DB.alarmas.find(x => x.id === Number(id));
  if (!a) { avisoUI('No se encontró el recordatorio.'); return; }
  _editAlarmaId = a.id;
  const set = (elid, v) => { const el = document.getElementById(elid); if (el) el.value = v; };
  set('alarma_texto', a.texto || '');
  set('alarma_nota', a.nota || '');
  set('alarma_fecha', a.fecha || '');
  set('alarma_tipo', a.tipo || 'importante');
  const btn = document.getElementById('alarma_btn'); if (btn) btn.textContent = 'Guardar cambios';
  const canc = document.getElementById('alarma_cancelar'); if (canc) canc.style.display = '';
  const el = document.getElementById('alarma_texto'); if (el) { try { el.focus(); el.scrollIntoView({ block: 'center' }); } catch (e) {} }
}

function cancelarEdicionAlarmaUI() { _resetFormAlarma(); }

function _resetFormAlarma() {
  _editAlarmaId = null;
  ['alarma_texto', 'alarma_nota', 'alarma_fecha'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const btn = document.getElementById('alarma_btn'); if (btn) btn.textContent = '+ Agregar';
  const canc = document.getElementById('alarma_cancelar'); if (canc) canc.style.display = 'none';
}

function resolverAlarmaUI(id) { resolverAlarma(id); if (typeof sincronizarUI === 'function') sincronizarUI(); else renderAvisos(); }
function eliminarAlarmaUI(id) {
  confirmarUI('¿Eliminar este recordatorio?').then(ok => {
    if (!ok) return;
    eliminarAlarma(id);
    if (typeof sincronizarUI === 'function') sincronizarUI(); else renderAvisos();
  });
}
