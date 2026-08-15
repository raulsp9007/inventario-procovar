# Diseño: editar nombre de cliente

**Fecha:** 2026-08-14
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué

`customerName` no es una entidad separada, es un string repetido en cada movimiento de pedido (`groupAllOrders` los agrupa por `orderId`, y `Customers.jsx`/`getCustomerStats` los agrupa por `customerName`). "Editar el nombre de un cliente" = renombrar ese string en **todos** los movimientos que lo tienen, para no perder ni duplicar el historial de compras.

`InventoryApp.jsx` gana `renameCustomer(oldName, newName)`: un solo `movements.map` + `setMovements`/`persist` (mismo patrón que `markOrdersSent`, para evitar el bug de closure ya encontrado con updates encadenados). Si `newName` coincide con un cliente ya existente, sus historiales quedan fusionados — comportamiento esperado, no se bloquea.

`Customers.jsx`: ícono de lápiz junto al nombre en cada fila. Click abre un input inline con el nombre actual; Guardar llama `onRenameCustomer(oldName, trimmed)`. Bloquea guardar si el nuevo nombre queda vacío tras trim.

## Verificación manual

1. Cliente con 3 pedidos → renombrar → los 3 pedidos (en Pedidos y en el historial expandido de Clientes) muestran el nombre nuevo.
2. Renombrar a un nombre que ya existe → ambos historiales se fusionan bajo una sola fila.
3. Intentar guardar vacío → no hace nada, mantiene el nombre anterior.
