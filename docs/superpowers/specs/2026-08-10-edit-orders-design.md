# Diseño: editar pedidos ya hechos

**Fecha:** 2026-08-10
**Estado:** Aprobado, implementación directa (sin plan formal)

## Contexto

"Pedidos" solo permite crear y eliminar pedidos, no corregir uno ya cargado (cliente mal escrito, cantidad equivocada, se olvidó un producto). El dueño quiere poder editar un pedido existente.

## Alcance

Incluye: editar nombre de cliente, flag de domicilio, y líneas (productos/cantidades) de un pedido de hoy, reusando el mismo formulario de "Nuevo pedido".

Fuera de alcance: editar pedidos de días anteriores (la app ya solo muestra "hoy"), historial de ediciones.

## Decisión clave: editar = revertir + reaplicar, mismo `orderId`

Igual criterio que el resto del feature de pedidos (todo vive en `movements`). Editar un pedido:
1. Revierte su efecto actual sobre `stock`/`cumulativeRevenue` (mismo cálculo que `deleteOrder`).
2. Aplica las líneas nuevas como si fuera un pedido recién confirmado (mismo cálculo que `confirmOrder`), pero con el `orderId` original — no se crea un pedido nuevo, se reemplaza el contenido del mismo.
3. Todo en una sola actualización de estado + un solo `persist` (no dos pasos separados, evita un estado intermedio inconsistente si algo falla a mitad de camino).
4. `sent` se resetea a `false` en los movimientos nuevos — el contenido cambió, cualquier mensaje ya enviado por WhatsApp quedó desactualizado.

## Validación de stock al editar

El stock "disponible" para cada producto, mientras edito el pedido X, es `stock[code] + (cantidad que el pedido X ya tenía reservada de ese código antes de editar)`. Así, si no cambiás cantidades, siempre pasa; si aumentás una cantidad, se valida contra lo que realmente queda libre (sin contar lo que el propio pedido ya tenía apartado).

## Componentes

### `src/Orders.jsx` (modificado)

Nuevo estado: `const [editingOrderId, setEditingOrderId] = useState(null)`.

**Botón "Editar" por pedido** (modo normal, junto a Enviar/Eliminar):
```js
function startEdit(order) {
  setCustomerName(order.customerName);
  setIsDelivery(order.isDelivery);
  const inputs = products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {});
  order.lines.forEach((line) => { inputs[line.code] = String(line.qty); });
  setQtyInputs(inputs);
  setEditingOrderId(order.orderId);
}
```

**Formulario de arriba:**
- Título: `editingOrderId ? "EDITAR PEDIDO" : "NUEVO PEDIDO"`.
- Botón principal: `editingOrderId ? "Guardar cambios" : "Confirmar pedido"`.
- Si `editingOrderId`, botón extra "Cancelar edición" (texto, mismo estilo que "Cancelar selección" ya usado) → limpia el formulario y `setEditingOrderId(null)` sin guardar nada.

**`confirmOrder()` (modificado):** misma validación de nombre/líneas que ya existe, pero el chequeo de stock por línea usa disponible ajustado si se está editando:
```js
function confirmOrder() {
  if (!customerName.trim()) {
    onError("Ingresa el nombre del cliente.");
    return;
  }
  const lines = products
    .map((p) => ({ code: p.code, qty: parseInt(qtyInputs[p.code], 10) }))
    .filter((line) => !isNaN(line.qty) && line.qty > 0);
  if (lines.length === 0) {
    onError("Agrega al menos un producto al pedido.");
    return;
  }
  const editingOrder = editingOrderId ? todaysOrders.find((o) => o.orderId === editingOrderId) : null;
  for (const line of lines) {
    const reserved = editingOrder
      ? (editingOrder.lines.find((l) => l.code === line.code)?.qty || 0)
      : 0;
    const available = (stock[line.code] || 0) + reserved;
    if (line.qty > available) {
      const product = products.find((p) => p.code === line.code);
      onError(`No hay suficiente stock de ${product ? product.name : line.code}.`);
      return;
    }
  }
  const draft = { customerName: customerName.trim(), isDelivery, lines };
  if (editingOrderId) {
    onEditOrder(editingOrderId, draft);
    setEditingOrderId(null);
  } else {
    onConfirmOrder(draft);
  }
  setCustomerName("");
  setIsDelivery(false);
  setQtyInputs(products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {}));
}
```

Nuevo prop: `onEditOrder`.

### `src/InventoryApp.jsx` (modificado)

Nueva función:
```js
function editOrder(orderId, { customerName, isDelivery, lines }) {
  const originalMovements = movements.filter((m) => m.orderId === orderId);
  if (originalMovements.length === 0) return;

  const restoredStock = { ...stock };
  let removedRevenue = 0;
  originalMovements.forEach((m) => {
    restoredStock[m.code] = (restoredStock[m.code] || 0) + m.qty;
    removedRevenue += m.qty * (m.unitPrice || 0);
  });

  const nextStock = { ...restoredStock };
  const newMovements = [];
  let addedRevenue = 0;
  lines.forEach(({ code, qty }) => {
    const unitPrice = prices[code] || 0;
    nextStock[code] = (nextStock[code] || 0) - qty;
    newMovements.push(makeMovement(code, "venta", qty, { unitPrice, orderId, customerName, isDelivery, sent: false }));
    addedRevenue += qty * unitPrice;
  });

  const otherMovements = movements.filter((m) => m.orderId !== orderId);
  const nextMovements = [...newMovements, ...otherMovements].slice(0, 500);
  const nextCumulativeRevenue = cumulativeRevenue - removedRevenue + addedRevenue;

  setStock(nextStock);
  setMovements(nextMovements);
  setCumulativeRevenue(nextCumulativeRevenue);
  persist({
    ...currentPersistedState,
    stock: nextStock,
    movements: nextMovements,
    cumulativeRevenue: nextCumulativeRevenue,
  });
}
```
Se pasa como `onEditOrder={editOrder}` a `<Orders />`. La validación de stock ya se hizo en `Orders.jsx` antes de llamar esto (mismo criterio que `confirmOrder`/`onConfirmOrder`, que tampoco revalida en `InventoryApp.jsx`).

## Manejo de errores

- Mismos mensajes que "Nuevo pedido" (nombre vacío, sin productos, stock insuficiente) — la única diferencia es que el disponible de stock se calcula distinto cuando se está editando.
- Cancelar edición → limpia formulario sin tocar el pedido original.

## Verificación (manual, sin suite de tests)

1. Editar un pedido cambiando solo el nombre → stock/ingreso no cambian, nombre se actualiza en la lista.
2. Editar aumentando la cantidad de un producto que tenía stock justo → pasa (se cuenta lo que el pedido ya tenía reservado).
3. Editar aumentando una cantidad más allá del stock real disponible → bloqueado, mensaje de error, nada se modifica.
4. Editar un pedido marcado "Enviado" → tras guardar, "Enviado" queda destildado.
5. "Cancelar edición" a mitad de editar → formulario se limpia, pedido original queda intacto.
6. Recargar tras editar → cambios persisten.
7. Mobile 375px: formulario en modo edición (título + botones) sin overflow.
