// ═══════════════════════════════════════════════════════════════════════════
//  SAM/OFTA — EJEMPLO DE FACTURACIÓN (IOMA, 4 médicos)
// ───────────────────────────────────────────────────────────────────────────
//  Carga un mes completo de prueba para explorar la app end-to-end:
//   · 1 obra social (IOMA) con contratos reales por prestación.
//   · 4 médicos: 1 cirujano que opera + 3 que derivan.
//   · Consultas y estudios por cantidad; 10 cataratas (con lentes) y 4 pterigiones.
//   · Valores fijos a médicos por tipo (incluida derivación por tipo).
//  Reemplaza los datos actuales (pide confirmación). No toca el código.
// ═══════════════════════════════════════════════════════════════════════════

function _sembrarEjemploIOMA() {
  ['medicos', 'obrasSociales', 'pacientes', 'nomenclador', 'prestacionesRealizadas',
   'pagosMedicos', 'cajaMovimientos', 'contratos', 'valoresMedico', 'auditoria'].forEach(c => { if (DB[c]) DB[c] = []; });
  if (DB.config) DB.config.insumoModo = 'total';

  DB.obrasSociales.push({ id: 1, nombre: 'IOMA', estado: 'Activo' });
  DB.medicos.push({ id: 600, nombre: 'Dr. Operador (cirujano)', estado: 'Activo', sedeId: 1 });
  DB.medicos.push({ id: 601, nombre: 'Dra. Núñez (deriva)', estado: 'Activo', sedeId: 1 });
  DB.medicos.push({ id: 602, nombre: 'Dr. Paz (deriva)', estado: 'Activo', sedeId: 1 });
  DB.medicos.push({ id: 603, nombre: 'Dra. Ríos (deriva)', estado: 'Activo', sedeId: 1 });

  const F = '2026-01-01';
  const cons = crearPrestacion({ categoria: 'consulta', descripcion: 'Consulta oftalmológica', codigo: '22211', vigenciaDesde: F });
  const oct = crearPrestacion({ categoria: 'realizacion_estudio', descripcion: 'OCT de mácula', codigo: '88.02.OCT', vigenciaDesde: F });
  const cv = crearPrestacion({ categoria: 'realizacion_estudio', descripcion: 'Campo visual computarizado', codigo: '88.02.01', vigenciaDesde: F });
  const eco = crearPrestacion({ categoria: 'realizacion_estudio', descripcion: 'Ecografía oftalmológica', codigo: '18.01.09', vigenciaDesde: F });
  const cata = crearPrestacion({ categoria: 'cirugia', descripcion: 'Catarata (extracción cristalino)', codigo: '02.07.01', vigenciaDesde: F });
  const pter = crearPrestacion({ categoria: 'cirugia', descripcion: 'Pterigión (escisión conjuntiva)', codigo: '02.03.02', vigenciaDesde: F });
  const lMono = crearPrestacion({ categoria: 'insumo', descripcion: 'Lente intraocular monofocal', precio: 180000, costo: 90000, honorarioMedico: 25000, vigenciaDesde: F });
  const lTor = crearPrestacion({ categoria: 'insumo', descripcion: 'Lente intraocular tórica', precio: 320000, costo: 150000, honorarioMedico: 40000, vigenciaDesde: F });

  setContrato('IOMA', cons.grupo, 22211, F); setContrato('IOMA', oct.grupo, 40000, F); setContrato('IOMA', cv.grupo, 35000, F);
  setContrato('IOMA', eco.grupo, 18000, F); setContrato('IOMA', cata.grupo, 265000, F); setContrato('IOMA', pter.grupo, 95000, F);

  setValorMedico('consulta', null, 6000, F);
  setValorMedico('realizacion_estudio', null, 5000, F);
  setValorMedico('realizacion_estudio', null, 12000, F, oct.grupo);
  setValorMedico('realizacion_estudio', null, 9000, F, cv.grupo);
  setValorMedico('cirugia', null, 70000, F, cata.grupo);
  setValorMedico('cirugia', null, 25000, F, pter.grupo);
  setValorMedico('derivacion', null, 8000, F);
  setValorMedico('derivacion', null, 15000, F, cata.grupo);

  const M = '2026-05-';
  registrarPrestacion({ fecha: M + '05', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 601, obraSocial: 'IOMA', cantidad: 40 });
  registrarPrestacion({ fecha: M + '06', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 602, obraSocial: 'IOMA', cantidad: 35 });
  registrarPrestacion({ fecha: M + '07', categoria: 'consulta', grupoNomenclador: cons.grupo, medicoRealizadorId: 603, obraSocial: 'IOMA', cantidad: 30 });
  registrarPrestacion({ fecha: M + '08', categoria: 'realizacion_estudio', grupoNomenclador: oct.grupo, medicoRealizadorId: 601, obraSocial: 'IOMA', cantidad: 8 });
  registrarPrestacion({ fecha: M + '08', categoria: 'realizacion_estudio', grupoNomenclador: oct.grupo, medicoRealizadorId: 602, obraSocial: 'IOMA', cantidad: 5 });
  registrarPrestacion({ fecha: M + '09', categoria: 'realizacion_estudio', grupoNomenclador: cv.grupo, medicoRealizadorId: 602, obraSocial: 'IOMA', cantidad: 6 });
  registrarPrestacion({ fecha: M + '09', categoria: 'realizacion_estudio', grupoNomenclador: cv.grupo, medicoRealizadorId: 603, obraSocial: 'IOMA', cantidad: 7 });
  registrarPrestacion({ fecha: M + '10', categoria: 'realizacion_estudio', grupoNomenclador: eco.grupo, medicoRealizadorId: 603, obraSocial: 'IOMA', cantidad: 10 });

  const derivCat = [601, 601, 601, 601, 602, 602, 602, 603, 603, 603];
  const insCat = [lMono.grupo, lMono.grupo, lMono.grupo, lMono.grupo, lMono.grupo, lMono.grupo, lTor.grupo, lTor.grupo, null, null];
  for (let i = 0; i < 10; i++) {
    registrarPrestacion({ fecha: M + String(11 + i), categoria: 'cirugia', grupoNomenclador: cata.grupo, medicoRealizadorId: 600, medicoDerivadorId: derivCat[i], obraSocial: 'IOMA', cantidad: 1, insumos: insCat[i] ? [insCat[i]] : [] });
  }
  const derivPt = [601, 601, 602, 603];
  for (let i = 0; i < 4; i++) {
    registrarPrestacion({ fecha: M + String(21 + i), categoria: 'cirugia', grupoNomenclador: pter.grupo, medicoRealizadorId: 600, medicoDerivadorId: derivPt[i], obraSocial: 'IOMA', cantidad: 1 });
  }
  if (typeof marcarCambios === 'function') marcarCambios('prestacionesRealizadas');
}

