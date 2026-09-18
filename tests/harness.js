// ─────────────────────────────────────────────────────────────────────────────
//  Harness de tests para SAM (mismo enfoque que OIP).
//
//  Lee index.html de producción tal cual, inlinea los <script src="js/..."> (jsdom
//  no los descarga) y agrega un <script> que expone símbolos internos en
//  window.__APP__ (en index.html son `const`/`function` de nivel superior, no
//  accesibles desde afuera). El archivo en disco no se toca.
//
//  url NO localhost + sin SDK de Supabase → initSupabase() corta y la app queda
//  trabajando en memoria, ideal para testear el ciclo de datos sin nube.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, '..', 'index.html');

const EXPONER = [
  // estado / constantes
  'DB', 'CATEGORIAS', 'CATEGORIA_IDS', 'CATEGORIAS_NOMENCLADOR', 'CATEGORIAS_REALIZADAS', 'CATEGORIAS_REGLA', 'ROLES', 'MONEDAS', 'MEDIOS_PAGO', 'COLECCIONES',
  'categoriaInfo', 'derivaCategoriaDe',
  // pagos a médicos (valores fijos)
  'redondearAbajo', 'CATEGORIAS_VALOR_MEDICO', 'valorMedicoVigente', 'setValorMedico', 'setValorMedicoActual', 'listarValoresMedicoActuales',
  'setHonorarioMedicoInsumo',
  'honorariosDePrestacion', 'honorariosDeMedico', 'honorariosDelMes',
  'renderValoresMedico', 'abrirNuevoValorMedico', 'guardarValorMedico', 'calcularPreviewHonorarios', 'onValorCategoriaChange',
  // caja
  'CATEGORIAS_GASTO', 'registrarMovimientoCaja', 'registrarGasto', 'editarMovimientoCaja',
  'eliminarMovimientoCaja', 'registrarEgresoPagoMedico', 'quitarEgresosDeLiquidacion',
  'saldosCaja', 'saldoPool', 'listarMovimientosCaja', 'registrarCierreCaja', 'listarCierresCaja',
  'renderCaja', 'abrirMovimientoCaja', 'guardarMovimientoCaja', 'eliminarMovimientoCajaUI',
  'abrirCierreCaja', 'guardarCierreCaja',
  // helpers de dominio
  'nuevoId', 'usuarioActual', 'sedeActiva', 'getSedesActivas', 'getMedicosActivos', 'escHtml',
  'getConsultoriosActivos', 'getConsultoriosDeSede',
  // consultorios y horarios
  'DIAS_SEMANA', 'renderConsultorios', 'abrirNuevoConsultorio', 'guardarConsultorio',
  'toggleEstadoConsultorio', 'eliminarConsultorio', '_referenciasConsultorio',
  'renderHorarios', 'abrirNuevoHorario', 'guardarHorario', 'eliminarHorario',
  // auditoría
  'registrarAuditoria', 'auditoriaDe',
  // persistencia
  'marcarCambios', 'cargarDesdeNube', 'guardarEnNube',
  // ABM de médicos
  'renderMedicos', 'abrirNuevoMedico', 'editarMedico', 'guardarMedico',
  'eliminarMedico', 'toggleEstadoMedico', '_referenciasMedico',
  // nomenclador: lógica de versionado de precios
  'hoyISO', 'versionesDe', 'precioVigente', 'versionActual', 'listarPrestaciones',
  'crearPrestacion', 'editarPrestacion', 'versionarPrecio', 'toggleEstadoPrestacion',
  'eliminarPrestacion', '_referenciasNomenclador', 'fmtMoneda',
  // nomenclador: UI
  'renderNomenclador', '_poblarFiltroCategoria', 'abrirNuevaPrestacion', 'editarPrestacionUI',
  'guardarPrestacion', 'abrirNuevoPrecio', 'guardarNuevoPrecio', 'onCategoriaChangePrest',
  'verHistorialPrestacion', 'inactivarPrestacionUI', 'eliminarPrestacionUI',
  'setCostoInsumo',
  // obras sociales
  'renderOS', 'abrirNuevaOS', 'editarOS', 'guardarOS', 'toggleEstadoOS', 'eliminarOS',
  '_referenciasOS', 'getObrasSocialesActivas', 'poblarDatalistOS',
  // admin (costo real de insumos)
  'renderAdmin', 'renderAdminInsumos', 'guardarCostoInsumoUI', 'abrirNuevoInsumo', 'guardarNuevoInsumo',
  // prestaciones realizadas
  'pacienteFindOrCreate', 'pacienteLabel', 'medicoNombre',
  'registrarPrestacion', 'editarPrestacionRealizada', 'anularPrestacion',
  'reactivarPrestacion', 'eliminarPrestacionRealizada', 'listarPrestacionesRealizadas',
  '_resolverInsumos', 'renderPrestaciones', 'irPaginaPrestaciones', 'abrirNuevaPrestacionRealizada', 'guardarPrestacionReg',
  'agregarInsumoReg', 'quitarInsumoReg',
  // carga diaria (parte visible) y panel del mes
  'renderCargaDiaria', 'cdAgregarConsulta', 'cdAgregarEstudio', 'cdEditarCantidad', 'cdNuevaCirugia', 'cdSedeChange', 'renderPanelMes',
  // liquidaciones
  'liquidacionDe', 'liquidacionCerradaDe', 'prestacionBloqueada', 'generarLiquidacion',
  'cerrarLiquidacion', 'reabrirLiquidacion', 'eliminarLiquidacion', 'listarLiquidaciones',
  'mensajeLiquidacionWhatsApp',
  'renderLiquidaciones', 'generarLiquidacionUI', 'cerrarLiquidacionUI',
  // estadísticas
  'resumenMes', 'resumenMedicoMes', 'controlInterno', 'resumenMesTextoWhatsApp', 'csvContable',
  'renderEstadisticas', 'switchStatView',
  // usuarios / permisos / auditoría
  'ROL_LABEL', 'PERMISOS_SECCIONES', 'rolActual', 'puedeVerSeccion', 'setUsuarioActual',
  'guardarUsuarioDatos', 'toggleEstadoUsuario', 'eliminarUsuario', 'listarAuditoria',
  'renderUsuarios', 'renderAuditoria', 'aplicarPermisos', 'poblarActuandoComo',
  // sedes (ABM)
  'renderSedes', 'abrirNuevaSede', 'editarSede', 'guardarSede', 'toggleEstadoSede',
  'eliminarSede', '_referenciasSede', 'marcarSedeActiva',
  // contratos (ingreso)
  'porcentajeSAM', 'valorContrato', 'setContrato', 'eliminarContrato', 'contratosDeOS',
  'aumentarContratosOS', 'importarContratos', 'agregarContratoManual',
  'ingresoSAMDePrestacion', 'ingresoSAMDelMes', 'ingresoSAMPorOS', 'registrarCobroSAM', 'quitarCobroSAM',
  'comparacionCobroSAM', 'comparacionCobrosMes',
  'insumoModo', 'setInsumoModo', 'costoInsumosDelMes',
  'renderContratos', 'guardarValorContratoUI', 'registrarCobroSAMUI',
  // matcheo de contratos (alias + sugerencias)
  'similitudTexto', 'buscarAliasContrato', 'guardarAliasContrato', 'olvidarAliasContrato',
  'sugerirPrestacionContrato', 'planImportarContratos', 'aplicarImportacionContratos',
  // diagnóstico (Etapa 9)
  'runSelfTests', 'diagnosticoDatos', 'estadoNube', 'verificarNube',
  // navegación
  'showSection', 'init',
];

