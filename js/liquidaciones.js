// ═══════════════════════════════════════════════════════════════════════════
//  SAM — LIQUIDACIONES A MÉDICOS (Etapa 6)
// ───────────────────────────────────────────────────────────────────────────
//  Genera la liquidación mensual de un médico a partir del motor de honorarios
//  (Etapa 4), con detalle por prestación/paciente. Estados:
//   - 'borrador': se puede regenerar/editar; NO toca la caja.
//   - 'cerrada' : carga el egreso AUTOMÁTICO en caja (origen 'pago_medico') y
//                 BLOQUEA las prestaciones de ese médico+mes (evita drift).
//  Reabrir/eliminar quita el egreso de caja (sin huérfanos).
//  Liquidación siempre en pesos; el dólar se convierte con la cotización pedida.
//  Comisión SAM del mes: se paga aparte (egreso a SAM); SAM Oftalmo es el resto.
// ═══════════════════════════════════════════════════════════════════════════

function liquidacionDe(medicoId, mes) {
  return DB.pagosMedicos.find(p => p.medicoId === Number(medicoId) && p.mes === mes) || null;
}
function liquidacionCerradaDe(medicoId, mes) {
  const l = liquidacionDe(medicoId, mes);
  return l && l.estado === 'cerrada' ? l : null;
}

// ¿La prestación está bloqueada por una liquidación cerrada de alguno de sus médicos?
function prestacionBloqueada(reg) {
  const mes = (reg.fecha || '').slice(0, 7);
  if (liquidacionCerradaDe(reg.medicoRealizadorId, mes)) return true;
  if (reg.medicoDerivadorId && liquidacionCerradaDe(reg.medicoDerivadorId, mes)) return true;
  return false;
}

// ── Generar / regenerar (borrador) ──
function generarLiquidacion(medicoId, mes) {
  const mid = Number(medicoId);
  if (!mes) throw new Error('Elegí el mes.');
  const existente = liquidacionDe(mid, mes);
  if (existente && existente.estado === 'cerrada') {
    throw new Error('La liquidación de ese médico y mes está cerrada. Reabrila para regenerar.');
  }
  const h = honorariosDeMedico(mid, mes);
  const detalle = h.detalle.map(d => {
    const reg = DB.prestacionesRealizadas.find(r => r.id === d.prestacionId);
    return { prestacionId: d.prestacionId, fecha: d.fecha, rol: d.rol, descripcion: d.descripcion, monto: d.monto, paciente: reg ? reg.pacienteNombre : '' };
  });
  const data = {
    medicoId: mid, mes, estado: 'borrador',
    total: h.total,
    faltaValor: h.faltaValor,
    detalle,
    fechaGeneracion: hoyISO(),
    fechaCierre: null,
    cajaMovimientoId: null,
  };
  if (existente) {
    const antes = JSON.parse(JSON.stringify(existente));
    Object.assign(existente, data);
    registrarAuditoria('edicion', 'pagoMedico', existente.id, antes, existente);
    marcarCambios('pagosMedicos');
    return existente;
  }
  const nueva = { id: nuevoId(), ...data, creadoEn: new Date().toISOString() };
  DB.pagosMedicos.push(nueva);
  registrarAuditoria('alta', 'pagoMedico', nueva.id, null, nueva);
  marcarCambios('pagosMedicos');
  return nueva;
}

// ── Cerrar: bloquea el período y carga el egreso automático en caja ──
function cerrarLiquidacion(id, fechaPago) {
  const l = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!l) return false;
  if (l.estado === 'cerrada') return l;
  if (l.faltaValor && l.faltaValor.length) throw new Error('Faltan valores fijos configurados. Definilos y regenerá antes de cerrar.');
  if (!(l.total > 0)) throw new Error('La liquidación no tiene honorarios a pagar (total $0). Revisá que el médico tenga prestaciones y que estén los valores fijos cargados.');
  const antes = JSON.parse(JSON.stringify(l));
  // Primero la caja: si algo falla, la liquidación NO queda a medio cerrar.
  const med = DB.medicos.find(m => m.id === l.medicoId);
  const fecha = fechaPago || hoyISO();
  const mov = registrarEgresoPagoMedico(l.id, l.total, 'Liquidación ' + l.mes + ' — ' + (med ? med.nombre : ''), fecha, med ? med.sedeId : sedeActiva());
  l.cajaMovimientoId = mov.id;
  l.estado = 'cerrada';
  l.fechaCierre = fecha;
  registrarAuditoria('edicion', 'pagoMedico', l.id, antes, l);
  marcarCambios('pagosMedicos');
  return l;
}