function cargarEjemploIOMA() {
  const seguir = ok => {
    if (!ok) return;
    try { _sembrarEjemploIOMA(); }
    catch (e) { alert('No se pudo cargar el ejemplo: ' + e.message); return; }
    // Posicionar los selectores de mes en mayo 2026.
    ['panelMes', 'statMes', 'liqMes', 'prevMes', 'ctrMes', 'regFiltroMes'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '2026-05';
    });
    const pm = document.getElementById('panelMes'); if (pm) pm.value = '2026-05';
    if (typeof sincronizarUI === 'function') sincronizarUI();
    const sam = ingresoSAMDelMes('2026-05');
    const hon = honorariosDelMes('2026-05').reduce((s, h) => s + h.total, 0);
    alert('Ejemplo IOMA cargado (mayo 2026).\n\n' +
      'Facturado a las OS: ' + fmtMoneda(sam.facturado, 'ARS') + '\n' +
      'SAM te debe pagar (40%): ' + fmtMoneda(sam.ingreso, 'ARS') + '\n' +
      'Honorarios a médicos: ' + fmtMoneda(hon, 'ARS') + '\n' +
      'Margen estimado: ' + fmtMoneda(sam.ingreso - hon, 'ARS') + '\n\n' +
      'Miralo en Resumen ▸ Panel del mes, Finanzas ▸ Liquidaciones / Cobros de SAM.');
  };
  if (typeof confirmarUI === 'function') {
    confirmarUI('Esto reemplaza los datos actuales por el ejemplo IOMA (4 médicos, mayo 2026). ¿Continuar?').then(seguir);
  } else { seguir(typeof confirm === 'function' ? confirm('¿Cargar ejemplo IOMA? Reemplaza los datos actuales.') : true); }
}
