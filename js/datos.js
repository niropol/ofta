// ═══════════════════════════════════════════════════════════════════════════
//  SAM Oftalmología — ESTADO / DATOS  (objeto DB en memoria)
// ───────────────────────────────────────────────────────────────────────────
//  Proyecto nuevo e independiente de OIP. NO reutiliza médicos, contratos ni
//  valores de ningún otro sistema. Este módulo se carga PRIMERO: todo el resto
//  depende de DB. Los símbolos (DB, CATEGORIAS, …) son globales a propósito
//  (mismo patrón que OIP: scripts clásicos, funciones colgadas de window).
//
//  Modelo de dinero (cerrado en Etapa 0):
//   - Ingresos  = lo que paga SAM, registrado tal cual (sin fórmula).
//   - Honorario = precio de nomenclador × % del médico (general o por médico),
//                 independiente de lo cobrado.
//   - Consulta  = valor fijo cargado, 100% al médico.
//   - LIO       = cobro y costo (cada uno en $ o USD); % sobre el neto
//                 (precio − costo); exclusiva del realizador.
//   - Derivación= en paralelo, % del derivador sobre el precio de nomenclador.
//   - Dólar     = se convierte a pesos al liquidar (cotización pedida ahí).
//   - Redondeo  = hacia abajo, al peso entero, a favor de la clínica.
//   - Anulación = contra-movimiento (el registro queda visible como ANULADO).
// ═══════════════════════════════════════════════════════════════════════════

// Categorías.
//  - tipo 'realizada'  → prestación que se le hace al paciente, con precio en el
//    nomenclador. Cada una tiene su % de reparto (la consulta es 100% fijo).
//    `permiteDerivador` → puede tener médico derivador; `derivaCategoria` es la
//    categoría de % que cobra ese derivador (en paralelo, sobre el mismo precio).
//    `permiteInsumos` → se le pueden asociar insumos usados (cirugía y práctica).
//  - tipo 'insumo'     → catálogo de insumos (se gestionan en el Nomenclador). NO
//    es una prestación en sí: se usa DENTRO de una cirugía/práctica. Tiene precio
//    y costo real; el % del realizador va sobre el neto (precio − costo).
//  - tipo 'derivacion' → NO es un ítem con precio: es la regla de % del derivador.
const CATEGORIAS = [
  { id: 'consulta',            label: 'Consulta',               tipo: 'realizada', nomenclador: true,  porcentajeFijo: 100,  permiteDerivador: false, derivaCategoria: null,                  usaCosto: false, permiteInsumos: false },
  { id: 'cirugia',             label: 'Cirugía',                tipo: 'realizada', nomenclador: true,  porcentajeFijo: null, permiteDerivador: true,  derivaCategoria: 'derivacion_cirugia',  usaCosto: false, permiteInsumos: true  },
  { id: 'practica',            label: 'Práctica',               tipo: 'realizada', nomenclador: true,  porcentajeFijo: null, permiteDerivador: true,  derivaCategoria: 'derivacion_practica', usaCosto: false, permiteInsumos: true  },
  { id: 'realizacion_estudio', label: 'Realización de estudio', tipo: 'realizada', nomenclador: true,  porcentajeFijo: null, permiteDerivador: true,  derivaCategoria: 'derivacion_estudio',  usaCosto: false, permiteInsumos: false },
  { id: 'insumo',              label: 'Insumo',                 tipo: 'insumo',    nomenclador: true,  porcentajeFijo: null, permiteDerivador: false, derivaCategoria: null,                  usaCosto: true,  netoPrecioMenosCosto: true, permiteInsumos: false },
  { id: 'derivacion_cirugia',  label: 'Derivación de cirugía',  tipo: 'derivacion', nomenclador: false },
  { id: 'derivacion_estudio',  label: 'Derivación de estudio',  tipo: 'derivacion', nomenclador: false },
  { id: 'derivacion_practica', label: 'Derivación de práctica', tipo: 'derivacion', nomenclador: false },
  // Comisión de SAM (parte externa) sobre el neto del insumo, EN PARALELO al médico.
  // Base = neto − honorario del médico. El sobrante queda para SAM Oftalmo (nosotros).
  { id: 'sam_insumo',          label: 'Comisión SAM (insumos)', tipo: 'comision',   nomenclador: false, porcentajeFijo: null },
];
const CATEGORIA_IDS = CATEGORIAS.map(c => c.id);
// Categorías que se cargan en el Nomenclador (tienen precio): prestaciones + insumos.
const CATEGORIAS_NOMENCLADOR = CATEGORIAS.filter(c => c.nomenclador);
// Categorías que se cargan como prestación realizada a un paciente (no incluye insumos).
const CATEGORIAS_REALIZADAS = CATEGORIAS.filter(c => c.tipo === 'realizada');
// Categorías que necesitan una regla de reparto (%). La consulta es 100% fijo, no lleva regla.
const CATEGORIAS_REGLA = CATEGORIAS.filter(c => c.porcentajeFijo == null);
function categoriaInfo(id) { return CATEGORIAS.find(c => c.id === id) || null; }
function derivaCategoriaDe(id) { const c = categoriaInfo(id); return c ? c.derivaCategoria : null; }

