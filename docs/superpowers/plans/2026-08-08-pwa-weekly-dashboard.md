# PWA offline + dashboard semanal + timestamp de ajustes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `inventario-procovar.jsx` (componente suelto pensado para un host tipo Artifact) en un sitio Vite real, instalable offline (PWA), con un dashboard de ventas semanal por producto y registro de fecha/hora del último ajuste manual de stock, desplegado automáticamente a GitHub Pages.

**Architecture:** Proyecto Vite + React. `window.storage` se reemplaza por `localStorage` vía un wrapper (`storage.js`). El componente principal se divide en `InventoryApp.jsx` (vista de stock, sin cambios de comportamiento salvo lo pedido) y `WeeklySummary.jsx` (nueva vista, cálculo derivado de `movements`, sin estado guardado nuevo). `vite-plugin-pwa` genera manifest + service worker. GitHub Actions construye y publica `dist/` a GitHub Pages en cada push a `main`.

**Tech Stack:** React 18, Vite, `vite-plugin-pwa`, `lucide-react`, GitHub Actions (`actions/deploy-pages`).

Spec de referencia: `docs/superpowers/specs/2026-08-08-pwa-weekly-dashboard-design.md`

---

## Contexto para quien ejecute este plan

No hay suite de tests en este proyecto (decisión explícita del spec — app pequeña, verificación manual). Por eso cada tarea reemplaza el paso "run test" por un paso de verificación manual concreto (`npm run dev` + acciones puntuales a probar en el navegador). No te saltes esos pasos: son la única red de seguridad que tiene este proyecto.

El repo vive en `D:\DOCUMENTOS\proyectos\PARRANDA\inventario-procovar-repo`, remoto `https://github.com/raulsp9007/inventario-procovar` (rama `main`, ya tiene historia previa — el componente original y el spec). Todos los comandos de las tareas asumen que el directorio de trabajo (`cwd`) es la raíz de ese repo.

---

### Task 1: Scaffold del proyecto Vite

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.jsx`
- Create: `.gitignore`

- [ ] **Step 1: Crear estructura de carpetas**

```bash
mkdir -p src public .github/workflows
```

- [ ] **Step 2: Inicializar package.json e instalar dependencias**

```bash
npm init -y
npm install react react-dom lucide-react
npm install -D vite @vitejs/plugin-react
```

- [ ] **Step 3: Editar `package.json`**

Abrir el `package.json` generado por `npm init -y` y reemplazar el bloque `"scripts"`, y agregar `"type": "module"` al nivel raíz del objeto:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

(El resto de campos que generó `npm init -y`, y las secciones `dependencies`/`devDependencies` que agregó `npm install`, se quedan igual.)

- [ ] **Step 4: Crear `.gitignore`**

```
node_modules
dist
.DS_Store
```

- [ ] **Step 5: Crear `vite.config.js`**

El sitio se sirve en GitHub Pages bajo `/inventario-procovar/` (repo de proyecto, no de usuario), por eso `base` cambia solo en build:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/inventario-procovar/" : "/",
  plugins: [react()],
}));
```

- [ ] **Step 6: Crear `index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inventario Procovar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Crear `src/main.jsx` (placeholder temporal)**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <h1>Procovar</h1>
  </React.StrictMode>
);
```

- [ ] **Step 8: Verificar que el proyecto arranca**

```bash
npm run dev
```

Abrir la URL que imprime (ej. `http://localhost:5173/`). Esperado: página en blanco con el texto "Procovar". Sin errores en consola del navegador. Detener el servidor (Ctrl+C) después de confirmar.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.js index.html src/main.jsx .gitignore
git commit -m "Scaffold Vite project"
```

---

### Task 2: `storage.js` — wrapper de localStorage

**Files:**
- Create: `src/storage.js`

- [ ] **Step 1: Crear `src/storage.js`**

Mismas firmas async que la `window.storage` original (para no cambiar cómo la llama el resto de la app), pero sobre `localStorage`. Si `localStorage.setItem` falla (cuota excedida, modo incógnito restringido), el error se propaga — quien llama (`persist()` en `InventoryApp`) ya lo captura y muestra un mensaje.

```js
export async function getData(key) {
  const raw = localStorage.getItem(key);
  return raw === null ? null : { value: raw };
}

