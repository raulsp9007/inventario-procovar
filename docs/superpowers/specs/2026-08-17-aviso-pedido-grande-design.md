# Diseño: aviso de "pedido grande" al confirmar (vs. umbral de stock bajo)

**Fecha:** 2026-08-17
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué

Al confirmar un pedido nuevo (o guardar una edición), sigue existiendo el bloqueo duro actual: si algún producto no tiene stock suficiente, no deja confirmar (`onError`, sin excepción — se mantiene igual, ya garantiza que nunca se puede tomar un pedido que deje el stock negativo).

Se agrega un aviso **no bloqueante, aparte**: si la cantidad pedida de algún producto (en esta orden nueva) es mayor a su umbral configurado de "aviso de stock bajo" (`lowStockThresholdFor`), se muestra un aviso antes de confirmar — independiente de cuánto stock haya. Ej.: pedir 25 uds de un producto con umbral 20, aunque haya 500 en stock. Con "Confirmar de todas formas" / "Cancelar".

## Por qué dos checks separados

El chequeo de stock insuficiente (bloqueo duro) ya garantiza matemáticamente que el stock nunca puede volverse negativo al confirmar un pedido — no hace falta otro mecanismo para eso. El aviso nuevo es una señal distinta: "este pedido es grande en relación a tu umbral de aviso", útil para notar pedidos inusuales aunque el stock alcance de sobra.

## Componentes

- `InventoryApp.jsx`: pasa `lowStockThresholdFor` como prop nueva a `<Orders>` (ya existe la función, se reusa la misma que usa `ProductsView`).
- `Orders.jsx`: en `confirmOrder()` (función local de validación del formulario), después del chequeo de stock existente, se agrega el chequeo de umbral. Si hay líneas que lo superan y todavía no se confirmó el aviso, se guarda el draft pendiente (`bigOrderWarning: {draft, bigLines}`) y se corta el submit. Banner nuevo (mismo estilo que el aviso de stock negativo de Aplazar) con "Confirmar de todas formas" (envía el draft guardado) / "Cancelar" (descarta el aviso, el formulario queda como estaba).

## Verificación manual

1. Pedido con cantidad menor al umbral de todos sus productos → confirma directo, sin aviso.
2. Pedido con un producto pidiendo más que su umbral, stock de sobra → aviso "Pedido grande" con el producto y cantidad → "Confirmar de todas formas" → se crea el pedido igual. "Cancelar" → no se crea nada, formulario intacto.
3. Pedido sin stock suficiente → sigue bloqueado igual que siempre, sin aviso de por medio (el bloqueo duro corre primero).
