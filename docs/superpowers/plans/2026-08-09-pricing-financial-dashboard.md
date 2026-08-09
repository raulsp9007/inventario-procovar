# Precios y dashboard financiero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar precio (CUP) por producto, con el precio congelado al momento de cada venta, y un reporte financiero en Resumen semanal: ingreso por producto, total de la semana, total del mes, historial semanal del mes, total general acumulado histórico, comisión % editable, y conversión a USD vía tasa de cambio editable — todo ocultable con un solo toggle.

**Architecture:** Cinco campos nuevos en el estado persistido (`prices`, `cumulativeRevenue`, `exchangeRate`, `commissionPercent`, `showPrices`). `persist()` pasa de argumentos posicionales a un solo objeto de estado, construido a partir de un `currentPersistedState` que cada callsite sobreescribe solo donde cambió algo — evita que agregar más campos seguidos siga ensuciando cada llamada. Cálculos de dinero (formato CUP/USD, suma de ingresos por rango, desglose semanal del mes) viven en un módulo nuevo y puro, `src/money.js`, sin estado ni JSX.

**Tech Stack:** React 18, mismo proyecto Vite/PWA ya desplegado en https://raulsp9007.github.io/inventario-procovar/.

Spec de referencia: `docs/superpowers/specs/2026-08-09-pricing-financial-dashboard-design.md`

---

## Contexto para quien ejecute este plan

Seguí sin suite de tests automatizados — cada tarea usa verificación manual (scripts de Node para lógica pura sin DOM, navegador real para lo que sí toca UI/estado). El repo vive en `D:\DOCUMENTOS\proyectos\PARRANDA\inventario-procovar-repo`, remoto `https://github.com/raulsp9007/inventario-procovar`, rama `main`, ya desplegado — cada push a `main` dispara un deploy real a GitHub Pages (`.github/workflows/deploy.yml`). Trabajás directo sobre `main` (sin worktree, decisión ya tomada en una sesión anterior).

Antes de empezar, estos son los archivos relevantes tal como están HOY (léelos vos mismo antes de editar, no asumas que el snippet "antes" de cada paso sigue exacto si alguna tarea anterior no se aplicó tal cual):
- `src/dateUtils.js` — helpers de fecha, ya tiene `todayStr`, `formatDate`, `formatDateTime`, `getWeekStartStr`, `getPreviousWeekRangeStr`.
- `src/InventoryApp.jsx` — componente principal, ya tiene stock, ventas, ajustes, deshacer, `lastAdjustedAt`, toggle Stock/Resumen semanal.
- `src/WeeklySummary.jsx` — vista de resumen semanal por producto (solo unidades, sin dinero todavía).
- `src/storage.js` — wrapper de `localStorage`, no necesita cambios en este plan.

---

### Task 1: `getMonthStartStr` en `dateUtils.js`

**Files:**
- Modify: `src/dateUtils.js`

- [ ] **Step 1: Agregar la función**

Al final de `src/dateUtils.js`, después de `getPreviousWeekRangeStr`, agregar:

```js
// Primer día del mes de referenceDateStr (formato "YYYY-MM-DD").
export function getMonthStartStr(referenceDateStr = todayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
```

- [ ] **Step 2: Verificar**

```bash
node --input-type=module -e '
import { getMonthStartStr } from "./src/dateUtils.js";
console.log(getMonthStartStr("2026-08-09"));
console.log(getMonthStartStr("2026-01-15"));
console.log(getMonthStartStr());
'
```

Esperado: `2026-08-01`, `2026-01-01`, y una tercera línea con el primer día del mes actual real (formato `YYYY-MM-01`).

- [ ] **Step 3: Commit**

```bash
git add src/dateUtils.js
git commit -m "Add getMonthStartStr date helper"
```

---

### Task 2: `src/money.js` — helpers de dinero

**Files:**
- Create: `src/money.js`

Funciones puras, sin estado ni JSX — formateo y cálculos sobre `movements` (que ya vienen con `unitPrice` a partir de la Task 5).

- [ ] **Step 1: Crear `src/money.js`**

```js
import { getWeekStartStr } from "./dateUtils";

export function formatCUP(amount) {
  const n = Number(amount) || 0;
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} CUP`;
}

