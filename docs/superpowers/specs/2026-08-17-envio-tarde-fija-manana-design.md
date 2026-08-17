# Diseño: marcar "Enviado" después de las 4pm fija el pedido en Mañana

**Fecha:** 2026-08-17
**Estado:** Aprobado, implementación directa (sin plan formal)

## El hueco

La regla anterior (pasadas las 4pm, todo pedido sin enviar cuenta como "mañana") tenía un caso sin cubrir: si un pedido armado antes de las 4pm se marcaba "Enviado" recién después de las 4pm, `!sent` pasaba a ser falso y el pedido "volvía" a Hoy — aunque el envío real (lo que le importa al cliente, cuándo le llega) pasó después del corte.

## Fix

Nuevo campo `sentAt` (timestamp ISO), estampado en `markOrdersSent` (`InventoryApp.jsx`) cada vez que un pedido pasa a `sent: true` (individual o en bloque, mismo update atómico de siempre). `dateUtils.js` gana `wasSentAfterCutoffToday(sentAtIso)` — true si `sentAt` cae en el calendario de hoy y su hora es ≥ 4pm.

La regla de pertenencia a "mañana" pasa a ser:

```
rolledToTomorrow(pedido) = (pasadasLas4pm && !pedido.sent) || wasSentAfterCutoffToday(pedido.sentAt)
```

Se usa igual en `InventoryApp.jsx` (dashboard Hoy/Mañana + header + badge de stock bajo) y en `Orders.jsx` (`belongsToTomorrow`, pestaña Pedidos) — mismo criterio en los dos lugares. `orderHelpers.js` (`groupAllOrders`) propaga `sentAt` al armar cada pedido agrupado.

Pedidos ya enviados ANTES de las 4pm no se ven afectados — `wasSentAfterCutoffToday` da falso, se quedan en Hoy con normalidad. Datos viejos sin `sentAt` (blindaje `m.sentAt || null`) tampoco rompen nada, simplemente no matchean la condición.

## Verificación manual

1. Pedido de hoy, sin enviar, viendo la app a las 5pm → ya estaba en Mañana (regla anterior).
2. Ese mismo pedido, click "Enviar" a las 5pm → se queda en Mañana (antes se hubiera ido de vuelta a Hoy).
3. Pedido de hoy enviado a las 10am, viendo la app a las 5pm → se queda en Hoy, no se mueve.
