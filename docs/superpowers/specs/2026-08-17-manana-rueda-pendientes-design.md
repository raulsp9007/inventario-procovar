# Diseño: Mañana también absorbe pendientes al pasar las 4pm

**Fecha:** 2026-08-17
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué

La pestaña "Mañana" no se limita a lo confirmado después de las 4pm (mecanismo ya existente vía `businessDayStr()`). Ahora, en cuanto pasan las 4pm (hora del dispositivo, ahora mismo), **todo pedido que no esté marcado "Enviado", de cualquier fecha**, pasa a contar como pedido de mañana — incluyendo pedidos de hoy que quedaron sin enviar, y pedidos viejos pendientes de días anteriores. Antes de las 4pm, Mañana sigue mostrando solo lo explícitamente fechado para mañana (pedidos aplazados/editados a esa fecha).

`dateUtils.js` gana `isPastCutoffNow()` (mismo `CUTOFF_HOUR` de `businessDayStr`).

## Regla (aplicada igual en dashboard y en Pedidos)

```
belongsToTomorrow(pedido) = pedido.date === mañana  ||  (pasadasLas4pm && !pedido.sent)
belongsToToday(pedido)    = pedido.date === hoy  &&  !belongsToTomorrow(pedido)
```

- `Today.jsx` deja de filtrar por fecha internamente — ahora recibe `movements` ya recortados por el llamador (`InventoryApp.jsx`), solo resume/muestra. `Tomorrow.jsx` se simplifica igual (ya no calcula `tomorrowStr()`, solo pone las etiquetas).
- `InventoryApp.jsx`: `todaysMovements`/`mananaMovements` se calculan con la regla de arriba antes de pasarlos a `<Today>`/`<Tomorrow>`. El header "VENDIDO HOY" y el badge de stock bajo ("Pendiente: N") también usan `todaysMovements`, así que dejan de contar lo que ya rodó a mañana.
- `Orders.jsx` (pestaña Pedidos): "PEDIDOS DE HOY"/"PEDIDOS DE MAÑANA"/"PEDIDOS ANTERIORES" usan la misma regla (`belongsToToday`/`belongsToTomorrow`), para que la lista de pedidos coincida siempre con lo que muestran las pestañas Hoy/Mañana — un pedido viejo sin enviar que aparece en el resumen de Mañana también aparece ahí en la lista de "Pedidos de mañana", no se queda huérfano en "anteriores".

## Verificación manual

1. Antes de las 4pm: sin cambios, Mañana solo muestra pedidos ya fechados para mañana (aplazados/editados).
2. Pasadas las 4pm (simulado): pedido de hoy sin enviar → desaparece de Hoy (Vendido/Pendiente y "Pedidos de hoy"), aparece en Mañana y "Pedidos de mañana".
3. Pedido viejo (varios días atrás) sin enviar → también rueda a Mañana pasadas las 4pm, sale de "Pedidos anteriores".
4. Pedido de hoy YA enviado → se queda en Hoy siempre, nunca rueda a Mañana.