export function formatUSD(amount) {
  const n = Number(amount) || 0;
  return `US$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function convertToUSD(cupAmount, exchangeRate) {
  if (!exchangeRate || exchangeRate <= 0) return null;
  return cupAmount / exchangeRate;
}

export function revenueInRange(movements, code, start, end) {
  return movements
    .filter((m) => m.code === code && m.type === "venta" && m.date >= start && m.date <= end)
    .reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
}

export function totalRevenueInRange(movements, start, end) {
  return movements
    .filter((m) => m.type === "venta" && m.date >= start && m.date <= end)
    .reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
}

export function monthWeeklyBreakdown(movements, monthStartStr, endDateStr) {
  const inMonth = movements.filter(
    (m) => m.type === "venta" && m.date >= monthStartStr && m.date <= endDateStr
  );
  const totals = new Map();
  inMonth.forEach((m) => {
    const weekStart = getWeekStartStr(m.date);
    totals.set(weekStart, (totals.get(weekStart) || 0) + m.qty * (m.unitPrice || 0));
  });
  return Array.from(totals.entries())
    .map(([weekStart, total]) => ({ weekStart, total }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}
```

- [ ] **Step 2: Verificar**

```bash
node --input-type=module -e '
import { formatCUP, formatUSD, convertToUSD, revenueInRange, totalRevenueInRange, monthWeeklyBreakdown } from "./src/money.js";

const movements = [
  { code: "P500", type: "venta", qty: 10, unitPrice: 100, date: "2026-08-05" },
  { code: "P500", type: "venta", qty: 4,  unitPrice: 100, date: "2026-08-03" },
  { code: "P500", type: "venta", qty: 20, unitPrice: 90,  date: "2026-07-29" },
];

console.log("revenueInRange (esta semana):", revenueInRange(movements, "P500", "2026-08-03", "2026-08-08")); // esperado: 1400
console.log("totalRevenueInRange (esta semana):", totalRevenueInRange(movements, "2026-08-03", "2026-08-08")); // esperado: 1400
console.log("monthWeeklyBreakdown (agosto):", JSON.stringify(monthWeeklyBreakdown(movements, "2026-08-01", "2026-08-09")));
// esperado: [{"weekStart":"2026-08-03","total":1400}] — la venta de julio queda afuera por estar antes del mes

console.log("convertToUSD(1000, 25):", convertToUSD(1000, 25)); // esperado: 40
console.log("convertToUSD(1000, null):", convertToUSD(1000, null)); // esperado: null
console.log("convertToUSD(1000, 0):", convertToUSD(1000, 0)); // esperado: null

console.log("formatCUP(1400):", formatCUP(1400));
console.log("formatUSD(40):", formatUSD(40));
'
```

Confirmar que las 3 primeras líneas dan exactamente `1400`, `1400`, y el array de una sola semana. Las de `convertToUSD` dan `40`, `null`, `null`. Las últimas dos solo confirmá que se ven como un monto razonable (el formato exacto de separadores depende del locale del sistema, no hace falta que coincida carácter por carácter).

- [ ] **Step 3: Commit**

```bash
git add src/money.js
git commit -m "Add money formatting and revenue calculation helpers"
```

---

### Task 3: `persist()` a un solo objeto de estado

**Files:**
- Modify: `src/InventoryApp.jsx`

Refactor puro — mismo comportamiento, sin campos nuevos todavía. Esto es lo que hace posible agregar 5 campos nuevos en las tareas siguientes sin que cada callsite de `persist` tenga que enumerarlos todos a mano.

- [ ] **Step 1: Agregar `currentPersistedState`**

Justo después de la línea `const [view, setView] = useState("stock"); // "stock" | "resumen"` (el último `useState` del componente), agregar:

```jsx
  const currentPersistedState = { stock, movements, lastAdjustedAt };
```

- [ ] **Step 2: Cambiar la firma de `persist`**

Reemplazar:

```jsx
  const persist = useCallback(async (nextStock, nextMovements, nextLastAdjustedAt) => {
    setSaveState("saving");
    try {
      await setData(
        STORAGE_KEY,
        JSON.stringify({ stock: nextStock, movements: nextMovements, lastAdjustedAt: nextLastAdjustedAt })
      );
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      setSaveState("idle");
      setError("No se pudo guardar. Intenta de nuevo.");
      setTimeout(() => setError(""), 3000);
    }
  }, []);
```

por:

```jsx
  const persist = useCallback(async (nextState) => {
    setSaveState("saving");
    try {
      await setData(STORAGE_KEY, JSON.stringify(nextState));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      setSaveState("idle");
      setError("No se pudo guardar. Intenta de nuevo.");
      setTimeout(() => setError(""), 3000);
    }
  }, []);
```

- [ ] **Step 3: Actualizar los 3 callsites existentes**

En `registerSale`, cambiar:

```jsx
    persist(nextStock, nextMovements, lastAdjustedAt);
```

por:

```jsx
    persist({ ...currentPersistedState, stock: nextStock, movements: nextMovements });
```

En `undoLast`, cambiar:

```jsx
    persist(nextStock, nextMovements, lastAdjustedAt);
```

por:

```jsx
    persist({ ...currentPersistedState, stock: nextStock, movements: nextMovements });
```

En `saveEdit`, cambiar:

```jsx
    persist(nextStock, nextMovements, nextLastAdjustedAt);
```

por:

```jsx
    persist({ ...currentPersistedState, stock: nextStock, movements: nextMovements, lastAdjustedAt: nextLastAdjustedAt });
```

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

Con localStorage limpio: ajustar stock de un producto, venderlo, deshacer la venta, recargar la página — todo debe comportarse exactamente igual que antes de este refactor (mismos valores, mismo "Guardado ✓"). Este paso no cambia ningún comportamiento visible; si algo se ve distinto, hay un error en el refactor. Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Refactor persist() to take a single state object instead of positional args"
```

---

### Task 4: Estado nuevo — precios, ingreso acumulado, tasa de cambio, comisión, toggle

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Agregar los 5 `useState` nuevos**

Justo después de `const [lastAdjustedAt, setLastAdjustedAt] = useState({});`, agregar:

```jsx
  const [prices, setPrices] = useState(() =>
    PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: 0 }), {})
  );
  const [cumulativeRevenue, setCumulativeRevenue] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [showPrices, setShowPrices] = useState(true);
