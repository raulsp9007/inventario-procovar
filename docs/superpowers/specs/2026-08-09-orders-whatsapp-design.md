# Diseño: sistema de pedidos + envío por WhatsApp

**Fecha:** 2026-08-09
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Hoy la app registra ventas sueltas por producto (botón "+"), sin noción de cliente ni de "pedido" con varias líneas. El dueño del negocio pidió poder armar un pedido con nombre y apellidos del cliente + lo que pide, marcar si es con entrega a domicilio, y al final del día mandar un resumen de todos los pedidos por WhatsApp.

## Alcance

Incluye: pantalla nueva "Pedidos" (tercera pestaña junto a Stock/Resumen semanal), armado de pedido (nombre cliente + cantidad por producto del catálogo existente + checkbox domicilio), confirmación que descuenta stock igual que una venta, lista de "Pedidos de hoy" con opción de eliminar un pedido completo, botón que abre WhatsApp con el resumen del día ya redactado.

Fuera de alcance: envío automático/programático de WhatsApp (imposible sin backend — se abre `wa.me` con el texto precargado y el dueño elige contacto/grupo y toca enviar), campo de dirección, historial de pedidos de días anteriores (solo "hoy", igual que "Vendido hoy" ya funciona), estados de pedido tipo pendiente/entregado (un pedido confirmado ya se considera hecho, igual que una venta).

## Decisión clave: los pedidos NO son una entidad nueva — son `movements` agrupados

Un pedido con 2 productos genera 2 `movements` de `type: "venta"` (los mismos que ya usa el resto de la app), pero comparten un `orderId` nuevo y llevan `customerName`/`isDelivery` — así toda la lógica de stock, precio congelado al vender, e ingreso acumulado ya construida se reutiliza sin duplicar nada. Una venta suelta (botón "+" existente) simplemente no lleva esos 3 campos. "Pedidos de hoy" es literalmente: filtrar `movements` de hoy con `orderId` definido y agruparlos por ese id.

Se descartó una entidad `orders` separada (un array paralelo) — obligaría a mantener dos fuentes de verdad sincronizadas (¿qué pasa si se borra un movimiento pero no el pedido, o viceversa?) por ningún beneficio real, ya que todo lo que un pedido necesita (producto, cantidad, precio, fecha) ya vive en un movimiento.

## Modelo de datos

`movements[]` gana 3 campos opcionales, presentes solo en movimientos creados desde Pedidos:

```js
{
  id, code, type: "venta", qty, unitPrice, date, timestamp,  // ya existen
  orderId,       // NUEVO — string, compartido por todas las líneas del mismo pedido
  customerName,  // NUEVO — string, igual en todas las líneas del mismo pedido
  isDelivery,    // NUEVO — boolean, igual en todas las líneas del mismo pedido
}
```

No hace falta ningún campo nuevo en el nivel raíz del estado persistido (`prices`, `cumulativeRevenue`, etc. no cambian) — todo vive dentro de `movements`, que ya se persiste.

## Componentes

### `src/orders.js` (nuevo, helpers puros — mismo patrón que `money.js`)

```js
groupOrders(movements, dateStr)
// Filtra movements de esa fecha con orderId definido, agrupa por orderId.
// Devuelve [{ orderId, customerName, isDelivery, timestamp, lines: [{ code, qty }] }],
// ordenado por timestamp ascendente (orden en que se armaron los pedidos).

formatOrdersForWhatsApp(orders, products)
// Arma el texto final: una línea por pedido,
// "📦 {customerName} (a domicilio): {qty}x {producto}, {qty}x {producto}"
// o "{customerName}: {qty}x {producto}..." si no es domicilio.
// products se usa para resolver code → nombre. Une todo con "\n".
```

### `src/Orders.jsx` (nuevo componente, vista "Pedidos")

Props: `products`, `movements`, `stock`, `onConfirmOrder(draft)`, `onDeleteOrder(orderId)`, `onError(message)`.

