# Reserva de pedidos para Hoy/Mañana — Diseño

**Goal:** Separar explícitamente los pedidos "para hoy" de los "reservados para mañana", de modo que solo los de hoy (y los de mañana ya enviados) afecten stock, ingreso y HL. Hoy todo pedido descuenta stock al confirmarlo, sin importar el día al que cae, lo cual confunde al dueño sobre cuánto stock real tiene disponible.

**Contexto actual:** El grupo Hoy/Mañana de un pedido se deriva 100% automático de la hora (corte a las 4pm) vía `isPastCutoffNow`/`wasSentAfterCutoffToday`/`businessDayStr` en `dateUtils.js`, consumido en `useInventoryStore.js` (confirmOrder, editOrder, postponeOrder) y en `Orders.jsx` (agrupación para mostrar). El stock/ingreso/HL se descuentan siempre al confirmar el pedido, sin relación con el grupo.

---

## 1. Modelo central: "comprometido" (committed)

Cada pedido (y sus movimientos) gana un campo nuevo:

- `bucket: "hoy" | "manana"` — elegido al crear el pedido, editable después.

Se define, como regla derivada (no se guarda, se calcula):

```
committed = bucket === "hoy" || (bucket === "manana" && sent === true)
```

El stock (`stock[code]`), `cumulativeRevenue` y `cumulativeHl` **solo reflejan movimientos de pedidos comprometidos**. Cualquier operación que pueda cambiar si un pedido está comprometido (crear, editar cantidades/bucket, marcar/desmarcar Enviado, eliminar) sigue el mismo patrón:

1. Si el pedido **estaba** comprometido antes del cambio → revertir su efecto en stock/ingreso/HL (sumar de vuelta qty al stock, restar revenue/HL).
2. Aplicar el cambio (nuevas líneas, nuevo bucket, nuevo sent).
3. Si el pedido **queda** comprometido después del cambio → aplicar su efecto en stock/ingreso/HL (restar qty del stock, sumar revenue/HL).

Este es el único mecanismo — evita lógica ad-hoc distinta por caso (crear vs editar vs marcar enviado vs eliminar).

El `unitPrice`/`unitHl`/`exchangeRate` se congelan en el movimiento al **crear** el pedido (como ya pasa hoy), no se recalculan al comprometerse después — un pedido de mañana que se envía dos días después se compromete con el precio que tenía cuando se armó.

## 2. Nuevo pedido — selector Hoy/Mañana

El formulario "Nuevo pedido" en `Orders.jsx` gana un selector de dos botones (mismo estilo que `TabButton`) arriba del campo de nombre: **Hoy** / **Mañana**.

- Pre-marcado según hora: antes de las 4pm → Hoy; después → Mañana. Solo es el valor inicial, el usuario lo puede cambiar en cualquier momento antes de confirmar.
- **Hoy**: al confirmar, descuenta stock y suma ingreso/HL de inmediato — igual que el comportamiento actual.
- **Mañana**: al confirmar, NO toca stock/ingreso/HL. Se valida cada línea contra `disponible = stock[code] - reservadoManana(code)` (ver sección 7); si `qty > disponible`, **bloquea la confirmación** con un error (reusa el mecanismo de `onError` ya existente en `Orders.jsx`), no se llega a crear el pedido.

`reservadoManana(code)` = suma de `qty` de todas las líneas con `code` en pedidos `bucket === "manana"` que no están enviados (`sent !== true`), excluyendo el pedido que se está editando si aplica.

## 3. Marcar Enviado / WhatsApp

`markOrdersSent(orderIds, sent)` (en `useInventoryStore.js`) pasa a recorrer cada orderId afectado y, por cada uno, recalcular `committed` antes/después según la regla de la sección 1, aplicando revert/reapply cuando corresponda. Para pedidos `bucket === "hoy"`, `committed` nunca cambia con `sent` (ya estaba comprometido) → sin efecto en stock, igual que hoy.

Desmarcar Enviado en un pedido de mañana ya comprometido revierte completo: devuelve stock, resta ingreso/HL, `committed` vuelve a `false`.

El botón individual "Enviar por WhatsApp" en cada fila (que ya llama a `onMarkSent(orderId, true)` además de abrir WhatsApp) dispara el mismo mecanismo sin cambios en su lógica de envío, solo en lo que `markOrderSent` hace por dentro.

**Envío masivo:** hoy el selector de checkboxes + botón "Enviar por WhatsApp (N)" solo existe arriba de la sección "PEDIDOS DE HOY" en `Orders.jsx` (estado `selectMode`/`selectedIds`, función `confirmBulkSend`, acotado a `todaysOrders`). Se agrega el mismo bloque (mismo componente/lógica, reapuntado) arriba de "PEDIDOS DE MAÑANA", operando sobre `tomorrowsOrders`. `confirmBulkSend` generaliza para recibir la lista de órdenes en vez de asumir siempre `todaysOrders`.

## 4. Editar pedido

El formulario de editar (mismo formulario de "Nuevo pedido", que hoy se reusa vía `editingOrderId`) incluye el mismo selector Hoy/Mañana, precargado con el `bucket` actual del pedido.

Al guardar cambios (`editOrder` en `useInventoryStore.js`), se aplica el mecanismo de la sección 1: revert del estado viejo (según `bucket`/`sent` antes de editar) → aplicar líneas nuevas → reapply según `bucket`/`sent` después de editar. Cambiar el bucket sin tocar cantidades ya dispara correctamente el revert/reapply (ej. mover Hoy→Mañana con las mismas 3 unidades: se devuelven las 3 al stock y no se vuelven a descontar, porque el pedido ya no queda comprometido).