```

- [ ] **Step 2: Cargarlos desde storage**

En el `useEffect` de carga, donde dice:

```jsx
          setLastAdjustedAt(parsed.lastAdjustedAt || {});
```

agregar debajo:

```jsx
          setPrices(parsed.prices || {});
          setCumulativeRevenue(parsed.cumulativeRevenue || 0);
          setExchangeRate(parsed.exchangeRate ?? null);
          setCommissionPercent(parsed.commissionPercent || 0);
          setShowPrices(parsed.showPrices ?? true);
```

- [ ] **Step 3: Incluirlos en `currentPersistedState`**

Cambiar:

```jsx
  const currentPersistedState = { stock, movements, lastAdjustedAt };
```

por:

```jsx
  const currentPersistedState = {
    stock, movements, lastAdjustedAt,
    prices, cumulativeRevenue, exchangeRate, commissionPercent, showPrices,
  };
```

Con este único cambio, los 3 callsites de `persist` de la Task 3 ya guardan los campos nuevos automáticamente (con su valor actual sin modificar) — no hace falta tocarlos de nuevo.

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

En DevTools → Application → Local Storage, después de cualquier acción (ej. ajustar stock), confirmar que el JSON guardado bajo `procovar-inventario-v1` ahora incluye `"prices":{...}`, `"cumulativeRevenue":0`, `"exchangeRate":null`, `"commissionPercent":0`, `"showPrices":true`. Recargar la página, confirmar que no rompe nada (todavía no hay UI para estos campos, pero deben cargar sin error). Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Add price, revenue, exchange rate, commission, and show-prices state"
```

---

### Task 5: `registerSale` guarda `unitPrice` y suma a `cumulativeRevenue`

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: `makeMovement` acepta campos extra**

Cambiar:

```jsx
  function makeMovement(code, type, qty) {
    return {
      id: `${Date.now()}-${type}-${code}-${Math.random().toString(36).slice(2, 7)}`,
      code,
      type,
      qty,
      date: todayStr(),
      timestamp: new Date().toISOString(),
    };
  }
```

por:

```jsx
  function makeMovement(code, type, qty, extra = {}) {
    return {
      id: `${Date.now()}-${type}-${code}-${Math.random().toString(36).slice(2, 7)}`,
      code,
      type,
      qty,
      date: todayStr(),
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }
```

- [ ] **Step 2: `registerSale` usa el precio actual y actualiza el acumulado**

Reemplazar la función completa:

```jsx
  function registerSale(code) {
    const raw = saleInputs[code];
    const qty = parseInt(raw, 10);
    if (!raw || isNaN(qty) || qty <= 0) {
      setError("Ingresa una cantidad válida.");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const current = stock[code] || 0;
    if (qty > current) {
      setError("No hay suficiente stock para esa venta.");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const unitPrice = prices[code] || 0;
    const nextStock = { ...stock, [code]: current - qty };
    const movement = makeMovement(code, "venta", qty, { unitPrice });
    const nextMovements = [movement, ...movements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue + qty * unitPrice;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setSaleInputs((s) => ({ ...s, [code]: "" }));
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
    });
  }
```

- [ ] **Step 3: Verificar manualmente**

```bash
npm run dev
```

Sin precio puesto todavía (Task 7 agrega la UI para ponerlo): vender un producto, confirmar en DevTools → Local Storage que el nuevo movimiento tiene `"unitPrice":0` y que `cumulativeRevenue` sigue en `0` (no rompe nada aunque no haya precio). Detener el servidor.