Estado local (no persistido, mismo criterio que `saleInputs`/`editInputs` en `InventoryApp.jsx`): nombre del cliente (string), checkbox domicilio (bool), y un input de cantidad por cada uno de los 5 productos (mismo patrón visual que "Ajustar existencias": todos los productos visibles a la vez, se llena cantidad solo en los que el cliente pidió).

Botón "Confirmar pedido":
1. Valida nombre no vacío.
2. Valida al menos un producto con cantidad > 0.
3. Valida que cada producto con cantidad > 0 tenga stock suficiente (`qty <= stock[code]`) — si CUALQUIERA falla, no se confirma nada (todo o nada, mismo criterio que ya bloquea sobreventa en una venta suelta). Mensaje de error nombra el producto sin stock.
4. Si todo pasa, llama a `onConfirmOrder({ customerName, isDelivery, lines: [{code, qty}, ...] })` y limpia el formulario.

Sección "Pedidos de hoy": lista los pedidos de `groupOrders(movements, todayStr())`, cada uno mostrando cliente (+ícono si domicilio) y sus líneas ("2x Parranda 1500ml, 1x Malta 330ml"), con un botón eliminar (🗑) por pedido.

Botón "Enviar por WhatsApp" (deshabilitado si no hay pedidos hoy): arma el texto con `formatOrdersForWhatsApp` y abre `https://wa.me/?text=${encodeURIComponent(texto)}` en una pestaña nueva.

### `src/InventoryApp.jsx` (modificado)

- Nuevo estado `view` gana un tercer valor `"pedidos"`, tercer botón en el toggle existente (Stock / Resumen semanal / Pedidos).
- `onConfirmOrder(draft)`: genera un `orderId` nuevo, crea un movimiento `"venta"` por cada línea (reutilizando `makeMovement` con `extra` para agregar `unitPrice` + `orderId` + `customerName` + `isDelivery`), descuenta stock de cada producto, suma a `cumulativeRevenue` la suma de `qty*unitPrice` de todas las líneas — mismo mecanismo que `registerSale`, aplicado a varias líneas de una.
- `onDeleteOrder(orderId)`: encuentra todos los movimientos con ese `orderId`, revierte stock y `cumulativeRevenue` de cada uno (mismo cálculo que la rama "venta" de `undoLast`, aplicado a cada línea), los saca de `movements`, persiste una sola vez al final (no una vez por línea).
- `onError`: reutiliza el `error`/`setError` ya existente (mismo banner que ya se muestra para errores de venta), para no duplicar UI de error.

## Manejo de errores

- Nombre vacío → "Ingresa el nombre del cliente."
- Ningún producto con cantidad → "Agrega al menos un producto al pedido."
- Stock insuficiente en algún producto → "No hay suficiente stock de {nombre producto}." — no se descuenta nada, ni de los productos que sí tenían stock.
- "Enviar por WhatsApp" sin pedidos hoy → botón deshabilitado, no hay error que mostrar.

## Verificación (manual, sin suite de tests)

1. Armar pedido con 2 productos + nombre + domicilio, confirmar → stock de ambos productos baja, aparece en "Pedidos de hoy" con el ícono de domicilio.
2. Confirmar sin nombre → bloqueado.
3. Confirmar sin ningún producto → bloqueado.
4. Confirmar con cantidad mayor al stock de un producto → bloqueado, y el OTRO producto del mismo pedido (que sí tenía stock) tampoco se descuenta.
5. Eliminar un pedido → stock e ingreso acumulado vuelven exactamente a sus valores antes del pedido, desaparece de la lista.
6. Armar 2 pedidos de clientes distintos (uno con domicilio, otro sin), "Enviar por WhatsApp" → confirma que abre `wa.me` con el texto correcto y el formato de domicilio solo en el que corresponde.
7. Confirmar que los movimientos de un pedido aparecen igual que cualquier venta en "Historial de movimientos" (Stock) y suman en "Resumen semanal" — mismo pipeline, sin caso especial.
8. Mobile 375px: formulario, lista de pedidos de hoy, botón de WhatsApp — sin overflow horizontal.
9. Recargar la página → pedidos del día siguen ahí (son `movements`, ya persistidos por el mecanismo existente, sin cambios necesarios ahí).
