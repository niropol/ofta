// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de PAGOS A MÉDICOS (valores fijos)
// ───────────────────────────────────────────────────────────────────────────
//  Vive en Admin ▸ Pagos a médicos. Dos bloques:
//   1) Valores fijos por tipo (consulta/estudio/cirugía/práctica/derivación):
//      general + override por médico, con vigencia.
//   2) Vista previa: cuánto le toca a cada médico en el mes.
// ═══════════════════════════════════════════════════════════════════════════

function _catValLabel(id) { return (CATEGORIAS_VALOR_MEDICO.find(c => c.id === id) || {}).label || id; }

// ── Pagos a médicos: tabla EDITABLE en el lugar ──
// Un selector arriba elige el alcance: General (todos) o un médico puntual.
// Cada fila muestra el valor actual, editable; "Guardar" corrige en el lugar.
function renderValoresMedico() {
  const cont = document.getElementById('valoresTabla');
  if (!cont) return;

  const sel = document.getElementById('valScope');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">General (todos los médicos)</option>' +
      getMedicosActivos().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
        .map(m => `<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('');
    if (cur) sel.value = cur;
  }
  const mid = (sel && sel.value) ? Number(sel.value) : null;
  const catFiltro = (document.getElementById('valCat') || {}).value || '';
  const q = (((document.getElementById('valBuscar') || {}).value) || '').trim().toLowerCase();
  const coincide = txt => !q || (txt || '').toLowerCase().includes(q);
  // Mes elegido: la tabla muestra los valores vigentes EN ese mes; al guardar, el
  // valor rige desde ese mes. Sin selector → mes actual.
  const mesSel = (document.getElementById('valMes') || {}).value || hoyISO().slice(0, 7);
  const fecha = mesSel + '-01';

  // Sugerencia: menor y promedio de los contratos (entre OS) de cada prestación,
  // y el 40% de cada uno (lo que SAM efectivamente nos paga).
  const pct = (typeof porcentajeSAM === 'function') ? porcentajeSAM() : 40;
  const compMap = {};
  (typeof comparativaContratos === 'function' ? comparativaContratos(fecha) : []).forEach(r => { compMap[r.grupo] = r; });
  const p40 = v => Math.floor(v * pct / 100);
  const celdaSug = grupo => {
    const r = grupo != null ? compMap[grupo] : null;
    if (!r) return '<td class="muted">—</td><td class="muted">—</td>';
    return `<td class="muted" title="Contrato más barato entre obras sociales">${fmtMoneda(r.menorValor, 'ARS')} <span style="font-size:11px">(${escHtml(r.menorOS)})</span><br><span style="font-size:11px">${pct}%: <strong>${fmtMoneda(p40(r.menorValor), 'ARS')}</strong></span></td>`
      + `<td class="muted" title="Promedio de los contratos${r.cantidadOS > 1 ? ' de ' + r.cantidadOS + ' OS' : ''}">${fmtMoneda(r.promedio, 'ARS')}<br><span style="font-size:11px">${pct}%: <strong>${fmtMoneda(p40(r.promedio), 'ARS')}</strong></span></td>`;
  };

  // Etiqueta de un valor según su modo: "$12.000" (fijo) o "20%" (porcentaje).
  const valLabel = v => v == null ? '—' : (v.modo === 'pct' ? (v.valor + '%') : fmtMoneda(v.valor, 'ARS'));

  // Fila editable de un valor por categoría (+ grupo opcional = tipo puntual).
  const fila = (label, categoria, grupo) => {
    const gen = valorMedicoVigente(categoria, null, fecha, grupo);
    let shown = gen;                 // registro que se muestra / edita en esta fila
    let valorInput = gen ? gen.valor : '';
    // "rige desde" de la versión mostrada (para saber qué valor correspondía al mes).
    const vigDesde = vigenciaValorMedico(categoria, mid, fecha, grupo) || vigenciaValorMedico(categoria, null, fecha, grupo);
    const rige = vigDesde ? `<span style="font-size:11px" title="Este valor rige desde ese mes">rige desde ${escHtml(vigDesde.slice(0, 7))}</span>` : '';
    let hint = rige;
    if (mid != null) {
      const propio = valorMedicoVigente(categoria, mid, fecha, grupo);
      const esOverride = propio && /^medico/.test(propio.origen);
      shown = esOverride ? propio : null;
      valorInput = esOverride ? propio.valor : '';
      hint = (gen ? `general ${valLabel(gen)} · ` : 'sin general · ') + rige;
    }
    const modo = shown ? (shown.modo || 'fijo') : 'fijo';
    const id = 'vm_' + categoria + '_' + (grupo || 'g') + '_' + (mid || 'gen');
    // Rojo si el pago supera lo que SAM te deja: en $ = 40% del contrato más barato; en % = el propio 40%.
    const r = grupo != null ? compMap[grupo] : null;
    const techo = r ? p40(r.menorValor) : null;
    const efectivo = Number((valorInput !== '' && valorInput != null) ? valorInput : (gen ? gen.valor : 0)) || 0;
    const excede = modo === 'pct' ? (efectivo > pct) : (techo != null && efectivo > techo);
    const avisoTit = modo === 'pct'
      ? 'Pagás más del ' + pct + '% (lo que SAM te deja por la prestación)'
      : (techo != null ? 'Pagás más que el ' + pct + '% del contrato más barato (' + fmtMoneda(techo, 'ARS') + ')' : '');
    const inpStyle = excede ? 'width:88px;border:2px solid var(--danger);background:#fdecec' : 'width:88px';
    return `<tr>
      <td>${escHtml(label)}${excede ? ' <span title="' + avisoTit + '" style="color:var(--danger)">⚠</span>' : ''}</td>
      <td><div style="display:flex;gap:4px;align-items:center">
        <input type="number" step="0.01" id="${id}" value="${valorInput}" style="${inpStyle}" placeholder="${mid != null ? '(usa el general)' : 'sin definir'}">
        <select id="${id}_modo" style="width:48px" title="Monto fijo ($) o porcentaje (%) del valor de la prestación">
          <option value="fijo"${modo === 'fijo' ? ' selected' : ''}>$</option>
          <option value="pct"${modo === 'pct' ? ' selected' : ''}>%</option>
        </select>
      </div></td>
      ${celdaSug(grupo)}
      <td class="muted">${hint}</td>
      <td class="acc"><button onclick="guardarValorInlineUI('${categoria}',${grupo || 'null'},${mid || 'null'},'${id}')">Guardar</button></td>
    </tr>`;
  };

  const encabezado = titulo => `<tr><td colspan="6" style="background:#f8fafc;font-weight:600">${escHtml(titulo)}</td></tr>`;

  // Bloque de una categoría: fila «general» (respaldo) + una fila por tipo del nomenclador.
  const bloque = (categoria, titulo, items, etiquetaGeneral) => {
    const rows = [];
    if (coincide('general ' + titulo)) rows.push(fila(etiquetaGeneral || ('General — toda la categoría'), categoria, null));
    items.filter(it => coincide(it.descripcion)).forEach(it => rows.push(fila(it.descripcion, categoria, it.grupo)));
    return rows.length ? encabezado(titulo) + rows.join('') : '';
  };

  const consultas = listarPrestaciones({ categoria: 'consulta', incluirInactivos: false });
  const estudios = listarPrestaciones({ categoria: 'realizacion_estudio', incluirInactivos: false });
  const practicas = listarPrestaciones({ categoria: 'practica', incluirInactivos: false });
  const cirugias = listarPrestaciones({ categoria: 'cirugia', incluirInactivos: false });

  const mostrar = c => !catFiltro || catFiltro === c;
  let cuerpo = '';
  if (mostrar('consulta')) cuerpo += bloque('consulta', 'Consultas', consultas, 'Consulta (valor general)');
  if (mostrar('realizacion_estudio')) cuerpo += bloque('realizacion_estudio', 'Estudios', estudios, 'Estudio (valor general)');
  if (mostrar('practica')) cuerpo += bloque('practica', 'Prácticas', practicas, 'Práctica (valor general)');
  if (mostrar('cirugia')) cuerpo += bloque('cirugia', 'Cirugías', cirugias, 'Cirugía (valor general)');

  // Derivación: valor al derivador. General siempre; por tipo al filtrar «Derivaciones».
  if (mostrar('derivacion')) {
    const rows = [];
    if (coincide('general derivacion derivación')) rows.push(fila('Derivación (valor general)', 'derivacion', null));
    if (catFiltro === 'derivacion') {
      [...cirugias, ...estudios, ...practicas]
        .filter(it => coincide(it.descripcion))
        .forEach(it => rows.push(fila('↪ ' + it.descripcion, 'derivacion', it.grupo)));
    }
    if (rows.length) cuerpo += encabezado('Derivaciones (al médico que deriva)') + rows.join('');
  }

  // Insumos: pago fijo por colocarlos (siempre general, no por médico).
  if (mid == null && mostrar('insumo')) {
    const insumos = listarPrestaciones({ categoria: 'insumo', incluirInactivos: false })
      .filter(v => coincide(v.descripcion));
    if (insumos.length) {
      cuerpo += encabezado('Insumos (pago por colocarlos)') + insumos.map(v => `
        <tr>
          <td>${escHtml(v.descripcion)}</td>
          <td><input type="number" step="0.01" id="vmi_${v.grupo}" value="${v.honorarioMedico != null ? v.honorarioMedico : ''}" style="width:120px" placeholder="0"></td>
          <td class="muted">—</td>
          <td class="muted">—</td>
          <td class="muted">por colocarlo</td>
          <td class="acc"><button onclick="guardarHonInsumoInlineUI(${v.grupo})">Guardar</button></td>
        </tr>`).join('');
    }
  }

  if (!cuerpo) cuerpo = '<tr><td colspan="6" class="muted">Sin prestaciones para ese filtro. Cargá el nomenclador/contratos primero.</td></tr>';

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Prestación</th><th>Pago al médico</th><th>Menor contrato</th><th>Promedio contratos</th><th></th><th></th></tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    <p class="muted" style="margin-top:6px"><span style="color:var(--danger)">⚠ En rojo</span>: el pago supera el ${pct}% del contrato más barato (pagarías más de lo que SAM te deja por esa prestación). ${mid == null
      ? 'Valores generales (todos los médicos). La fila «valor general» de cada bloque se usa cuando un tipo puntual no tiene valor propio. Elegí un médico arriba para ponerle un valor especial. En «Derivaciones» elegí esa categoría para fijar el pago por tipo derivado.'
      : 'Valor especial para <strong>' + escHtml(medicoNombre(mid)) + '</strong>. Vacío = usa el general. Los insumos son siempre generales.'}</p>`;
}

function guardarValorInlineUI(categoria, grupo, medicoId, inputId) {
  const el = document.getElementById(inputId);
  const v = el ? el.value.trim() : '';
  if (v === '') return;  // vacío = sin cambio (para el override vacío usá "quitar" — próxima)
  const modoEl = document.getElementById(inputId + '_modo');
  const modo = modoEl ? modoEl.value : 'fijo';
  const mes = (document.getElementById('valMes') || {}).value || hoyISO().slice(0, 7);
  try { setValorMedicoDeMes(categoria, medicoId || null, v, mes, grupo || null, modo); }
  catch (e) { avisoUI(e.message); return; }
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderValoresMedico();
  if (typeof ofrecerRecalcularAfectadas === "function") ofrecerRecalcularAfectadas();
}

function guardarHonInsumoInlineUI(grupo) {
  const el = document.getElementById('vmi_' + grupo);
  const v = el ? el.value.trim() : '';
  try { setHonorarioMedicoInsumo(grupo, v === '' ? 0 : v); }
  catch (e) { avisoUI(e.message); return; }
  if (typeof sincronizarUI === 'function') sincronizarUI(); else renderValoresMedico();
  if (typeof ofrecerRecalcularAfectadas === "function") ofrecerRecalcularAfectadas();
}

// ── Vista previa de pagos del mes ──
function calcularPreviewHonorarios() {
  const cont = document.getElementById('previewHonorarios');
  if (!cont) return;
  const mesEl = document.getElementById('prevMes');
  const mes = mesEl ? mesEl.value : '';
  if (!mes) { cont.innerHTML = '<p class="muted">Elegí un mes.</p>'; return; }

  const meds = honorariosDelMes(mes);
  if (meds.length === 0) { cont.innerHTML = '<p class="vacio">No hay prestaciones activas en ese mes.</p>'; return; }

  const rows = meds.map(h => {
    const flags = h.faltaValor.length
      ? '<span class="badge-inactivo">falta valor de ' + h.faltaValor.map(c => escHtml(_catValLabel(c))).join(', ') + '</span>'
      : '<span class="muted">ok</span>';
    return `<tr><td>${escHtml(medicoNombre(h.medicoId))}</td><td class="num">${fmtMoneda(h.total, 'ARS')}</td><td>${flags}</td></tr>`;
  }).join('');
  const totalMes = meds.reduce((s, h) => s + h.total, 0);
  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Médico</th><th class="num">Pago (ARS)</th><th>Observaciones</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Total del mes</th><th class="num">${fmtMoneda(totalMes, 'ARS')}</th><th></th></tr></tfoot>
    </table>
    <p class="muted">Vista previa. La liquidación formal, el comprobante y el egreso en caja se hacen en Admin ▸ Liquidaciones.</p>`;
}
