# Diseño: dropdown de productos en "Nuevo pedido"

**Fecha:** 2026-08-10
**Estado:** Aprobado, implementación directa (sin plan formal)

## Contexto

El formulario de pedido muestra un input de cantidad por CADA producto del catálogo, siempre, aunque no lo vayas a pedir. Con el catálogo ahora extensible (feature de agregar productos), esto se vuelve cada vez más largo y confuso. El dueño quiere un dropdown: elegir producto, cargar cantidad, agregarlo a una lista — solo se ven los productos que realmente van en el pedido.

## Alcance

Incluye: dropdown + cantidad + botón "Agregar" que arma una lista de líneas del pedido; cada línea agregada muestra nombre, cantidad editable inline, botón quitar; el dropdown deja de ofrecer productos ya agregados (sin duplicados); aplica tanto a pedido nuevo como a edición de uno existente.

Fuera de alcance: reordenar líneas, buscar/filtrar dentro del dropdown (5-10 productos no lo necesita).

## Componentes

### `src/Orders.jsx` (modificado)

Reemplaza `qtyInputs` (un valor por CADA producto del catálogo) por:
```js
const [draftLines, setDraftLines] = useState([]); // [{ code, qty: "3" }, ...]
const [selectedProductCode, setSelectedProductCode] = useState("");
const [pendingQty, setPendingQty] = useState("");
```

Derivado en cada render (sin efectos, sin estado que se pueda desincronizar):
```js
const availableProducts = products.filter((p) => !draftLines.some((l) => l.code === p.code));
const effectiveSelectedProductCode = availableProducts.some((p) => p.code === selectedProductCode)
  ? selectedProductCode
  : (availableProducts[0]?.code || "");
```
Así, apenas se agrega un producto, el dropdown cae solo al siguiente disponible (ya no está en `availableProducts`) — no hace falta gestionar el "próximo seleccionado" a mano en `addDraftLine`/`removeDraftLine`.

```js
function addDraftLine() {
  if (!effectiveSelectedProductCode) return;
  const qty = parseInt(pendingQty, 10);
  if (!pendingQty || isNaN(qty) || qty <= 0) {
    onError("Ingresa una cantidad válida.");
    return;
  }
  setDraftLines((lines) => [...lines, { code: effectiveSelectedProductCode, qty: String(qty) }]);
  setPendingQty("");
}

function updateDraftLineQty(code, value) {
  setDraftLines((lines) => lines.map((l) => (l.code === code ? { ...l, qty: value } : l)));
}

function removeDraftLine(code) {
  setDraftLines((lines) => lines.filter((l) => l.code !== code));
}
```

`resetForm()`: `setDraftLines([])` en vez de reconstruir `qtyInputs` completo.

`startEdit(order)`: `setDraftLines(order.lines.map((l) => ({ code: l.code, qty: String(l.qty) })))` — reemplaza el loop que llenaba `qtyInputs` para todos los productos.

`confirmOrder()`: las líneas salen de `draftLines` en vez de iterar `products`:
```js
const lines = draftLines
  .map((l) => ({ code: l.code, qty: parseInt(l.qty, 10) }))
  .filter((l) => !isNaN(l.qty) && l.qty > 0);
```
Resto de la función (validación de nombre, de stock disponible considerando lo reservado al editar, llamada a `onConfirmOrder`/`onEditOrder`) queda igual — solo cambia de dónde sale `lines`.

**UI:**
- Lista de líneas ya agregadas (si `draftLines.length > 0`): nombre del producto + input de cantidad editable + botón "×" para quitar.
- Debajo, si `availableProducts.length > 0`: `<select>` con los productos restantes + input de cantidad + botón "Agregar". Si no queda ninguno (`availableProducts.length === 0`), en su lugar un texto "Todos los productos ya están en el pedido." (no tiene sentido mostrar un dropdown vacío).

## Manejo de errores

- "Agregar" sin cantidad válida → mismo mensaje ya usado para cantidades inválidas ("Ingresa una cantidad válida."), no agrega la línea.
- "Confirmar pedido"/"Guardar cambios" sin ninguna línea agregada → mismo mensaje ya existente ("Agrega al menos un producto al pedido.").

## Verificación (manual, sin suite de tests)

1. Elegir producto en dropdown, cargar cantidad, "Agregar" → aparece en la lista de líneas, dropdown ya no lo ofrece.
2. Agregar los 5 productos → dropdown se reemplaza por "Todos los productos ya están en el pedido."
3. Editar cantidad de una línea ya agregada directo en el input → cambia sin sacarla/re-agregarla.
4. Quitar una línea (×) → vuelve a aparecer disponible en el dropdown.
5. Confirmar pedido sin ninguna línea → bloqueado, mismo mensaje de siempre.
6. Editar un pedido existente (botón "Editar") → la lista de líneas se precarga con lo que el pedido ya tenía, dropdown ofrece el resto.
7. Mobile 375px: dropdown + cantidad + botón, y las líneas agregadas, sin overflow horizontal.
