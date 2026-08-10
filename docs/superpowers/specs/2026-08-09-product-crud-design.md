# Diseño: agregar productos + renombrar existentes

**Fecha:** 2026-08-09
**Estado:** Aprobado, implementación directa (sin plan formal, a pedido del usuario)

## Contexto

El catálogo de productos (`PRODUCTS`) hoy es una constante fija en `InventoryApp.jsx` con 5 SKUs. El dueño quiere poder agregar productos nuevos al catálogo y corregir el nombre de los existentes, sin tocar código.

## Alcance

Incluye: agregar producto nuevo (solo pidiendo nombre completo), renombrar producto existente (campo `name`), persistencia del catálogo (sobrevive a recargar/reinstalar).

Fuera de alcance (confirmado con el usuario): eliminar/descontinuar productos, editar nombre corto (`short`) o color a mano, reordenar catálogo.

## Decisión clave: `products` pasa a ser estado persistido, con seed por defecto

`PRODUCTS` (const) se renombra `DEFAULT_PRODUCTS` y queda como seed. Nuevo estado `products` en `InventoryApp.jsx`, cargado así:

```js
setProducts(parsed.products || DEFAULT_PRODUCTS);
```

Mismo patrón de blindaje que el resto del storage — dato guardado en una versión anterior (sin campo `products`) usa el catálogo por defecto, no rompe nada. `products` se agrega a `currentPersistedState` y se persiste en cada mutación de catálogo.

Todos los componentes (`WeeklySummary`, `Orders`, `Customers`) ya reciben `products` como prop (no importan la constante directamente) — no requieren cambios, solo reciben el array dinámico en vez del fijo.

## Modelo de datos

Cada producto ya tiene `{ code, name, short, color }`. Sin campos nuevos. Un producto agregado por el usuario:

```js
{ code: "<generado>", name: "<lo que escribió>", short: "<mismo texto que name>", color: "<de la paleta>" }
```

## Generación de código (`src/productHelpers.js`, nuevo — helpers puros)

```js
slugifyProductName(name)
// Mayúsculas, sin acentos (normalize NFD + strip diacríticos), solo A-Z0-9,
// resto se descarta. Si queda vacío, "PROD".

generateProductCode(name, existingCodes)
// base = slugifyProductName(name)
// si base no está en existingCodes -> devuelve base
// si choca -> prueba base+"2", base+"3", ... hasta encontrar uno libre.

PRODUCT_COLOR_PALETTE
// ["#C77A2E", "#274E37", "#6B4C9A", "#2E6E8A", "#8A2E5E", "#4C7A2E"]

nextProductColor(existingCount)
// PRODUCT_COLOR_PALETTE[existingCount % PRODUCT_COLOR_PALETTE.length]
```

## Componentes / cambios

### `src/productHelpers.js` (nuevo)
Ver arriba.

### `src/InventoryApp.jsx` (modificado)

- `PRODUCTS` → `DEFAULT_PRODUCTS`.
- Nuevo estado: `const [products, setProducts] = useState(DEFAULT_PRODUCTS)`.
- Carga: `setProducts(parsed.products || DEFAULT_PRODUCTS)`.
- `currentPersistedState` gana `products`.
- Todo uso de `PRODUCTS` en el archivo (totalStock, lowStockCount, `.map` de tarjetas, historial de movimientos, props a `WeeklySummary`/`Orders`/`Customers`, `openEdit`/`saveEdit`) pasa a usar `products` (estado).
- `value={saleInputs[p.code]}` (línea 464) pasa a `value={saleInputs[p.code] ?? ""}` — necesario porque un producto agregado después del mount no tiene entrada previa en `saleInputs`, y React tira warning de input no controlado si el value es `undefined`.

**Nuevo estado de edición de nombre:**
```js
const [editNameInputs, setEditNameInputs] = useState({});
const [newProductName, setNewProductName] = useState("");
```

**`openEdit()` (modificado):** además de `inputs`/`priceInputs`, arma `nameInputs` desde `products` actual:
```js
function openEdit() {
  const inputs = {};
  const priceInputs = {};
  const nameInputs = {};
  products.forEach((p) => {
    inputs[p.code] = String(stock[p.code] || 0);
    priceInputs[p.code] = String(prices[p.code] || 0);
    nameInputs[p.code] = p.name;
  });
  setEditInputs(inputs);
  setEditPriceInputs(priceInputs);
  setEditNameInputs(nameInputs);
  setEditMode(true);
}
```

