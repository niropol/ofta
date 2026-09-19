// ═══════════════════════════════════════════════════════════════════════════
//  SAM — CONTRATOS (INGRESO): valores reales por obra social + prestación
// ───────────────────────────────────────────────────────────────────────────
//  SAM factura a la obra social el VALOR DE CONTRATO y le paga a SAM Oftalmo el
//  % de config.porcentajeSAM (40%). Ese % × valor de contrato es NUESTRO INGRESO.
//  Versionado por vigencia (un cambio de valor no recalcula lo ya facturado).
//    Contrato: { id, obraSocial, grupoNomenclador, descripcion, valor,
//                vigenciaDesde, vigenciaHasta, estado }
// ═══════════════════════════════════════════════════════════════════════════

function porcentajeSAM() { return Number(DB.config.porcentajeSAM) || 0; }
function insumoModo() { return DB.config.insumoModo === 'margen' ? 'margen' : 'total'; }
function setInsumoModo(modo) {
  const m = modo === 'margen' ? 'margen' : 'total';
  const antes = DB.config.insumoModo;
  DB.config.insumoModo = m;
  registrarAuditoria('edicion', 'config', 'insumoModo', { insumoModo: antes }, { insumoModo: m });
  marcarCambios('config');
  return m;
}

function _contratosDe(obraSocial, grupo) {
  const g = Number(grupo);
  return DB.contratos
    .filter(c => c.obraSocial === obraSocial && c.grupoNomenclador === g)
    .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1));
}
function _contratoActual(obraSocial, grupo) {
  const cs = _contratosDe(obraSocial, grupo);
  return cs.find(c => !c.vigenciaHasta) || cs[0] || null;
}

// Valor de contrato vigente a una fecha (o null si no hay contrato cargado).
function valorContrato(obraSocial, grupo, fecha) {
  const f = fecha || hoyISO();
  const c = DB.contratos.find(x =>
    x.obraSocial === obraSocial && x.grupoNomenclador === Number(grupo) &&
    x.estado !== 'Inactivo' && x.vigenciaDesde <= f && (!x.vigenciaHasta || x.vigenciaHasta >= f));
  return c ? c.valor : null;
}

// Define / cambia el valor de contrato (versiona: cierra el vigente y abre uno nuevo).
function setContrato(obraSocial, grupo, valor, vigenciaDesde) {
  const g = Number(grupo);
  const item = versionActual(g);
  if (!item) throw new Error('Prestación inexistente.');
  const val = Number(valor);
  if (isNaN(val) || val < 0) throw new Error('El valor debe ser un número ≥ 0.');
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');
  const actual = _contratoActual(obraSocial, g);
  if (actual && desde <= actual.vigenciaDesde) {
    throw new Error('La vigencia debe ser posterior a la del valor actual (' + actual.vigenciaDesde + ').');
  }
  const antes = actual ? JSON.parse(JSON.stringify(actual)) : null;
  if (actual) actual.vigenciaHasta = _diaAnterior(desde);
  const nuevo = {
    id: nuevoId(), obraSocial, grupoNomenclador: g, descripcion: item.descripcion,
    valor: val, vigenciaDesde: desde, vigenciaHasta: null, estado: 'Activo',
  };
  DB.contratos.push(nuevo);
  registrarAuditoria(actual ? 'edicion' : 'alta', 'contrato', nuevo.id, antes, nuevo);
  marcarCambios('contratos');
  return nuevo;
}

// Sube o versiona el valor de contrato sin fallar si la vigencia coincide con la
// actual (en ese caso corrige el valor en su lugar). Usado por import y aumentos.
function _upsertContrato(obraSocial, grupo, valor, desde) {
  const g = Number(grupo);
  const actual = _contratoActual(obraSocial, g);
  if (actual && actual.vigenciaDesde === desde) {
    const antes = JSON.parse(JSON.stringify(actual));
    actual.valor = Number(valor);
    registrarAuditoria('edicion', 'contrato', actual.id, antes, actual);
    marcarCambios('contratos');
    return actual;
  }
  return setContrato(obraSocial, grupo, valor, desde);
}

// Aumento porcentual a TODOS los contratos vigentes de UNA obra social (cada OS se
// ajusta por separado; nunca hay aumento global). Redondeo hacia abajo.
function aumentarContratosOS(obraSocial, porcentaje, vigenciaDesde) {
  const pct = Number(porcentaje);
  if (isNaN(pct)) throw new Error('El porcentaje debe ser un número.');
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');
  const grupos = [...new Set(DB.contratos.filter(c => c.obraSocial === obraSocial).map(c => c.grupoNomenclador))];
  let n = 0;
  grupos.forEach(g => {
    const actual = _contratoActual(obraSocial, g);
    if (!actual || actual.estado === 'Inactivo') return;
    _upsertContrato(obraSocial, g, Math.floor(actual.valor * (1 + pct / 100)), desde);
    n++;
  });
  return { obraSocial, porcentaje: pct, actualizados: n, vigenciaDesde: desde };
}

