# Sistema de pedidos + envío por WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pestaña "Pedidos" donde armar un pedido por cliente (nombre + cantidad por producto + domicilio sí/no), confirmarlo (descuenta stock como una venta, todo-o-nada), ver los pedidos del día, eliminar uno si hace falta, y mandar el resumen del día por WhatsApp con un botón.

**Architecture:** Los pedidos no son una entidad nueva — son `movements` de tipo `"venta"` que comparten un `orderId` + `customerName` + `isDelivery`. Toda la lógica de stock/precio/ingreso acumulado ya construida (Tasks previos de precios) se reutiliza sin cambios. Un módulo nuevo puro (`src/orders.js`) agrupa esos movimientos por pedido y arma el texto de WhatsApp; un componente nuevo (`src/Orders.jsx`) es la pantalla; `InventoryApp.jsx` gana dos funciones (`confirmOrder`, `deleteOrder`) que aplican la mutación de estado, mismo patrón que `registerSale`/`undoLast`.

**Tech Stack:** React 18, mismo proyecto Vite/PWA ya desplegado en https://raulsp9007.github.io/inventario-procovar/.

Spec de referencia: `docs/superpowers/specs/2026-08-09-orders-whatsapp-design.md`

---

## Contexto para quien ejecute este plan

Sin suite de tests automatizados — verificación manual (Node para lógica pura sin DOM, navegador real para lo que toca UI/estado). Repo en `D:\DOCUMENTOS\proyectos\PARRANDA\inventario-procovar-repo`, remoto `https://github.com/raulsp9007/inventario-procovar`, rama `main`, ya desplegado — cada push a `main` dispara un deploy real a GitHub Pages. Trabajás directo sobre `main` (sin worktree, decisión ya tomada en sesiones anteriores de este mismo proyecto).

`src/InventoryApp.jsx` es grande (500 líneas) y lo tocan varias tareas de este plan — leelo vos mismo antes de editar en vez de confiar ciegamente en los snippets "antes" de cada paso, por si algo cambió.

---

### Task 1: `src/orders.js` — helpers puros

**Files:**
- Create: `src/orders.js`

- [ ] **Step 1: Crear `src/orders.js`**

```js
export function groupOrders(movements, dateStr) {
  const todaysOrderMovements = movements.filter((m) => m.date === dateStr && m.orderId);
  const byId = new Map();
  todaysOrderMovements.forEach((m) => {
    if (!byId.has(m.orderId)) {
      byId.set(m.orderId, {
        orderId: m.orderId,
        customerName: m.customerName,
        isDelivery: !!m.isDelivery,
        timestamp: m.timestamp,
        lines: [],
      });
    }
    byId.get(m.orderId).lines.push({ code: m.code, qty: m.qty });
  });
  return Array.from(byId.values()).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}

export function formatOrdersForWhatsApp(orders, products) {
  return orders
    .map((order) => {
      const itemsText = order.lines
        .map((line) => {
          const product = products.find((p) => p.code === line.code);
          return `${line.qty}x ${product ? product.name : line.code}`;
        })
        .join(", ");
      const prefix = order.isDelivery ? `📦 ${order.customerName} (a domicilio)` : order.customerName;
      return `${prefix}: ${itemsText}`;
    })
    .join("\n");
}
```

- [ ] **Step 2: Verificar**

```bash
node --input-type=module -e '
import { groupOrders, formatOrdersForWhatsApp } from "./src/orders.js";

const movements = [
  { id: "1", code: "P1500", type: "venta", qty: 2, unitPrice: 100, date: "2026-08-09", timestamp: "2026-08-09T10:00:00.000Z", orderId: "order-1", customerName: "Juan Perez", isDelivery: true },
  { id: "2", code: "M330",  type: "venta", qty: 1, unitPrice: 50,  date: "2026-08-09", timestamp: "2026-08-09T10:00:00.000Z", orderId: "order-1", customerName: "Juan Perez", isDelivery: true },
  { id: "3", code: "P500",  type: "venta", qty: 3, unitPrice: 80,  date: "2026-08-09", timestamp: "2026-08-09T11:00:00.000Z", orderId: "order-2", customerName: "Maria Gomez", isDelivery: false },
  { id: "4", code: "P1500", type: "venta", qty: 1, unitPrice: 100, date: "2026-08-08", timestamp: "2026-08-08T10:00:00.000Z", orderId: "order-3", customerName: "Pedido de ayer", isDelivery: false },
  { id: "5", code: "P330",  type: "venta", qty: 5, unitPrice: 60,  date: "2026-08-09", timestamp: "2026-08-09T09:00:00.000Z" },
];
const products = [
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500" },
  { code: "M330",  name: "Malta Guajira 330ml", short: "M-330" },
  { code: "P500",  name: "Parranda 500ml", short: "P-500" },
];

const orders = groupOrders(movements, "2026-08-09");
console.log("cantidad de pedidos:", orders.length); // esperado: 2
console.log("orden:", orders.map((o) => o.customerName)); // esperado: ["Juan Perez", "Maria Gomez"]
console.log(formatOrdersForWhatsApp(orders, products));
// esperado exacto:
// 📦 Juan Perez (a domicilio): 2x Parranda 1500ml, 1x Malta Guajira 330ml
// Maria Gomez: 3x Parranda 500ml
'
```

