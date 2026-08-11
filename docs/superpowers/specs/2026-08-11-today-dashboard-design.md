# Diseño: pestaña "Hoy" (dashboard del día)

**Fecha:** 2026-08-11
**Estado:** Aprobado, implementación directa (sin plan formal)

## Contexto

Hoy, "vendido hoy" y "stock restante" están dispersos: el header muestra unidades vendidas hoy en general, Stock muestra stock restante por producto pero no lo vendido hoy por producto, Resumen semanal es semanal/mensual/acumulado, no diario. El dueño quiere una vista centralizada: resumen del día + tabla por producto (vendido hoy + stock restante).

## Alcance

Incluye: pestaña nueva "Hoy", resumen arriba (unidades vendidas, ingreso del día, cantidad de pedidos de hoy, HL vendidos hoy), tabla por producto activo (vendido hoy + stock restante), ordenada por más vendido primero.

Fuera de alcance: comparación contra días anteriores (eso ya lo cubre "Resumen semanal" a nivel semana), edición de nada desde acá (es solo lectura).

## Componentes

### `src/Today.jsx` (nuevo)

Props: `products`, `movements`, `stock`, `showPrices`, `exchangeRate`.

```js
const today = todayStr();
const todaysMovements = movements.filter((m) => m.date === today);
const todaysSales = todaysMovements.filter((m) => m.type === "venta");
const unitsSold = todaysSales.reduce((sum, m) => sum + m.qty, 0);
const dayRevenue = totalRevenueInRange(movements, today, today); // ya existe en money.js
const dayRevenueUSD = convertToUSD(dayRevenue, exchangeRate);
const hlSoldToday = totalHlSold(todaysMovements, products); // reutiliza igual, filtra type "venta" adentro
const ordersToday = new Set(todaysSales.filter((m) => m.orderId).map((m) => m.orderId)).size;

const activeProducts = products.filter((p) => !p.archived);
const rows = activeProducts
  .map((p) => ({
    product: p,
    soldToday: todaysSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
    stockLeft: stock[p.code] || 0,
  }))
  .sort((a, b) => b.soldToday - a.soldToday);
```

**Resumen (4 tarjetas o fila de métricas):**
- Unidades vendidas hoy: `unitsSold`.
- Ingreso del día: `formatCUP(dayRevenue)` + `formatUSD(dayRevenueUSD)` si hay tasa — solo si `showPrices` (mismo criterio que el resto de la app: precios se ocultan como bloque).
- Pedidos de hoy: `ordersToday`.
- HL vendidos hoy: `hlSoldToday.toFixed(2)` hL — siempre visible, no depende de `showPrices` (HL no es un dato de precio, mismo criterio que ya se usa en Resumen semanal).

**Tabla por producto:** nombre, vendido hoy (uds), stock restante (uds). Si `rows` no tiene ningún producto con `soldToday > 0`, no hay estado vacío especial — igual se muestra la tabla completa con stock restante (es útil aunque no se haya vendido nada todavía).

### `src/InventoryApp.jsx` (modificado)

- Toggle de vistas gana botón "Hoy" al final (Stock / Resumen semanal / Pedidos / Clientes / **Hoy** / ícono mostrar-ocultar precios).
- `view === "hoy"` renderiza `<Today products={products} movements={movements} stock={stock} showPrices={showPrices} exchangeRate={exchangeRate} />`.

## Manejo de errores

Ninguno — vista de solo lectura, sin inputs que puedan fallar.

## Verificación (manual, sin suite de tests)

1. Con ventas de hoy en 2 productos distintos → resumen muestra unidades/ingreso/pedidos/HL correctos, tabla ordenada por más vendido primero.
2. Producto sin ventas hoy → aparece en la tabla con "0" vendido y su stock restante real.
3. Producto archivado → no aparece en la tabla.
4. `showPrices` desactivado → ingreso del día se oculta, HL y unidades siguen visibles.
5. Sin tasa USD definida → ingreso del día solo en CUP, sin quiebre.
6. Pedido con 2 líneas cuenta como 1 en "Pedidos de hoy" (no 2).
7. Mobile 375px: resumen y tabla sin overflow horizontal.