export async function setData(key, value) {
  localStorage.setItem(key, value);
  return true;
}
```

- [ ] **Step 2: Verificar en consola del navegador**

```bash
npm run dev
```

Abrir la página, abrir DevTools → Console, y ejecutar:

```js
const mod = await import("/src/storage.js");
await mod.setData("test-key", "hola");
await mod.getData("test-key"); // debe devolver { value: "hola" }
localStorage.removeItem("test-key");
```

Esperado: `getData` devuelve `{ value: "hola" }`. Detener el servidor.

- [ ] **Step 3: Commit**

```bash
git add src/storage.js
git commit -m "Add localStorage wrapper to replace window.storage"
```

---

### Task 3: `dateUtils.js` — helpers de fecha y semana

**Files:**
- Create: `src/dateUtils.js`

- [ ] **Step 1: Crear `src/dateUtils.js`**

Incluye `todayStr`/`formatDate` (movidos desde el componente original, sin cambio de firma) más los helpers nuevos de semana. Nota: `todayStr()` original usaba `new Date().toISOString().slice(0,10)`, que es la fecha en UTC, no en la zona horaria local del negocio — cerca de medianoche eso podía poner una venta en el día equivocado. Se corrige aquí a cálculo en fecha local, y como `getWeekStartStr` depende de `todayStr()` para saber "hoy", ambas funciones tienen que usar el mismo criterio (local) para que "hoy" caiga siempre dentro de "esta semana".

```js
function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function formatDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Lunes de la semana de referenceDateStr (formato "YYYY-MM-DD").
export function getWeekStartStr(referenceDateStr = todayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  const day = d.getDay(); // 0 = domingo, 1 = lunes, ... 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toDateStr(d);
}

