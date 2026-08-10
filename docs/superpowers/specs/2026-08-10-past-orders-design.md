# Diseño: sección "Pedidos anteriores" (colapsable)

**Fecha:** 2026-08-10
**Estado:** Aprobado, implementación directa (sin plan formal)

## Contexto

"Pedidos" solo muestra pedidos de hoy (`groupOrders(movements, todayStr())`). Al otro día, un pedido desaparece de la lista aunque sigue guardado (nada se borra — ver conversación previa). El dueño quiere poder seguir accediendo a esos pedidos sin que ocupen espacio visual todo el tiempo.

## Alcance

Incluye: sección "Pedidos anteriores" debajo de "Pedidos de hoy", colapsada por defecto, agrupada por fecha, últimos 14 días (sin contar hoy), mismas acciones por pedido (editar, enviar WhatsApp individual, marcar enviado, eliminar) que ya existen para pedidos de hoy — reutilizando la misma fila, no una UI distinta.

Fuera de alcance: selección múltiple/envío en bloque para pedidos anteriores (esa mecánica queda solo para "hoy", como ya está), historial más allá de 14 días, pedidos completos con fecha (calendario).

## Bug latente que este cambio expone (se corrige acá)

`editOrder` en `InventoryApp.jsx` genera los movimientos nuevos con `makeMovement`, que siempre estampa `date: todayStr()`. Mientras "Editar" solo aparecía en pedidos de HOY, esto no se notaba (la fecha ya era hoy). Al exponer "Editar" en pedidos de días anteriores, editar uno de ayer lo movería silenciosamente a la fecha de HOY — corrompiendo a qué semana/mes/día quedó atribuida esa venta (ingreso, HL, etc.). Se corrige preservando la fecha original del pedido al editar.

También: la validación de stock al editar (`Orders.jsx`, busca `editingOrder` en `todaysOrders`) deja de encontrar el pedido si es de un día anterior — se corrige buscando en TODOS los pedidos, no solo los de hoy.

## Modelo de datos

Sin campos nuevos. `groupOrders` gana un campo `date` en el objeto de pedido devuelto (ya disponible en cada movimiento, no se usaba).

## Componentes

### `src/dateUtils.js` (modificado)
```js
export function getDateNDaysAgoStr(n, referenceDateStr = todayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}
```

### `src/orderHelpers.js` (modificado)
```js
export function groupOrders(movements, dateStr) {
  // ... igual, pero el objeto de pedido gana: date: m.date
}

export function groupAllOrders(movements) {
  // Igual que groupOrders pero sin filtrar por fecha — agrupa TODOS los movimientos con orderId.
  // Mismo orden (timestamp ascendente); Orders.jsx decide cómo bucketizar/ordenar para mostrar.
}
```

### `src/Orders.jsx` (modificado)

- `allOrders = groupAllOrders(movements)`.
- `todaysOrders = allOrders.filter((o) => o.date === todayStr())` (reemplaza el uso directo de `groupOrders`).
- `pastOrdersByDate`: `allOrders` con `date !== todayStr()` y `date >= getDateNDaysAgoStr(14)`, agrupados por fecha (`Map`), ordenados fecha descendente (más reciente primero); dentro de cada fecha, pedidos por `timestamp` ascendente (igual criterio que ya usa `groupOrders`).
- La fila de un pedido (nombre, líneas, checkbox Enviado, botones Editar/Enviar/Eliminar) se extrae a una función interna `renderOrderRow(order)` para reusarla en "Pedidos de hoy" y en "Pedidos anteriores" sin duplicar JSX.
- Nueva sección colapsable, solo si `pastOrdersByDate` no está vacío:
```jsx
<button onClick={() => setShowPast((s) => !s)}>
  Pedidos anteriores ({pastOrdersByDate reduce a total de pedidos}) {showPast ? "▲" : "▼"}
</button>
{showPast && Array.from(pastOrdersByDate.entries()).map(([date, orders]) => (
  <div key={date}>
    <div>{formatDate(date)}</div>
    {orders.map(renderOrderRow)}
  </div>
))}
```
Estado nuevo: `const [showPast, setShowPast] = useState(false)` (colapsada por defecto, como se propuso).
- `confirmOrder()`: el lookup `editingOrder` pasa de `todaysOrders.find(...)` a `allOrders.find(...)` — así la validación de stock al editar funciona también para pedidos de días anteriores.

### `src/InventoryApp.jsx` (modificado)

`editOrder(orderId, draft)`: al armar `newMovements`, usa la fecha del pedido original en vez de `todayStr()`:
```js
function editOrder(orderId, { customerName, isDelivery, lines }) {
  const originalMovements = movements.filter((m) => m.orderId === orderId);
  if (originalMovements.length === 0) return;
  const originalDate = originalMovements[0].date; // NUEVO — preserva fecha original

  // ... resto igual, pero:
  newMovements.push(makeMovement(code, "venta", qty, { unitPrice, orderId, customerName, isDelivery, sent: false, date: originalDate }));
  // `extra` pisa el date default de makeMovement, que siempre usa todayStr()
}
```
(`makeMovement` ya hace `{ ...defaults, ...extra }`, así que pasar `date` en `extra` alcanza — no hace falta tocar `makeMovement`.)

## Manejo de errores

Ninguno nuevo — mismas validaciones ya existentes, ahora alcanzan también a pedidos de días anteriores.

## Garantía "no se pierden datos de hoy"

- No se toca la lógica de guardado/persistencia ni el array `movements` en sí — el cambio es puramente de qué se MUESTRA y de a qué fecha queda un pedido editado (fix necesario, ver arriba).
- `todaysOrders` sigue siendo exactamente los pedidos con `date === todayStr()`, sin cambios de criterio.
- Editar un pedido de HOY sigue comportándose igual que antes (`originalDate` ya era hoy, no cambia nada observable).
- Verificación explícita (ver abajo) de que pedidos de hoy y de días anteriores nunca se mezclan ni se pisan entre sí.

## Verificación (manual, sin suite de tests)

1. `groupAllOrders` con pedidos de 3 fechas distintas → todos aparecen, cada uno con su `date` correcto.
2. Pedido de hoy: sigue en "Pedidos de hoy", NO aparece en "Pedidos anteriores".
3. Pedido de ayer: aparece solo en "Pedidos anteriores" (colapsada), agrupado bajo la fecha de ayer.
4. Pedido de hace 20 días → NO aparece (fuera de la ventana de 14 días), sigue existiendo en `movements` (no se borra, solo no se muestra en Pedidos).
5. Editar un pedido de ayer, cambiar cantidad → sigue apareciendo bajo la fecha de AYER (no se mueve a hoy), stock/ingreso/HL se recalculan igual que editar uno de hoy.
6. Editar un pedido de ayer con cantidad mayor al stock disponible (considerando lo que ese pedido ya tenía reservado) → bloqueado, mismo mensaje que ya existe.
7. Enviar por WhatsApp / marcar Enviado / Eliminar sobre un pedido de "Pedidos anteriores" → funciona igual que en uno de hoy.
8. Colapsar/expandir la sección, recargar la página → sigue colapsada por defecto (no se persiste el estado abierto/cerrado, es UI efímera).
9. Mobile 375px: sección colapsable y filas de pedidos anteriores sin overflow horizontal.
