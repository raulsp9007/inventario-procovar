# Diseño: aplazar pedido (cambiar fecha) + aviso de stock negativo

**Fecha:** 2026-08-15
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué

Botón nuevo "Aplazar" (ícono calendario) en cada pedido, junto a Editar/Enviar/Eliminar. Abre un input de fecha inline (mín. hoy = día hábil actual, default hoy). Al confirmar, cambia **solo** el campo `date` en todos los movimientos del pedido — no toca productos, cantidades, precio ni HL. `sent` y `confirmed` vuelven a `false` (mismo criterio que "Editar pedido": nueva fecha de entrega implica re-confirmar con el cliente).

El stock **no se recalcula al aplazar** — ya está descontado desde que se confirmó el pedido (el contador de stock no está partido por día, así que "aplazar" no mueve inventario, solo la fecha de atribución).

## Aviso de stock negativo

Antes de aplicar el aplazamiento, se revisa cada línea del pedido contra el `stock[code]` actual (el mismo número ya refleja todo lo comprometido — pedidos enviados y pendientes — porque el descuento pasa al confirmar, no al enviar). Si algún producto de la línea tiene stock actual `< 0`, se muestra un aviso inline con la lista de productos afectados y su stock negativo, con dos botones: "Aplazar de todos modos" / "Cancelar". Sin negativos, aplazar sucede directo al confirmar la fecha, sin aviso extra.

## Componentes

- `InventoryApp.jsx`: nueva función `postponeOrder(orderId, newDateStr)` — un solo `movements.map` + `setMovements`/`persist` (mismo patrón atómico que `markOrdersSent`, para evitar el bug de closure ya encontrado). Pisa `date` y resetea `sent`/`confirmed` en los movimientos del pedido. Se pasa como prop `onPostponeOrder` a `Orders`.
- `Orders.jsx`: estado nuevo `postponingOrderId`, `postponeDateInput`, `postponeWarning` (`{orderId, date, negatives}` cuando hace falta confirmar). Botón calendario abre el input de fecha inline en la fila del pedido; al confirmar, calcula negativos (`stock[code] < 0` para cada línea) usando el prop `stock` ya disponible — si hay, muestra el aviso; si no, llama `onPostponeOrder` directo.

## Verificación manual

1. Pedido viejo pendiente, sin stock negativo → Aplazar a hoy → fecha cambia, aparece en "Pedidos de hoy", `sent`/`confirmed` en false.
2. Pedido con un producto en stock negativo (forzado con ajuste manual) → Aplazar → aparece aviso con el producto y su stock negativo → "Aplazar de todos modos" → se aplica igual. "Cancelar" → no cambia nada.
3. Intentar elegir fecha pasada → bloqueado por `min` del input.
