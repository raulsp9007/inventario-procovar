# Diseño: backup, HL robusto, refactor de Productos, confirmación al eliminar pedido

**Fecha:** 2026-08-11
**Estado:** Aprobado (a partir de recomendaciones de análisis de la app), implementación directa

## Contexto

Tras un análisis completo de la app, el dueño pidió aplicar 6 de las recomendaciones: exportar/importar datos (#1), robustecer el conteo de HL contra el límite de 500 movimientos (#2), separar la pestaña Productos en su propio archivo (#4), extraer componentes de estilo repetido (#6), confirmar antes de eliminar un pedido (#7), y congelar la tasa de cambio por venta (#9). Requisito explícito: **ningún dato actual existente se puede perder**.

## 1. Exportar / Importar datos

`src/backup.js` (nuevo, helpers puros):
```js
export function exportBackup(persistedState) {
  const blob = new Blob([JSON.stringify(persistedState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `procovar-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```
En `InventoryApp.jsx` (o `ProductsView.jsx`, ver sección 3): botón "Exportar datos" llama `exportBackup(currentPersistedState)`. Botón "Importar datos" abre un `<input type="file" accept="application/json">` oculto; al elegir archivo, `FileReader` + `JSON.parse`, pide confirmación explícita (acción irreversible: pisa TODO lo que hay guardado) con un estado de "click de nuevo para confirmar" (mismo patrón que la confirmación de eliminar pedido, sección 5) antes de aplicar `setX(...)` por cada campo + `persist(...)`. Si el JSON no parsea o no es un objeto, error visible, no se toca nada.

No se agrega ningún campo nuevo al modelo de datos — el archivo exportado es exactamente lo que ya se persiste.

## 2. HL: contador corriente + congelado por venta

Mismo patrón que ya usa `cumulativeRevenue`/`unitPrice`, aplicado a HL:

- Movimientos de venta (`confirmOrder`, `editOrder`) estampan `unitHl: product.hl || 0` (congelado, como `unitPrice`) además de lo que ya estampan.
- Nuevo estado `cumulativeHl`, en `currentPersistedState`. `confirmOrder` lo incrementa (`+= qty * unitHl` por línea), `deleteOrder`/`editOrder` lo revierte usando `m.unitHl` del movimiento original (no el HL actual del producto — así una edición posterior del HL de catálogo no descuadra un revertido de algo vendido antes con otro valor).
- **Migración (garantiza no perder HL ya contado):** al cargar, si `parsed.cumulativeHl` es `null`/`undefined` (usuario con datos de antes de este cambio), se calcula UNA vez `totalHlSold(parsedMovements, parsedProducts)` (la función derivada que ya existe, usando el HL actual de cada producto para movimientos viejos sin `unitHl`) y se usa como valor inicial de `cumulativeHl`, persistido de inmediato. De ahí en adelante, `cumulativeHl` es la fuente de verdad — ya no se recorta si `movements` supera 500 entradas.
- `money.js` → `totalHlSold(movements, products)` se ajusta para preferir `m.unitHl` cuando está presente, y solo hacer el lookup en vivo `product.hl` como fallback para movimientos viejos sin ese campo — sigue usándose tal cual en `Today.jsx` (HL vendido HOY, período acotado, no necesita el contador corriente).
- `WeeklySummary.jsx`: la sección HECTOLITROS pasa de `totalHlSold(movements, products)` a recibir `cumulativeHl` como prop (total general, igual que ya hace con `cumulativeRevenue`).

## 3. Separar Productos en `ProductsView.jsx`

Extrae de `InventoryApp.jsx` todo el bloque `view === "stock"` (tarjetas de producto, modo edición, agregar producto, productos eliminados, historial de movimientos) a `src/ProductsView.jsx`. Recibe como props: `products`, `activeProducts`, `archivedProducts`, `stock`, `prices`, `movements`, `lastAdjustedAt`, `showPrices`, `editMode`, `onToggleEditMode`, `editInputs`/`setEditInputs` (+ los otros 4 pares de edit-inputs), `newProductName`/`setNewProductName`, `newProductHl`/`setNewProductHl`, `showArchived`/`setShowArchived`, `onSaveEdit`, `onAddProduct`, `onArchiveProduct`, `onRestoreProduct`. `InventoryApp.jsx` conserva el estado (sigue siendo la única fuente de verdad y quien persiste) y solo delega el render + los handlers ya definidos.

## 4. `TabButton` + `FieldLabel`

`src/TabButton.jsx`:
```jsx
export default function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
      borderRadius: 7, border: "1px solid #22261F",
      background: active ? "#22261F" : "transparent",
      color: active ? "#F7F4EC" : "#22261F",
    }}>
      {children}
    </button>
  );
}
```
`src/FieldLabel.jsx`:
```jsx
export default function FieldLabel({ children }) {
  return <div style={{ fontSize: 10, color: "#9A9484", letterSpacing: "0.04em", marginBottom: 3 }}>{children}</div>;
}
```
Se aplican en la barra de pestañas de `InventoryApp.jsx` y en los 4 labels de edición dentro de `ProductsView.jsx` (mismo lugar que ya se está tocando por la separación de archivo — no se sale a barrer el resto de la app buscando más candidatos, alcance acotado).

## 5. Confirmar antes de eliminar pedido

`Orders.jsx`: nuevo estado `const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)`. Botón eliminar de una fila:
- Si `confirmingDeleteId !== order.orderId`: primer click → `setConfirmingDeleteId(order.orderId)`, ícono/texto cambia a "¿Seguro?" en rojo, arranca un `setTimeout` de 3s que hace `setConfirmingDeleteId(null)` si no se confirma.
- Si `confirmingDeleteId === order.orderId`: segundo click → `onDeleteOrder(order.orderId)`, `setConfirmingDeleteId(null)`.

Mismo criterio se aplica al botón "Importar datos" de la sección 1 (reutiliza el mismo patrón de doble-click, no un modal).

## 6. Congelar tasa USD por venta

`confirmOrder`/`editOrder` agregan `exchangeRate` (el valor actual del estado, puede ser `null`) a cada movimiento nuevo, igual que `unitPrice`/`unitHl`. No se lee ni se muestra en ningún lado todavía — es una base para un reporte histórico en USD futuro, sin inventar UI que nadie pidió. Cero cambio de comportamiento visible hoy.

## Garantía "no se pierde ningún dato actual"

- Ningún campo existente se elimina ni se renombra.
- El único dato "recalculado" es `cumulativeHl`, y se hace explícitamente a partir de lo que ya existe (`totalHlSold` sobre los `movements` actuales) antes de empezar a incrementarlo — no arranca en cero.
- Exportar/Importar no toca el storage salvo que el usuario explícitamente confirme una importación (doble click).
- La separación de `ProductsView.jsx` y los componentes `TabButton`/`FieldLabel` son refactors de UI puros — cero cambio de datos ni de comportamiento.

## Verificación (manual, sin suite de tests)

1. Exportar datos → se descarga un `.json` con el contenido real actual.
2. Importar un backup → primer click pide confirmación, segundo click reemplaza todo y persiste; JSON inválido → error, nada se toca.
3. Simular usuario con ventas viejas (movements con `unitPrice` pero sin `unitHl`, sin `cumulativeHl` en el storage) y productos con `hl` definido → al cargar, `cumulativeHl` se siembra con el total derivado correcto (verificar con una cuenta a mano).
4. Nueva venta después de la migración → `cumulativeHl` sube exactamente `qty*hl` de esa venta, sin perder lo migrado.
5. Eliminar/editar un pedido → `cumulativeHl` se revierte usando el `unitHl` congelado del movimiento, no el HL actual del producto (probar editando el HL del producto DESPUÉS de vender, y comprobar que revertir esa venta vieja resta lo correcto).
6. Pestaña Productos se ve y funciona igual que antes tras la separación a `ProductsView.jsx` (tarjetas, editar, agregar, eliminar/restaurar producto, historial).
7. Eliminar pedido: un click no borra nada, cambia a estado de confirmación; segundo click sí borra; pasan 3s sin confirmar → vuelve a la normalidad.
8. Recargar la página en cualquier punto → nada de lo anterior se pierde.