- [ ] **Step 4: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Stamp unit price on sale movements and accumulate cumulative revenue"
```

---

### Task 6: `undoLast` revierte `cumulativeRevenue` en ventas

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Reemplazar `undoLast`**

```jsx
  function undoLast(code) {
    const idx = movements.findIndex((m) => m.code === code);
    if (idx === -1) return;
    const m = movements[idx];
    const current = stock[code] || 0;
    const restored = m.type === "venta" ? current + m.qty : Math.max(0, current - m.qty);
    const nextStock = { ...stock, [code]: restored };
    const nextMovements = movements.filter((_, i) => i !== idx);
    const nextCumulativeRevenue =
      m.type === "venta" ? cumulativeRevenue - m.qty * (m.unitPrice || 0) : cumulativeRevenue;
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

- [ ] **Step 2: Verificar manualmente**

```bash
npm run dev
```

En "Ajustar existencias", poné precio 100 a un producto (adelantando un poco la Task 7 manualmente vía DevTools si hace falta — o simplemente saltate a probar esto después de la Task 7 y volvé a confirmar aquí). Por ahora, con `unitPrice` en 0 (todavía sin UI de precio), el comportamiento a verificar es: vender, confirmar `cumulativeRevenue` sube; deshacer esa venta, confirmar que `cumulativeRevenue` vuelve exactamente al valor de antes (aunque sea 0 en ambos casos por no haber precio todavía, el cálculo simétrico ya queda correcto y se re-confirma con datos reales en la Task 13). Deshacer un "ajuste manual" (no una venta) y confirmar que `cumulativeRevenue` NO cambia. Detener el servidor.

- [ ] **Step 3: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Reverse cumulative revenue when undoing a sale"
```

---

### Task 7: Precio editable en "Ajustar existencias"

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Nuevo estado local para el input de precio**

Junto a `const [editInputs, setEditInputs] = useState({});`, agregar:

```jsx
  const [editPriceInputs, setEditPriceInputs] = useState({});
```

- [ ] **Step 2: `openEdit` precarga el precio actual**

Reemplazar:

```jsx
  function openEdit() {
    const inputs = {};
    PRODUCTS.forEach((p) => (inputs[p.code] = String(stock[p.code] || 0)));
    setEditInputs(inputs);
    setEditMode(true);
  }
```

por:

```jsx
  function openEdit() {
    const inputs = {};
    const priceInputs = {};
    PRODUCTS.forEach((p) => {
      inputs[p.code] = String(stock[p.code] || 0);
      priceInputs[p.code] = String(prices[p.code] || 0);
    });
    setEditInputs(inputs);
    setEditPriceInputs(priceInputs);
    setEditMode(true);
  }
```

- [ ] **Step 3: `saveEdit` guarda los precios**

Reemplazar la función completa:

```jsx
  function saveEdit() {
    const nextStock = { ...stock };
    const nextPrices = { ...prices };
    const adjustments = [];
    const nextLastAdjustedAt = { ...lastAdjustedAt };
    const now = new Date().toISOString();
    PRODUCTS.forEach((p) => {
      const val = parseInt(editInputs[p.code], 10);
      const newVal = isNaN(val) || val < 0 ? 0 : val;
      const diff = newVal - (stock[p.code] || 0);
      if (diff !== 0) {
        adjustments.push(makeMovement(p.code, "ajuste", diff));
        nextLastAdjustedAt[p.code] = now;
      }
      nextStock[p.code] = newVal;

      const priceVal = parseFloat(editPriceInputs[p.code]);
      nextPrices[p.code] = isNaN(priceVal) || priceVal < 0 ? 0 : priceVal;
    });
    const nextMovements = [...adjustments, ...movements].slice(0, 500);
    setStock(nextStock);
    setPrices(nextPrices);
    setMovements(nextMovements);
    setLastAdjustedAt(nextLastAdjustedAt);
    setEditMode(false);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      lastAdjustedAt: nextLastAdjustedAt,
      prices: nextPrices,
    });
  }
