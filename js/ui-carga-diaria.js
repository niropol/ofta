// ═══════════════════════════════════════════════════════════════════════════
//  SAM — CARGA DIARIA (parte visible, uso de la secretaria)
// ───────────────────────────────────────────────────────────────────────────
//  Pantalla pensada para el ritmo real de carga:
//    • Consultas y estudios → alta rápida por paciente (elegís día + médico una
//      vez, después solo tipo + paciente y "+ Agregar"). Valor único, sin OS que
//      cambie la plata.
//    • Prácticas → una por una, con su médico derivador.
//    • Cirugías → detalle completo (insumo, derivador) en el modal de siempre.
//  Debajo, "Cargado el <día>" muestra lo del día para revisar/corregir.
//  Todo reusa registrarPrestacion() y compañía (prestaciones.js).
// ═══════════════════════════════════════════════════════════════════════════

function _cdGet(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function _cdSet(id, v) { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }

// Opciones de consultas + estudios del nomenclador, agrupadas, con precio a la fecha.
function _optsConsultaEstudio(fecha, sel) {
  const grupos = [['consulta', 'Consultas'], ['realizacion_estudio', 'Estudios']];
  let html = '<option value="">Elegí consulta o estudio…</option>';
  grupos.forEach(([cat, label]) => {
    const items = listarPrestaciones({ categoria: cat, incluirInactivos: false });
    if (!items.length) return;
    html += `<optgroup label="${escHtml(label)}">` + items.map(v => {
      const pv = precioVigente(v.grupo, fecha);
      const p = pv ? fmtMoneda(pv.precio, pv.moneda) : 'sin precio a la fecha';
      return `<option value="${v.grupo}"${v.grupo === sel ? ' selected' : ''}>${escHtml(v.descripcion)} — ${p}</option>`;
    }).join('') + '</optgroup>';
  });
  return html;
}

function cdSedeChange() {
  const el = document.getElementById('cd_consultorio');
  if (el) el.innerHTML = _optsConsultorios(Number(_cdGet('cd_sede')));
}

// ── Render principal: puebla selects (preservando lo elegido) y la tabla del día ──
function renderCargaDiaria() {
  const cont = document.getElementById('cd_tabla');
  if (!cont) return; // la sección no está en el DOM (tests de otras cosas)

  // Día por defecto = hoy.
  if (!_cdGet('cd_fecha')) _cdSet('cd_fecha', hoyISO());
  const fecha = _cdGet('cd_fecha');

  // Preservar selección actual de cada select antes de repoblar.
  const prev = {
    medico: _cdGet('cd_medico'), sede: _cdGet('cd_sede'), consultorio: _cdGet('cd_consultorio'),
    ceTipo: _cdGet('cd_ce_tipo'), ceOs: _cdGet('cd_ce_os'),
    prTipo: _cdGet('cd_pr_tipo'), prOs: _cdGet('cd_pr_os'), prDeriv: _cdGet('cd_pr_deriv'),
  };
  const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  setHTML('cd_medico', _optsMedicos(prev.medico ? Number(prev.medico) : null, true, '— Elegí médico —'));
  const sede = prev.sede ? Number(prev.sede) : sedeActiva();
  setHTML('cd_sede', _optsSedes(sede));
  setHTML('cd_consultorio', _optsConsultorios(sede, prev.consultorio ? Number(prev.consultorio) : null));
  setHTML('cd_ce_tipo', _optsConsultaEstudio(fecha, prev.ceTipo ? Number(prev.ceTipo) : null));
  setHTML('cd_ce_os', _optsOS(prev.ceOs || 'Particular'));
  setHTML('cd_pr_tipo', _optsPrestacionesCat('practica', fecha, prev.prTipo ? Number(prev.prTipo) : null));
  setHTML('cd_pr_os', _optsOS(prev.prOs || 'Particular'));
  setHTML('cd_pr_deriv', _optsMedicos(prev.prDeriv ? Number(prev.prDeriv) : null, true, '— sin derivación —'));

  const lbl = document.getElementById('cd_fecha_lbl');
  if (lbl) lbl.textContent = fecha || '—';

  // Tabla de lo cargado ese día.
  const filas = DB.prestacionesRealizadas
    .filter(r => r.fecha === fecha)
    .sort((a, b) => b.id - a.id);
  if (filas.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no cargaste nada para este día.</p>';
    return;
  }
  const rows = filas.map(r => {
    const anulada = r.estado === 'anulada';
    const i = (typeof ingresoSAMDePrestacion === 'function') ? ingresoSAMDePrestacion(r) : { ingreso: 0 };
    const deriv = r.medicoDerivadorId ? medicoNombre(r.medicoDerivadorId) : '—';
    return `
    <tr class="${anulada ? 'fila-inactiva' : ''}">
      <td>${escHtml(_catLabel(r.categoria))}</td>
      <td>${escHtml(r.descripcion)}${anulada ? ' <span class="badge-inactivo">Anulada</span>' : ''}</td>
      <td>${escHtml(r.obraSocial)}</td>
      <td>${escHtml(r.pacienteNombre || '—')}</td>
      <td>${escHtml(medicoNombre(r.medicoRealizadorId))}</td>
      <td>${escHtml(deriv)}</td>
      <td class="num muted">${r.obraSocial === 'Particular' ? '—' : fmtMoneda(i.ingreso, 'ARS')}</td>
      <td class="acc">
        ${anulada
          ? `<button onclick="reactivarPrestacionUI(${r.id})">Reactivar</button>`
          : `<button onclick="editarPrestacionRealizadaUI(${r.id})">Editar</button>
             <button onclick="anularPrestacionUI(${r.id})">Anular</button>`}
        <button class="danger" onclick="eliminarPrestacionRealizadaUI(${r.id})">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr>
        <th>Tipo</th><th>Descripción</th><th>Obra social</th><th>Paciente</th>
        <th>Realizador</th><th>Derivador</th><th class="num">SAM 40%</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted" style="margin-top:8px">${filas.length} cargada(s) el ${escHtml(fecha)}.</p>`;
}

// Día + médico + sede/consultorio comunes a los altas rápidas.
function _cdComun() {
  const fecha = _cdGet('cd_fecha');
  const medico = _cdGet('cd_medico');
  if (!fecha) { alert('Elegí el día.'); return null; }
  if (!medico) { alert('Elegí el médico realizador.'); return null; }
  return {
    fecha, medicoRealizadorId: medico,
    sedeId: Number(_cdGet('cd_sede')) || sedeActiva(),
    consultorioId: _cdGet('cd_consultorio') || null,
  };
}

// Alta rápida de consulta / estudio (la categoría sale del ítem del nomenclador).
function cdAgregarCE() {
  const base = _cdComun(); if (!base) return;
  const grupo = _cdGet('cd_ce_tipo');
  if (!grupo) { alert('Elegí la consulta o el estudio.'); return; }
  const cat = (versionActual(Number(grupo)) || {}).categoria;
  try {
    registrarPrestacion({
      ...base, categoria: cat, grupoNomenclador: grupo,
      obraSocial: _cdGet('cd_ce_os') || 'Particular',
      paciente: { apellido: _cdGet('cd_ce_ap'), nombre: _cdGet('cd_ce_nom'), dni: _cdGet('cd_ce_dni') },
    });
  } catch (e) { alert(e.message); return; }
  ['cd_ce_ap', 'cd_ce_nom', 'cd_ce_dni'].forEach(id => _cdSet(id, '')); // limpiar paciente, conservar tipo/OS
  renderCargaDiaria();
}

// Alta de práctica (una por una) con su médico derivador.
function cdAgregarPractica() {
  const base = _cdComun(); if (!base) return;
  const grupo = _cdGet('cd_pr_tipo');
  if (!grupo) { alert('Elegí la práctica.'); return; }
  try {
    registrarPrestacion({
      ...base, categoria: 'practica', grupoNomenclador: grupo,
      obraSocial: _cdGet('cd_pr_os') || 'Particular',
      medicoDerivadorId: _cdGet('cd_pr_deriv') || null,
      paciente: { apellido: _cdGet('cd_pr_ap'), nombre: _cdGet('cd_pr_nom'), dni: _cdGet('cd_pr_dni') },
    });
  } catch (e) { alert(e.message); return; }
  ['cd_pr_ap', 'cd_pr_nom', 'cd_pr_dni'].forEach(id => _cdSet(id, ''));
  renderCargaDiaria();
}

// Cirugía: abre el modal completo (insumos + derivador) con día/médico prellenados.
function cdNuevaCirugia() {
  const base = _cdComun(); if (!base) return;
  abrirNuevaPrestacionRealizada({
    categoria: 'cirugia', fecha: base.fecha, medicoRealizadorId: base.medicoRealizadorId,
    sedeId: base.sedeId, consultorioId: base.consultorioId,
  });
}
