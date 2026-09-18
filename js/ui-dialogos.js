// ═══════════════════════════════════════════════════════════════════════════
//  SAM — DIÁLOGOS IN-APP (confirmar / documento imprimible / copiar texto)
// ───────────────────────────────────────────────────────────────────────────
//  Reemplazan a confirm(), window.open() y navigator.clipboard, que muchos
//  navegadores (y el panel embebido) bloquean. Todo pasa dentro de la app:
//   · confirmarUI(msg)            → Promise<boolean> (modal Sí/No)
//   · mostrarDocModal(tit, html)  → comprobante/informe con botón Imprimir/PDF
//   · copiarTextoUI(tit, texto)   → textarea seleccionable + botón Copiar
// ═══════════════════════════════════════════════════════════════════════════

// ── Confirmación ──
let _confirmResolver = null;
function confirmarUI(mensaje) {
  const modal = document.getElementById('modalConfirm');
  if (!modal) return Promise.resolve(typeof confirm === 'function' ? confirm(mensaje) : true);
  return new Promise(resolve => {
    _confirmResolver = resolve;
    const m = document.getElementById('confirmMsg');
    if (m) m.textContent = mensaje;
    modal.style.display = 'flex';
  });
}
function _confirmResp(ok) {
  const modal = document.getElementById('modalConfirm');
  if (modal) modal.style.display = 'none';
  const r = _confirmResolver; _confirmResolver = null;
  if (r) r(!!ok);
}

// ── Documento imprimible (comprobante / informe) ──
function mostrarDocModal(titulo, contenidoHTML) {
  const modal = document.getElementById('modalDoc');
  const box = document.getElementById('docPrintable');
  const tit = document.getElementById('docModalTitulo');
  if (!modal || !box) { alert('No se pudo abrir el documento.'); return; }
  if (tit) tit.textContent = titulo || 'Documento';
  box.innerHTML = contenidoHTML;
  modal.style.display = 'flex';
}
function cerrarDocModal() { const m = document.getElementById('modalDoc'); if (m) m.style.display = 'none'; }
function imprimirDoc() { try { window.print(); } catch (e) { alert('No se pudo iniciar la impresión en este entorno. Abrí la app en tu navegador para imprimir o guardar en PDF.'); } }

// Compatibilidad: las exportaciones (comprobante, informes, resumen) llamaban a
// esta función que abría un popup. Ahora muestra el documento dentro de la app.
function _abrirVentanaImpresion(titulo, contenidoHTML) { mostrarDocModal(titulo, contenidoHTML); }

// ── Copiar texto (WhatsApp / CSV) ──
function copiarTextoUI(titulo, texto) {
  const modal = document.getElementById('modalCopiar');
  const ta = document.getElementById('copiarTexto');
  const tit = document.getElementById('copiarTitulo');
  if (!modal || !ta) {  // respaldo si no existe el modal
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).catch(() => {});
    return;
  }
  if (tit) tit.textContent = titulo || 'Copiar';
  ta.value = texto;
  modal.style.display = 'flex';
  setTimeout(() => { try { ta.focus(); ta.select(); } catch (e) {} }, 30);
  const est = document.getElementById('copiarEstado');
  if (est) est.textContent = '';
}
function cerrarCopiarModal() { const m = document.getElementById('modalCopiar'); if (m) m.style.display = 'none'; }
function copiarDesdeModal() {
  const ta = document.getElementById('copiarTexto');
  const est = document.getElementById('copiarEstado');
  if (!ta) return;
  try { ta.focus(); ta.select(); } catch (e) {}
  const ok = () => { if (est) est.textContent = '✓ Copiado al portapapeles.'; };
  const fallo = () => {
    try {
      const r = document.execCommand('copy');
      if (est) est.textContent = r ? '✓ Copiado.' : 'Seleccioná el texto y usá Ctrl/Cmd + C.';
    } catch (e) { if (est) est.textContent = 'Seleccioná el texto y usá Ctrl/Cmd + C.'; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).then(ok, fallo);
  } else { fallo(); }
}