```

- [ ] **Step 4: Input de precio en el JSX de la tarjeta**

Reemplazar:

```jsx
                    {editMode ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editInputs[p.code]}
                        onChange={(e) => setEditInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        style={{
                          width: 90, textAlign: "right", fontSize: 20, fontWeight: 700,
                          border: "1px solid #D8D2C0", borderRadius: 7, padding: "6px 10px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    ) : (
```

por:

```jsx
                    {editMode ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editInputs[p.code]}
                          onChange={(e) => setEditInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                          style={{
                            width: 90, textAlign: "right", fontSize: 20, fontWeight: 700,
                            border: "1px solid #D8D2C0", borderRadius: 7, padding: "6px 10px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          value={editPriceInputs[p.code]}
                          onChange={(e) => setEditPriceInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                          placeholder="Precio CUP"
                          title="Precio en CUP"
                          style={{
                            width: 90, textAlign: "right", fontSize: 13, fontWeight: 600,
                            border: "1px solid #D8D2C0", borderRadius: 7, padding: "5px 8px",
                            fontVariantNumeric: "tabular-nums", color: "#8A8574",
                          }}
                        />
                      </div>
                    ) : (
```

- [ ] **Step 5: Verificar manualmente**

```bash
npm run dev
```

"Ajustar existencias" → poner precio 100 a un producto → "Guardar existencias" → confirmar en Local Storage que `prices` tiene ese valor. Volver a abrir "Ajustar existencias", confirmar que el input de precio muestra 100 (precargado correctamente). Vender ese producto → confirmar en Local Storage que el movimiento nuevo tiene `"unitPrice":100` y que `cumulativeRevenue` subió exactamente `qty * 100`. Deshacer esa venta → confirmar que `cumulativeRevenue` vuelve a su valor anterior exacto. Detener el servidor.

- [ ] **Step 6: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Add editable per-product price to Ajustar existencias"
```

---

### Task 8: Mostrar precio en la tarjeta de Stock + toggle "Mostrar precios"

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Imports nuevos**

Cambiar:

```jsx
import { Plus, RotateCcw, AlertTriangle, History, Settings2 } from "lucide-react";
```

por:

```jsx
import { Plus, RotateCcw, AlertTriangle, History, Settings2, Eye, EyeOff } from "lucide-react";
```

Y agregar, junto al import de `dateUtils`:

```jsx
import { formatCUP } from "./money";
```

- [ ] **Step 2: Línea de precio en la tarjeta (modo lectura)**

Cambiar:

```jsx
                      {lastAdjustedAt[p.code] && (
                        <div style={{ fontSize: 11, color: "#B4AF9E" }}>ajustado {formatDateTime(lastAdjustedAt[p.code])}</div>
                      )}
                    </div>
                  </div>
```

por:

```jsx
                      {lastAdjustedAt[p.code] && (
                        <div style={{ fontSize: 11, color: "#B4AF9E" }}>ajustado {formatDateTime(lastAdjustedAt[p.code])}</div>
                      )}
                      {showPrices && (
                        <div style={{ fontSize: 11, color: "#8A8574" }}>
                          Precio: {prices[p.code] ? formatCUP(prices[p.code]) : "no definido"}
                        </div>
                      )}
                    </div>
                  </div>
```

- [ ] **Step 3: Botón toggle "Mostrar precios"**

Cambiar:

```jsx
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 16px 0", display: "flex", gap: 8 }}>
        <button
          onClick={() => setView("stock")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "stock" ? "#22261F" : "transparent",
            color: view === "stock" ? "#F7F4EC" : "#22261F",
          }}
        >
          Stock
        </button>
        <button
          onClick={() => setView("resumen")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "resumen" ? "#22261F" : "transparent",
            color: view === "resumen" ? "#F7F4EC" : "#22261F",
          }}
        >
          Resumen semanal
        </button>
      </div>
```

por:

```jsx
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 16px 0", display: "flex", gap: 8 }}>
        <button
          onClick={() => setView("stock")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "stock" ? "#22261F" : "transparent",
            color: view === "stock" ? "#F7F4EC" : "#22261F",
          }}
        >
          Stock
        </button>
        <button
          onClick={() => setView("resumen")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "resumen" ? "#22261F" : "transparent",
            color: view === "resumen" ? "#F7F4EC" : "#22261F",
          }}
        >
          Resumen semanal
        </button>
        <button
          onClick={() => {
            const next = !showPrices;
            setShowPrices(next);
            persist({ ...currentPersistedState, showPrices: next });
          }}
          title={showPrices ? "Ocultar precios" : "Mostrar precios"}
          aria-label={showPrices ? "Ocultar precios" : "Mostrar precios"}
          style={{
            flex: "0 0 auto", width: 40, padding: "9px", cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: "transparent", color: "#22261F",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {showPrices ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
```

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

Con un precio ya puesto en un producto: confirmar que la tarjeta muestra "Precio: X CUP" en modo lectura. Click en el botón del ojo → confirmar que la línea de precio desaparece de la tarjeta, y que el ícono cambia a "ojo tachado". Recargar la página → confirmar que el estado del toggle persistió. Volver a activarlo. A 375px de ancho, confirmar que los 3 botones (Stock / Resumen semanal / ojo) caben sin desbordar horizontalmente. Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Show unit price on stock cards behind a show/hide toggle"
```

---

### Task 9: Wirear props nuevas a `WeeklySummary` + columna de ingreso por producto

**Files:**
- Modify: `src/InventoryApp.jsx`
- Modify: `src/WeeklySummary.jsx`

- [ ] **Step 1: `InventoryApp.jsx` — pasar las props nuevas**

Cambiar:

```jsx
        {view === "resumen" && <WeeklySummary products={PRODUCTS} movements={movements} />}
```

por:

```jsx
        {view === "resumen" && (
          <WeeklySummary
            products={PRODUCTS}
            movements={movements}
            prices={prices}
            cumulativeRevenue={cumulativeRevenue}
            exchangeRate={exchangeRate}
            commissionPercent={commissionPercent}
            showPrices={showPrices}
            onExchangeRateChange={(next) => {
              setExchangeRate(next);
              persist({ ...currentPersistedState, exchangeRate: next });
            }}
            onCommissionPercentChange={(next) => {
              setCommissionPercent(next);
              persist({ ...currentPersistedState, commissionPercent: next });
            }}
          />
        )}
```

- [ ] **Step 2: `WeeklySummary.jsx` — recibir las props y agregar columna de ingreso**

Reemplazar todo el archivo:

```jsx
import { getWeekStartStr, getPreviousWeekRangeStr, todayStr, formatDate } from "./dateUtils";
import { formatCUP, revenueInRange } from "./money";

export default function WeeklySummary({
  products,
  movements,
  prices,
  cumulativeRevenue,
  exchangeRate,
  commissionPercent,
  showPrices,
  onExchangeRateChange,
  onCommissionPercentChange,
}) {
  const weekStart = getWeekStartStr();
  const today = todayStr();
  const { start: prevStart, end: prevEnd } = getPreviousWeekRangeStr();

  const soldInRange = (code, start, end) =>
    movements
      .filter((m) => m.code === code && m.type === "venta" && m.date >= start && m.date <= end)
      .reduce((sum, m) => sum + m.qty, 0);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        RESUMEN SEMANAL · {formatDate(weekStart)} – {formatDate(today)}
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
        {products.map((p, i) => {
          const current = soldInRange(p.code, weekStart, today);
          const previous = soldInRange(p.code, prevStart, prevEnd);
          const hasComparison = previous > 0;
          const pctChange = hasComparison ? Math.round(((current - previous) / previous) * 100) : null;
          const revenue = revenueInRange(movements, p.code, weekStart, today);
          return (
            <div
              key={p.code}
              style={{
                display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                gap: 6, padding: "12px 16px", fontSize: 14,
                borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 24, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{p.short}</span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{current} uds</span>
                {showPrices && (
                  <span style={{ fontSize: 12.5, color: "#8A8574", fontVariantNumeric: "tabular-nums" }}>{formatCUP(revenue)}</span>
                )}
                <span style={{ fontSize: 12.5, color: pctChange === null ? "#9A9484" : pctChange >= 0 ? "#3C6E4A" : "#B4661E" }}>
                  {pctChange === null ? "—" : `${pctChange >= 0 ? "↑" : "↓"} ${Math.abs(pctChange)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar manualmente**

```bash
npm run dev
```

Con un producto con precio puesto: vender un par de unidades, ir a "Resumen semanal", confirmar que la fila de ese producto ahora muestra también su ingreso en CUP (además de las unidades y el %). Apagar el toggle de precios (Task 8) → confirmar que la columna de ingreso desaparece de esta vista también (unidades y % siguen visibles). Detener el servidor.

- [ ] **Step 4: Commit**

```bash
git add src/InventoryApp.jsx src/WeeklySummary.jsx
git commit -m "Wire pricing props into WeeklySummary and show per-product revenue"
```

---

### Task 10: Total semana actual + Total del mes

**Files:**
- Modify: `src/WeeklySummary.jsx`

- [ ] **Step 1: Imports**

Cambiar:

```jsx
import { getWeekStartStr, getPreviousWeekRangeStr, todayStr, formatDate } from "./dateUtils";
import { formatCUP, revenueInRange } from "./money";
```

por:

```jsx
import { getWeekStartStr, getPreviousWeekRangeStr, getMonthStartStr, todayStr, formatDate } from "./dateUtils";
import { formatCUP, revenueInRange, totalRevenueInRange } from "./money";
```

- [ ] **Step 2: Cálculos nuevos**

Justo después de:

```jsx
  const { start: prevStart, end: prevEnd } = getPreviousWeekRangeStr();
```

agregar:

```jsx
  const monthStart = getMonthStartStr();
  const weekTotal = totalRevenueInRange(movements, weekStart, today);
  const monthTotal = totalRevenueInRange(movements, monthStart, today);
  const monthName = new Date(monthStart + "T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
```

- [ ] **Step 3: JSX de los dos totales**

Cambiar el cierre del componente, de:

```jsx
      </div>
    </div>
  );
}
```

(el `</div>` que cierra la tarjeta blanca con la tabla de productos, seguido del `</div>` que cierra el `<div>` raíz del componente) por:

```jsx
      </div>

      {showPrices && (
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "#8A8574" }}>Total semana actual</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(weekTotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "#8A8574" }}>Total {monthName}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(monthTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

(Es decir: el primer `</div>` que ya existía queda igual — cierra la tarjeta de la tabla — y se inserta el bloque nuevo entre ese `</div>` y el `</div>` final que cierra todo el componente, que también ya existía. No se duplica ningún tag, solo se inserta contenido entre dos que ya estaban.)

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

Con ventas registradas esta semana (con precio): confirmar "Total semana actual" en Resumen semanal coincide con la suma de `qty*precio` de esas ventas. Confirmar "Total {mes actual}" incluye esas mismas ventas (y cualquier otra del mes). Apagar el toggle de precios → confirmar que ambos bloques desaparecen. Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/WeeklySummary.jsx
git commit -m "Add current week and current month revenue totals"
```

---

### Task 11: Historial semanal del mes

**Files:**
- Modify: `src/WeeklySummary.jsx`

- [ ] **Step 1: Import**

Cambiar:

```jsx
import { formatCUP, revenueInRange, totalRevenueInRange } from "./money";
```

por:

```jsx
import { formatCUP, revenueInRange, totalRevenueInRange, monthWeeklyBreakdown } from "./money";
```

- [ ] **Step 2: Cálculo**

Justo después de:

```jsx
  const monthName = new Date(monthStart + "T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
```

agregar:

```jsx
  const weeklyBreakdown = monthWeeklyBreakdown(movements, monthStart, today);
```

- [ ] **Step 3: JSX**

Insertar este bloque justo después del `</div>` que cierra el segundo total ("Total {monthName}") y antes del `</div>` que cierra el `{showPrices && (...)}` de la Task 10 — es decir, dentro del mismo bloque condicional, como tercer elemento del `<div style={{ marginTop: 16, display: "grid", gap: 8 }}>`:

Buscar:

```jsx
          <div style={{ display: "flex", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "#8A8574" }}>Total {monthName}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(monthTotal)}</span>
          </div>
        </div>
      )}
```

Reemplazar por:

```jsx
          <div style={{ display: "flex", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "#8A8574" }}>Total {monthName}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(monthTotal)}</span>
          </div>

          {weeklyBreakdown.length > 0 && (
            <div>
              <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
                HISTORIAL SEMANAL DE {monthName.toUpperCase()}
              </div>
              <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
                {weeklyBreakdown.map((w, i) => (
                  <div
                    key={w.weekStart}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 16px", fontSize: 13.5,
                      borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                    }}
                  >
                    <span style={{ color: "#8A8574" }}>Semana del {formatDate(w.weekStart)}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(w.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

Con ventas en más de una semana dentro del mes actual (podés simular editando `localStorage` directamente vía DevTools para poner fechas de semanas distintas si no querés esperar días reales — o simplemente confirmá con una sola semana de datos, que debe verse una sola fila): confirmar que "Historial semanal de {mes}" muestra una fila por cada semana con ventas, ordenadas de la más vieja a la más nueva, y que la suma de esas filas coincide con "Total {mes}". Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/WeeklySummary.jsx
git commit -m "Add weekly revenue breakdown for the current month"
```

---

### Task 12: Total general acumulado, tasa de cambio y comisión

**Files:**
- Modify: `src/WeeklySummary.jsx`

- [ ] **Step 1: Imports**

Cambiar:

```jsx
import { formatCUP, revenueInRange, totalRevenueInRange, monthWeeklyBreakdown } from "./money";
```

por:

```jsx
import { formatCUP, formatUSD, convertToUSD, revenueInRange, totalRevenueInRange, monthWeeklyBreakdown } from "./money";
```

- [ ] **Step 2: Cálculos**

Justo después de:

```jsx
  const weeklyBreakdown = monthWeeklyBreakdown(movements, monthStart, today);
```

agregar:

```jsx
  const cumulativeUSD = convertToUSD(cumulativeRevenue, exchangeRate);
  const commissionCUP = (cumulativeRevenue * (commissionPercent || 0)) / 100;
  const commissionUSD = convertToUSD(commissionCUP, exchangeRate);
```

- [ ] **Step 3: JSX — sección de total general, al final del componente**

Cambiar el cierre del componente, de:

```jsx
        </div>
      )}
    </div>
  );
}
```

por:

```jsx
        </div>
      )}

      <div style={{ marginTop: 16, background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>TOTAL GENERAL ACUMULADO</span>
          {showPrices && (
            <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
              {formatCUP(cumulativeRevenue)}
              {cumulativeUSD !== null && <span style={{ color: "#8A8574", fontWeight: 500, fontSize: 13 }}> · {formatUSD(cumulativeUSD)}</span>}
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: "#8A8574", display: "flex", alignItems: "center", gap: 6 }}>
            1 USD =
            <input
              type="number"
              inputMode="decimal"
              value={exchangeRate ?? ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onExchangeRateChange(isNaN(val) || val <= 0 ? null : val);
              }}
              placeholder="tasa"
              style={{
                width: 90, border: "1px solid #E7E2D3", borderRadius: 7,
                padding: "6px 8px", fontSize: 13, fontVariantNumeric: "tabular-nums",
              }}
            />
            CUP
          </label>

          <label style={{ fontSize: 13, color: "#8A8574", display: "flex", alignItems: "center", gap: 6 }}>
            Comisión
            <input
              type="number"
              inputMode="decimal"
              value={commissionPercent || ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onCommissionPercentChange(isNaN(val) || val < 0 ? 0 : val);
              }}
              placeholder="0"
              style={{
                width: 60, border: "1px solid #E7E2D3", borderRadius: 7,
                padding: "6px 8px", fontSize: 13, fontVariantNumeric: "tabular-nums",
              }}
            />
            %
          </label>
        </div>

        {showPrices && commissionPercent > 0 && (
          <div style={{ fontSize: 13, color: "#8A8574" }}>
            Comisión ({commissionPercent}%): <span style={{ fontWeight: 700, color: "#26241F" }}>{formatCUP(commissionCUP)}</span>
            {commissionUSD !== null && <span> · {formatUSD(commissionUSD)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

Confirmar "Total general acumulado" muestra el mismo valor que `cumulativeRevenue` en Local Storage. Poner una tasa de cambio (ej. `300`) → confirmar que aparece el equivalente en USD junto al total CUP, y que persiste tras recargar. Poner una comisión (ej. `10`) → confirmar que aparece la línea "Comisión (10%): ..." con el cálculo correcto en CUP y USD. Apagar el toggle de precios → confirmar que el monto del total general y de la comisión se ocultan, pero los inputs de tasa de cambio y comisión siguen visibles y editables. Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/WeeklySummary.jsx
git commit -m "Add cumulative revenue total, exchange rate input, and commission calculation"
```

---

### Task 13: Verificación final y deploy

**Files:** ninguno (solo verificación, salvo que algo falle)

- [ ] **Step 1: Build limpio**

```bash
npm run build
```

Esperado: sin errores.

- [ ] **Step 2: Regresión completa sobre el build de producción**

```bash
npm run preview
```

Repetir contra el build de producción (URL con `/inventario-procovar/`, no root) los 10 puntos de verificación de la spec:

1. Poner precio a un producto, guardar, confirmar que aparece en la tarjeta de Stock.
2. Vender ese producto, confirmar que "Total semana actual" y "Total mes" reflejan `qty * precio`.
3. Cambiar el precio, vender de nuevo, confirmar que el reporte de la venta anterior no cambió (sigue con el precio viejo — revisar en el historial de movimientos o recalculando el total de la semana antes del cambio de precio).
4. Deshacer la venta más reciente, confirmar que "Total general acumulado" baja exactamente lo que había subido.
5. Poner una tasa de cambio, confirmar que los montos CUP muestran su equivalente USD.
6. Poner un % de comisión, confirmar el cálculo sobre el total acumulado.
7. Apagar "Mostrar precios", confirmar que se ocultan los montos en Stock y Resumen semanal pero la tasa de cambio y la comisión siguen editables.
8. Recargar la página, confirmar que precios, tasa de cambio, comisión, toggle y total acumulado persistieron.
9. Con datos de más de una semana en el mes, confirmar que "Historial semanal de este mes" desglosa correctamente.
10. A 375px de ancho, confirmar que ninguna fila nueva (columna de ingreso, totales, inputs de tasa/comisión) desborda horizontalmente.

- [ ] **Step 3: Confirmar que el resto de la app no regresionó**

Repetir rápido: vender con oversell bloqueado, deshacer, ajuste de stock con timestamp, botón "+" compacto, offline (matar el server de preview y recargar) — todo lo que ya estaba antes de este plan debe seguir funcionando igual.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Esto dispara el deploy automático a GitHub Pages. Confirmar con:

```bash
gh run watch --exit-status
```

Esperado: jobs `build` y `deploy` en verde. Abrir `https://raulsp9007.github.io/inventario-procovar/` y repetir una pasada rápida (poner precio, vender, ver Resumen semanal) sobre el sitio en vivo.

- [ ] **Step 5: Commit final (si algo se ajustó durante la verificación)**

```bash
git add -A
git commit -m "Fix issues found during end-to-end verification"
git push origin main
```

Si no hubo que tocar nada, no hay commit que hacer en este paso.
