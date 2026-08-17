# Diseño: aplazar pedido = tratarlo como pedido nuevo (rev. de la directiva anterior)

**Fecha:** 2026-08-17
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué cambia

La versión anterior de "Aplazar" (2026-08-15) solo movía el campo `date` con un selector manual, sin tocar stock/precio (razonamiento: el stock es un contador único, no partido por día, así que ya reflejaba todo). Nueva directiva: aplazar un pedido viejo debe tratarse **como si fuera un pedido nuevo hecho ahora mismo** — mismos productos/cantidades, pero:

- Fecha automática = `businessDayStr()` (hoy o mañana según el corte de las 4pm), **sin selector manual**.
- `unitPrice`/`unitHl`/tasa se recalculan contra los valores **actuales** (`prices`, `product.hl`, `exchangeRate` de ahora), no los que tenía el pedido original.
- Motivo: en el día a día puede haber cambiado el precio o los datos del producto entre que se armó el pedido y que se aplaza.

## Implementación

`postponeOrder(orderId)` en `InventoryApp.jsx` deja de tener lógica propia — reusa `editOrder`, que ya hace exactamente esto (restaura stock viejo contra el stock actual, resta el nuevo, recalcula precio/HL/acumulados) cuando se le pasa una fecha explícita. `editOrder` gana un 3er parámetro opcional `dateOverride`:

- Edición normal (formulario "Editar pedido"): no pasa `dateOverride`, sigue preservando la fecha original (sin cambios de comportamiento).
- `postponeOrder`: arma `{customerName, isDelivery, lines}` a partir de los movimientos actuales del pedido (sin cambiarlos) y llama `editOrder(orderId, draft, businessDayStr())`.

Matemáticamente, si la cantidad no cambia, el número de stock del producto **no varía** (se restaura +qty y se resta -qty, neto cero) — lo único que cambia es fecha, precio/HL congelados y los acumulados (`cumulativeRevenue`/`cumulativeHl`, que sí reflejan la diferencia de precio).

## Aviso de stock negativo (se mantiene)

Sigue igual: antes de aplazar, si `stock[code]` actual es negativo para algún producto del pedido, se avisa con la lista de productos y stock negativo, con "Aplazar de todos modos" / "Cancelar". Como el aplazamiento no cambia la cantidad, el chequeo contra el stock actual (`stock[code] < 0`) sigue siendo el indicador correcto — matemáticamente equivalente a comprobar el resultado post-recalculo.

## UI (`Orders.jsx`)

Se quita el selector de fecha inline y sus botones "Confirmar"/"Cancelar" — el botón calendario ahora ejecuta directo (como Enviar/Eliminar), salvo que haya stock negativo, en cuyo caso aparece el aviso con "Aplazar de todos modos"/"Cancelar" (sin cambios respecto a la versión anterior, solo que ya no depende de una fecha elegida a mano).

## Verificación manual

1. Pedido viejo, precio del producto cambiado desde entonces, stock sin problema → Aplazar → pasa a "Pedidos de hoy", precio del pedido usa el precio ACTUAL, stock del producto no cambia, `cumulativeRevenue` ajustado a la diferencia.
2. Pedido viejo con stock actual negativo → Aplazar → aviso con el producto y su stock negativo → "Aplazar de todos modos" → se aplica igual, mismo recálculo de precio.
3. Editar pedido (formulario normal, sin aplazar) → sigue preservando la fecha original, sin cambios.