// Alta manual de un contrato: crea la prestación (categoría + código + descripción)
// si no existe y le fija el valor para esa obra social. Devuelve { grupo, creada }.
function agregarContratoManual(obraSocial, categoria, codigo, descripcion, valor, vigenciaDesde) {
  if (!obraSocial) throw new Error('Elegí la obra social.');
  const cat = categoria || 'consulta';
  if (!CATEGORIAS_NOMENCLADOR.some(c => c.id === cat) || cat === 'insumo') throw new Error('Categoría inválida.');
  const cod = (codigo || '').trim();
  const desc = (descripcion || '').trim();
  if (!desc) throw new Error('La descripción es obligatoria.');
  const val = Number(valor);
  if (isNaN(val) || val < 0) throw new Error('El valor debe ser un número ≥ 0.');
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');

  const items = listarPrestaciones({ incluirInactivos: false }).filter(n => n.categoria !== 'insumo');
  let item = items.find(n => (cod && String(n.codigo || '') === cod) || (n.descripcion || '').toLowerCase() === desc.toLowerCase());
  let creada = false;
  if (!item) {
    item = crearPrestacion({ categoria: cat, codigo: cod, descripcion: desc, precio: 0, vigenciaDesde: desde });
    creada = true;
  }
  _upsertContrato(obraSocial, item.grupo, val, desde);
  return { grupo: item.grupo, creada };
}

// Importa contratos desde filas normalizadas [{obraSocial, ref, valor}].
// `ref` matchea la prestación por código o por descripción. Devuelve {ok, errores}.
function importarContratos(filas, vigenciaDesde) {
  const desde = vigenciaDesde || (hoyISO().slice(0, 7) + '-01');
  const items = listarPrestaciones({ incluirInactivos: false }).filter(n => n.categoria !== 'insumo');
  const res = { ok: 0, errores: [] };
  (filas || []).forEach((f, i) => {
    const os = (f.obraSocial || '').trim();
    const ref = (f.ref != null ? String(f.ref) : '').trim();
    const valor = Number(f.valor);
    if (!os || !ref) { res.errores.push({ fila: i + 1, motivo: 'faltan obra social o prestación' }); return; }
    if (isNaN(valor) || valor < 0) { res.errores.push({ fila: i + 1, motivo: 'valor inválido (' + f.valor + ')' }); return; }
    const item = items.find(n => String(n.codigo || '') === ref || (n.descripcion || '').toLowerCase() === ref.toLowerCase());
    if (!item) { res.errores.push({ fila: i + 1, motivo: 'cirugía no encontrada: ' + ref }); return; }
    try { _upsertContrato(os, item.grupo, valor, desde); res.ok++; }
    catch (e) { res.errores.push({ fila: i + 1, motivo: e.message }); }
  });
  return res;
}

function eliminarContrato(obraSocial, grupo) {
  const g = Number(grupo);
  const filas = _contratosDe(obraSocial, g);
  if (filas.length === 0) return false;
  filas.forEach(c => registrarAuditoria('baja', 'contrato', c.id, c, null));
  DB.contratos = DB.contratos.filter(c => !(c.obraSocial === obraSocial && c.grupoNomenclador === g));
  marcarCambios('contratos');
  return true;
}

// Valores de contrato ACTUALES de una OS, uno por prestación del nomenclador
// (todas menos insumos: cada OS tiene su propio valor por prestación).
function contratosDeOS(obraSocial) {
  const grupos = [...new Set(DB.nomenclador.map(n => n.grupo))];
  return grupos.map(g => {
    const item = versionActual(g);
    const actual = _contratoActual(obraSocial, g);
    return { grupo: g, codigo: item ? (item.codigo || '') : '', descripcion: item ? item.descripcion : '', categoria: item ? item.categoria : '',
             valor: actual ? actual.valor : null, vigenciaDesde: actual ? actual.vigenciaDesde : null };
  }).filter(x => x.descripcion && x.categoria !== 'insumo');
}