Confirmar: 2 pedidos (el pedido de ayer y la venta suelta sin `orderId` quedan afuera), en orden Juan Perez → Maria Gomez (por `timestamp`), y el texto final coincide exactamente con lo mostrado arriba (2 líneas, la primera con 📦 y "(a domicilio)", la segunda sin nada de eso).

- [ ] **Step 3: Commit**

```bash
git add src/orders.js
git commit -m "Add order grouping and WhatsApp message formatting helpers"
```

---

### Task 2: `src/Orders.jsx` — componente de la pantalla (sin wirear todavía)

**Files:**
- Create: `src/Orders.jsx`

- [ ] **Step 1: Crear `src/Orders.jsx`**

```jsx
import { useState } from "react";
import { Trash2, Send } from "lucide-react";
import { todayStr } from "./dateUtils";
import { groupOrders, formatOrdersForWhatsApp } from "./orders";

export default function Orders({ products, movements, stock, onConfirmOrder, onDeleteOrder, onError }) {
  const [customerName, setCustomerName] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [qtyInputs, setQtyInputs] = useState(() =>
    products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {})
  );

  const todaysOrders = groupOrders(movements, todayStr());

  function confirmOrder() {
    if (!customerName.trim()) {
      onError("Ingresa el nombre del cliente.");
      return;
    }
    const lines = products
      .map((p) => ({ code: p.code, qty: parseInt(qtyInputs[p.code], 10) }))
      .filter((line) => !isNaN(line.qty) && line.qty > 0);
    if (lines.length === 0) {
      onError("Agrega al menos un producto al pedido.");
      return;
    }
    for (const line of lines) {
      const available = stock[line.code] || 0;
      if (line.qty > available) {
        const product = products.find((p) => p.code === line.code);
        onError(`No hay suficiente stock de ${product ? product.name : line.code}.`);
        return;
      }
    }
    onConfirmOrder({ customerName: customerName.trim(), isDelivery, lines });
    setCustomerName("");
    setIsDelivery(false);
    setQtyInputs(products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {}));
  }

  function sendWhatsApp() {
    const text = formatOrdersForWhatsApp(todaysOrders, products);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        NUEVO PEDIDO
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Nombre y apellidos del cliente"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          style={{
            width: "100%", border: "1px solid #E7E2D3", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, marginBottom: 10,
          }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#8A8574", marginBottom: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isDelivery}
            onChange={(e) => setIsDelivery(e.target.checked)}
          />
          Entrega a domicilio
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          {products.map((p) => (
            <div key={p.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13.5 }}>{p.name}</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={qtyInputs[p.code]}
                onChange={(e) => setQtyInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                style={{
                  width: 70, textAlign: "right", border: "1px solid #E7E2D3", borderRadius: 7,
                  padding: "7px 10px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={confirmOrder}
          style={{
            marginTop: 16, width: "100%", background: "#22261F", color: "#F7F4EC", border: "none",
            borderRadius: 7, padding: "11px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          Confirmar pedido
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PEDIDOS DE HOY</div>
        <button
          onClick={sendWhatsApp}
          disabled={todaysOrders.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: todaysOrders.length === 0 ? "#E7E2D3" : "#25D366",
            color: todaysOrders.length === 0 ? "#9A9484" : "#FFFFFF",
            border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600,
            cursor: todaysOrders.length === 0 ? "default" : "pointer",
          }}
        >
          <Send size={14} /> Enviar por WhatsApp
        </button>
      </div>

      {todaysOrders.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
          Aún no hay pedidos hoy.
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
          {todaysOrders.map((order, i) => (
            <div
              key={order.orderId}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                gap: 8, padding: "12px 16px", fontSize: 13.5,
                borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  {order.isDelivery ? "📦 " : ""}{order.customerName}
                </div>
                <div style={{ color: "#9A9484", fontSize: 12.5 }}>
                  {order.lines.map((line) => {
                    const product = products.find((p) => p.code === line.code);
                    return `${line.qty}x ${product ? product.short : line.code}`;
                  }).join(", ")}
                </div>
              </div>
              <button
                onClick={() => onDeleteOrder(order.orderId)}
                title="Eliminar pedido"
                aria-label="Eliminar pedido"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid #E7E2D3", color: "#8A8574",
                  borderRadius: 7, width: 34, height: 34, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que el archivo es válido**

Este componente no está wireado a la app todavía (eso es la Task 3) — verificá que Vite lo transforma sin error:

```bash
npm run dev
```

En otra terminal (o con el mismo proceso en background):

```bash
curl -s http://localhost:5173/src/Orders.jsx | head -5
```

Esperado: devuelve JS transformado por Vite (no un error 500 ni un stack trace). Detener el servidor.

- [ ] **Step 3: Commit**

```bash
git add src/Orders.jsx
git commit -m "Add Orders view component (not wired yet)"
```

---

### Task 3: Wirear Pedidos en `InventoryApp.jsx`

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Step 1: Importar `Orders`**

Cambiar:

```jsx
import WeeklySummary from "./WeeklySummary";
```

por:

```jsx
import WeeklySummary from "./WeeklySummary";
import Orders from "./Orders";
```

- [ ] **Step 2: Actualizar el comentario del estado `view`**

Cambiar:

```jsx
  const [view, setView] = useState("stock"); // "stock" | "resumen"