export function loadApp() {
  let html = readFileSync(HTML_PATH, 'utf8');

  html = html.replace(/<script src="(js\/[^"?]+)(?:\?[^"]*)?"><\/script>/g, (_m, src) => {
    const code = readFileSync(join(__dirname, '..', src), 'utf8');
    return `<script>\n${code}\n</script>`;
  });

  const shim = `\n<script>window.__APP__ = { ${EXPONER.join(', ')} };</script>\n`;
  const idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + shim + html.slice(idx);

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.com/',   // no localhost → sin modo dev; sin SDK → corta en Supabase
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.confirm = () => true;
  window.alert = () => {};
  window.prompt = () => '';

  const app = window.__APP__;
  if (!app) throw new Error('No se pudo exponer __APP__: ¿cambió la estructura de index.html?');
  // Asegurar init() (renders) aunque el DOMContentLoaded ya haya pasado.
  try { if (typeof app.init === 'function') app.init(); } catch (e) {}
  return { window, dom, app };
}

// Deja las colecciones de datos vacías para un test limpio (conserva sedes/usuarios base).
export function resetDatos(app) {
  const D = app.DB;
  ['medicos', 'obrasSociales', 'pacientes', 'nomenclador', 'reglasReparto',
   'prestacionesRealizadas', 'cobros', 'gastos', 'pagosMedicos', 'cajaMovimientos',
   'cajaCierres', 'contratos', 'aliasContrato', 'valoresMedico', 'consultorios', 'horarios',
   'auditoria'].forEach(c => { D[c] = []; });
  return D;
}

export function setInput(window, id, value) {
  const el = window.document.getElementById(id);
  if (!el) throw new Error('No existe el elemento #' + id);
  el.value = String(value);
  return el;
}