// ── Comparativa de contratos entre obras sociales ──
// Para cada prestación CANÓNICA con al menos un contrato vigente, devuelve el
// valor de cada OS y marca cuál es la de MENOR valor (y la de mayor). Se recalcula
// cada vez que se carga/edita un contrato (renderContratos lo vuelve a pedir).
function comparativaContratos(fecha) {
  const f = fecha || hoyISO();
  const porGrupo = {};
  const pares = new Set();
  DB.contratos.forEach(c => pares.add(c.obraSocial + '||' + c.grupoNomenclador));
  pares.forEach(k => {
    const idx = k.lastIndexOf('||');
    const os = k.slice(0, idx);
    const g = Number(k.slice(idx + 2));
    const v = valorContrato(os, g, f);
    if (v == null) return;
    (porGrupo[g] = porGrupo[g] || []).push({ obraSocial: os, valor: v });
  });
  return Object.keys(porGrupo).map(gStr => {
    const g = Number(gStr);
    const item = versionActual(g);
    const lista = porGrupo[g].slice().sort((a, b) => a.valor - b.valor);
    const menor = lista[0], mayor = lista[lista.length - 1];
    return {
      grupo: g,
      codigo: item ? (item.codigo || '') : '',
      descripcion: item ? item.descripcion : '—',
      categoria: item ? item.categoria : '',
      contratos: lista,
      cantidadOS: lista.length,
      menorOS: menor.obraSocial, menorValor: menor.valor,
      mayorOS: mayor.obraSocial, mayorValor: mayor.valor,
      diferencia: mayor.valor - menor.valor,
    };
  }).filter(r => r.descripcion && r.categoria !== 'insumo');
}

// ── Ingreso de SAM ──
// SAM factura TODA prestación (consulta, estudio, práctica y cirugía, incluido
// Particular) por su VALOR DE CONTRATO según la obra social (cada OS su valor), y
// nos paga el porcentajeSAM% (40%). Si la OS no tiene contrato para esa prestación,
// faltaContrato = true. Los insumos usados suman su ingreso (según el mecanismo).
function ingresoSAMDePrestacion(reg) {
  const cant = Math.max(1, Math.floor(Number(reg.cantidad) || 1));  // consulta/estudio se cargan por cantidad
  const insMode = insumoModo();
  // insBilling = lo que factura SAM por los insumos (para "SAM factura a la OS").
  // insReparto = lo que entra a NUESTRO reparto 60/40 (mismo billing en Mec 1;
  //              billing − costo en Mec 2). En ambos NO pagamos el costo aparte.
  let insBilling = 0, insReparto = 0;
  (reg.insumos || []).forEach(i => {
    const ing = Number(i.ingreso) || 0;
    insBilling += ing;
    insReparto += (insMode === 'margen') ? (ing - (Number(i.costo) || 0)) : ing;  // costo en pesos
  });

  const vc = valorContrato(reg.obraSocial, reg.grupoNomenclador, reg.fecha);
  const factU = (vc || 0) + insBilling;
  const baseU = (vc || 0) + insReparto;
  const ingU = Math.floor(baseU * porcentajeSAM() / 100);
  return {
    ingreso: ingU * cant, facturado: factU * cant, base: baseU * cant,
    valorContrato: vc, insumos: insBilling * cant, faltaContrato: vc == null, cantidad: cant,
  };
}

// Ingreso de SAM del mes (suma). Si se pasa obraSocial, filtra por esa OS —
// clave para cerrar el cobro de cada obra social por separado.
function ingresoSAMDelMes(mes, obraSocial) {
  let facturado = 0, ingreso = 0, sinContrato = 0, cantidad = 0;
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes) && (!obraSocial || r.obraSocial === obraSocial))
    .forEach(r => {
      const i = ingresoSAMDePrestacion(r);
      if (i.faltaContrato) sinContrato++;
      facturado += i.facturado;
      ingreso += i.ingreso;
      cantidad++;
    });
  return { mes, obraSocial: obraSocial || null, facturado, ingreso, porcentaje: porcentajeSAM(), sinContrato, cantidad };
}