// ── Reabrir: quita el egreso de caja y desbloquea ──
function reabrirLiquidacion(id) {
  const l = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!l || l.estado !== 'cerrada') return false;
  const antes = JSON.parse(JSON.stringify(l));
  quitarEgresosDeLiquidacion(l.id);
  l.estado = 'borrador'; l.fechaCierre = null; l.cajaMovimientoId = null;
  registrarAuditoria('edicion', 'pagoMedico', l.id, antes, l);
  marcarCambios('pagosMedicos');
  return l;
}

// ── Eliminar (limpia el egreso asociado) ──
function eliminarLiquidacion(id) {
  const l = DB.pagosMedicos.find(p => p.id === Number(id));
  if (!l) return false;
  quitarEgresosDeLiquidacion(l.id);
  const antes = JSON.parse(JSON.stringify(l));
  DB.pagosMedicos = DB.pagosMedicos.filter(p => p.id !== l.id);
  registrarAuditoria('baja', 'pagoMedico', l.id, antes, null);
  marcarCambios('pagosMedicos');
  return true;
}

function listarLiquidaciones(mes) {
  return DB.pagosMedicos.filter(p => !mes || p.mes === mes).sort((a, b) => b.total - a.total);
}

// ── Mensaje de WhatsApp (texto listo para pegar/enviar) ──
// Detalla, para el médico, la cantidad de consultas, de estudios (por tipo) y de
// cirugías (por tipo), más las derivaciones y el total a depositar.
function mensajeLiquidacionWhatsApp(l) {
  const med = DB.medicos.find(m => m.id === l.medicoId);
  const nombre = med ? med.nombre : 'Médico';

  const porRol = { realizador: 0, derivador: 0 };
  const cantCat = {};                 // categoría → cantidad total
  const porTipo = {};                 // categoría → { descripción → cantidad }
  let derivCant = 0;
  l.detalle.forEach(d => {
    const cant = Math.max(1, Math.floor(Number(d.cantidad) || 1));
    porRol[d.rol] = (porRol[d.rol] || 0) + d.monto;
    if (d.rol === 'derivador') { derivCant += cant; return; }
    const reg = DB.prestacionesRealizadas.find(r => r.id === d.prestacionId);
    const cat = reg ? reg.categoria : 'otros';
    cantCat[cat] = (cantCat[cat] || 0) + cant;
    (porTipo[cat] = porTipo[cat] || {})[d.descripcion] = (porTipo[cat][d.descripcion] || 0) + cant;
  });

  // Bloque por categoría con desglose por tipo.
  const bloque = (cat, emoji, titulo, conDesglose) => {
    if (!cantCat[cat]) return '';
    let txt = `${emoji} *${titulo}:* ${cantCat[cat]}\n`;
    if (conDesglose) {
      const tipos = Object.entries(porTipo[cat]).sort((a, b) => b[1] - a[1]);
      if (tipos.length > 1 || (tipos[0] && tipos[0][0] !== titulo)) {
        txt += tipos.map(([desc, n]) => `   • ${desc}: ${n}`).join('\n') + '\n';
      }
    }
    return txt;
  };

  const detalle =
    bloque('consulta', '🩺', 'Consultas', false) +
    bloque('realizacion_estudio', '🔬', 'Estudios', true) +
    bloque('practica', '🧪', 'Prácticas', true) +
    bloque('cirugia', '🔪', 'Cirugías', true) +
    (derivCant > 0 ? `↪️ *Derivaciones:* ${derivCant}\n` : '');

  const lineaDeriv = porRol.derivador > 0 ? `↪️ Derivaciones → *${fmtMoneda(porRol.derivador, 'ARS')}*\n` : '';

  return `👁 *SAM Oftalmología*\n📋 *Liquidación ${l.mes}*\n\n👨‍⚕️ ${nombre}\n\n${detalle}\n💰 *Honorarios:*\n🩺 Realizador → *${fmtMoneda(porRol.realizador, 'ARS')}*\n${lineaDeriv}\n*A depositar (transferencia): ${fmtMoneda(l.total, 'ARS')}*\n\nPor favor remitir factura para procesar el pago. ¡Gracias!`;
}