```

por:

```jsx
  const [view, setView] = useState("stock"); // "stock" | "resumen" | "pedidos"
```

- [ ] **Step 3: Agregar `confirmOrder` y `deleteOrder`**

Justo después de la función `saveEdit` completa (después de su `}` de cierre, antes de `return (`), agregar:

```jsx
  function confirmOrder({ customerName, isDelivery, lines }) {
    const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextStock = { ...stock };
    const newMovements = [];
    let addedRevenue = 0;
    lines.forEach(({ code, qty }) => {
      const unitPrice = prices[code] || 0;
      nextStock[code] = (nextStock[code] || 0) - qty;
      newMovements.push(makeMovement(code, "venta", qty, { unitPrice, orderId, customerName, isDelivery }));
      addedRevenue += qty * unitPrice;
    });
    const nextMovements = [...newMovements, ...movements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue + addedRevenue;
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

  function deleteOrder(orderId) {
    const orderMovements = movements.filter((m) => m.orderId === orderId);
    if (orderMovements.length === 0) return;
    const nextStock = { ...stock };
    let removedRevenue = 0;
    orderMovements.forEach((m) => {
      nextStock[m.code] = (nextStock[m.code] || 0) + m.qty;
      removedRevenue += m.qty * (m.unitPrice || 0);
    });
    const nextMovements = movements.filter((m) => m.orderId !== orderId);
    const nextCumulativeRevenue = cumulativeRevenue - removedRevenue;
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

Nota: `confirmOrder` asume que `lines` ya viene validado (nombre no vacío, al menos una línea, stock suficiente) — esa validación vive en `Orders.jsx` (Task 2), antes de llamar a este callback. `confirmOrder` no vuelve a validar, solo aplica la mutación — mismo principio que ya usa `saveEdit` (confía en lo que le llega del formulario).

- [ ] **Step 4: Agregar el botón "Pedidos" al toggle de vistas**

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
        <button
          onClick={() => {
```

por:

```jsx
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 16px 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
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
          onClick={() => setView("pedidos")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "pedidos" ? "#22261F" : "transparent",
            color: view === "pedidos" ? "#F7F4EC" : "#22261F",
          }}
        >
          Pedidos
        </button>
        <button
          onClick={() => {
```

(Solo se agregó `flexWrap: "wrap"` al contenedor y el nuevo botón "Pedidos" — el resto del bloque, incluyendo el botón del ojo que sigue después, queda exactamente igual.)

- [ ] **Step 5: Renderizar `Orders` cuando `view === "pedidos"`**

Cambiar:

```jsx
        {view === "resumen" && (
          <WeeklySummary
            products={PRODUCTS}
            movements={movements}
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

        <div style={{ marginTop: 20, fontSize: 11.5, color: "#B4AF9E", textAlign: "center" }}>
```

por:

```jsx
        {view === "resumen" && (
          <WeeklySummary
            products={PRODUCTS}
            movements={movements}
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

        {view === "pedidos" && (
          <Orders
            products={PRODUCTS}
            movements={movements}
            stock={stock}
            onConfirmOrder={confirmOrder}
            onDeleteOrder={deleteOrder}
            onError={(message) => {
              setError(message);
              setTimeout(() => setError(""), 2500);
            }}
          />
        )}

        <div style={{ marginTop: 20, fontSize: 11.5, color: "#B4AF9E", textAlign: "center" }}>
```

- [ ] **Step 6: Verificar manualmente (navegador real)**

```bash
npm run dev
```

Con localStorage limpio, y algún producto con precio y stock puestos (vía "Ajustar existencias" primero):

1. Ir a "Pedidos". Confirmar que se ve el formulario (nombre, checkbox domicilio, cantidad por cada uno de los 5 productos) y "Pedidos de hoy" vacío ("Aún no hay pedidos hoy.").
2. Click "Confirmar pedido" sin nombre → error "Ingresa el nombre del cliente.", nada se crea.
3. Poner nombre, sin ningún producto → error "Agrega al menos un producto al pedido."
4. Poner nombre + cantidad de un producto MAYOR al stock disponible → error "No hay suficiente stock de {producto}.", stock no cambia (confirmar en Stock que no bajó).
5. Poner nombre "Juan Pérez", tildar domicilio, cantidad válida en 2 productos distintos → "Confirmar pedido" → stock de ambos productos baja lo correspondiente, aparece en "Pedidos de hoy" con 📦 antes del nombre y ambos items listados, el formulario se vacía.
6. Ir a Stock → confirmar que "Historial de movimientos" muestra las 2 ventas de ese pedido igual que cualquier venta normal.
7. Ir a Resumen semanal → confirmar que esas unidades/ingreso ya están sumadas ahí también.
8. Volver a Pedidos, click el ícono de basura del pedido de Juan Pérez → confirmar que el pedido desaparece de la lista Y que el stock de ambos productos vuelve exactamente a como estaba antes del pedido (revisar en Stock).
9. Confirmar 2 pedidos nuevos (uno con domicilio, otro sin), click "Enviar por WhatsApp" → confirmar que se abre una pestaña nueva a `wa.me` con el texto correcto (2 líneas, formato domicilio solo en el que corresponde). Cerrar esa pestaña.
10. Recargar la página → los pedidos de hoy siguen en la lista (son `movements`, ya persistidos).

Detener el servidor.

- [ ] **Step 7: Commit**

```bash
git add src/InventoryApp.jsx
git commit -m "Wire Pedidos view: build, confirm, list, delete, and send orders via WhatsApp"
```

---

### Task 4: Verificación final y deploy

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

La URL impresa incluye `/inventario-procovar/` — usar esa, no la raíz. Repetir contra este build los 10 puntos de verificación de la spec (`docs/superpowers/specs/2026-08-09-orders-whatsapp-design.md`, sección "Verificación") — son los mismos 10 puntos del Step 6 de la Task 3, ya cubiertos ahí; repetirlos ahora es para confirmar que siguen funcionando igual sobre el build de producción, no sobre el dev server.

Además, confirmar que NO regresionó nada de lo construido en planes anteriores: venta suelta con oversell bloqueado, deshacer, ajuste de stock con timestamp, precios editables, Resumen semanal (totales semana/mes/historial/acumulado/comisión/USD), toggle mostrar precios.

- [ ] **Step 3: Prueba offline real**

Con el preview server corriendo, matar el proceso de verdad (no un checkbox de DevTools) y recargar — debe seguir funcionando vía el service worker. En este entorno Windows/Git Bash, `kill`/`pkill` desde Bash suele no matar el proceso node.exe real — si pasa eso, buscar el PID real con `netstat -ano | grep <puerto>` y usar `Stop-Process -Id <pid> -Force` de PowerShell, confirmando que el puerto queda inalcanzable antes de recargar.

- [ ] **Step 4: Mobile (375×812)**

Revisar sin overflow horizontal: la fila de 4 botones (Stock/Resumen semanal/Pedidos/ojo — debe verse en una o dos filas prolijas gracias al `flexWrap` agregado, sin cortar texto ni desbordar), el formulario de pedido completo, la lista de "Pedidos de hoy", y el botón "Enviar por WhatsApp".

- [ ] **Step 5: Push**

```bash
git push origin main
gh run watch --exit-status
```

Esperado: jobs `build` y `deploy` en verde. Confirmar con:

```bash
gh api repos/raulsp9007/inventario-procovar/pages --jq .html_url
```

Abrir esa URL — si el navegador ya tenía la app instalada/visitada antes, puede servir una versión vieja cacheada por el service worker hasta el siguiente reload (esto ya pasó en un deploy anterior de este mismo proyecto y no es un bug): si las funciones nuevas no aparecen a la primera, desregistrar el service worker y las caches desde DevTools (o `navigator.serviceWorker.getRegistrations()...unregister()` + `caches.keys()...delete()` por consola) y recargar de nuevo antes de dar por mala la verificación.

- [ ] **Step 6: Commit final (si algo se ajustó durante la verificación)**

```bash
git add -A
git commit -m "Fix issues found during end-to-end verification"
git push origin main
```

Si no hubo que tocar nada, no hay commit que hacer en este paso.
