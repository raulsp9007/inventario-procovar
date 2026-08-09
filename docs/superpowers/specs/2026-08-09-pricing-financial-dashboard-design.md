# Diseño: precios, reporte financiero semanal/mensual y comisión

**Fecha:** 2026-08-09
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

La app (`inventario-procovar-repo`, desplegada en https://raulsp9007.github.io/inventario-procovar/) hoy trackea solo unidades — stock, ventas, ajustes — sin ningún concepto de precio o dinero. El dueño del negocio pidió 6 cosas; se decidió con él dividirlas en dos proyectos independientes porque una de ellas (catálogo editable de productos: agregar/editar/eliminar) es una pieza arquitectónica separada que afecta cómo se referencian los productos en todo el historial existente:

1. **Este spec** — precio por producto + reporte financiero (semanal, mensual, acumulado general, comisión, conversión a USD).
2. **Spec futuro, separado** — CRUD de productos (agregar/editar/eliminar) en la pantalla de "Ajustar existencias".

## Alcance

Incluye: precio en CUP por producto (editable), toggle para mostrar/ocultar montos en dinero, ingreso total de la semana actual y del mes actual, desglose del mes por semana, total general acumulado histórico, comisión % editable sobre ese total, campo de tasa de cambio editable para mostrar todo también en USD.

Fuera de alcance: CRUD de productos (spec separado), historial de cambios de precio (solo importa el precio vigente al momento de cada venta, no un log de cuándo cambió), soporte multi-moneda más allá de CUP/USD, cualquier sincronización remota.

## Decisiones clave (ya validadas con el dueño del negocio)

- **Un precio por producto, en CUP.** El "Precio USD" que pidió no es un segundo precio por producto — es una tasa de cambio global editable (1 USD = ___ CUP) que convierte los totales calculados en CUP a su equivalente en USD.
- **Precio histórico fijo.** Cada venta guarda el precio vigente en ese momento (`unitPrice` en el movimiento). Si el precio de un producto cambia después, los reportes de semanas/meses pasados NO se recalculan — siguen mostrando lo que realmente se cobró.
- **El % editable es una comisión sobre el total general acumulado histórico** (no sobre semana ni mes) — un solo % editable, un solo resultado.
- **Toggle de precios afecta Stock y Resumen semanal.** Un solo switch oculta/muestra: precio unitario en las tarjetas de Stock, y todos los montos calculados (ingresos, totales, comisión) en Resumen semanal. No oculta los campos de configuración (tasa de cambio, % comisión) en sí — esos son ajustes, no revelan montos de venta por sí solos.
- **"Historial del mes por semana" = mes calendario actual** (día 1 hasta hoy), desglosado en las semanas (lun-dom) que caen dentro de ese rango. Sin selector de meses pasados por ahora.
- **Precio se edita en "Ajustar existencias"**, junto al campo de cantidad existente — no es un CRUD de productos, solo un valor más por editar sobre los 5 productos que ya existen.

## Problema técnico que este diseño tiene que resolver: `persist()` ya no debería seguir creciendo en argumentos posicionales

Una revisión de código de una tarea anterior (Task 7 del plan de PWA) ya advirtió sobre esto: `persist(nextStock, nextMovements, nextLastAdjustedAt)` obliga a cada callsite a saber sobre campos que no le importan, y es una trampa silenciosa — si se agrega un campo nuevo y se olvida un callsite, se sobreescribe ese campo con `undefined` sin ningún error visible. Este spec agrega CUATRO campos nuevos al estado persistido (`prices`, `cumulativeRevenue`, `exchangeRate`, `commissionPercent`, más `showPrices` — cinco en total). Seguir el patrón posicional actual sería claramente peor que la advertencia original. Este es exactamente el caso que esa revisión anticipó — se resuelve como parte de este trabajo, no como refactor aparte.

**Fix:** `persist` pasa a recibir un solo objeto con el estado completo a guardar, en vez de N argumentos posicionales:

```jsx
persist({ stock, movements, lastAdjustedAt, prices, cumulativeRevenue, exchangeRate, commissionPercent, showPrices })
```

Cada callsite arma el objeto solo con los campos que le interesan tocar, usando el resto del estado actual sin tener que enumerarlo todo a mano (ver sección de Componentes).

## Modelo de datos

Nuevo shape persistido bajo la misma key `procovar-inventario-v1`:

```js
{
  stock: { [code]: number },
  movements: [{
    id, code,
    type: "venta" | "ajuste",
    qty,
    unitPrice,        // NUEVO — solo en movimientos type "venta"; precio CUP vigente al momento de la venta. undefined en "ajuste".
    date, timestamp,
  }],
  lastAdjustedAt: { [code]: isoTimestampString },
  prices: { [code]: number },        // NUEVO — precio actual en CUP por producto. Default 0 (= "sin definir").
  cumulativeRevenue: number,          // NUEVO — ingreso histórico acumulado en CUP. Default 0.
  exchangeRate: number | null,        // NUEVO — CUP por 1 USD. Default null (= "sin definir", no se calculan montos USD).
  commissionPercent: number,          // NUEVO — % editable. Default 0.
  showPrices: boolean,                // NUEVO — estado del toggle. Default true.
}
```

**Por qué `cumulativeRevenue` es un campo separado y no se calcula sumando `movements`:** `movements` se recorta a 500 entradas (`.slice(0, 500)`), igual razón por la que `lastAdjustedAt` ya es un campo separado — un negocio con más de 500 movimientos históricos perdería ventas viejas del array y el total general quedaría mal. `cumulativeRevenue` se incrementa en cada venta (`+= qty * unitPrice`) y se decrementa en cada deshacer de una venta (`-= qty * unitPrice`, usando el `unitPrice` guardado en ese movimiento), nunca se recalcula desde cero.

**Migración:** datos guardados antes de este cambio no tienen estos campos — se cargan con los defaults de arriba (`prices: {}`, `cumulativeRevenue: 0`, etc.), igual patrón que ya se usó para `lastAdjustedAt`.

## Componentes

### `src/money.js` (nuevo)

Funciones puras de formato y cálculo, sin estado ni dependencias de React:

```js
formatCUP(amount)                                    // "1.234 CUP" (es-ES, hasta 2 decimales)
formatUSD(amount)                                    // "US$1,234.56"
convertToUSD(cupAmount, exchangeRate)                // null si exchangeRate es null/0, si no cupAmount / exchangeRate
revenueInRange(movements, code, start, end)          // suma qty*unitPrice de ventas de ese código en [start,end]
totalRevenueInRange(movements, start, end)           // suma qty*unitPrice de TODAS las ventas en [start,end], todos los productos
monthWeeklyBreakdown(movements, monthStartStr, todayStr) // [{ weekStart, total }], una fila por cada semana (lun-dom) con al menos un día dentro de [monthStartStr, todayStr], ordenadas ascendente
```

`monthWeeklyBreakdown` agrupa las ventas del rango por el resultado de `getWeekStartStr(m.date)` (ya existe en `dateUtils.js`) y suma `qty*unitPrice` por grupo — como el filtro de rango ya recorta al mes, las semanas que quedan parcialmente fuera del mes (al principio o fin de mes) automáticamente solo suman los días que sí caen dentro, sin lógica de recorte adicional.

### `src/InventoryApp.jsx` (modificado)

- Nuevos estados: `prices`, `cumulativeRevenue`, `exchangeRate`, `commissionPercent`, `showPrices` — cargados desde storage con los defaults de arriba.
- `persist` cambia a la firma de un solo objeto (ver sección anterior). Cada callsite existente (`registerSale`, `undoLast`, `saveEdit`) pasa a construir `{ ...camposQueNoTocó, ...camposQueSíCambió }` en vez de enumerar todos los argumentos.
- `registerSale`: además de lo que ya hace, lee `prices[code] || 0` como `unitPrice`, lo guarda en el movimiento nuevo, e incrementa `cumulativeRevenue` en `qty * unitPrice`.
- `undoLast`: si el movimiento deshecho es `type === "venta"`, decrementa `cumulativeRevenue` en `m.qty * (m.unitPrice || 0)`. Si es `"ajuste"`, no toca `cumulativeRevenue` (comportamiento sin cambios).
- `saveEdit`: agrega un segundo input por producto (precio CUP) junto al de cantidad ya existente. Al guardar, actualiza `prices[code]` para todos los productos (sin condicionar a "cambió o no" — a diferencia del stock, el precio no genera movimiento ni timestamp, así que no hay necesidad de detectar diffs). No toca `cumulativeRevenue` (un ajuste de precio no es una venta).
- Nuevo botón/switch "Mostrar precios" cerca del toggle Stock/Resumen semanal existente, controla `showPrices`, persistido.
- Tarjeta de producto (vista Stock, modo lectura): si `showPrices` es true, muestra una línea "Precio: {formatCUP(prices[code])}" (o "Precio: no definido" si es 0), debajo de la línea de "ajustado". El input de precio en modo edición ("Ajustar existencias") siempre se muestra, sin importar `showPrices` — el toggle solo oculta la vista pasiva, no el campo que necesitás ver para editarlo.

### `src/WeeklySummary.jsx` (modificado)

Recibe props nuevas: `prices`, `cumulativeRevenue`, `exchangeRate`, `commissionPercent`, `showPrices`, más callbacks `onExchangeRateChange`/`onCommissionPercentChange` (para que los inputs editables persistan a través de `InventoryApp`, mismo patrón que ya usan `saleInputs`/`editInputs`).

Estructura de la vista (de arriba hacia abajo, cada sección nueva marcada):

1. Tabla por producto existente (unidades esta semana + comparación) — si `showPrices`, se agrega una columna con el ingreso CUP de esa semana para ese producto (`revenueInRange`).
2. **Nuevo:** "Total semana actual" — `totalRevenueInRange` para el rango de la semana actual, en CUP (+ USD si `exchangeRate` está definido). Oculto si `showPrices` es false.
3. **Nuevo:** "Total mes ({nombre del mes})" — `totalRevenueInRange` para `[inicio de mes, hoy]`. Oculto si `showPrices` es false.
4. **Nuevo:** "Historial semanal de este mes" — una fila por cada elemento de `monthWeeklyBreakdown`, con el rango de fechas de esa semana y su total. Oculto si `showPrices` es false.
5. **Nuevo:** "Total general acumulado" — `cumulativeRevenue` en CUP (+ USD si aplica). Siempre visible el label, el monto oculto si `showPrices` es false.
6. **Nuevo:** campo editable "Tasa de cambio (1 USD = ___ CUP)" — siempre visible y editable, independiente de `showPrices` (es config, no revela ventas).
7. **Nuevo:** campo editable "Comisión (%)" + resultado calculado (`cumulativeRevenue * commissionPercent / 100`, en CUP y USD). El % siempre visible/editable; el resultado en dinero oculto si `showPrices` es false.

## Manejo de errores

- `exchangeRate` inválido (no numérico, negativo, o vacío) → se guarda como `null` (tratado igual que "sin definir"); todo lo que mostraría USD muestra "—" en su lugar.
- `commissionPercent` inválido → se guarda como `0`.
- Producto sin precio definido (`prices[code]` es `0` o no existe) → sus ventas suman `0` a los totales de dinero sin romper nada; la tarjeta muestra "Precio: no definido" en vez de "0 CUP" para que quede claro que es un dato faltante, no un producto gratis.
- `undoLast` sobre una venta cuyo movimiento no tiene `unitPrice` (dato viejo, de antes de este cambio) → trata `unitPrice` como `0` (no resta nada de `cumulativeRevenue`, ya que tampoco se había sumado nada cuando se registró esa venta original).

## Verificación (sin suite de tests, manual como el resto del proyecto)

1. Poner precio a un producto en "Ajustar existencias", guardar, confirmar que aparece en la tarjeta de Stock (con el toggle de precios activo).
2. Vender ese producto, confirmar que "Total semana actual" y "Total mes" en Resumen semanal reflejan `qty * precio`.
3. Cambiar el precio del producto, vender de nuevo, confirmar que el reporte de la venta anterior (ya pasada) no cambió — sigue con el precio viejo.
4. Deshacer la venta más reciente, confirmar que "Total general acumulado" baja exactamente lo que había subido.
5. Poner una tasa de cambio, confirmar que todos los montos CUP muestran también su equivalente USD.
6. Poner un % de comisión, confirmar el cálculo sobre el total acumulado.
7. Apagar el toggle "Mostrar precios", confirmar que se ocultan los montos en Stock y Resumen semanal pero los campos de tasa de cambio/comisión siguen editables.
8. Recargar la página, confirmar que precios, tasa de cambio, comisión, toggle y total acumulado persistieron.
9. Revisar "Historial semanal de este mes" a caballo entre dos meses (datos de prueba con fechas manipuladas) — confirmar que cada semana solo suma los días que caen dentro del mes actual.
10. Confirmar layout mobile (375px) de las nuevas filas/inputs en Resumen semanal — sin overflow horizontal.