// Roles del sistema. Los médicos NO tienen cuenta (no entran al sistema).
const ROLES = ['admin', 'secretaria_1', 'secretaria_2'];

// Monedas soportadas en caja / montos.
const MONEDAS = ['ARS', 'USD'];
const MEDIOS_PAGO = ['efectivo', 'transferencia'];

const DB = {
  // ── Valores globales configurables ──
  config: {
    empresa: 'SAM Oftalmología',
    sedeActiva: 1,
  },

  // ── Usuarios del sistema (secretarias + admin). Sin login todavía (Etapa 10),
  //    pero la tabla existe desde el inicio para enganchar auditoría/permisos. ──
  usuarios: [
    { id: 1, nombre: 'Administrador', email: 'niropol@gmail.com', rol: 'admin', estado: 'Activo' },
  ],

  // ── Sedes. Hoy una sola; modelada con sedeId en todo para agregar más sin migrar. ──
  sedes: [
    { id: 1, nombre: 'SAM', estado: 'Activa' },
  ],

  // ── Médicos (ABM — Etapa 1). Sin datos inventados. ──
  medicos: [],

  // ── Obras sociales / planes (se cobra a pacientes/OS vía SAM). ──
  obrasSociales: [],

  // ── Pacientes (vinculados a cada prestación realizada). ──
  pacientes: [],

  // ── Nomenclador de prestaciones con versionado de precios (Etapa 2). ──
  //    { id, codigo, descripcion, categoria, precio, moneda, costo, costoMoneda,
  //      vigenciaDesde, vigenciaHasta, estado }
  nomenclador: [],

  // ── Reglas de reparto: % por categoría, general (medicoId=null) o por médico,
  //    con vigencia (Etapa 4). La consulta es 100% fijo (no necesita regla). ──
  reglasReparto: [],

  // ── Prestaciones realizadas: consultas/cirugías/derivaciones/estudios (Etapa 3). ──
  //    Guarda medicoRealizadorId y medicoDerivadorId (nullable) por separado.
  //    estado: 'activa' | 'anulada' (+ motivoAnulacion).
  prestacionesRealizadas: [],

  // ── Cobros (ingresos): lo efectivamente pagado por SAM, sin fórmula (Etapa 5). ──
  cobros: [],

  // ── Gastos operativos: monto fijo, no afectan el honorario (Etapa 5). ──
  gastos: [],

  // ── Liquidaciones a médicos: nomenclador × %, siempre en pesos (Etapa 6).
  //    Al cerrarse, cargan su egreso automático en cajaMovimientos. ──
  pagosMedicos: [],

  // ── Caja: libro único de ingresos/egresos, saldo neteado, multi-moneda (Etapa 5).
  //    origen: 'manual' | 'pago_medico' | 'gasto'; referenciaId al origen si es automático.
  //    Los gastos operativos y los ingresos de SAM son movimientos manuales de este libro. ──
  cajaMovimientos: [],

  // ── Cierres/arqueos de caja: por día + moneda + medio, saldo del sistema vs contado. ──
  cajaCierres: [],

  // ── Auditoría de cambios: cada alta/edición/baja/anulación con quién, cuándo,
  //    valor anterior y nuevo. Control de seguridad de caja (Etapa 8, activo ya). ──
  auditoria: [],

  // Contador global de IDs.
  nextId: 1000,
};

// Colecciones que se persisten a la nube (ver persistencia.js). config/nextId van aparte.
const COLECCIONES = [
  'usuarios', 'sedes', 'medicos', 'obrasSociales', 'pacientes', 'nomenclador',
  'reglasReparto', 'prestacionesRealizadas', 'cobros', 'gastos', 'pagosMedicos',
  'cajaMovimientos', 'cajaCierres', 'auditoria',
];

// Genera el próximo id global y lo consume.
function nuevoId() { return DB.nextId++; }

// Helpers de dominio compartidos.
function sedeActiva() { return DB.config.sedeActiva; }
function usuarioActual() {
  // Sin login todavía: el actor por defecto es el admin. En Etapa 10 esto sale de la sesión.
  return (DB.usuarios.find(u => u.rol === 'admin') || DB.usuarios[0] || { nombre: 'sistema' });
}
function getSedesActivas() { return DB.sedes.filter(s => s.estado === 'Activa'); }
function getMedicosActivos() { return DB.medicos.filter(m => m.estado !== 'Inactivo'); }

// Escapa texto para insertarlo en HTML (anti-XSS; mismo criterio que OIP).
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
