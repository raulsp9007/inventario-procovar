# Diseño: hectolitros por producto + meta HL

**Fecha:** 2026-08-10
**Estado:** Aprobado, implementación directa (sin plan formal)

## Contexto

El dueño quiere trackear hectolitros vendidos (unidad de medida del negocio, junto al CUP). Cada producto necesita un valor de "hectolitros por unidad vendida" (número decimal, ej. una Parranda 1500ml podría ser 0.015 hL). Con eso, en "Resumen semanal" quiere ver el total de HL vendidos hasta el momento comparado contra una meta editable — incluyendo ventas que ya existen, hechas antes de este feature.

## Alcance

Incluye: campo `hl` por producto (opcional, editable al agregar producto y en productos ya existentes), cálculo de HL total vendido desde el historial completo de movimientos, campo "Meta HL" editable y persistido, comparación vendido/meta en Resumen semanal.

Fuera de alcance: HL por semana/mes (solo el total general vs meta, como ya se pidió), historial de cambios de HL por producto, unidades de medida distintas a hectolitros.

## Decisión clave: HL total se deriva del historial, no es un contador aparte

A diferencia de `cumulativeRevenue` (que SÍ es un contador corriendo, porque el precio de un producto cambia con el tiempo y cada venta necesita quedar congelada a su precio de ese momento), el HL-por-unidad de un producto es una constante física del tamaño de envase — no cambia de una venta a otra. Por eso no hace falta "congelarlo" en cada movimiento ni mantener un contador aparte: `totalHlSold` se calcula sumando, sobre TODOS los `movements` de tipo `"venta"`, `qty * (hl del producto de ese código)`. Esto automáticamente cuenta las ventas que ya existen apenas el usuario carga el HL de cada producto — sin ningún paso de migración ni "backfill" especial.

Mismo criterio que ya usan `weekTotal`/`monthTotal` en `WeeklySummary.jsx` (derivados de `movements`, no contadores separados) — coherente con el resto del archivo.

Limitación conocida y aceptada (igual que ya aplica a esos totales semanales/mensuales): `movements` está limitado a 500 entradas. Si algún día se supera ese límite, las ventas más viejas dejan de contar para este total. No es un problema nuevo de este feature.

## Modelo de datos

Producto (`products[]`) gana un campo opcional:
```js
{ code, name, short, color, hl }  // hl: number | undefined — "no definido" si no se cargó
```

Estado persistido nuevo, a nivel raíz (mismo patrón `|| default`):
```js
hlGoal: number | null
```

## Componentes

### `src/InventoryApp.jsx` (modificado)

- Carga: `setHlGoal(parsed.hlGoal ?? null)`, nuevo estado `const [hlGoal, setHlGoal] = useState(null)`, agregado a `currentPersistedState`.
- `addProduct()`: nuevo estado local `newProductHl` (string), se guarda como `hl: parseFloat(newProductHl) || undefined` en el producto nuevo (vacío → sin definir, igual que precio vacío hoy).
- `openEdit()`/`saveEdit()`: mismo patrón que `editPriceInputs` — nuevo `editHlInputs`, poblado en `openEdit` desde `p.hl`, aplicado en `saveEdit` sobre `nextProducts` (no sobre `nextPrices`, es un campo del producto).
- JSX de edición: input "HL" junto al de precio, y en la fila de "+ Agregar producto".
- Prop nueva a `WeeklySummary`: `hlGoal`, `onHlGoalChange`.

### `src/money.js` o nuevo helper puro

```js
// en money.js, mismo archivo que ya calcula totales de revenue
export function totalHlSold(movements, products) {
  return movements
    .filter((m) => m.type === "venta")
    .reduce((sum, m) => {
      const product = products.find((p) => p.code === m.code);
      const hl = product?.hl || 0;
      return sum + m.qty * hl;
    }, 0);
}
```

### `src/WeeklySummary.jsx` (modificado)

Props nuevas: `products` (ya lo recibe), `hlGoal`, `onHlGoalChange`.

Nueva sección (junto al bloque de TOTAL GENERAL ACUMULADO, visible siempre — no depende de `showPrices`, HL no es un dato de precio):
```js
const hlSold = totalHlSold(movements, products);
```
Input "Meta HL" (mismo patrón de estado local raw-string que `rateInput`/`commissionInput`, para no repetir el bug de tipeo de decimales). Debajo, si `hlGoal` está definido: `"Vendido: {hlSold.toFixed(2)} hL de {hlGoal} hL ({pct}%)"`, con `pct = hlGoal > 0 ? Math.round((hlSold / hlGoal) * 100) : 0`.

## Manejo de errores

- Producto sin HL definido → cuenta como 0 en el total (no bloquea nada, no hay error).
- Meta HL vacía o inválida → no se muestra la comparación, solo el input queda vacío (mismo criterio que exchange rate).

## Verificación (manual, sin suite de tests)

1. Agregar producto nuevo con HL cargado → aparece en Ajustar existencias con ese valor.
2. Cargar HL a un producto existente (de los 5 originales) → se guarda, persiste tras recargar.
3. Con ventas ya hechas ANTES de cargar HL: cargar el HL de un producto que ya tiene ventas → el total HL en Resumen semanal las cuenta de inmediato, sin recargar nada ni pasos extra.
4. Cargar Meta HL, ver "Vendido X de Y (Z%)" con número correcto.
5. Producto sin HL definido → no rompe el cálculo total (cuenta como 0).
6. Simular dato guardado de versión anterior (sin `hlGoal` en el nivel raíz, sin `hl` en productos) → carga sin crash, todo en 0/no definido.
7. Mobile 375px: inputs de HL en Ajustar existencias y en Resumen semanal sin overflow.
