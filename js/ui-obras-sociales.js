// ═══════════════════════════════════════════════════════════════════════════
//  SAM — ABM DE OBRAS SOCIALES
// ───────────────────────────────────────────────────────────────────────────
//  Alta / edición / baja de obras sociales. Las prestaciones guardan la OS por
//  NOMBRE (string), así que renombrar propaga y borrar se bloquea si está en uso.
//  "Particular" es un valor implícito siempre disponible (no hace falta cargarlo).
// ═══════════════════════════════════════════════════════════════════════════

// Cuántas prestaciones usan una OS (por nombre) — para bloquear el borrado.
function _referenciasOS(nombre) {
  return DB.prestacionesRealizadas.filter(p => (p.obraSocial || '') === nombre).length;
}

// Nombres de OS activas (para el datalist del alta de prestaciones).
function getObrasSocialesActivas() {
  return DB.obrasSociales.filter(o => o.estado !== 'Inactiva');
}

// Rellena el <datalist id="osList"> con Particular + las OS activas.
function poblarDatalistOS() {
  const dl = document.getElementById('osList');
  if (!dl) return;
  const nombres = ['Particular', ...getObrasSocialesActivas().map(o => o.nombre)];
  dl.innerHTML = nombres.map(n => `<option value="${escHtml(n)}"></option>`).join('');
}

// ── Render de la tabla ──
function renderOS() {
  const cont = document.getElementById('osTabla');
  if (!cont) return;
  const lista = [...DB.obrasSociales].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  if (lista.length === 0) {
    cont.innerHTML = '<p class="vacio">No hay obras sociales cargadas. Usá «+ Nueva obra social». (Igual siempre podés cargar prestaciones como «Particular».)</p>';
    return;
  }
  const rows = lista.map(o => {
    const inactiva = o.estado === 'Inactiva';
    return `
    <tr class="${inactiva ? 'fila-inactiva' : ''}">
      <td>${escHtml(o.nombre)}${inactiva ? ' <span class="badge-inactivo">Inactiva</span>' : ''}</td>
      <td>${escHtml(o.codigo || '—')}</td>
      <td class="acc">
        <button onclick="editarOS(${o.id})">Editar</button>
        <button onclick="toggleEstadoOS(${o.id})">${inactiva ? 'Reactivar' : 'Inactivar'}</button>
        <button class="danger" onclick="eliminarOSUI(${o.id})">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Obra social</th><th>Código</th><th>Acciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Modal ──
function _mostrarModalOS(on) { const m = document.getElementById('modalOS'); if (m) m.style.display = on ? 'flex' : 'none'; }
function cerrarModalOS() { _mostrarModalOS(false); }

function abrirNuevaOS() {
  document.getElementById('modalOSTitulo').textContent = 'Nueva obra social';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('os_id', ''); set('os_nombre', ''); set('os_codigo', ''); set('os_estado', 'Activa'); set('os_modalidadIVA', 'ambas');
  _mostrarModalOS(true);
}

function editarOS(id) {
  const o = DB.obrasSociales.find(x => x.id === Number(id));
  if (!o) return;
  document.getElementById('modalOSTitulo').textContent = 'Editar obra social';
  const set = (idf, v) => { const el = document.getElementById(idf); if (el) el.value = v == null ? '' : v; };
  set('os_id', o.id); set('os_nombre', o.nombre); set('os_codigo', o.codigo); set('os_estado', o.estado || 'Activa'); set('os_modalidadIVA', o.modalidadIVA || 'ambas');
  _mostrarModalOS(true);
}

function guardarOS() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const nombre = val('os_nombre');
  if (!nombre) { avisoUI('El nombre de la obra social es obligatorio.'); return false; }
  const idEdit = val('os_id') ? Number(val('os_id')) : null;

  // Evitar duplicados por nombre (case-insensitive), salvo el que se está editando.
  const dup = DB.obrasSociales.find(o => (o.nombre || '').toLowerCase() === nombre.toLowerCase() && o.id !== idEdit);
  if (dup) { avisoUI('Ya existe una obra social con ese nombre.'); return false; }

  const datos = { nombre, codigo: val('os_codigo'), estado: val('os_estado') || 'Activa', modalidadIVA: val('os_modalidadIVA') || 'ambas' };

  if (idEdit) {
    const o = DB.obrasSociales.find(x => x.id === idEdit);
    if (!o) return false;
    const antes = JSON.parse(JSON.stringify(o));
    const nombreViejo = o.nombre;
    Object.assign(o, datos);
    // Propagar el renombre a las prestaciones que la usan (OS por nombre).
    if (nombreViejo !== o.nombre) {
      DB.prestacionesRealizadas.forEach(p => { if (p.obraSocial === nombreViejo) p.obraSocial = o.nombre; });
      marcarCambios('prestacionesRealizadas');
    }
    registrarAuditoria('edicion', 'obraSocial', o.id, antes, o);
    marcarCambios('obrasSociales');
    cerrarModalOS(); renderOS(); poblarDatalistOS();
    return o;
  }

  const nuevo = { id: nuevoId(), ...datos, creadoEn: new Date().toISOString() };
  DB.obrasSociales.push(nuevo);
  registrarAuditoria('alta', 'obraSocial', nuevo.id, null, nuevo);
  marcarCambios('obrasSociales');
  cerrarModalOS(); renderOS(); poblarDatalistOS();
  return nuevo;
}

function toggleEstadoOS(id) {
  const o = DB.obrasSociales.find(x => x.id === Number(id));
  if (!o) return;
  const antes = JSON.parse(JSON.stringify(o));
  o.estado = (o.estado === 'Inactiva') ? 'Activa' : 'Inactiva';
  registrarAuditoria('edicion', 'obraSocial', o.id, antes, o);
  marcarCambios('obrasSociales');
  renderOS(); poblarDatalistOS();
  return o;
}

// Motor: elimina si no está en uso y devuelve true/false (sin confirmación).
function eliminarOS(id) {
  const o = DB.obrasSociales.find(x => x.id === Number(id));
  if (!o) return false;
  const ref = _referenciasOS(o.nombre);
  if (ref > 0) {
    avisoUI(`No se puede eliminar "${o.nombre}": hay ${ref} prestación(es) que la usan. Inactivala en su lugar.`);
    return false;
  }
  const antes = JSON.parse(JSON.stringify(o));
  DB.obrasSociales = DB.obrasSociales.filter(x => x.id !== o.id);
  registrarAuditoria('baja', 'obraSocial', o.id, antes, null);
  marcarCambios('obrasSociales');
  return true;
}
// UI: confirma y refresca.
function eliminarOSUI(id) {
  const o = DB.obrasSociales.find(x => x.id === Number(id));
  if (!o) return;
  if (_referenciasOS(o.nombre) > 0) { eliminarOS(id); return; }  // muestra el aviso de bloqueo
  confirmarUI(`¿Eliminar definitivamente la obra social "${o.nombre}"? Queda registrado en auditoría.`).then(ok => {
    if (!ok) return;
    if (eliminarOS(id) && typeof sincronizarUI === 'function') sincronizarUI(); else { renderOS(); poblarDatalistOS(); }
  });
}