// Obras sociales con prestaciones activas en el mes (incluye 'Particular').
function _osDelMes(mes) {
  return [...new Set(DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (r.fecha || '').slice(0, 7) === mes)
    .map(r => r.obraSocial || 'Particular'))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

// Ingreso del mes desglosado por obra social (una fila por OS).
function ingresoSAMPorOS(mes) {
  return _osDelMes(mes).map(os => ingresoSAMDelMes(mes, os));
}

// Costo total de los insumos del mes — SOLO informativo. Nosotros no lo pagamos:
// en Mecanismo 1 lo absorbe SAM; en Mecanismo 2 ya está descontado de nuestro reparto.
function costoInsumosDelMes(mes, cotizacion) {
  const cot = Number(cotizacion) || null;
  let costo = 0, requiereCotizacion = false;
  DB.prestacionesRealizadas
    .filter(r => r.estado === 'activa' && (!mes || (r.fecha || '').slice(0, 7) === mes))
    .forEach(r => { const cant = Math.max(1, Math.floor(Number(r.cantidad) || 1)); (r.insumos || []).forEach(i => {
      if (i.costoMoneda === 'USD') { if (cot) costo += (Number(i.costo) || 0) * cot * cant; else requiereCotizacion = true; }
      else costo += (Number(i.costo) || 0) * cant;
    }); });
  return { mes, costo: Math.round(costo), requiereCotizacion };
}

// Cada obra social paga en su momento → cada una cierra su cobro por separado.
// La referencia del movimiento es "mes|obraSocial" para no mezclarlas.
function _refCobro(mes, obraSocial) { return mes + '|' + obraSocial; }
function _movCobro(mes, obraSocial) {
  const ref = _refCobro(mes, obraSocial);
  return DB.cajaMovimientos.find(m => m.origen === 'cobro_sam' && m.referenciaId === ref) || null;
}

// Compara, para UNA obra social y mes, lo que SAM DEBERÍA pagarte (40% de lo
// facturado) contra lo efectivamente cobrado. diferencia = recibido − esperado.
function comparacionCobroSAM(mes, obraSocial) {
  const esperado = ingresoSAMDelMes(mes, obraSocial).ingreso;
  const mov = _movCobro(mes, obraSocial);
  return {
    mes, obraSocial, esperado, recibido: mov ? mov.monto : null,
    registrado: !!mov, diferencia: mov ? mov.monto - esperado : null, fecha: mov ? mov.fecha : null,
  };
}

// Resumen del mes: una fila por obra social (esperado / recibido / diferencia /
// estado) + totales, para el control de cobros y el panel.
function comparacionCobrosMes(mes) {
  const filas = ingresoSAMPorOS(mes).map(g => {
    const c = comparacionCobroSAM(mes, g.obraSocial);
    return {
      obraSocial: g.obraSocial, facturado: g.facturado, esperado: g.ingreso,
      cantidad: g.cantidad, sinContrato: g.sinContrato,
      recibido: c.recibido, diferencia: c.diferencia, registrado: c.registrado, fecha: c.fecha,
    };
  }).filter(f => f.esperado > 0 || f.facturado > 0);
  let esperado = 0, recibido = 0, esperadoCobrado = 0, registradas = 0;
  filas.forEach(f => {
    esperado += f.esperado;
    if (f.registrado) { recibido += f.recibido; esperadoCobrado += f.esperado; registradas++; }
  });
  return {
    mes, filas, esperado, recibido, esperadoCobrado, registradas,
    total: filas.length, pendientes: filas.length - registradas,
    diferenciaCobrada: recibido - esperadoCobrado,
  };
}

// Registra en caja el cobro de SAM de UNA obra social para el mes. Evita duplicar.
// montoRecibido: lo que SAM efectivamente transfirió (si se omite, usa el esperado).
function registrarCobroSAM(mes, obraSocial, fechaCobro, montoRecibido) {
  if (!obraSocial) throw new Error('Indicá la obra social del cobro.');
  const ref = _refCobro(mes, obraSocial);
  if (DB.cajaMovimientos.some(m => m.origen === 'cobro_sam' && m.referenciaId === ref)) {
    throw new Error('El cobro de ' + obraSocial + ' de ' + mes + ' ya está registrado.');
  }
  const esperado = ingresoSAMDelMes(mes, obraSocial).ingreso;
  if (!(esperado > 0)) throw new Error('No hay ingreso de SAM para ' + obraSocial + ' en ' + mes + ' (cargá los contratos / valores).');
  const recibido = (montoRecibido == null || montoRecibido === '') ? esperado : Number(montoRecibido);
  if (isNaN(recibido) || recibido < 0) throw new Error('El monto recibido debe ser un número ≥ 0.');
  const dif = recibido - esperado;
  const desc = 'Cobro SAM · ' + obraSocial + ' ' + mes + ' (' + porcentajeSAM() + '%)' +
    (dif !== 0 ? ' · dif ' + (dif > 0 ? '+' : '') + dif : '');
  const mov = registrarMovimientoCaja({
    fecha: fechaCobro || hoyISO(), tipo: 'ingreso', descripcion: desc,
    monto: recibido, moneda: 'ARS', medioPago: 'transferencia',
    origen: 'cobro_sam', referenciaId: ref,
  });
  mov.esperado = esperado;
  mov.diferencia = dif;
  mov.obraSocial = obraSocial;
  mov.mesCobro = mes;
  marcarCambios('cajaMovimientos');
  return mov;
}

// Deshace el cobro de una obra social en el mes (quita el ingreso de caja).
function quitarCobroSAM(mes, obraSocial) {
  const ref = _refCobro(mes, obraSocial);
  const movs = DB.cajaMovimientos.filter(m => m.origen === 'cobro_sam' && m.referenciaId === ref);
  if (!movs.length) return 0;
  DB.cajaMovimientos = DB.cajaMovimientos.filter(m => !(m.origen === 'cobro_sam' && m.referenciaId === ref));
  movs.forEach(m => registrarAuditoria('baja', 'cajaMovimiento', m.id, m, null));
  marcarCambios('cajaMovimientos');
  return movs.length;
}
