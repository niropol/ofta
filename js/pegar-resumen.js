// ═══════════════════════════════════════════════════════════════════════════
//  OFTA — PEGAR RESUMEN: carga diaria por texto (una línea por prestación)
// ───────────────────────────────────────────────────────────────────────────
//  Formato tolerante, una línea por renglón:
//     <cantidad> <prestación> <obra social>
//  Ej.:  "5 consultas IOMA"  ·  "3 OCT OSDE"  ·  "2 campo visual particular"
//  La cantidad es opcional (default 1). La obra social se detecta si aparece un
//  nombre de OS conocido (o "particular"); si no, queda Particular. La prestación
//  se matchea con el catálogo por similitud. Las CIRUGÍAS se cargan aparte (una a
//  una, con paciente), así que se marcan como problema. Nada se aplica sin confirmar.
// ═══════════════════════════════════════════════════════════════════════════

function _escRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function parsearResumenDiario(texto) {
  const items = (typeof listarPrestaciones === 'function' ? listarPrestaciones({ incluirInactivos: false }) : [])
    .filter(n => n.categoria !== 'insumo');
  const osNames = ['Particular', ...((typeof getObrasSocialesActivas === 'function' ? getObrasSocialesActivas() : []).map(o => o.nombre))];
  const lineas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  return lineas.map((linea, i) => {
    const m = linea.match(/^(\d+)\s+(.*)$/);
    const cantidad = m ? Math.max(1, parseInt(m[1], 10)) : 1;
    let resto = m ? m[2].trim() : linea;

    // Detectar OS (nombre conocido en cualquier parte de la línea).
    let obraSocial = 'Particular';
    for (const n of osNames) {
      if (!n) continue;
      const re = new RegExp('\\b' + _escRegExp(n) + '\\b', 'i');
      if (re.test(resto)) { obraSocial = n; resto = resto.replace(re, ' ').replace(/\s+/g, ' ').trim(); break; }
    }
    const prestTxt = resto;

    // Matchear prestación contra el catálogo: similitud + coincidencia por palabra
    // (tolera plurales y prefijos, ej. "consultas"→"Consulta", "OCT"→"OCT de mácula").
    let grupo = null, descripcion = prestTxt, categoria = '';
    if (prestTxt && items.length && typeof similitudTexto === 'function') {
      const norm = s => (typeof _normContrato === 'function') ? _normContrato(s) : String(s).toLowerCase();
      const qWords = norm(prestTxt).split(' ').filter(Boolean);
      const rank = items.map(it => {
        let s = similitudTexto(prestTxt, it.descripcion);
        const dWords = norm(it.descripcion).split(' ').filter(Boolean);
        const hit = qWords.some(qw => dWords.some(dw =>
          dw === qw || dw.startsWith(qw) || qw.startsWith(dw) || (qw.length > 4 && dw.startsWith(qw.slice(0, -1)))));
        if (hit) s = Math.max(s, 0.8);
        return { it, score: s };
      }).sort((a, b) => b.score - a.score);
      const best = rank[0];
      if (best && best.score >= 0.5) { grupo = best.it.grupo; descripcion = best.it.descripcion; categoria = best.it.categoria; }
    }
    if (!categoria) categoria = (typeof clasificarPrestacionOFTA === 'function' ? clasificarPrestacionOFTA(prestTxt).categoria : '');

    let problema = null;
    if (!prestTxt) problema = 'línea vacía';
    else if (!grupo) problema = 'prestación no reconocida en el catálogo';
    else if (categoria === 'cirugia') problema = 'las cirugías se cargan individualmente (con paciente)';

    return { fila: i + 1, cantidad, prestTxt, obraSocial, grupo, descripcion, categoria, problema };
  });
}

// Aplica las líneas OK como prestaciones de la carga diaria (por médico/fecha).
function aplicarResumenDiario(plan, { fecha, medicoRealizadorId }) {
  const res = { ok: 0, unidades: 0, omitidas: 0, errores: [] };
  (plan || []).forEach(p => {
    if (p.problema) { res.omitidas++; return; }
    try {
      registrarPrestacion({
        fecha: fecha || hoyISO(),
        categoria: p.categoria,
        grupoNomenclador: p.grupo,
        obraSocial: p.obraSocial,
        medicoRealizadorId: medicoRealizadorId || null,
        cantidad: p.cantidad,
      });
      res.ok++; res.unidades += p.cantidad;
    } catch (e) { res.errores.push({ fila: p.fila, motivo: e.message }); }
  });
  return res;
}
