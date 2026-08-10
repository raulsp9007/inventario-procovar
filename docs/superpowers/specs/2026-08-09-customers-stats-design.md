# Diseño: autocompletado de clientes + estadísticas + blindaje de datos

**Fecha:** 2026-08-09
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Hoy "Pedidos" pide el nombre del cliente en texto libre, sin memoria de clientes anteriores. El dueño quiere: (1) que al escribir el nombre en un pedido nuevo aparezcan sugerencias de clientes ya usados, (2) ver estadísticas por cliente (qué producto le gusta más, cuándo compró por última vez) para saber cuándo y qué ofrecerle, (3) garantía de que futuras actualizaciones de la app nunca borren datos ya guardados en el dispositivo.

## Alcance

Incluye: helpers puros para derivar lista de clientes y estadísticas desde `movements` existentes, sugerencias de autocompletado en el input de nombre de "Pedidos", pestaña nueva "Clientes" con producto favorito + fecha de última compra por cliente, documentación + verificación explícita del patrón de carga segura ya existente en `InventoryApp.jsx`.

Fuera de alcance: entidad `customers` separada y persistida (ver decisión clave abajo), umbral/etiqueta de "cliente inactivo" (se muestra la fecha, el dueño juzga), edición/fusión de nombres de clientes con errores de tipeo, historial de compras línea por línea dentro de la pestaña Clientes (solo agregado: favorito + última fecha), exportar/backup de datos (fuera de lo pedido).

## Decisión clave: clientes NO son una entidad nueva — se derivan de `movements`

Mismo criterio que ya se usó para pedidos: el nombre del cliente ya vive en cada movimiento (`customerName`, presente cuando el movimiento viene de un pedido). Lista de clientes, producto favorito y última compra se calculan siempre a partir de `movements`, sin guardar nada nuevo en el storage. Cero campos nuevos → cero riesgo nuevo de incompatibilidad entre versiones.

Se descartó guardar un array `customers[]` aparte — dos fuentes de verdad para el mismo nombre (¿qué pasa si se borra un pedido pero el cliente queda en la lista igual?) sin ganar nada, ya que todo lo necesario ya está en `movements`.

## Componentes

### `src/customerHelpers.js` (nuevo, helpers puros — mismo patrón que `orderHelpers.js`/`money.js`)

```js
getCustomerNames(movements)
// Filtra movements con customerName definido (vienen de pedidos), toma nombres únicos.
// Devuelve array de strings, sin orden particular garantizado (se ordena en el consumidor si hace falta).

matchCustomerNames(names, query)
// Filtra names cuyo texto incluya query (case-insensitive, sin acentos no se normaliza — YAGNI).
// query vacío -> devuelve [] (no mostrar sugerencias con el campo vacío).

getCustomerStats(movements, products)
// Agrupa movements con customerName por cliente.
// Por cliente: suma qty vendida por código de producto -> producto con mayor qty es "favorito"
//   (empate: gana el que aparece primero en `products`, orden fijo del catálogo).
// "Última compra": el date (string) más reciente entre sus movimientos.
// Devuelve [{ customerName, favoriteProductCode, lastPurchaseDate }],
//   ordenado por lastPurchaseDate descendente (más reciente primero).
```

### `src/Orders.jsx` (modificado)

- Nuevo estado local `showSuggestions` (bool).
- Al escribir en el input de nombre: `matchCustomerNames(getCustomerNames(movements), customerName)` calcula sugerencias en cada render (lista de movimientos ya está en memoria, sin costo real con el volumen de este negocio).
- Debajo del input, si `showSuggestions && customerName.trim() && sugerencias.length > 0`: lista desplegable simple (mismo estilo de tarjeta que el resto de la app). Click en una sugerencia: `setCustomerName(sugerencia)`, `setShowSuggestions(false)`.
- Input gana `onFocus={() => setShowSuggestions(true)}` y `onBlur` con timeout corto (150ms) antes de ocultar, para que el click en la sugerencia registre antes de que el blur la esconda (patrón estándar de autocomplete con blur).

### `src/Customers.jsx` (nuevo componente, vista "Clientes")

Props: `products`, `movements`.

```
getCustomerStats(movements, products) -> lista de filas
```

Cada fila: nombre del cliente, producto favorito (nombre corto del catálogo), fecha de última compra (`formatDate`). Sin stats (`movements` sin ningún pedido todavía): mensaje "Aún no hay clientes registrados." (mismo criterio que el vacío de "Pedidos de hoy").

### `src/InventoryApp.jsx` (modificado)

- Toggle de vistas gana 5to botón "Clientes" junto a Stock / Resumen semanal / Pedidos / mostrar-ocultar precios.
- `view === "clientes"` renderiza `<Customers products={PRODUCTS} movements={movements} />`.
- Comentario corto agregado junto al bloque de carga (líneas ~54-61) documentando la regla: todo campo nuevo que se agregue al estado persistido DEBE cargarse con `|| default` / `?? default`, nunca asumir que existe — así ninguna actualización futura rompe datos guardados en una versión anterior.

## Manejo de errores

- Sin pedidos aún → pestaña Clientes muestra mensaje vacío, no error.
- Autocompletado sin coincidencias → no se muestra lista (no es error, es normal).
- Nombre de cliente con mayúsculas/espacios distintos entre pedidos (ej. "Juan Perez" vs "juan perez ") cuenta como cliente distinto — conocido, aceptado (fuera de alcance normalizar).

## Verificación (manual, sin suite de tests)

1. Armar 2 pedidos con el mismo nombre de cliente pero distintos productos → pestaña Clientes muestra ese cliente una sola vez, con el producto de mayor cantidad total como favorito.
2. Empate exacto en cantidad entre 2 productos para un cliente → gana el que aparece primero en el catálogo (`PRODUCTS`).
3. En "Pedidos", escribir las primeras letras de un cliente ya usado → aparece en sugerencias; click lo completa.
4. Escribir nombre que no coincide con ninguno → no aparece lista de sugerencias.
5. Pestaña Clientes sin ningún pedido → mensaje de vacío, sin crash.
6. Simular dato guardado de una versión anterior (localStorage con JSON que NO tiene, por ejemplo, `commissionPercent` ni `prices`) → recargar app → carga sin crash, usa defaults, nada se borra del resto de los datos.
7. Mobile 375px: dropdown de sugerencias y pestaña Clientes sin overflow horizontal.
