# Diseño: eliminar (archivar) producto en Stock

**Fecha:** 2026-08-10
**Estado:** Aprobado, implementación directa (sin plan formal)

## Contexto

El catálogo permite agregar y renombrar productos, pero no sacar uno. El dueño quiere poder eliminar un producto desde "Ajustar existencias" en la pestaña Stock.

## Decisión clave: "eliminar" = archivar, no borrar

Confirmado con el usuario: el producto desaparece de todo lo que sirve para VENDER/AJUSTAR (Stock, dropdown de Pedidos, filas editables), pero su historial (movimientos pasados, ingreso, HL, stats de clientes que lo compraron) queda intacto — reversible.

Motivo técnico: `unitPrice` ya se congela por venta, pero HL se calcula en vivo contra `product.hl` (`totalHlSold`, ver diseño de HL). Si el producto se borrara del array `products`, ese lookup dejaría de encontrarlo y el HL histórico de sus ventas pasadas desaparecería solo — mismo problema para nombres en "Historial de movimientos", pedidos viejos y stats de clientes. Archivar (flag, no `delete` del array) evita esto de raíz.

## Modelo de datos

Producto gana campo opcional:
```js
{ code, name, short, color, hl, lowStockThreshold, archived: boolean }
```
`archived` ausente o `false` = activo (default, blindado igual que el resto).

## Regla general: dos vistas de `products`

- **Lookups históricos** (resolver nombre/short/hl de un código ya vendido: historial de movimientos, pedidos de hoy/anteriores, stats de clientes, `totalHlSold`): usan `products` COMPLETO, con archivados incluidos. Ningún cambio en estos sitios.
- **Listas para actuar ahora** (qué se puede vender/ajustar/ver como fila viva): filtran `products.filter((p) => !p.archived)`. Estos sí cambian:
  - Stock: grid de tarjetas de producto en modo ver/editar.
  - `totalStock` / `lowStockCount` (no tiene sentido avisar stock bajo de algo que ya no se vende).
  - `openEdit()` / `saveEdit()`: solo recorren/aplican productos activos (los archivados no tienen inputs en pantalla).
  - `Orders.jsx`: dropdown de "Nuevo pedido" (`availableProducts`) — no podés armar un pedido nuevo con algo archivado. Las líneas de pedidos YA hechos siguen mostrando el nombre real (usan `products` completo vía `products.find`, sin cambios ahí).
  - `WeeklySummary.jsx`: filas por producto de la semana (el `.map` que arma cada renglón) — un producto archivado deja de tener su propia fila, pero su ingreso pasado sigue sumado en los totales generales (esos se calculan directo de `movements`, no filtran por `products`).

## Componentes

### `src/InventoryApp.jsx` (modificado)

```js
function archiveProduct(code) {
  const nextProducts = products.map((p) => (p.code === code ? { ...p, archived: true } : p));
  setProducts(nextProducts);
  persist({ ...currentPersistedState, products: nextProducts });
}

function restoreProduct(code) {
  const nextProducts = products.map((p) => (p.code === code ? { ...p, archived: false } : p));
  setProducts(nextProducts);
  persist({ ...currentPersistedState, products: nextProducts });
}
```
Ambas se aplican al toque (mismo criterio que `addProduct` — no esperan a "Guardar existencias").

- `openEdit()`/`saveEdit()`: cambian `products.forEach` por `products.filter((p) => !p.archived).forEach` — no arman ni aplican inputs de productos archivados.
- Grid de tarjetas de producto (Stock): `products.filter((p) => !p.archived).map(...)`.
- `totalStock`/`lowStockCount`: sobre `products.filter((p) => !p.archived)`.
- "Historial de movimientos" (`products.find` para ícono/short de cada movimiento): sin cambios, sigue usando `products` completo.
- Cada tarjeta de producto en modo edición gana botón "Eliminar producto" (ícono tacho) → `archiveProduct(p.code)`, directo, sin confirmación (reversible, ver abajo).
- Debajo de la lista activa, dentro de modo edición, sección colapsada por defecto (mismo patrón que "Pedidos anteriores"): "Productos eliminados (N)" — si hay archivados, cada uno con nombre + botón "Restaurar" (`restoreProduct(p.code)`).

### `src/Orders.jsx` (modificado)

`availableProducts` (dropdown de "Nuevo pedido") pasa de `products.filter(...)` a `products.filter((p) => !p.archived && !draftLines.some((l) => l.code === p.code))`. Todo lo demás (`products.find` para mostrar líneas de pedidos ya hechos, de hoy o anteriores) sigue usando `products` completo.

### `src/WeeklySummary.jsx` (modificado)

El `.map` que arma una fila por producto (`products.map((p, i) => {...})`) pasa a iterar `products.filter((p) => !p.archived)`. `totalHlSold(movements, products)` sigue recibiendo `products` completo (ya lo hace, sin cambios).

## Manejo de errores

Ninguno nuevo — archivar/restaurar no tienen forma de fallar (no hay validación de stock ni nada que bloquear).

## Verificación (manual, sin suite de tests)

1. Archivar un producto sin ventas previas → desaparece de Stock, Ajustar existencias, dropdown de Pedidos, fila de Resumen semanal.
2. Archivar un producto CON ventas/movimientos previos → esas ventas siguen en "Historial de movimientos" con su nombre real, siguen sumando en ingreso/HL acumulado, un pedido viejo que lo incluía sigue mostrando el nombre real (no el código crudo).
3. `lowStockCount`/banner de stock bajo ya no cuenta el producto archivado.
4. "Productos eliminados" en modo edición lista el archivado, "Restaurar" lo devuelve a todas las vistas activas de nuevo.
5. Agregar un producto nuevo cuyo nombre generaría el mismo código que uno ya archivado → sigue resolviendo colisión con sufijo numérico (no reutiliza el código).
6. Simular dato guardado de versión anterior (productos sin campo `archived`) → se tratan como activos, sin crash.
7. Mobile 375px: botón eliminar y sección "Productos eliminados" sin overflow horizontal.
