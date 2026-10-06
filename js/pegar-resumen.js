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

// ═══════════════════════════════════════════════════════════════════════════
//  PEGAR RESUMEN — FORMATO TABLA (export por paciente, separado por tabulaciones)
// ───────────────────────────────────────────────────────────────────────────
//  Una fila por paciente. Dos órdenes de columna admitidos (se autodetecta por
//  cantidad de columnas / encabezado):
//   A (9):  Fecha · Nombre · DNI · Médico · Cobertura · Consulta/Práctica · Cirugía · Arancel OS/Pago · Copago
//   B (10): Fecha · Nombre · DNI · Nro Afiliado · Médico · Cobertura · Consulta/Práctica · Cirugía · Arancel OS/Pago · Copago
//  Cada fila trae su propia FECHA y MÉDICO (no se toman de arriba). La prestación
//  sale de «Cirugía» si está completa; si no, de «Consulta/Práctica».
// ═══════════════════════════════════════════════════════════════════════════

function _normTxt(s) {
  return (typeof _normContrato === 'function') ? _normContrato(s)
    : String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// ¿La paste es tabular? (tiene tabulaciones, o un encabezado con rótulos conocidos)
function esResumenTabla(texto) {
  const primera = String(texto || '').split(/\r?\n/).find(l => l.trim()) || '';
  if (primera.includes('\t')) return true;
  const low = primera.toLowerCase();
  return /fecha/.test(low) && /(dni|cobertura|paciente|m[eé]dico)/.test(low);
}

function _matchMedicoTxt(txt) {
  const t = _normTxt(txt); if (!t) return null;
  const meds = (typeof getMedicosActivos === 'function') ? getMedicosActivos() : (DB.medicos || []).filter(m => m.estado !== 'Inactivo');
  let best = null, bs = 0;
  meds.forEach(m => {
    const n = _normTxt(m.nombre);
    let s = (typeof similitudTexto === 'function') ? similitudTexto(txt, m.nombre) : 0;
    if (n === t || n.includes(t) || t.includes(n) || n.split(' ').some(w => w.length > 2 && t.includes(w))) s = Math.max(s, 0.85);
    if (s > bs) { bs = s; best = m; }
  });
  return bs >= 0.5 ? best : null;
}

function _matchOSTxt(txt) {
  const t = _normTxt(txt); if (!t) return 'Particular';
  if (/particular/.test(t)) return 'Particular';
  const osNames = (typeof getObrasSocialesActivas === 'function' ? getObrasSocialesActivas() : []).map(o => o.nombre);
  for (const n of osNames) { const nn = _normTxt(n); if (nn === t || nn.includes(t) || t.includes(nn)) return n; }
  return String(txt || '').trim() || 'Particular';
}

function _matchPrestTxt(txt) {
  const items = (typeof listarPrestaciones === 'function' ? listarPrestaciones({ incluirInactivos: false }) : []).filter(n => n.categoria !== 'insumo');
  if (!txt || !items.length || typeof similitudTexto !== 'function') return { grupo: null, descripcion: txt, categoria: '' };
  const qWords = _normTxt(txt).split(' ').filter(Boolean);
  const rank = items.map(it => {
    let s = similitudTexto(txt, it.descripcion);
    const dWords = _normTxt(it.descripcion).split(' ').filter(Boolean);
    const hit = qWords.some(qw => dWords.some(dw => dw === qw || dw.startsWith(qw) || qw.startsWith(dw) || (qw.length > 4 && dw.startsWith(qw.slice(0, -1)))));
    if (hit) s = Math.max(s, 0.8);
    return { it, score: s };
  }).sort((a, b) => b.score - a.score);
  const best = rank[0];
  if (best && best.score >= 0.5) return { grupo: best.it.grupo, descripcion: best.it.descripcion, categoria: best.it.categoria };
  return { grupo: null, descripcion: txt, categoria: '' };
}

function _parseFechaTabla(txt) {
  const t = String(txt || '').trim();
  let m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
  return null;
}

// ¿Ya hay prestaciones activas cargadas para ese médico en esa fecha?
function fechaMedicoYaCargada(fecha, medicoId) {
  if (!fecha || !medicoId) return false;
  return DB.prestacionesRealizadas.some(r => r.estado === 'activa' && r.fecha === fecha && Number(r.medicoRealizadorId) === Number(medicoId));
}

function parsearResumenTabla(texto) {
  let lineas = String(texto || '').split(/\r?\n/).filter(l => l.trim());
  // Saltar encabezado si la primera fila trae rótulos.
  if (lineas.length && /fecha/i.test(lineas[0]) && /(dni|cobertura|paciente|m[eé]dico)/i.test(lineas[0])) lineas = lineas.slice(1);

  return lineas.map((linea, i) => {
    const cols = linea.split('\t').map(c => c.trim());
    const con10 = cols.length >= 10;   // formato con «Nro Afiliado»
    const idx = con10
      ? { fecha: 0, nombre: 1, dni: 2, afiliado: 3, medico: 4, cobertura: 5, consulta: 6, cirugia: 7, arancel: 8, copago: 9 }
      : { fecha: 0, nombre: 1, dni: 2, afiliado: null, medico: 3, cobertura: 4, consulta: 5, cirugia: 6, arancel: 7, copago: 8 };
    const get = k => (idx[k] != null && cols[idx[k]] != null) ? cols[idx[k]] : '';

    const fechaTxt = get('fecha');
    const fecha = _parseFechaTabla(fechaTxt);
    const paciente = get('nombre');
    const dni = get('dni');
    const afiliado = get('afiliado');
    const medicoTxt = get('medico');
    const coberturaTxt = get('cobertura');
    const cirugiaTxt = get('cirugia');
    const consultaTxt = get('consulta');

    const esCirugia = !!cirugiaTxt;
    const prestTxt = esCirugia ? cirugiaTxt : consultaTxt;

    const med = _matchMedicoTxt(medicoTxt);
    const obraSocial = _matchOSTxt(coberturaTxt);
    const pm = _matchPrestTxt(prestTxt);
    const categoria = esCirugia ? 'cirugia' : pm.categoria;

    let problema = null;
    if (cols.length < 8) problema = 'faltan columnas (esperaba 9 o 10)';
    else if (!prestTxt) problema = 'sin prestación (Consulta/Práctica y Cirugía vacías)';
    else if (!pm.grupo) problema = 'prestación no reconocida en el catálogo';
    else if (!med) problema = 'médico no reconocido';
    else if (!fecha) problema = 'fecha inválida';

    return {
      fila: i + 1, fecha, fechaTxt, paciente, dni, afiliado,
      medicoTxt, medicoId: med ? med.id : null, medicoNombre: med ? med.nombre : medicoTxt,
      obraSocial, prestTxt, grupo: pm.grupo, descripcion: pm.grupo ? pm.descripcion : prestTxt,
      categoria, esCirugia, arancel: get('arancel'), copago: get('copago'),
      yaCargada: med && fecha ? fechaMedicoYaCargada(fecha, med.id) : false,
      problema,
    };
  });
}

// Aplica el plan tabular: cada fila con su propia fecha/médico/paciente.
function aplicarResumenTabla(plan) {
  const res = { ok: 0, omitidas: 0, errores: [] };
  (plan || []).forEach(p => {
    if (p.problema) { res.omitidas++; return; }
    try {
      const datos = {
        fecha: p.fecha, categoria: p.categoria, grupoNomenclador: p.grupo,
        obraSocial: p.obraSocial, medicoRealizadorId: p.medicoId, cantidad: 1,
      };
      if (p.paciente || p.dni) datos.paciente = { apellido: p.paciente, nombre: '', dni: p.dni };
      registrarPrestacion(datos);
      res.ok++;
    } catch (e) { res.errores.push({ fila: p.fila, motivo: e.message }); }
  });
  return res;
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