**`saveEdit()` (modificado):** además de aplicar stock/precio, aplica nombre nuevo por producto:
```js
function saveEdit() {
  const nextStock = { ...stock };
  const nextPrices = { ...prices };
  const adjustments = [];
  const nextLastAdjustedAt = { ...lastAdjustedAt };
  const now = new Date().toISOString();
  products.forEach((p) => {
    const val = parseInt(editInputs[p.code], 10);
    const newVal = isNaN(val) || val < 0 ? 0 : val;
    const diff = newVal - (stock[p.code] || 0);
    if (diff !== 0) {
      adjustments.push(makeMovement(p.code, "ajuste", diff));
      nextLastAdjustedAt[p.code] = now;
    }
    nextStock[p.code] = newVal;
    const priceVal = parseFloat(editPriceInputs[p.code]);
    nextPrices[p.code] = !Number.isFinite(priceVal) || priceVal < 0 ? 0 : priceVal;
  });
  const nextProducts = products.map((p) => {
    const trimmed = (editNameInputs[p.code] || "").trim();
    return trimmed ? { ...p, name: trimmed } : p;
  });
  const nextMovements = [...adjustments, ...movements].slice(0, 500);
  setStock(nextStock);
  setPrices(nextPrices);
  setMovements(nextMovements);
  setLastAdjustedAt(nextLastAdjustedAt);
  setProducts(nextProducts);
  setEditMode(false);
  persist({
    ...currentPersistedState,
    stock: nextStock,
    movements: nextMovements,
    lastAdjustedAt: nextLastAdjustedAt,
    prices: nextPrices,
    products: nextProducts,
  });
}
```
Nombre vacío (usuario borró todo) → se ignora, queda el nombre anterior (evita producto sin nombre; no hace falta mensaje de error, mismo criterio permisivo que ya usa el guardado de stock/precio).

**`addProduct()` (nuevo):**
```js
function addProduct() {
  const trimmed = newProductName.trim();
  if (!trimmed) {
    setError("Ingresa el nombre del producto.");
    setTimeout(() => setError(""), 2500);
    return;
  }
  const code = generateProductCode(trimmed, products.map((p) => p.code));
  const color = nextProductColor(products.length);
  const newProduct = { code, name: trimmed, short: trimmed, color };
  const nextProducts = [...products, newProduct];
  setProducts(nextProducts);
  setNewProductName("");
  if (editMode) {
    setEditInputs((s) => ({ ...s, [code]: "0" }));
    setEditPriceInputs((s) => ({ ...s, [code]: "0" }));
    setEditNameInputs((s) => ({ ...s, [code]: trimmed }));
  }
  persist({ ...currentPersistedState, products: nextProducts });
}
```
Se guarda al toque (persist inmediato), independiente del botón "Guardar existencias" — igual que se explicó en el diseño.

**UI en modo edición (`editMode`):**
- Nombre del producto (línea ~409, `<div>{p.name}</div>`) pasa a `<input>` editable con `editNameInputs[p.code]` cuando `editMode` es true; texto plano cuando no.
- Al final de la lista de tarjetas de producto (después del `.map`, dentro de `editMode`): fila con input de texto (`newProductName`) + botón "Agregar producto". Solo visible en `editMode` (coherente con que ahí es donde se edita el catálogo).

## Manejo de errores

- Agregar producto con nombre vacío → "Ingresa el nombre del producto." (mismo banner de error ya usado en toda la app).
- Nombre generando código que choca con uno existente → resuelto automáticamente por `generateProductCode` (sufijo numérico), sin intervención ni error visible.
- Renombrar dejando el campo vacío → se ignora el cambio para ese producto, sin error (no bloquea guardar el resto).

## Verificación (manual, sin suite de tests)

1. `generateProductCode`: nombre nuevo sin colisión → código = slug. Nombre que colisiona con uno existente → sufijo numérico. Nombre con acentos/símbolos ("Malta Guajira 750ml (Ed. especial)") → código solo A-Z0-9.
2. Agregar producto en "Ajustar existencias" → aparece de inmediato en la lista con stock 0, sin salir de modo edición, con inputs propios funcionando.
3. Recargar página tras agregar → el producto sigue en el catálogo (persistido).
4. Renombrar un producto existente, "Guardar existencias" → nuevo nombre se ve en Stock, Resumen semanal, Pedidos, Clientes, Historial de movimientos (todos usan `products` dinámico).
5. Renombrar dejando el campo vacío → guarda el resto de los cambios, ese producto conserva su nombre anterior.
6. Simular dato guardado de versión anterior (localStorage sin campo `products`) → recarga → usa catálogo por defecto (los 5 de siempre), sin crash.
7. Mobile 375px: input de nombre en edición y fila "Agregar producto" sin overflow horizontal.
