# SAM Oftalmología — Diseño del modelo de datos (Etapa 1)

Proyecto **independiente de OIP**: código aparte, base de Supabase aparte. No comparte
médicos, contratos ni valores con ningún otro sistema.

## Almacenamiento (igual que OIP, base propia)

Se usa el mismo esquema genérico que OIP para heredar sus defensas anti-pérdida
(carga paginada, candado anti-pisada, backup diario) sin reescribirlas:

```sql
-- Cada documento de cada colección, como una fila JSON.
create table app_data (
  coleccion text not null,
  doc_id    text not null,
  data      jsonb not null,
  primary key (coleccion, doc_id)
);

-- Config global y contador de ids.
create table app_meta (
  clave text primary key,
  valor jsonb not null
);
```

> RLS / permisos: se definen en la **Etapa 10** (login con Google). Hasta entonces
> el proyecto de SAM se usa solo en local/tests. Para conectarlo, completar
> `SUPABASE_URL` y `SUPABASE_ANON` en `js/persistencia.js`.

## Colecciones (el objeto `DB` en memoria)

| Colección | Etapa | Contenido |
|---|---|---|
| `usuarios` | 1 | Secretarias + admin. Rol: `admin` / `secretaria_1` / `secretaria_2`. Los médicos **no** tienen cuenta. |
| `sedes` | 1 | Hoy solo `SAM`. Todo lleva `sedeId` para agregar sedes sin migrar. |
| `medicos` | 1 | ABM: `{id, nombre, especialidad, matricula, cuit, tel, email, cbu, sedeId, estado, color, formaPago}` |
| `obrasSociales` | 2 | `{id, nombre, codigo, estado}` |
| `pacientes` | 3 | `{id, nombre, apellido, dni, os, plan}` |
| `nomenclador` | 2 | Precios versionados: `{id, codigo, descripcion, categoria, precio, moneda, costo, costoMoneda, vigenciaDesde, vigenciaHasta, estado}` |
| `reglasReparto` | 4 | `% por categoría`: `{id, categoria, medicoId(null=general), porcentaje, vigenciaDesde, vigenciaHasta}` |
| `prestacionesRealizadas` | 3 | `{id, fecha, sedeId, pacienteId, categoria, nomencladorId, medicoRealizadorId, medicoDerivadorId(null), precioCobradoSAM, estado('activa'|'anulada'), motivoAnulacion}` |
| `cobros` | 5 | Ingresos de SAM, sin fórmula: `{id, fecha, prestacionId, pacienteId, monto, moneda, medioPago, sedeId}` |
| `gastos` | 5 | Operativos, monto fijo: `{id, fecha, categoria, monto, moneda, medioPago, sedeId, descripcion}` |
| `pagosMedicos` | 6 | Liquidaciones (nomenclador × %, en pesos): `{id, mes, medicoId, estado, cotizacionUSD, detalle[], total, fechaCierre}` |
| `cajaMovimientos` | 5 | Libro único: `{id, fecha, tipo('ingreso'|'egreso'), descripcion, monto, moneda, medioPago, sedeId, origen('manual'|'pago_medico'|'gasto'|'cobro'), referenciaId, estado}` |
| `auditoria` | 1 (activa) | `{id, fecha, usuario, usuarioId, accion('alta'|'edicion'|'baja'|'anulacion'), entidad, entidadId, antes, despues}` |

`config` y `nextId` van en `app_meta`.

## Categorías de prestación (con % propio) — `CATEGORIAS` en `datos.js`

- `consulta` — valor fijo cargado, **100% al médico** (porcentaje fijo, no editable por regla).
- `cirugia`
- `lio` — % sobre el **neto (precio − costo)**; exclusiva del realizador; costo y precio cada uno en $ o USD.
- `realizacion_estudio`
- `derivacion_estudio` — derivación (en paralelo, sobre el precio de nomenclador).
- `derivacion_cirugia` — derivación (idem).

## Reglas de dinero (cerradas en Etapa 0)

- **Redondeo**: hacia abajo, al peso entero, a favor de la clínica.
- **Dólar**: se convierte a pesos al generar la liquidación (cotización pedida en ese momento).
- **Anulación**: contra-movimiento — el registro queda visible como ANULADO y se genera el negativo que lo compensa.
- **Sin huérfanos**: al corregir/eliminar se limpian todos los rastros; queda en auditoría quién lo hizo.
- **Config de %**: solo el admin.