## 5. Eliminar pedido

`deleteOrder` (y el flujo de deshacer 5s ya existente en `Orders.jsx`) solo revierte stock/ingreso/HL si el pedido **estaba comprometido** en el momento de eliminarlo. Un pedido de mañana sin enviar se borra sin tocar stock/ingreso — nunca se habían aplicado.

## 6. Se elimina

- **Botón "Aplazar"** (`postponeOrder`, el ícono de reloj en cada fila) — se quita. Reemplazado por: editar el pedido y cambiar el selector Hoy/Mañana.
- **Lógica de corte automático para bucketing**: `isPastCutoffNow` y `wasSentAfterCutoffToday` dejan de usarse para decidir en qué grupo cae un pedido o para "hacerlo rodar" de día. Se mantiene `isPastCutoffNow` únicamente como input del valor por-default del selector al abrir el formulario de nuevo pedido (sección 2). `dateUtils.js` no pierde funciones usadas en otros lados (`todayStr`, `tomorrowStr`, `businessDayStr`, `formatDate`, etc.).
- La agrupación Hoy/Mañana en `Orders.jsx` (`belongsToToday`/`belongsToTomorrow`) se simplifica a comparar directamente `order.bucket` en vez de fecha + corte horario.

## 7. Visualización

**Pestaña Productos (`ProductsView.jsx`):** debajo del número de stock de cada producto activo (no en modo edición), línea nueva chica:

```
Reservado mañana: {reservadoManana(code)} · Libre: {stock[code] - reservadoManana(code)}
```

Mismo color ámbar (`var(--accent-orange-soft-text)`) que ya se usa para avisos de pendiente. Solo se muestra si `reservadoManana(code) > 0` (si no hay nada reservado, no agrega ruido visual).

**Pedidos → sección Mañana (`Orders.jsx`):** panel nuevo arriba de "PEDIDOS DE MAÑANA", mismo estilo Card que ya se usa, título "DISPONIBLE PARA MAÑANA", una fila por producto activo con `stock[code] - reservadoManana(code)` uds libres. Se calcula con `useMemo` junto a los demás derivados de la sección.

`reservadoManana(code)` se centraliza como una función/selector compartido (probablemente en `orderHelpers.js`, ya que ahí vive `groupAllOrders`) para no duplicar el cálculo entre `ProductsView.jsx` y `Orders.jsx` — recibe `movements`/`allOrders` + `code` y devuelve la suma.

## 8. Pestañas Hoy/Mañana del menú (`Today.jsx`/`Tomorrow.jsx` vía `InventoryApp.jsx`)

- **Hoy**: sin cambios de comportamiento — sigue mostrando movimientos comprometidos de hoy (ahora filtrados por `bucket === "hoy"` en vez del corte horario).
- **Mañana**: pasa a mostrar los pedidos reservados (`bucket === "manana"`, `sent !== true`, es decir NO comprometidos), con un banner de aviso arriba (estilo `Banner variant="warning"`) aclarando: *"Reservado, pendiente de envío — no está descontado del stock ni sumado al ingreso todavía"*. Las stat-cards (unidades, ingreso, HL) muestran esos totales reservados, mismo layout que hoy.

---

## Archivos que cambian

- `src/useInventoryStore.js` — campo `bucket`, mecanismo committed/revert-reapply en `confirmOrder`, `editOrder`, `deleteOrder`, `markOrdersSent`; elimina `postponeOrder`.
- `src/Orders.jsx` — selector Hoy/Mañana en el formulario (nuevo y editar), agrupación por `bucket`, panel "Disponible para mañana", envío masivo también en Mañana, quita botón Aplazar.
- `src/ProductsView.jsx` — línea "Reservado mañana / Libre" por producto.
- `src/orderHelpers.js` — función compartida `reservadoManana`/`availableForTomorrow`.
- `src/Today.jsx` / `src/Tomorrow.jsx` (vía `InventoryApp.jsx`) — Mañana filtra por bucket no-comprometido + banner de aviso.
- `src/dateUtils.js` — `isPastCutoffNow`/`wasSentAfterCutoffToday` dejan de usarse para bucketing (se evalúa si `wasSentAfterCutoffToday` queda sin usos y se puede borrar).

## Migración de datos existentes

Pedidos/movimientos ya guardados en `localStorage` no tienen `bucket`. Al cargar (`applyPersistedData`), a los movimientos sin `bucket` se les asigna uno derivado UNA sola vez (igual que la migración de `cumulativeHl` ya existente): `bucket = "hoy"` si `date === todayStr()` o es pasado, `"manana"` si `date === tomorrowStr()`. Como su stock/ingreso ya fue aplicado en su momento (con la lógica vieja), quedan tratados como **comprometidos** de entrada (no se les revierte nada retroactivamente) — la migración es solo para que dejen de depender del corte horario hacia adelante.

## Fuera de alcance

- No se toca la lógica de `Clientes`, `Resumen semanal` ni exportar/importar backup (siguen leyendo `movements` tal cual, el campo `bucket` viaja con ellos sin romper nada por el patrón `|| default` ya usado en todo el código).
- No se agrega un tercer bucket ni reservas para más de un día adelante.
