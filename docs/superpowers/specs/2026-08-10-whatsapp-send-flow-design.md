# Diseño: envío por WhatsApp individual + selección múltiple, nuevo formato de mensaje

**Fecha:** 2026-08-10
**Estado:** Aprobado, implementación directa (sin plan formal)

## Contexto

Hoy "Pedidos" tiene un solo botón "Enviar por WhatsApp" que arma un mensaje con TODOS los pedidos de hoy combinados en un solo texto (`formatOrdersForWhatsApp`, una línea por pedido: `"Nombre: 2x Producto, 1x Producto"`). El dueño quiere: elegir cuáles pedidos manda en cada momento (no siempre todos juntos), un mensaje de WhatsApp separado por cada pedido (nunca combinados), un checkbox "Enviado" por pedido que evite reenviar el mismo dos veces, y un formato de mensaje distinto (nombre en su propia línea, un producto por línea).

## Alcance

Incluye: nuevo formato de mensaje multilínea, botón "Enviar" individual por pedido, modo de selección múltiple activado por el botón general "Enviar por WhatsApp", checkbox "Enviado" persistido por pedido (manual, editable siempre), saltos de línea reales en el texto que llega a WhatsApp.

Fuera de alcance: historial de envíos (cuándo se envió, cuántas veces), reenvío automático, edición del texto del mensaje antes de enviar.

## Formato de mensaje (reemplaza el actual)

```
NOMBRE CLIENTE (a domicilio)
Producto1 - 2
Producto2 - 1
```

`(a domicilio)` solo si `isDelivery`. Nombre completo de producto (`product.name`, no abreviado). Un mensaje = un pedido, siempre — nunca se combinan varios pedidos en un mismo texto, ni siquiera en el modo de selección múltiple (ahí se abre un `wa.me` por cada pedido seleccionado, uno detrás de otro).

Saltos de línea reales: el texto se arma con `"\n"` entre líneas y `encodeURIComponent` se encarga de codificarlos como `%0A` en la URL — así es como `wa.me` ya recibe saltos de línea interpretables (esto es como ya funciona `encodeURIComponent`, no hace falta nada especial más que no perder los `\n` en el join).

## Dato `sent` (nuevo campo en movimientos de pedido)

Mismo patrón que `customerName`/`isDelivery`: cada movimiento de una línea de pedido lleva `sent: boolean`, duplicado igual en todas las líneas del mismo pedido. Pedido viejo sin este campo → `false` por defecto (blindaje ya usado en todo el proyecto — ver comentario en `InventoryApp.jsx` sobre `|| default`).

## Componentes

### `src/orderHelpers.js` (modificado)

```js
formatOrderForWhatsApp(order, products)
// UN pedido -> el texto multilínea de arriba. Reemplaza formatOrdersForWhatsApp
// (que combinaba varios). Nombre de línea: `${product ? product.name : line.code} - ${line.qty}`.

groupOrders(movements, dateStr)
// Sin cambios en la firma. Agrega `sent` al objeto de cada pedido:
// sent: !!(primer movimiento del grupo).sent
```

`formatOrdersForWhatsApp` (plural, combinaba todos) se elimina — ya no tiene uso, ningún flujo combina pedidos en un solo mensaje.

### `src/Orders.jsx` (modificado)

Nuevo estado local: `const [selectMode, setSelectMode] = useState(false)` y `const [selectedIds, setSelectedIds] = useState(new Set())`.

**Botón general "Enviar por WhatsApp" (arriba, donde ya está):**
- Si `!selectMode`: al tocarlo, `setSelectMode(true)` (no envía nada todavía, solo activa selección).
- Si `selectMode`: cambia a "Confirmar envío (`selectedIds.size`)" — al tocarlo, por cada pedido en `selectedIds`, abre `window.open(wa.me con formatOrderForWhatsApp(order, products))`, llama a `onMarkSent(orderId, true)` para cada uno, y sale de `selectMode` (`setSelectMode(false)`, `setSelectedIds(new Set())`).
- Deshabilitado si no hay pedidos hoy (igual que ya está) o, en modo selección, si `selectedIds.size === 0`.

**Por pedido en la lista, dos variantes de fila:**
- Modo normal (`!selectMode`): checkbox "Enviado" (`order.sent`, `onChange` llama `onMarkSent(orderId, next)`) + botón "Enviar" individual (abre `wa.me` de ESE pedido solo, sin tocar el checkbox) + botón eliminar (ya existe).
- Modo selección (`selectMode`): si `order.sent` es `true`, checkbox tildado y deshabilitado (no se puede volver a incluir); si no, checkbox normal que agrega/saca el `orderId` de `selectedIds`. Se ocultan los botones "Enviar" individual y eliminar mientras dura la selección (evita acciones cruzadas a medio seleccionar).

Nuevo prop: `onMarkSent(orderId, sent)`.

### `src/InventoryApp.jsx` (modificado)

Nueva función:
```js
function markOrderSent(orderId, sent) {
  const nextMovements = movements.map((m) =>
    m.orderId === orderId ? { ...m, sent } : m
  );
  setMovements(nextMovements);
  persist({ ...currentPersistedState, movements: nextMovements });
}
```
Se pasa como `onMarkSent={markOrderSent}` a `<Orders />`.

## Manejo de errores

- Confirmar envío en modo selección sin nada tildado → botón deshabilitado, no hay error que mostrar (igual criterio que "Enviar por WhatsApp" deshabilitado sin pedidos).
- Pedido ya marcado "Enviado" → no aparece seleccionable en modo selección (evita reenvío accidental), pero sigue teniendo su checkbox "Enviado" tildado y editable en modo normal por si hace falta destildarlo.

## Verificación (manual, sin suite de tests)

1. `formatOrderForWhatsApp` de un pedido con 2 productos, sin domicilio → texto exacto: `"Nombre\nProducto1 - 2\nProducto2 - 1"` (verificar `\n` reales, no `\\n` literal).
2. Mismo pedido con `isDelivery: true` → primera línea `"Nombre (a domicilio)"`.
3. Botón "Enviar" individual de un pedido → abre `wa.me` con el texto de ESE pedido solo, checkbox "Enviado" de esa fila NO cambia solo.
4. Tildar "Enviado" a mano en modo normal → persiste, sigue tildado tras recargar.
5. Botón general "Enviar por WhatsApp" con pedidos de hoy → entra en modo selección, checkboxes aparecen, pedidos ya "Enviado" salen tildados y bloqueados.
6. Seleccionar 2 pedidos no enviados, "Confirmar envío" → se abren 2 `wa.me` (uno por pedido, textos distintos), ambos quedan marcados "Enviado" solos, modo selección se cierra.
7. Destildar "Enviado" de un pedido que se mandó por error → vuelve a aparecer seleccionable en el modo selección.
8. Simular pedido guardado sin campo `sent` en sus movimientos (dato de versión anterior) → `groupOrders` lo trata como `sent: false`, sin crash.
9. Mobile 375px: fila de pedido en modo normal y en modo selección, sin overflow horizontal.