// Lunes y domingo de la semana ANTERIOR a la de referenceDateStr.
export function getPreviousWeekRangeStr(referenceDateStr = todayStr()) {
  const mondayStr = getWeekStartStr(referenceDateStr);
  const monday = new Date(mondayStr + "T00:00:00");
  const prevMonday = new Date(monday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevSunday = new Date(monday);
  prevSunday.setDate(prevSunday.getDate() - 1);
  return { start: toDateStr(prevMonday), end: toDateStr(prevSunday) };
}
```

- [ ] **Step 2: Verificar en consola del navegador**

```bash
npm run dev
```

En DevTools → Console:

```js
const mod = await import("/src/dateUtils.js");
mod.todayStr();                        // "YYYY-MM-DD" de hoy
mod.getWeekStartStr("2026-08-08");     // "2026-08-03" (lunes de esa semana; 2026-08-08 es sábado)
mod.getPreviousWeekRangeStr("2026-08-08"); // { start: "2026-07-27", end: "2026-08-02" }
mod.formatDateTime(new Date().toISOString()); // fecha+hora legible en español
```

Confirmar que `getWeekStartStr("2026-08-08")` da `"2026-08-03"` (el 8 de agosto de 2026 es sábado; el lunes de esa semana es el 3). Detener el servidor.

- [ ] **Step 3: Commit**

```bash
git add src/dateUtils.js
git commit -m "Add week/date helper functions"
```

---

### Task 4: Migrar el componente principal a `src/InventoryApp.jsx`

**Files:**
- Create: `src/InventoryApp.jsx`
- Modify: `src/main.jsx`
- Delete: `inventario-procovar.jsx` (raíz del repo)

Este paso mueve el componente tal cual (mismo comportamiento que hoy: registrar venta, deshacer, ajustar existencias, historial, validación de oversell) pero usando `storage.js` y `dateUtils.js` en vez de `window.storage` y las funciones de fecha locales. Sin features nuevas todavía — eso es lo que hace verificable este paso por separado.

- [ ] **Step 1: Crear `src/InventoryApp.jsx`**

```jsx
import { useState, useEffect, useCallback } from "react";
import { Package, TrendingDown, Plus, Minus, RotateCcw, AlertTriangle, History, Settings2 } from "lucide-react";
import { getData, setData } from "./storage";
import { todayStr, formatDate } from "./dateUtils";

const PRODUCTS = [
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", color: "#C77A2E" },
  { code: "P500",  name: "Parranda 500ml",  short: "P-500",  color: "#C77A2E" },
  { code: "P330",  name: "Parranda 330ml",  short: "P-330",  color: "#C77A2E" },
  { code: "M330",  name: "Malta Guajira 330ml",  short: "M-330",  color: "#274E37" },
  { code: "M1500", name: "Malta Guajira 1500ml", short: "M-1500", color: "#274E37" },
];

const LOW_STOCK_THRESHOLD = 20;
const STORAGE_KEY = "procovar-inventario-v1";

export default function InventoryApp() {
  const [stock, setStock] = useState(() =>
    PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: 0 }), {})
  );
  const [movements, setMovements] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [saleInputs, setSaleInputs] = useState(() =>
    PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {})
  );
  const [editMode, setEditMode] = useState(false);
  const [editInputs, setEditInputs] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const result = await getData(STORAGE_KEY);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          setStock(parsed.stock || {});
          setMovements(parsed.movements || []);
        }
      } catch (e) {
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (nextStock, nextMovements) => {
    setSaveState("saving");
    try {
      await setData(STORAGE_KEY, JSON.stringify({ stock: nextStock, movements: nextMovements }));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      setSaveState("idle");
      setError("No se pudo guardar. Intenta de nuevo.");
      setTimeout(() => setError(""), 3000);
    }
  }, []);

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F4EC", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ color: "#9A9484", fontSize: 14, letterSpacing: "0.05em" }}>CARGANDO INVENTARIO…</div>
      </div>
    );
  }

  const totalStock = PRODUCTS.reduce((sum, p) => sum + (stock[p.code] || 0), 0);
  const lowStockCount = PRODUCTS.filter((p) => (stock[p.code] || 0) <= LOW_STOCK_THRESHOLD).length;
  const todaysMovements = movements.filter((m) => m.date === todayStr());
  const todaysUnitsSold = todaysMovements
    .filter((m) => m.type === "venta")
    .reduce((sum, m) => sum + m.qty, 0);

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
    const nextStock = { ...stock, [code]: current - qty };
    const movement = makeMovement(code, "venta", qty);
    const nextMovements = [movement, ...movements].slice(0, 500);
    setStock(nextStock);
    setMovements(nextMovements);
    setSaleInputs((s) => ({ ...s, [code]: "" }));
    persist(nextStock, nextMovements);
  }

  function undoLast(code) {
    const idx = movements.findIndex((m) => m.code === code);
    if (idx === -1) return;
    const m = movements[idx];
    const current = stock[code] || 0;
    const restored = m.type === "venta" ? current + m.qty : Math.max(0, current - m.qty);
    const nextStock = { ...stock, [code]: restored };
    const nextMovements = movements.filter((_, i) => i !== idx);
    setStock(nextStock);
    setMovements(nextMovements);
    persist(nextStock, nextMovements);
  }

  function openEdit() {
    const inputs = {};
    PRODUCTS.forEach((p) => (inputs[p.code] = String(stock[p.code] || 0)));
    setEditInputs(inputs);
    setEditMode(true);
  }

  function saveEdit() {
    const nextStock = { ...stock };
    const adjustments = [];
    PRODUCTS.forEach((p) => {
      const val = parseInt(editInputs[p.code], 10);
      const newVal = isNaN(val) || val < 0 ? 0 : val;
      const diff = newVal - (stock[p.code] || 0);
      if (diff !== 0) {
        adjustments.push(makeMovement(p.code, "ajuste", diff));
      }
      nextStock[p.code] = newVal;
    });
    const nextMovements = [...adjustments, ...movements].slice(0, 500);
    setStock(nextStock);
    setMovements(nextMovements);
    setEditMode(false);
    persist(nextStock, nextMovements);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EC", fontFamily: "'Inter', system-ui, sans-serif", color: "#26241F", paddingBottom: 48 }}>
      <style>{`
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .rowfade { animation: fadeIn 0.25s ease; }
      `}</style>

      <div style={{ background: "#22261F", color: "#F7F4EC", padding: "24px 16px 20px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "#B7C9A8", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · CONTROL DE STOCK</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>Inventario diario</h1>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#9AA890", letterSpacing: "0.06em" }}>UNIDADES TOTALES</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totalStock}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#9AA890", letterSpacing: "0.06em" }}>VENDIDO HOY</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#E3B463" }}>{todaysUnitsSold}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px 0" }}>
        {lowStockCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FBEFE0", border: "1px solid #E9CFA0", color: "#8A5A1E", padding: "10px 14px", borderRadius: 8, fontSize: 13.5, marginBottom: 16 }}>
            <AlertTriangle size={16} strokeWidth={2} />
            {lowStockCount === 1
              ? "1 producto con stock bajo (≤ 20 unidades)."
              : `${lowStockCount} productos con stock bajo (≤ 20 unidades).`}
          </div>
        )}

        {error && (
          <div style={{ background: "#FBE4E0", border: "1px solid #E9A79C", color: "#8A2E1E", padding: "9px 14px", borderRadius: 8, fontSize: 13.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PRODUCTOS</div>
          <button
            onClick={editMode ? saveEdit : openEdit}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: editMode ? "#22261F" : "transparent",
              color: editMode ? "#F7F4EC" : "#22261F",
              border: "1px solid #22261F",
              borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Settings2 size={14} />
            {editMode ? "Guardar existencias" : "Ajustar existencias"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {PRODUCTS.map((p) => {
            const qty = stock[p.code] || 0;
            const isLow = qty <= LOW_STOCK_THRESHOLD;
            const lastMovement = movements.find((m) => m.code === p.code);
            return (
              <div
                key={p.code}
                className="rowfade"
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${isLow ? "#E9CFA0" : "#E7E2D3"}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{
                      width: 6, height: 40, borderRadius: 3, background: p.color, flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "#9A9484" }}>{p.short}{lastMovement ? ` · último movimiento ${formatDate(lastMovement.date)}` : ""}</div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
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
                      <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isLow ? "#B4661E" : "#22261F" }}>
                        {qty} <span style={{ fontSize: 12, fontWeight: 500, color: "#9A9484" }}>uds</span>
                      </div>
                    )}
                  </div>
                </div>

                {!editMode && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Cant. vendida"
                      value={saleInputs[p.code]}
                      onChange={(e) => setSaleInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") registerSale(p.code); }}
                      style={{
                        flex: "1 1 110px", minWidth: 110, border: "1px solid #E7E2D3", borderRadius: 7,
                        padding: "9px 12px", fontSize: 16, fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={() => registerSale(p.code)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        flex: "1 1 auto",
                        background: "#22261F", color: "#F7F4EC", border: "none",
                        borderRadius: 7, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Minus size={14} /> Registrar venta
                    </button>
                    {lastMovement && (
                      <button
                        onClick={() => undoLast(p.code)}
                        title="Deshacer último movimiento"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "transparent", border: "1px solid #E7E2D3", color: "#8A8574",
                          borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                        }}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
            <History size={14} /> HISTORIAL DE MOVIMIENTOS
          </div>
          {movements.length === 0 ? (
            <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
              Aún no hay movimientos registrados.
            </div>
          ) : (
            <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
              {movements.slice(0, 25).map((m, i) => {
                const product = PRODUCTS.find((p) => p.code === m.code);
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                      gap: 6, padding: "10px 16px", fontSize: 13.5,
                      borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: product?.color || "#9A9484" }} />
                      <span style={{ fontWeight: 600 }}>{product?.short || m.code}</span>
                      <span style={{ color: "#9A9484" }}>{m.type === "venta" ? "venta" : "ajuste manual"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <span style={{ color: "#9A9484", fontSize: 12 }}>{formatDate(m.date)}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: m.type === "venta" ? "#B4661E" : (m.qty >= 0 ? "#3C6E4A" : "#B4661E") }}>
                        {m.type === "venta" ? `-${m.qty}` : (m.qty >= 0 ? `+${m.qty}` : m.qty)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, fontSize: 11.5, color: "#B4AF9E", textAlign: "center" }}>
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : "Los datos se guardan automáticamente en este dispositivo"}
        </div>
      </div>
    </div>
  );
}
```

Nota: `Package` y `TrendingDown` quedan importados sin usar (ya estaban así en el original) — se limpian en la Task 8 al tocar los imports de íconos para el botón de venta.

- [ ] **Step 2: Actualizar `src/main.jsx`**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import InventoryApp from "./InventoryApp.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <InventoryApp />
  </React.StrictMode>
);
```

- [ ] **Step 3: Eliminar el archivo viejo de la raíz**

```bash
git rm inventario-procovar.jsx
```

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

En el navegador:
1. Abrir DevTools → Application → Local Storage, borrar cualquier entrada previa de `procovar-inventario-v1` para partir limpio.
2. Recargar. Debe verse "Inventario diario" con todos los productos en 0.
3. Click "Ajustar existencias", poner algún valor (ej. 30) en un producto, "Guardar existencias" — el número debe quedar y debe verse "Guardado ✓" brevemente abajo.
4. Vender una cantidad menor al stock — debe descontar y aparecer en el historial.
5. Intentar vender más de lo disponible — debe mostrar "No hay suficiente stock para esa venta." y no modificar el stock.
6. Click en deshacer (ícono ↺) — debe restaurar el valor anterior exacto.
7. Recargar la página — todo lo anterior debe seguir ahí (persistencia via localStorage funcionando).

Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/InventoryApp.jsx src/main.jsx inventario-procovar.jsx
git commit -m "Migrate InventoryApp to Vite project using localStorage"
```

---

### Task 5: `WeeklySummary.jsx` — componente de resumen semanal

**Files:**
- Create: `src/WeeklySummary.jsx`

- [ ] **Step 1: Crear `src/WeeklySummary.jsx`**

Recibe `products` y `movements` como props — no lee ni guarda nada por su cuenta, todo el cálculo es derivado (sin nuevo estado persistido).

```jsx
import { getWeekStartStr, getPreviousWeekRangeStr, todayStr, formatDate } from "./dateUtils";

export default function WeeklySummary({ products, movements }) {
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

- [ ] **Step 2: Verificar el cálculo con datos simulados**

Este componente no está wireado a la UI todavía (eso es la Task 6), pero su lógica es pura y se puede probar en consola:

```bash
npm run dev
```

En DevTools → Console:

```js
const mod = await import("/src/dateUtils.js");
// Fabricar movimientos de prueba a caballo entre dos semanas (referencia: 2026-08-08 es sábado)
const movements = [
  { code: "P500", type: "venta", qty: 10, date: "2026-08-05" }, // esta semana (miércoles)
  { code: "P500", type: "venta", qty: 4,  date: "2026-08-03" }, // esta semana (lunes)
  { code: "P500", type: "venta", qty: 20, date: "2026-07-29" }, // semana pasada
];
const weekStart = mod.getWeekStartStr("2026-08-08");           // "2026-08-03"
const prev = mod.getPreviousWeekRangeStr("2026-08-08");        // { start: "2026-07-27", end: "2026-08-02" }
const inRange = (start, end) => movements.filter(m => m.date >= start && m.date <= end).reduce((s, m) => s + m.qty, 0);
inRange(weekStart, "2026-08-08"); // esperado: 14 (10 + 4)
inRange(prev.start, prev.end);    // esperado: 20
```

Confirmar que da 14 y 20 respectivamente (14 vs 20 sería una caída de -30%, exactamente el tipo de dato que la UI mostrará). Detener el servidor.

- [ ] **Step 3: Commit**

```bash
git add src/WeeklySummary.jsx
git commit -m "Add WeeklySummary component"
```

---

### Task 6: Wirear el toggle Stock / Resumen semanal

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Agregar import y estado de vista**

En `src/InventoryApp.jsx`, agregar el import de `WeeklySummary` junto a los demás imports:

```jsx
import WeeklySummary from "./WeeklySummary";
```

Agregar el estado, junto a los demás `useState` (después de `const [error, setError] = useState("");`):

```jsx
const [view, setView] = useState("stock"); // "stock" | "resumen"
```

- [ ] **Step 2: Agregar el toggle en el JSX**

Insertar este bloque justo después del `<div>` de cierre del header (después de la línea `</div>` que cierra `background: "#22261F"`, antes del `<div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px 0" }}>` que contiene las alertas):

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

- [ ] **Step 3: Condicionar el resto del contenido a la vista activa**

Dentro del `<div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px 0" }}>` que sigue (el que tiene las alertas, productos e historial), envolver todo el bloque de "PRODUCTOS" + grid de tarjetas + "HISTORIAL DE MOVIMIENTOS" en una condición. Concretamente, reemplazar:

```jsx
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PRODUCTOS</div>
```

por:

```jsx
        {view === "stock" && (
        <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PRODUCTOS</div>
```

Y donde termina el bloque de historial (justo antes del `<div style={{ marginTop: 20, ... }}>` del footer "Los datos se guardan..."), cerrar el fragment y agregar la vista de resumen:

```jsx
        </div>
        </>
        )}

        {view === "resumen" && <WeeklySummary products={PRODUCTS} movements={movements} />}

        <div style={{ marginTop: 20, fontSize: 11.5, color: "#B4AF9E", textAlign: "center" }}>
```

(El `</div>` agregado antes de `</>` cierra el `<div style={{ marginTop: 28 }}>` del historial, que ya existía — solo se está envolviendo lo existente, no se duplica markup.)

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

1. Con datos de prueba ya cargados (de la Task 4), confirmar que la vista "Stock" se ve igual que antes.
2. Click en "Resumen semanal" — debe verse una fila por producto con "0 uds" y "—" (sin ventas registradas de prueba en `movements` reales todavía, es esperado).
3. Registrar un par de ventas en la vista Stock, volver a Resumen semanal — el número de esa venta debe reflejarse en "esta semana".
4. Confirmar que no hay overflow horizontal a 375px de ancho (DevTools → toggle device toolbar → iPhone SE o similar).

Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Wire Stock/Resumen semanal view toggle"
```

---

### Task 7: Fecha/hora de último ajuste manual de stock

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Importar `formatDateTime`**

Cambiar el import de `dateUtils` (agregado en Task 4) de:

```jsx
import { todayStr, formatDate } from "./dateUtils";
```

a:

```jsx
import { todayStr, formatDate, formatDateTime } from "./dateUtils";
```

- [ ] **Step 2: Agregar estado `lastAdjustedAt`**

Junto a `const [movements, setMovements] = useState([]);`, agregar:

```jsx
const [lastAdjustedAt, setLastAdjustedAt] = useState({});
```

- [ ] **Step 3: Cargar y guardar `lastAdjustedAt`**

En el `useEffect` de carga, donde dice:

```jsx
          setStock(parsed.stock || {});
          setMovements(parsed.movements || []);
```

agregar debajo:

```jsx
          setLastAdjustedAt(parsed.lastAdjustedAt || {});
```

En `persist`, cambiar la firma y el payload guardado:

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

- [ ] **Step 4: Actualizar las 3 llamadas a `persist`**

En `registerSale`, `undoLast` y `saveEdit`, cada llamada a `persist(nextStock, nextMovements)` pasa a `persist(nextStock, nextMovements, lastAdjustedAt)` — **sin cambiar** `lastAdjustedAt` en esos dos primeros casos (venta y deshacer no tocan la fecha de ajuste).

En `registerSale`, cambiar:

```jsx
    persist(nextStock, nextMovements);
```

por:

```jsx
    persist(nextStock, nextMovements, lastAdjustedAt);
```

En `undoLast`, cambiar:

```jsx
    persist(nextStock, nextMovements);
```

por:

```jsx
    persist(nextStock, nextMovements, lastAdjustedAt);
```

(Son dos ocurrencias idénticas del mismo texto viejo en el archivo, una dentro de `registerSale` y otra dentro de `undoLast` — reemplazar cada una en su función correspondiente, no con un buscar-y-reemplazar global, porque `saveEdit` también llama a `persist` pero con una firma distinta que se define en el paso siguiente.)

En `saveEdit`, calcular el nuevo mapa y usarlo tanto para actualizar el estado como para persistir:

```jsx
  function saveEdit() {
    const nextStock = { ...stock };
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
    });
    const nextMovements = [...adjustments, ...movements].slice(0, 500);
    setStock(nextStock);
    setMovements(nextMovements);
    setLastAdjustedAt(nextLastAdjustedAt);
    setEditMode(false);
    persist(nextStock, nextMovements, nextLastAdjustedAt);
  }
```

- [ ] **Step 5: Mostrar la fecha en la tarjeta del producto**

En el JSX de cada tarjeta, debajo de la línea que muestra "último movimiento", agregar una línea condicional. Ubicación: dentro del `<div>` que envuelve nombre + subtítulo del producto, después de:

```jsx
                      <div style={{ fontSize: 12, color: "#9A9484" }}>{p.short}{lastMovement ? ` · último movimiento ${formatDate(lastMovement.date)}` : ""}</div>
```

agregar:

```jsx
                      {lastAdjustedAt[p.code] && (
                        <div style={{ fontSize: 11, color: "#B4AF9E" }}>ajustado {formatDateTime(lastAdjustedAt[p.code])}</div>
                      )}
```

- [ ] **Step 6: Verificar manualmente**

```bash
npm run dev
```

1. Con localStorage limpio, abrir la app.
2. Vender una unidad de un producto — la tarjeta NO debe mostrar línea "ajustado ...".
3. Click "Ajustar existencias", cambiar el valor de ese mismo producto, guardar — ahora sí debe aparecer "ajustado {fecha}, {hora}" bajo el producto.
4. Recargar la página — la fecha de ajuste debe persistir.
5. Vender de nuevo en ese producto — la línea "ajustado ..." NO debe cambiar (solo la línea de "último movimiento" se actualiza).

Detener el servidor.

- [ ] **Step 7: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Track and display last manual stock adjustment timestamp per product"
```

---

### Task 8: Botón de venta compacto (ícono en vez de texto)

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Reemplazar el botón**

Cambiar:

```jsx
                    <button
                      onClick={() => registerSale(p.code)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        flex: "1 1 auto",
                        background: "#22261F", color: "#F7F4EC", border: "none",
                        borderRadius: 7, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Minus size={14} /> Registrar venta
                    </button>
```

por:

```jsx
                    <button
                      onClick={() => registerSale(p.code)}
                      title="Registrar venta"
                      aria-label="Registrar venta"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flex: "0 0 auto", width: 40,
                        background: "#22261F", color: "#F7F4EC", border: "none",
                        borderRadius: 7, padding: "10px", cursor: "pointer",
                      }}
                    >
                      <Plus size={18} strokeWidth={2.5} />
                    </button>
```

El input de cantidad pasa a `flex: "1 1 auto"` para ocupar el espacio que el botón ya no necesita — cambiar:

```jsx
                      style={{
                        flex: "1 1 110px", minWidth: 110, border: "1px solid #E7E2D3", borderRadius: 7,
                        padding: "9px 12px", fontSize: 16, fontVariantNumeric: "tabular-nums",
                      }}
```

por:

```jsx
                      style={{
                        flex: "1 1 auto", minWidth: 110, border: "1px solid #E7E2D3", borderRadius: 7,
                        padding: "9px 12px", fontSize: 16, fontVariantNumeric: "tabular-nums",
                      }}
```

- [ ] **Step 2: Limpiar imports de íconos sin uso**

`Minus` ya no se usa en ningún lado del archivo. `Package` y `TrendingDown` tampoco se usaban desde el componente original. Cambiar el import de:

```jsx
import { Package, TrendingDown, Plus, Minus, RotateCcw, AlertTriangle, History, Settings2 } from "lucide-react";
```

a:

```jsx
import { Plus, RotateCcw, AlertTriangle, History, Settings2 } from "lucide-react";
```

- [ ] **Step 3: Verificar manualmente**

```bash
npm run dev
```

Confirmar: cada producto muestra un botón cuadrado con "+" en vez de "Registrar venta", sigue funcionando igual al hacer click (registra la venta del valor en el input), y al pasar el mouse por encima aparece el tooltip "Registrar venta". Revisar a 375px de ancho que la fila (input + botón + deshacer) ya no tiene tanto riesgo de wrap como antes.

Detener el servidor.

- [ ] **Step 4: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Replace 'Registrar venta' button label with compact plus icon"
```

---

### Task 9: Generar íconos de la PWA

**Files:**
- Create: `scripts/generate-icons.mjs`
- Create (generado, no manual): `public/icon-192.png`, `public/icon-512.png`

Sin dependencias nuevas — genera PNGs válidos a mano (chunks IHDR/IDAT/IEND) usando solo `node:zlib` y `node:fs`, para no depender de `canvas`/`sharp` (requieren compilación nativa). El resultado es un ícono simple: fondo `#22261F` (el mismo del header) con un cuadrado centrado en `#E3B463` (el color de acento que ya usa "VENDIDO HOY"). No es un logo elaborado — sirve como ícono válido de partida; se puede reemplazar más adelante con arte real sin tocar el resto del sistema (el manifest solo referencia los nombres de archivo).

- [ ] **Step 1: Crear `scripts/generate-icons.mjs`**

```js
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function generateIcon(size, outPath) {
  const bg = hexToRgb("#22261F");
  const fg = hexToRgb("#E3B463");
  const inset = Math.round(size * 0.28);

  const stride = 1 + size * 3; // 1 byte de filtro + 3 bytes (RGB) por pixel
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      const inner = x >= inset && x < size - inset && y >= inset && y < size - inset;
      const [r, g, b] = inner ? fg : bg;
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const idat = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(outPath, png);
  console.log(`Generado ${outPath} (${size}x${size})`);
}

generateIcon(192, new URL("../public/icon-192.png", import.meta.url));
generateIcon(512, new URL("../public/icon-512.png", import.meta.url));
```

- [ ] **Step 2: Ejecutar el script**

```bash
node scripts/generate-icons.mjs
```

Esperado en la salida:
```
Generado .../public/icon-192.png (192x192)
Generado .../public/icon-512.png (512x512)
```

- [ ] **Step 3: Verificar que son PNGs válidos**

```bash
file public/icon-192.png public/icon-512.png
```

Esperado: `PNG image data, 192 x 192, 8-bit/color RGB` y `... 512 x 512 ...` respectivamente. Si el comando `file` no está disponible, abrir ambos archivos directamente en el explorador de Windows y confirmar que se ven como una imagen (cuadrado oscuro con cuadrado dorado centrado), no como archivo corrupto.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icons.mjs public/icon-192.png public/icon-512.png
git commit -m "Add PWA icon generator and generated icons"
```

---

### Task 10: Configurar `vite-plugin-pwa`

**Files:**
- Modify: `vite.config.js`
- Modify: `index.html`

> **Nota post-implementación:** el `command === "build"` de los snippets abajo (y del `vite.config.js` original de la Task 1) resultó estar mal — `vite preview` también reporta `command: "serve"` (igual que `vite dev`), así que rompía `npm run preview` localmente (los assets se servían con el prefijo `/inventario-procovar/` horneado en el HTML, pero el server de preview montaba en `/`). El fix real, aplicado después de la verificación manual de este task, usa `mode === "production" || isPreview` en su lugar. El deploy real a GitHub Pages nunca estuvo afectado (sirve `dist/` tal cual, sin pasar por la lógica de preview de Vite). Ver commits `a4a1f21` y `05cec8a`.

- [ ] **Step 1: Instalar la dependencia**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Modificar `vite.config.js`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/inventario-procovar/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Inventario Procovar",
        short_name: "Procovar",
        description: "Control de stock diario Procovar",
        theme_color: "#22261F",
        background_color: "#F7F4EC",
        display: "standalone",
        start_url: command === "build" ? "/inventario-procovar/" : "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
}));
```

- [ ] **Step 3: Agregar meta tags para iOS en `index.html`**

Cambiar:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inventario Procovar</title>
```

por:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#22261F" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <title>Inventario Procovar</title>
```

- [ ] **Step 4: Build y verificación**

```bash
npm run build
npm run preview
```

Abrir la URL que imprime `preview` (sirve el build de producción, con el `base` de GitHub Pages). En DevTools:
1. Application → Manifest: debe mostrar nombre "Inventario Procovar", ambos íconos, `theme_color` y `background_color` correctos.
2. Application → Service Workers: debe aparecer uno registrado y activo.
3. Network → marcar "Offline", recargar la página — debe seguir cargando y funcionando (mismo comportamiento que online, usando el cache del service worker).
4. Barra de direcciones del navegador (Chrome desktop): debe aparecer el ícono de instalar (⊕ o similar) en la barra de URL.

Detener el servidor de preview.

- [ ] **Step 5: Commit**

```bash
git add vite.config.js index.html package.json package-lock.json
git commit -m "Configure vite-plugin-pwa for offline install support"
```

---

### Task 11: Deploy automático a GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Crear `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions workflow to deploy to GitHub Pages"
```

- [ ] **Step 3: Habilitar GitHub Pages con origen "GitHub Actions" (una sola vez)**

Verificar primero si ya está configurado:

```bash
gh api repos/raulsp9007/inventario-procovar/pages
```

Si responde `404`, habilitarlo:

```bash
gh api repos/raulsp9007/inventario-procovar/pages -X POST -f build_type=workflow
```

Si ya existe pero con otro `build_type`, actualizarlo:

```bash
gh api repos/raulsp9007/inventario-procovar/pages -X PUT -f build_type=workflow
```

- [ ] **Step 4: Push y verificar el deploy**

```bash
git push origin main
gh run watch
```

`gh run watch` sigue en vivo la ejecución del workflow que se disparó con el push. Esperado: job `build` y luego `deploy` en verde. Al terminar, confirmar:

```bash
gh api repos/raulsp9007/inventario-procovar/pages --jq .html_url
```

Abrir esa URL en el navegador — debe cargar la app (puede tardar 1-2 minutos la primera vez en propagarse).

---

### Task 12: Actualizar el README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Reescribir `README.md`**

```markdown
# Inventario Procovar

App de control de stock diario para Procovar (Parranda / Malta Guajira): registra ventas, ajustes manuales de existencias (con fecha/hora del último ajuste por producto), deshacer último movimiento, historial, y un resumen de ventas semanal por producto. Instalable como app offline (PWA) — los datos se guardan solo en el dispositivo donde se usa (`localStorage`), sin sincronización entre dispositivos.

## Sitio en vivo

https://raulsp9007.github.io/inventario-procovar/

Para instalarla como app: abrir esa URL en el navegador del teléfono/computador y usar la opción "Agregar a inicio" (Android/Chrome) o el ícono de instalar en la barra de direcciones (desktop). En iPhone (Safari): compartir → "Agregar a pantalla de inicio".

## Desarrollo local

Requiere Node 18+.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Build de producción

```bash
npm run build
npm run preview
```

## Estructura

- `src/InventoryApp.jsx` — vista principal (stock, ventas, ajustes, historial).
- `src/WeeklySummary.jsx` — resumen de ventas semanal por producto.
- `src/storage.js` — wrapper sobre `localStorage`.
- `src/dateUtils.js` — helpers de fecha y cálculo de semana (lunes a domingo).
- `scripts/generate-icons.mjs` — genera los íconos de `public/` usados por el manifest de la PWA.

## Deploy

Automático: cada push a `main` dispara `.github/workflows/deploy.yml`, que hace `npm run build` y publica `dist/` en GitHub Pages.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README for Vite project structure and PWA install instructions"
```

---

### Task 13: Verificación final end-to-end

**Files:** ninguno (solo verificación manual, sin cambios de código salvo que algo falle)

- [ ] **Step 1: Build limpio**

```bash
rm -rf node_modules dist
npm install
npm run build
```

Esperado: build sin errores ni warnings de módulos faltantes.

- [ ] **Step 2: Regresión funcional completa**

```bash
npm run preview
```

Repetir, sobre el build de producción, la lista de verificación de la Task 4 (venta, oversell bloqueado, deshacer, persistencia tras recargar) más:
- Ajustar stock de un producto → confirmar timestamp "ajustado ..." aparece y una venta posterior no lo cambia (Task 7).
- Cambiar a vista "Resumen semanal" → confirmar que refleja las ventas hechas en la sesión de prueba.
- Confirmar que el botón de venta es el ícono "+" (Task 8).

- [ ] **Step 3: Prueba offline real**

En DevTools → Network → "Offline", recargar la página. Debe seguir funcionando (Task 10 ya lo verificó tras el build; esto confirma que sigue así con todos los cambios posteriores).

- [ ] **Step 4: Prueba mobile (375px)**

DevTools → device toolbar → 375×812 (iPhone SE/12 mini). Revisar:
- Toggle "Stock" / "Resumen semanal" no desborda.
- Fila de venta (input + botón "+" + deshacer) no desborda.
- Tabla de "Resumen semanal" no desborda.
- Historial de movimientos no desborda.

- [ ] **Step 5: Confirmar el sitio público**

Abrir `https://raulsp9007.github.io/inventario-procovar/` (del Task 11) en un navegador limpio (o ventana de incógnito) y repetir una pasada rápida: cargar, ajustar stock, vender, ver resumen semanal.

- [ ] **Step 6: Commit final (si algo se ajustó durante la verificación)**

```bash
git add -A
git commit -m "Fix issues found during end-to-end verification"
git push origin main
```

Si no hubo que tocar nada, no hay commit que hacer en este paso — el trabajo ya quedó pusheado en la Task 11.
