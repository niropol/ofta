// ═══════════════════════════════════════════════════════════════════════════
//  SAM — UI de DIAGNÓSTICO (Etapa 9): botones de verificación en Admin
// ═══════════════════════════════════════════════════════════════════════════

function _diagBox() { return document.getElementById('diagResultado'); }

// Verificar cálculos (self-tests del motor).
function uiVerificarCalculos() {
  const cont = _diagBox();
  if (!cont) return;
  const { resultados, pasaron, total } = runSelfTests();
  const filas = resultados.map(x => `
    <tr>
      <td>${x.ok ? '✅' : '❌'}</td>
      <td>${escHtml(x.nombre)}</td>
      <td class="num muted">${x.ok ? '' : 'obtuvo ' + escHtml(String(x.real)) + ' (esperaba ' + escHtml(String(x.esperado)) + ')'}</td>
    </tr>`).join('');
  const todo = pasaron === total;
  cont.innerHTML = `
    <div class="${todo ? 'diag-ok' : 'diag-err'}">${todo ? '✅' : '⚠️'} Cálculos: <strong>${pasaron}/${total}</strong> correctos.</div>
    <table class="tabla"><tbody>${filas}</tbody></table>`;
}

// Diagnóstico de integridad de datos.
function uiDiagnosticoDatos() {
  const cont = _diagBox();
  if (!cont) return;
  const { issues, resumen } = diagnosticoDatos();
  const resumenHTML = '<ul>' + resumen.map(s => `<li class="muted">${escHtml(s)}</li>`).join('') + '</ul>';
  if (issues.length === 0) {
    cont.innerHTML = `<div class="diag-ok">✅ Integridad OK: no se encontraron datos huérfanos ni inconsistencias.</div>${resumenHTML}`;
    return;
  }
  const li = issues.map(s => `<li>${escHtml(s)}</li>`).join('');
  cont.innerHTML = `<div class="diag-err">⚠️ Se encontraron ${issues.length} problema(s):</div><ul>${li}</ul>${resumenHTML}`;
}

// Verificar que todo está en la nube.
async function uiVerificarNube() {
  const cont = _diagBox();
  if (!cont) return;
  const est = estadoNube();
  if (!est.hayCredenciales) {
    cont.innerHTML = `<div class="diag-err">☁️ Todavía no hay conexión a la nube (falta cargar las credenciales de Supabase, Etapa 10). Los datos viven en este navegador hasta entonces.</div>`;
    return;
  }
  cont.innerHTML = '<p class="muted">Guardando y verificando contra la nube…</p>';
  let res;
  try { res = await verificarNube(); } catch (e) { cont.innerHTML = `<div class="diag-err">Error: ${escHtml(e.message)}</div>`; return; }
  if (!res.conectado) { cont.innerHTML = `<div class="diag-err">No se pudo conectar a la nube.</div>`; return; }
  if (res.error) { cont.innerHTML = `<div class="diag-err">Error al leer la nube: ${escHtml(res.error)}</div>`; return; }
  const filas = res.detalle.map(d => `
    <tr><td>${d.ok ? '✅' : '❌'}</td><td>${escHtml(d.coleccion)}</td>
      <td class="num">${d.local}</td><td class="num">${d.nube}</td></tr>`).join('');
  cont.innerHTML = `
    <div class="${res.todoOk ? 'diag-ok' : 'diag-err'}">${res.todoOk ? '✅ Todo está guardado en la nube.' : '⚠️ Hay diferencias entre lo local y la nube.'}</div>
    <table class="tabla"><thead><tr><th></th><th>Colección</th><th class="num">Local</th><th class="num">Nube</th></tr></thead><tbody>${filas}</tbody></table>`;
}

// ── Copia de seguridad (backup/restore JSON) ──
function descargarBackupUI() {
  try {
    const dump = exportarBackupObj();
    const blob = new Blob([JSON.stringify(dump, null, 0)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ofta_backup_' + hoyISO() + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const box = _diagBox(); if (box) box.innerHTML = '<div class="diag-ok">✅ Copia descargada (ofta_backup_' + hoyISO() + '.json). Guardala en un lugar seguro.</div>';
  } catch (e) {
    const box = _diagBox(); if (box) box.innerHTML = '<div class="diag-err">No se pudo generar la copia: ' + escHtml(e.message) + '</div>';
  }
}

function restaurarBackupUI(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let dump;
    try { dump = JSON.parse(e.target.result); }
    catch (err) { alert('No se pudo leer el archivo JSON: ' + err.message); input.value = ''; return; }
    const registros = (typeof COLECCIONES !== 'undefined' ? COLECCIONES : []).reduce((s, c) => s + (Array.isArray(dump[c]) ? dump[c].length : 0), 0);
    confirmarUI('Restaurar esta copia REEMPLAZA todos los datos actuales por los del archivo (' + registros + ' registro/s). ¿Continuar?').then(ok => {
      input.value = '';
      if (!ok) return;
      let r;
      try { r = importarBackupObj(dump); }
      catch (err) { alert('No se pudo restaurar: ' + err.message); return; }
      if (typeof sincronizarUI === 'function') sincronizarUI();
      const box = _diagBox(); if (box) box.innerHTML = '<div class="diag-ok">✅ Copia restaurada: ' + r.registros + ' registro/s en ' + r.colecciones + ' colección(es).</div>';
    });
  };
  reader.readAsText(file);
}
