# Reserva de pedidos Hoy/Mañana — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el diseño de `docs/superpowers/specs/2026-08-19-reserva-manana-design.md`: pedidos "Hoy" descuentan stock/ingreso/HL al confirmar (como ahora); pedidos "Mañana" no descuentan nada hasta que se marcan Enviados (o se envían por WhatsApp, que también marca Enviado). Desmarcar Enviado revierte. Se agrega selector Hoy/Mañana al crear/editar pedido, un panel "Disponible para mañana", línea de reservado en Productos, envío masivo también en Mañana, y se elimina el botón Aplazar junto con la lógica de corte automático de las 4pm para agrupar pedidos.

**Architecture:** Un campo nuevo `bucket: "hoy" | "manana"` en cada pedido/movimiento. Un estado derivado `committed = bucket === "hoy" || (bucket === "manana" && sent === true)` decide si el pedido afecta `stock`/`cumulativeRevenue`/`cumulativeHl`. Toda operación que pueda cambiar `committed` (crear, editar, marcar/desmarcar Enviado, eliminar) sigue el patrón revert-antiguo → aplicar-nuevo. Pedidos/movimientos guardados antes de este cambio no tienen `bucket`: se les asume `"hoy"` por default en cada punto de lectura (`m.bucket || "hoy"`), igual que otros campos opcionales ya en el código — no hace falta una migración explícita que reescriba `localStorage`.

**Tech Stack:** React 18, Vite, localStorage (sin backend, sin test runner — este proyecto no tiene suite de tests; la verificación de cada tarea es manual en el navegador vía `preview_start`/`mcp__Claude_Browser__*`, siguiendo el patrón ya usado en todo el desarrollo previo de esta app).

**Nota sobre 2 correcciones al spec original**, encontradas al bajar a código concreto (no cambian ninguna decisión que aprobaste, son detalles de implementación):
1. **La agrupación Hoy/Mañana/Anteriores en la pestaña Pedidos sigue siendo por fecha** (`order.date === hoy/mañana`), no por `bucket`. Si fuera por `bucket`, un pedido de Hoy de hace 3 días sin enviar nunca caería a "Pedidos anteriores" (quedaría pegado en Hoy para siempre). `bucket` sigue decidiendo *solo* si afecta stock/ingreso, no en qué sección se ve.
2. **No hace falta reescribir `localStorage` en la carga** — alcanza con que cada función que mira `bucket` use `m.bucket || "hoy"` como default, igual que el resto de campos opcionales del proyecto.

---

## File Structure

- **Modifica:** `src/orderHelpers.js` — agrega `isCommittedOrder`, `isCommittedMovement`, `reservedForTomorrow`; `groupAllOrders` incluye `bucket`.
- **Modifica:** `src/money.js` — las funciones de ingreso/HL excluyen movimientos no comprometidos.
- **Modifica:** `src/dateUtils.js` — elimina `wasSentAfterCutoffToday` (queda sin uso).
- **Modifica:** `src/useInventoryStore.js` — `confirmOrder`, `editOrder`, `deleteOrder`, `markOrdersSent` reescritos con la lógica de comprometido; elimina `postponeOrder`; `todaysMovements`/`mananaMovements` pasan a ser por fecha + comprometido.
- **Modifica:** `src/Orders.jsx` — selector Hoy/Mañana, panel "Disponible para mañana", envío masivo en ambas secciones, quita Aplazar.
- **Modifica:** `src/ProductsView.jsx` — línea "Reservado mañana / Libre".
- **Modifica:** `src/Today.jsx` — modo `pendingMode` para la vista de reservados.
- **Modifica:** `src/Tomorrow.jsx` — activa `pendingMode`.
- **Modifica:** `src/InventoryApp.jsx` — deja de pasar `onPostponeOrder`/`postponeOrder`.

---

### Task 1: Helpers de pedido — `bucket`, comprometido, reservado para mañana

**Files:**
- Modify: `src/orderHelpers.js`

- [ ] **Paso 1: Agregar `bucket` al objeto de pedido en `groupAllOrders`**

En `src/orderHelpers.js`, dentro de `groupAllOrders`, el objeto que se crea por cada `orderId` nuevo (líneas 6-17 actuales) agrega el campo `bucket`:

```js
export function groupAllOrders(movements) {
  const orderMovements = movements.filter((m) => m.orderId);
  const byId = new Map();
  orderMovements.forEach((m) => {
    if (!byId.has(m.orderId)) {
      byId.set(m.orderId, {
        orderId: m.orderId,
        customerName: m.customerName,
        isDelivery: !!m.isDelivery,
        note: m.note || "",
        sent: !!m.sent,
        sentAt: m.sentAt || null,
        confirmed: !!m.confirmed,
        bucket: m.bucket || "hoy",
        date: m.date,
        timestamp: m.timestamp,
        lines: [],
      });
    }
    byId.get(m.orderId).lines.push({ code: m.code, qty: m.qty, unitPrice: m.unitPrice || 0 });
  });
  return Array.from(byId.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
```

- [ ] **Paso 2: Agregar `isCommittedOrder`, `isCommittedMovement`, `reservedForTomorrow`**

Al final de `src/orderHelpers.js` (después de `formatOrderForWhatsApp`), agregar:

```js
// "Comprometido" = ya afecta stock/ingreso/HL. Hoy siempre; Mañana solo si
// ya se marcó Enviado (o se envió por WhatsApp, que también marca Enviado).
export function isCommittedOrder(order) {
  const bucket = order.bucket || "hoy";
  return bucket === "hoy" || (bucket === "manana" && !!order.sent);
}

export function isCommittedMovement(m) {
  const bucket = m.bucket || "hoy";
  return bucket === "hoy" || (bucket === "manana" && !!m.sent);
}

// Unidades ya reservadas en pedidos de mañana sin enviar (no descuentan
// stock todavía, pero igual comprometen disponibilidad futura). Se excluye
// opcionalmente un pedido (el que se está editando) para no contarse a sí mismo.
export function reservedForTomorrow(orders, code, excludeOrderId = null) {
  return orders
    .filter((o) => o.bucket === "manana" && !o.sent && o.orderId !== excludeOrderId)
    .reduce((sum, o) => {
      const line = o.lines.find((l) => l.code === code);
      return sum + (line ? line.qty : 0);
    }, 0);
}
```

- [ ] **Paso 3: Verificar**

No hay test runner en este proyecto — este archivo es puro (sin UI), se verifica indirectamente en las tareas siguientes cuando se usa desde `Orders.jsx`/`ProductsView.jsx`/`money.js`. Confirmar que no rompe el import: `node -e "require('./src/orderHelpers.js')"` fallará por ser ESM, no hace falta correrlo — el chequeo real es que la app siga arrancando en la Tarea 3.

---

### Task 2: `money.js` — excluir movimientos no comprometidos del ingreso/HL

**Files:**
- Modify: `src/money.js`

- [ ] **Paso 1: Importar `isCommittedMovement` y filtrar en las 4 funciones que suman "venta"**

Reemplazar todo `src/money.js` por:

```js
import { getWeekStartStr } from "./dateUtils.js";
import { isCommittedMovement } from "./orderHelpers.js";

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
    .filter((m) => m.code === code && m.type === "venta" && isCommittedMovement(m) && m.date >= start && m.date <= end)
    .reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
}

export function totalRevenueInRange(movements, start, end) {
  return movements
    .filter((m) => m.type === "venta" && isCommittedMovement(m) && m.date >= start && m.date <= end)
    .reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
}

export function totalHlSold(movements, products) {
  return movements
    .filter((m) => m.type === "venta" && isCommittedMovement(m))
    .reduce((sum, m) => {
      if (m.unitHl != null) return sum + m.qty * m.unitHl;
      const product = products.find((p) => p.code === m.code);
      const hl = product?.hl || 0;
      return sum + m.qty * hl;
    }, 0);
}

export function monthWeeklyBreakdown(movements, monthStartStr, endDateStr) {
  const inMonth = movements.filter(
    (m) => m.type === "venta" && isCommittedMovement(m) && m.date >= monthStartStr && m.date <= endDateStr
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

Por qué: `totalHlSold` también se usa en `useInventoryStore.js` para la migración one-time de `cumulativeHl` — al llamarla ahí sobre movimientos viejos sin `bucket`, `isCommittedMovement` los trata como `"hoy"` (comprometidos) por el default, así que esa migración sigue funcionando igual que antes sin cambios.

- [ ] **Paso 2: Verificar**

Arrancar el dev server, ir a "Resumen semanal" con datos existentes — los totales de ingreso/HL tienen que verse exactamente igual que antes de este cambio (todos los pedidos existentes son `bucket` default `"hoy"` → comprometidos → cuentan igual).

---

### Task 3: Quitar `wasSentAfterCutoffToday` (queda sin uso)

**Files:**
- Modify: `src/dateUtils.js`

- [ ] **Paso 1: Eliminar la función**

En `src/dateUtils.js`, borrar el bloque completo (comentario incluido):

```js
// El pedido se marcó "Enviado" hoy mismo, después de las 4pm -- aunque se
// haya armado antes del corte, el envío real (lo que importa para saber
// cuándo llega al cliente) pasó hoy después de la hora límite.
export function wasSentAfterCutoffToday(sentAtIso) {
  if (!sentAtIso) return false;
  const d = new Date(sentAtIso);
  return toDateStr(d) === todayStr() && d.getHours() >= CUTOFF_HOUR;
}
```

No borrar `isPastCutoffNow` (se sigue usando para el default del selector Hoy/Mañana) ni `businessDayStr` (lo sigue usando `WeeklySummary.jsx` y las funciones de rango de semana/mes del propio archivo).

- [ ] **Paso 2: Verificar**

Este paso deja imports rotos en `Orders.jsx` y `useInventoryStore.js` hasta las Tareas 4 y 5 — no arrancar el dev server todavía entre este paso y esos, o vas a ver el error de import. Se verifica junto con la Tarea 5 (arranque limpio).

---

### Task 4: `useInventoryStore.js` — lógica de comprometido

**Files:**
- Modify: `src/useInventoryStore.js`

- [ ] **Paso 1: Actualizar el import de `dateUtils`**

Cambiar:
```js
import { todayStr, tomorrowStr, businessDayStr, isPastCutoffNow, wasSentAfterCutoffToday } from "./dateUtils";
```
por:
```js
import { todayStr, tomorrowStr } from "./dateUtils";
import { isCommittedMovement } from "./orderHelpers";
```

- [ ] **Paso 2: Reescribir el `useMemo` de `todaysMovements`/`mananaMovements`**

Reemplazar el bloque completo (desde el comentario "Pasadas las 4pm..." hasta el cierre del `useMemo`, líneas ~201-226 actuales) por:

```js
  // "Hoy" = movimientos comprometidos de hoy (bucket Hoy, o Mañana ya
  // enviado, con date === hoy). "Mañana" = pedidos reservados de mañana
  // TODAVÍA sin comprometer (sin enviar) -- una vez enviados, dejan de
  // aparecer acá porque ya no son "pendientes de envío".
  const todayCal = todayStr();
  const tomorrowCal = tomorrowStr();
  const { todaysMovements, mananaMovements } = useMemo(() => {
    const todaysMovements = movements.filter((m) => {
      if (m.date !== todayCal) return false;
      return m.type !== "venta" || isCommittedMovement(m);
    });
    const mananaMovements = movements.filter((m) => {
      if (m.date !== tomorrowCal) return false;
      return m.type !== "venta" || !isCommittedMovement(m);
    });
    return { todaysMovements, mananaMovements };
  }, [movements, todayCal, tomorrowCal]);
```

- [ ] **Paso 3: Reescribir `confirmOrder`**

Reemplazar la función completa por:

```js
  function confirmOrder({ customerName, isDelivery, note, lines, bucket }) {
    const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const committed = bucket === "hoy";
    const date = bucket === "hoy" ? todayStr() : tomorrowStr();
    const nextStock = { ...stock };
    const newMovements = [];
    let addedRevenue = 0;
    let addedHl = 0;
    lines.forEach(({ code, qty }) => {
      const unitPrice = prices[code] || 0;
      const product = products.find((p) => p.code === code);
      const unitHl = product?.hl || 0;
      newMovements.push(makeMovement(code, "venta", qty, { unitPrice, unitHl, exchangeRate, orderId, customerName, isDelivery, note, bucket, date }));
      if (committed) {
        nextStock[code] = (nextStock[code] || 0) - qty;
        addedRevenue += qty * unitPrice;
        addedHl += qty * unitHl;
      }
    });
    const nextMovements = [...newMovements, ...movements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue + addedRevenue;
    const nextCumulativeHl = cumulativeHl + addedHl;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
      cumulativeHl: nextCumulativeHl,
    });
  }
```

- [ ] **Paso 4: Reescribir `deleteOrder`**

```js
  function deleteOrder(orderId) {
    const orderMovements = movements.filter((m) => m.orderId === orderId);
    if (orderMovements.length === 0) return;
    const wasBucket = orderMovements[0].bucket || "hoy";
    const wasCommitted = wasBucket === "hoy" || (wasBucket === "manana" && !!orderMovements[0].sent);

    const nextStock = { ...stock };
    let removedRevenue = 0;
    let removedHl = 0;
    if (wasCommitted) {
      orderMovements.forEach((m) => {
        nextStock[m.code] = (nextStock[m.code] || 0) + m.qty;
        removedRevenue += m.qty * (m.unitPrice || 0);
        removedHl += m.qty * (m.unitHl || 0);
      });
    }
    const nextMovements = movements.filter((m) => m.orderId !== orderId);
    const nextCumulativeRevenue = cumulativeRevenue - removedRevenue;
    const nextCumulativeHl = cumulativeHl - removedHl;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
      cumulativeHl: nextCumulativeHl,
    });
  }
```

- [ ] **Paso 5: Reescribir `editOrder` (sin `dateOverride`) y borrar `postponeOrder`**

Reemplazar `editOrder` completo:

```js
  // La fecha se recalcula siempre desde el bucket actual (hoy/mañana de
  // HOY, no la fecha original) -- así editar un pedido viejo estancado lo
  // "refresca" al día correspondiente sin necesitar un botón Aplazar aparte.
  function editOrder(orderId, { customerName, isDelivery, note, lines, bucket }) {
    const originalMovements = movements.filter((m) => m.orderId === orderId);
    if (originalMovements.length === 0) return;
    const wasSent = !!originalMovements[0].sent;
    const wasBucket = originalMovements[0].bucket || "hoy";
    const wasCommitted = wasBucket === "hoy" || (wasBucket === "manana" && wasSent);

    const restoredStock = { ...stock };
    let removedRevenue = 0;
    let removedHl = 0;
    if (wasCommitted) {
      originalMovements.forEach((m) => {
        restoredStock[m.code] = (restoredStock[m.code] || 0) + m.qty;
        removedRevenue += m.qty * (m.unitPrice || 0);
        removedHl += m.qty * (m.unitHl || 0);
      });
    }

    const nextSent = wasSent;
    const willBeCommitted = bucket === "hoy" || (bucket === "manana" && nextSent);
    const date = bucket === "hoy" ? todayStr() : tomorrowStr();

    const nextStock = { ...restoredStock };
    const newMovements = [];
    let addedRevenue = 0;
    let addedHl = 0;
    lines.forEach(({ code, qty }) => {
      const unitPrice = prices[code] || 0;
      const product = products.find((p) => p.code === code);
      const unitHl = product?.hl || 0;
      newMovements.push(makeMovement(code, "venta", qty, { unitPrice, unitHl, exchangeRate, orderId, customerName, isDelivery, note, bucket, date, sent: nextSent }));
      if (willBeCommitted) {
        nextStock[code] = (nextStock[code] || 0) - qty;
        addedRevenue += qty * unitPrice;
        addedHl += qty * unitHl;
      }
    });

    const otherMovements = movements.filter((m) => m.orderId !== orderId);
    const nextMovements = [...newMovements, ...otherMovements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue - removedRevenue + addedRevenue;
    const nextCumulativeHl = cumulativeHl - removedHl + addedHl;

    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
      cumulativeHl: nextCumulativeHl,
    });
  }
```

Borrar por completo la función `postponeOrder` (el bloque del comentario "Aplazar un pedido viejo..." hasta su cierre, justo antes de `markOrdersSent`).

- [ ] **Paso 6: Reescribir `markOrdersSent`**

```js
  // Llamar una sola vez por varios pedidos a la vez (envío en bloque, Hoy o
  // Mañana): calcula todos los deltas de stock/ingreso/HL sobre el
  // `movements` de este render antes de aplicar el set, así no se pisan
  // entre sí. Los pedidos de Hoy nunca cambian de "comprometido" al
  // (des)marcar Enviado -- ya estaban comprometidos desde que se crearon.
  function markOrdersSent(orderIds, sent) {
    const idSet = new Set(orderIds);
    const nowIso = new Date().toISOString();
    const nextStock = { ...stock };
    let revenueDelta = 0;
    let hlDelta = 0;

    idSet.forEach((orderId) => {
      const orderMovements = movements.filter((m) => m.orderId === orderId);
      if (orderMovements.length === 0) return;
      const bucket = orderMovements[0].bucket || "hoy";
      if (bucket !== "manana") return;
      const wasSent = !!orderMovements[0].sent;
      if (wasSent === sent) return;
      const sign = sent ? 1 : -1;
      orderMovements.forEach((m) => {
        nextStock[m.code] = (nextStock[m.code] || 0) - sign * m.qty;
        revenueDelta += sign * m.qty * (m.unitPrice || 0);
        hlDelta += sign * m.qty * (m.unitHl || 0);
      });
    });

    const nextMovements = movements.map((m) =>
      idSet.has(m.orderId) ? { ...m, sent, sentAt: sent ? nowIso : m.sentAt } : m
    );
    const nextCumulativeRevenue = cumulativeRevenue + revenueDelta;
    const nextCumulativeHl = cumulativeHl + hlDelta;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
      cumulativeHl: nextCumulativeHl,
    });
  }
```

- [ ] **Paso 7: Sacar `postponeOrder` del objeto de retorno**

Cambiar:
```js
    confirmOrder, deleteOrder, editOrder, markOrderSent, postponeOrder, markOrdersSent,
```
por:
```js
    confirmOrder, deleteOrder, editOrder, markOrderSent, markOrdersSent,
```

- [ ] **Paso 8: Verificar**

`preview_start` con el server de dev, confirmar que arranca sin errores de consola (import roto se vería acá). Todavía va a fallar `InventoryApp.jsx`/`Orders.jsx` porque siguen esperando `postponeOrder` -- seguir a la Tarea 5 antes de verificar en el navegador.

---

### Task 5: `InventoryApp.jsx` — sacar el wiring de Aplazar

**Files:**
- Modify: `src/InventoryApp.jsx`

- [ ] **Paso 1: Sacar `postponeOrder` del destructuring del hook**

Cambiar:
```js
    confirmOrder, deleteOrder, editOrder, markOrderSent, postponeOrder, markOrdersSent,
```
por:
```js
    confirmOrder, deleteOrder, editOrder, markOrderSent, markOrdersSent,
```

- [ ] **Paso 2: Sacar el prop `onPostponeOrder` del `<Orders>`**

Borrar la línea `onPostponeOrder={postponeOrder}` del JSX de `<Orders ... />`.

- [ ] **Paso 3: Verificar**

Arrancar dev server, confirmar consola sin errores (aunque `Orders.jsx` todavía tenga referencias viejas a `onPostponeOrder`/Aplazar hasta la Tarea 6 -- React va a tirar "onPostponeOrder is not a function" recién al clickear ese botón, no al cargar. Confirmar carga inicial limpia antes de seguir).

---

### Task 6: `Orders.jsx` — selector Hoy/Mañana, panel disponible, envío masivo en ambas, sin Aplazar

Este es el archivo con más cambios. Reemplazar el archivo completo.

**Files:**
- Modify: `src/Orders.jsx`

- [ ] **Paso 1: Reemplazar todo el archivo**

```jsx
import { useState, useEffect, useRef, useMemo } from "react";
import { Trash2, Send, Pencil, ChevronDown, ChevronUp, CheckCheck } from "lucide-react";
import { todayStr, tomorrowStr, isPastCutoffNow, formatDate, formatDateTime, getDateNDaysAgoStr } from "./dateUtils";
import { formatCUP } from "./money";
import { groupAllOrders, formatOrderForWhatsApp, isCommittedOrder, reservedForTomorrow } from "./orderHelpers";
import { getCustomerNames, matchCustomerNames } from "./customerHelpers";
import Banner from "./Banner.jsx";

const PAST_ORDERS_DAYS = 14;
const FILTERS_STORAGE_KEY = "procovar-pedidos-filtros";

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function defaultBucket() {
  return isPastCutoffNow() ? "manana" : "hoy";
}

function openOrderWhatsApp(order, products, phone, senderOptions) {
  const text = formatOrderForWhatsApp(order, products, senderOptions);
  const url = `https://wa.me/${phone || ""}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function orderTotal(order) {
  return order.lines.reduce((sum, l) => sum + l.qty * (l.unitPrice || 0), 0);
}

function draftTotal(draftLines, prices) {
  return draftLines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (prices[l.code] || 0), 0);
}

export default function Orders({ products, movements, stock, prices, showPrices, whatsappPhone, senderName, sendSenderName, lowStockThresholdFor, onConfirmOrder, onEditOrder, onDeleteOrder, onMarkSent, onMarkOrdersSent, onMarkConfirmed, onError }) {
  const senderOptions = { senderName, sendSenderName };
  const [customerName, setCustomerName] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [note, setNote] = useState("");
  const [draftLines, setDraftLines] = useState([]);
  const [draftBucket, setDraftBucket] = useState(defaultBucket);
  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [pendingQty, setPendingQty] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectSection, setSelectSection] = useState(null); // null | "hoy" | "manana"
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [pendingDeletes, setPendingDeletes] = useState(() => new Map());
  const [bigOrderWarning, setBigOrderWarning] = useState(null);
  const [todayOrderSort, setTodayOrderSort] = useState(() => (loadSavedFilters().sort === "oldest" ? "oldest" : "recent"));
  const [orderSearch, setOrderSearch] = useState("");
  const [filterUnsent, setFilterUnsent] = useState(() => !!loadSavedFilters().filterUnsent);
  const [filterUnconfirmed, setFilterUnconfirmed] = useState(() => !!loadSavedFilters().filterUnconfirmed);
  // Bloquea envíos repetidos (doble clic/doble toque) mientras el formulario
  // todavía no reflejó el reset -- el estado de React (customerName, etc.)
  // se actualiza en batch, así que un segundo click puede leer el mismo
  // formulario "todavía lleno" antes de que se limpie. El ref cambia de
  // inmediato y solo se libera cuando el re-render con el formulario ya
  // vacío efectivamente ocurre (ver useEffect debajo).
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ sort: todayOrderSort, filterUnsent, filterUnconfirmed }));
    } catch {}
  }, [todayOrderSort, filterUnsent, filterUnconfirmed]);

  useEffect(() => {
    submittingRef.current = false;
  }, [customerName]);

  const today = todayStr();
  const tomorrow = tomorrowStr();
  const belongsToToday = (o) => o.date === today;
  const belongsToTomorrow = (o) => o.date === tomorrow;
  const searchTerm = orderSearch.trim().toLowerCase();
  const pastCutoff = getDateNDaysAgoStr(PAST_ORDERS_DAYS, today);

  // groupAllOrders + los 3 filtros/sorts escanean todos los movimientos en
  // cada uno -- se memoizan juntos para no repetir el trabajo en cada
  // render que no cambia ninguno de estos valores (ej. tipear en un input
  // que no es la búsqueda).
  const {
    allOrders, todaysOrders, sortedTodaysOrders,
    tomorrowsOrders, sortedTomorrowsOrders,
    pastOrdersByDate, pastDatesDesc, pastOrdersCount,
  } = useMemo(() => {
    const matchesSearch = (order) => !searchTerm || order.customerName.toLowerCase().includes(searchTerm);
    const matchesStatusFilter = (order) =>
      (!filterUnsent && !filterUnconfirmed) ||
      (filterUnsent && !order.sent) ||
      (filterUnconfirmed && !order.confirmed);
    const matchesFilters = (order) => matchesSearch(order) && matchesStatusFilter(order);

    const allOrders = groupAllOrders(movements).filter((o) => !pendingDeletes.has(o.orderId));
    const todaysOrders = allOrders.filter((o) => belongsToToday(o) && matchesFilters(o));
    const sortedTodaysOrders = [...todaysOrders].sort((a, b) =>
      todayOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
    );
    const tomorrowsOrders = allOrders.filter((o) => belongsToTomorrow(o) && matchesFilters(o));
    const sortedTomorrowsOrders = [...tomorrowsOrders].sort((a, b) =>
      todayOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
    );
    const pastOrdersByDate = new Map();
    allOrders
      .filter((o) => !belongsToToday(o) && !belongsToTomorrow(o) && o.date >= pastCutoff && matchesFilters(o))
      .forEach((o) => {
        if (!pastOrdersByDate.has(o.date)) pastOrdersByDate.set(o.date, []);
        pastOrdersByDate.get(o.date).push(o);
      });
    const pastDatesDesc = Array.from(pastOrdersByDate.keys()).sort((a, b) => b.localeCompare(a));
    const pastOrdersCount = pastDatesDesc.reduce((sum, d) => sum + pastOrdersByDate.get(d).length, 0);

    return { allOrders, todaysOrders, sortedTodaysOrders, tomorrowsOrders, sortedTomorrowsOrders, pastOrdersByDate, pastDatesDesc, pastOrdersCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, today, tomorrow, pastCutoff, searchTerm, filterUnsent, filterUnconfirmed, todayOrderSort, pendingDeletes]);

  const activeProductsForPanel = products.filter((p) => !p.archived);

  const availableProducts = products.filter((p) => !p.archived && !draftLines.some((l) => l.code === p.code));
  const effectiveSelectedProductCode = availableProducts.some((p) => p.code === selectedProductCode)
    ? selectedProductCode
    : (availableProducts[0]?.code || "");

  const suggestions = showSuggestions
    ? matchCustomerNames(getCustomerNames(movements), customerName)
    : [];

  function resetForm() {
    setCustomerName("");
    setIsDelivery(false);
    setNote("");
    setDraftLines([]);
    setPendingQty("");
    setEditingOrderId(null);
    setBigOrderWarning(null);
    setDraftBucket(defaultBucket());
  }

  function startEdit(order) {
    setCustomerName(order.customerName);
    setIsDelivery(order.isDelivery);
    setNote(order.note || "");
    setDraftLines(order.lines.map((l) => ({ code: l.code, qty: String(l.qty) })));
    setPendingQty("");
    setEditingOrderId(order.orderId);
    setDraftBucket(order.bucket);
  }

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

  // Techo real para una línea del pedido en edición/creación:
  // - Si es para Hoy: stock actual (+ lo que este mismo pedido ya tenía
  //   comprometido, si se está editando uno que ya estaba comprometido).
  // - Si es para Mañana: lo mismo, menos lo que ya reservaron OTROS pedidos
  //   de mañana sin enviar (no se puede prometer más de lo que hay físico).
  function computeAvailable(code) {
    const editingOrder = editingOrderId ? allOrders.find((o) => o.orderId === editingOrderId) : null;
    const creditBack = editingOrder && isCommittedOrder(editingOrder)
      ? (editingOrder.lines.find((l) => l.code === code)?.qty || 0)
      : 0;
    const base = (stock[code] || 0) + creditBack;
    if (draftBucket === "hoy") return base;
    return base - reservedForTomorrow(allOrders, code, editingOrderId);
  }

  function confirmOrder() {
    if (submittingRef.current) return;
    if (!customerName.trim()) {
      onError("Ingresa el nombre del cliente.");
      return;
    }
    const lines = draftLines
      .map((l) => ({ code: l.code, qty: parseInt(l.qty, 10) }))
      .filter((l) => !isNaN(l.qty) && l.qty > 0);
    if (lines.length === 0) {
      onError("Agrega al menos un producto al pedido.");
      return;
    }
    for (const line of lines) {
      const available = computeAvailable(line.code);
      if (line.qty > available) {
        const product = products.find((p) => p.code === line.code);
        const motivo = draftBucket === "manana" ? " para mañana (ya reservado por otros pedidos)" : "";
        onError(`No hay suficiente stock de ${product ? product.name : line.code}${motivo}.`);
        return;
      }
    }
    const draft = { customerName: customerName.trim(), isDelivery, note: note.trim(), lines, bucket: draftBucket };
    const bigLines = lines
      .map((l) => {
        const product = products.find((p) => p.code === l.code);
        const threshold = product ? lowStockThresholdFor(product) : null;
        return { name: product ? product.name : l.code, qty: l.qty, threshold };
      })
      .filter((x) => x.threshold != null && x.qty > x.threshold);
    if (bigLines.length > 0) {
      setBigOrderWarning({ draft, bigLines });
      return;
    }
    submittingRef.current = true;
    submitDraft(draft);
  }

  function submitDraft(draft) {
    if (editingOrderId) {
      onEditOrder(editingOrderId, draft);
    } else {
      onConfirmOrder(draft);
    }
    resetForm();
  }

  function confirmBigOrderAnyway() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    submitDraft(bigOrderWarning.draft);
    setBigOrderWarning(null);
  }

  function cancelBigOrderWarning() {
    setBigOrderWarning(null);
  }

  function handleDeleteClick(order) {
    if (confirmingDeleteId === order.orderId) {
      setConfirmingDeleteId(null);
      stageDelete(order);
      return;
    }
    setConfirmingDeleteId(order.orderId);
    setTimeout(() => {
      setConfirmingDeleteId((current) => (current === order.orderId ? null : current));
    }, 3000);
  }

  // Borrado real recién pasa cuando expiran los 5s sin que se apriete
  // "Deshacer" -- nada se pierde hasta ese momento, el pedido solo se
  // esconde de las listas mientras tanto (pendingDeletes). Se guarda el
  // customerName ademas del timeout para poder mostrarlo en el aviso sin
  // tener que buscarlo en una lista de la que ya lo filtramos.
  function stageDelete(order) {
    const timeoutId = setTimeout(() => {
      onDeleteOrder(order.orderId);
      setPendingDeletes((m) => {
        const next = new Map(m);
        next.delete(order.orderId);
        return next;
      });
    }, 5000);
    setPendingDeletes((m) => new Map(m).set(order.orderId, { timeoutId, customerName: order.customerName }));
  }

  function undoDelete(orderId) {
    setPendingDeletes((m) => {
      const entry = m.get(orderId);
      if (entry) clearTimeout(entry.timeoutId);
      const next = new Map(m);
      next.delete(orderId);
      return next;
    });
  }

  function toggleSelected(orderId) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function startSelect(section) {
    setSelectSection(section);
    setSelectedIds(new Set());
  }

  function cancelSelect() {
    setSelectSection(null);
    setSelectedIds(new Set());
  }

  function confirmBulkSend(orders) {
    const idsToSend = [];
    orders.forEach((order) => {
      if (!selectedIds.has(order.orderId)) return;
      openOrderWhatsApp(order, products, whatsappPhone, senderOptions);
      idsToSend.push(order.orderId);
    });
    onMarkOrdersSent(idsToSend, true);
    setSelectSection(null);
    setSelectedIds(new Set());
  }

  function renderOrderRow(order, i, { inSelectMode }) {
    return (
      <div
        key={order.orderId}
        style={{
          padding: "12px 16px", fontSize: 13.5,
          borderTop: i === 0 ? "none" : "1px solid var(--divider)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {inSelectMode && (
            <input
              type="checkbox"
              checked={order.sent || selectedIds.has(order.orderId)}
              disabled={order.sent}
              onChange={() => toggleSelected(order.orderId)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              {order.isDelivery ? "🛺 " : ""}{order.customerName}
            </div>
            <div style={{ color: "var(--text-faint)", fontSize: 12.5 }}>
              {order.lines.map((line) => {
                const product = products.find((p) => p.code === line.code);
                return `${line.qty}x ${product ? product.short : line.code}`;
              }).join(", ")}
              {showPrices && ` · ${formatCUP(orderTotal(order))}`}
            </div>
            <div style={{ color: "var(--text-faint-2)", fontSize: 11.5, marginTop: 2 }}>
              {formatDateTime(order.timestamp)}
            </div>
            {order.note && (
              <div style={{ color: "var(--warning-text)", fontSize: 12.5, marginTop: 4, fontStyle: "italic" }}>
                📝 {order.note}
              </div>
            )}
          </div>
        </div>

        {!inSelectMode && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={order.sent}
                  onChange={(e) => onMarkSent(order.orderId, e.target.checked)}
                />
                Enviado
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={order.confirmed}
                  onChange={(e) => onMarkConfirmed(order.orderId, e.target.checked)}
                />
                <CheckCheck size={13} /> Confirmado
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => startEdit(order)}
                title="Editar pedido"
                aria-label="Editar pedido"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)",
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => {
                  openOrderWhatsApp(order, products, whatsappPhone, senderOptions);
                  onMarkSent(order.orderId, true);
                }}
                title="Enviar por WhatsApp"
                aria-label="Enviar por WhatsApp"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--whatsapp)", color: "var(--on-accent)", border: "none",
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Send size={16} />
              </button>
              <button
                onClick={() => handleDeleteClick(order)}
                title={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                aria-label={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, width: confirmingDeleteId === order.orderId ? "auto" : 40, height: 40,
                  padding: confirmingDeleteId === order.orderId ? "0 10px" : 0,
                  background: confirmingDeleteId === order.orderId ? "var(--danger)" : "transparent",
                  border: confirmingDeleteId === order.orderId ? "1px solid var(--danger)" : "1px solid var(--border)",
                  color: confirmingDeleteId === order.orderId ? "var(--on-accent)" : "var(--text-muted)",
                  borderRadius: 7, cursor: "pointer", flexShrink: 0, fontSize: 12, fontWeight: 600,
                }}
              >
                <Trash2 size={14} />
                {confirmingDeleteId === order.orderId && "¿Seguro?"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Misma estructura para PEDIDOS DE HOY y PEDIDOS DE MAÑANA: título +
  // envío masivo opcional + orden + lista (o mensaje vacío). `section` es
  // "hoy" | "manana", usado para saber si el modo selección activo es el
  // de esta sección.
  function renderOrdersSection({ section, title, orders, sorted, emptyText }) {
    const inSelectMode = selectSection === section;
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>{title}</div>
          <button
            onClick={() => (inSelectMode ? confirmBulkSend(orders) : startSelect(section))}
            disabled={orders.length === 0 || (inSelectMode && selectedIds.size === 0)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: (orders.length === 0 || (inSelectMode && selectedIds.size === 0)) ? "var(--border)" : "var(--whatsapp)",
              color: (orders.length === 0 || (inSelectMode && selectedIds.size === 0)) ? "var(--text-faint)" : "var(--on-accent)",
              border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600,
              cursor: (orders.length === 0 || (inSelectMode && selectedIds.size === 0)) ? "default" : "pointer",
            }}
          >
            <Send size={14} /> {inSelectMode ? `Confirmar envío (${selectedIds.size})` : "Enviar por WhatsApp"}
          </button>
        </div>

        {inSelectMode && (
          <button
            onClick={cancelSelect}
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 12.5,
              cursor: "pointer", padding: "0 0 10px", textDecoration: "underline",
            }}
          >
            Cancelar selección
          </button>
        )}

        {!inSelectMode && orders.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <select
              value={todayOrderSort}
              onChange={(e) => setTodayOrderSort(e.target.value)}
              style={{
                border: "1px solid var(--border)", borderRadius: 7,
                padding: "7px 10px", fontSize: 12.5, background: "var(--surface)", color: "var(--text-muted)",
              }}
            >
              <option value="recent">Más recientes primero</option>
              <option value="oldest">Más antiguos primero</option>
            </select>
          </div>
        )}

        {orders.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
            {searchTerm || filterUnsent || filterUnconfirmed ? `Ningún pedido coincide con la búsqueda/filtros.` : emptyText}
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {sorted.map((order, i) => renderOrderRow(order, i, { inSelectMode }))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>
          {editingOrderId ? "EDITAR PEDIDO" : "NUEVO PEDIDO"}
        </div>
        {editingOrderId && (
          <button
            onClick={resetForm}
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 12.5,
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            Cancelar edición
          </button>
        )}
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setDraftBucket("hoy")}
            style={{
              flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: draftBucket === "hoy" ? "var(--ink)" : "transparent",
              color: draftBucket === "hoy" ? "var(--cream)" : "var(--text)",
            }}
          >
            Hoy
          </button>
          <button
            onClick={() => setDraftBucket("manana")}
            style={{
              flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: draftBucket === "manana" ? "var(--ink)" : "transparent",
              color: draftBucket === "manana" ? "var(--cream)" : "var(--text)",
            }}
          >
            Mañana
          </button>
        </div>

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Nombre y apellidos del cliente"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 7,
              padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            }}
          />
          {suggestions.length > 0 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7,
                marginTop: 4, overflow: "hidden",
              }}
            >
              {suggestions.map((name) => (
                <div
                  key={name}
                  onClick={() => {
                    setCustomerName(name);
                    setShowSuggestions(false);
                  }}
                  style={{ padding: "8px 12px", fontSize: 13.5, cursor: "pointer" }}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text-muted)", marginBottom: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isDelivery}
            onChange={(e) => setIsDelivery(e.target.checked)}
          />
          Entrega a domicilio
        </label>

        <textarea
          placeholder="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{
            width: "100%", border: "1px solid var(--border)", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            marginBottom: 14, resize: "vertical", fontFamily: "inherit",
          }}
        />

        {draftLines.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            {draftLines.map((line) => {
              const product = products.find((p) => p.code === line.code);
              return (
                <div key={line.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13.5 }}>{product ? product.name : line.code}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={line.qty}
                      onChange={(e) => updateDraftLineQty(line.code, e.target.value)}
                      style={{
                        width: 60, textAlign: "right", border: "1px solid var(--border)", borderRadius: 7,
                        padding: "6px 8px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={() => removeDraftLine(line.code)}
                      title="Quitar producto"
                      aria-label="Quitar producto"
                      style={{
                        background: "transparent", border: "none", color: "var(--text-muted)",
                        cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
            {showPrices && (
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 13.5, fontWeight: 600 }}>
                Total: {formatCUP(draftTotal(draftLines, prices))}
              </div>
            )}
          </div>
        )}

        {availableProducts.length > 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={effectiveSelectedProductCode}
              onChange={(e) => setSelectedProductCode(e.target.value)}
              style={{
                flex: "1 1 auto", border: "1px solid var(--border)", borderRadius: 7,
                padding: "9px 10px", fontSize: 14, background: "var(--surface)",
              }}
            >
              {availableProducts.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Cant."
              value={pendingQty}
              onChange={(e) => setPendingQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addDraftLine(); }}
              style={{
                width: 70, textAlign: "right", border: "1px solid var(--border)", borderRadius: 7,
                padding: "9px 10px", fontSize: 14, fontVariantNumeric: "tabular-nums",
              }}
            />
            <button
              onClick={addDraftLine}
              style={{
                flex: "0 0 auto", background: "var(--ink)", color: "var(--cream)", border: "none",
                borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Agregar
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Todos los productos ya están en el pedido.</div>
        )}

        {bigOrderWarning && (
          <Banner
            variant="warning"
            style={{ marginTop: 12, fontSize: 12.5 }}
            actions={[
              { label: "Confirmar de todas formas", kind: "dark", onClick: confirmBigOrderAnyway },
              { label: "Cancelar", kind: "secondary", onClick: cancelBigOrderWarning },
            ]}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Pedido grande:</div>
            {bigOrderWarning.bigLines.map((l) => `${l.name}: ${l.qty} uds (aviso ≤ ${l.threshold})`).join(", ")}
          </Banner>
        )}

        <button
          onClick={confirmOrder}
          style={{
            marginTop: 16, width: "100%", background: "var(--ink)", color: "var(--cream)", border: "none",
            borderRadius: 7, padding: "11px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          {editingOrderId ? "Guardar cambios" : "Confirmar pedido"}
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar cliente en pedidos"
        value={orderSearch}
        onChange={(e) => setOrderSearch(e.target.value)}
        style={{
          width: "100%", border: "1px solid var(--border)", borderRadius: 7,
          padding: "9px 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 10,
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnsent}
            onChange={(e) => setFilterUnsent(e.target.checked)}
          />
          Solo no enviados
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnconfirmed}
            onChange={(e) => setFilterUnconfirmed(e.target.checked)}
          />
          Solo no confirmados
        </label>
      </div>

      {pendingDeletes.size > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {Array.from(pendingDeletes.entries()).map(([orderId, { customerName: deletedName }]) => (
            <Banner
              key={orderId}
              variant="dark"
              layout="row"
              style={{ fontSize: 13 }}
              actions={[{ label: "Deshacer", kind: "secondary", onClick: () => undoDelete(orderId) }]}
            >
              Pedido de {deletedName} eliminado.
            </Banner>
          ))}
        </div>
      )}

      {renderOrdersSection({
        section: "hoy",
        title: "PEDIDOS DE HOY",
        orders: todaysOrders,
        sorted: sortedTodaysOrders,
        emptyText: "Aún no hay pedidos hoy.",
      })}

      <div style={{ marginTop: 20 }}>
        {activeProductsForPanel.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
              DISPONIBLE PARA MAÑANA
            </div>
            {activeProductsForPanel.map((p, i) => {
              const reserved = reservedForTomorrow(allOrders, p.code);
              const libre = (stock[p.code] || 0) - reserved;
              return (
                <div
                  key={p.code}
                  style={{
                    display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                  }}
                >
                  <span>{p.name}</span>
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{libre} uds libres</b>
                </div>
              );
            })}
          </div>
        )}

        {renderOrdersSection({
          section: "manana",
          title: "PEDIDOS DE MAÑANA",
          orders: tomorrowsOrders,
          sorted: sortedTomorrowsOrders,
          emptyText: "Aún no hay pedidos reservados para mañana.",
        })}
      </div>

      {pastOrdersCount > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowPast((s) => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
              color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
              padding: 0, marginBottom: showPast ? 10 : 0,
            }}
          >
            {showPast ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            PEDIDOS ANTERIORES ({pastOrdersCount})
          </button>

          {showPast && pastDatesDesc.map((date) => (
            <div key={date} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>
                {formatDate(date)}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {pastOrdersByDate.get(date).map((order, i) => renderOrderRow(order, i, { inSelectMode: false }))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 2: Verificar en el navegador**

Arrancar `preview_start` (dev server), abrir la pestaña Pedidos:
- El formulario muestra el selector Hoy/Mañana, pre-marcado según la hora actual.
- Crear un pedido en Hoy → aparece en "PEDIDOS DE HOY", el stock del producto baja de inmediato (chequear en pestaña Productos).
- Crear un pedido en Mañana con cantidad menor al stock → aparece en "PEDIDOS DE MAÑANA", el stock del producto en Productos **no cambia**.
- Intentar crear otro pedido en Mañana con cantidad que sume más que el stock disponible junto al anterior → banner de error, no se confirma.
- El panel "DISPONIBLE PARA MAÑANA" arriba de esa sección refleja `stock - reservado`.
- Marcar Enviado en el pedido de mañana → el stock baja recién ahí.
- Desmarcar Enviado → el stock vuelve a subir.
- Enviar por WhatsApp un pedido de mañana no enviado → también descuenta stock (marca Enviado como side-effect).
- Probar selección múltiple + "Confirmar envío" tanto en Hoy como en Mañana.
- Editar un pedido de Hoy y cambiarlo a Mañana → el stock que tenía comprometido se devuelve. Editar uno de Mañana sin enviar y pasarlo a Hoy → se descuenta.
- Eliminar un pedido de Mañana sin enviar → no toca stock. Eliminar uno ya comprometido (Hoy, o Mañana enviado) → revierte, como antes.
- Confirmar que ya no existe el botón/ícono de Aplazar (reloj) en ninguna fila.

---

### Task 7: `ProductsView.jsx` — línea "Reservado mañana / Libre"

**Files:**
- Modify: `src/ProductsView.jsx`

- [ ] **Paso 1: Import y cálculo**

Agregar al principio del archivo:
```js
import { useMemo } from "react";
```
y en los imports existentes agregar `groupAllOrders`, `reservedForTomorrow`:
```js
import { groupAllOrders, reservedForTomorrow } from "./orderHelpers.js";
```

Dentro del componente, justo antes del `return (`:
```js
  const allOrders = useMemo(() => groupAllOrders(movements), [movements]);
```

- [ ] **Paso 2: Agregar la línea bajo el número de stock**

Ubicar el bloque (dentro del `.map` de `activeProducts`, rama `!editMode`):
```jsx
                {!editMode && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isLow ? "var(--accent-orange-text)" : "var(--text)" }}>
                      {qty} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-faint)" }}>uds</span>
                    </div>
                  </div>
                )}
```
Reemplazar por:
```jsx
                {!editMode && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isLow ? "var(--accent-orange-text)" : "var(--text)" }}>
                      {qty} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-faint)" }}>uds</span>
                    </div>
                    {reservedForTomorrow(allOrders, p.code) > 0 && (
                      <div style={{ fontSize: 11.5, color: "var(--accent-orange-soft-text)", marginTop: 2 }}>
                        Reservado mañana: {reservedForTomorrow(allOrders, p.code)} · Libre: {qty - reservedForTomorrow(allOrders, p.code)}
                      </div>
                    )}
                  </div>
                )}
```

- [ ] **Paso 3: Verificar**

Con el pedido de mañana creado en la Tarea 6, ir a Productos → el producto reservado muestra "Reservado mañana: N · Libre: M" en ámbar, debajo del stock. Un producto sin reservas no muestra la línea.

---

### Task 8: `Today.jsx` / `Tomorrow.jsx` — modo "reservado, pendiente de envío"

**Files:**
- Modify: `src/Today.jsx`
- Modify: `src/Tomorrow.jsx`

- [ ] **Paso 1: `Today.jsx` — agregar `pendingMode`**

Reemplazar todo el archivo por:

```jsx
import { formatCUP, formatUSD, convertToUSD, totalHlSold } from "./money";
import Banner from "./Banner.jsx";

// `movements` ya viene filtrado por el llamador (InventoryApp.jsx) según qué
// pedidos le tocan a esta pestaña -- este componente solo resume/muestra.
// `pendingMode` (pestaña Mañana): todo lo que llega ya es "reservado, sin
// comprometer" -- se cuenta todo como un solo total, sin separar
// enviado/pendiente (acá no hay "enviado" todavía).
export default function Today({
  products, movements, stock, showPrices, exchangeRate,
  title = "HOY", ordersLabel = "PEDIDOS DE HOY", soldLabel = "Vendido hoy",
  pendingMode = false,
}) {
  const todaysSales = movements.filter((m) => m.type === "venta");
  const todaysSentSales = pendingMode ? todaysSales : todaysSales.filter((m) => m.sent);
  const todaysPendingSales = pendingMode ? [] : todaysSales.filter((m) => !m.sent);
  const unitsSold = todaysSentSales.reduce((sum, m) => sum + m.qty, 0);
  const dayRevenue = todaysSentSales.reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
  const dayRevenueUSD = convertToUSD(dayRevenue, exchangeRate);
  const hlSoldToday = totalHlSold(todaysSentSales, products);
  const ordersToday = new Set(todaysSentSales.filter((m) => m.orderId).map((m) => m.orderId)).size;

  const activeProducts = products.filter((p) => !p.archived);
  const rows = activeProducts
    .map((p) => ({
      product: p,
      soldToday: todaysSentSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      pendingToday: todaysPendingSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      stockLeft: stock[p.code] || 0,
    }))
    .map((row) => ({ ...row, disponibleLibre: row.stockLeft - row.pendingToday }))
    .sort((a, b) => b.soldToday - a.soldToday);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
        {title}
      </div>

      {pendingMode && (
        <Banner variant="warning" style={{ marginBottom: 14 }}>
          Reservado, pendiente de envío -- no está descontado del stock ni sumado al ingreso todavía.
        </Banner>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{pendingMode ? "UNIDADES RESERVADAS" : "UNIDADES VENDIDAS"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{unitsSold}</div>
        </div>

        {showPrices && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{pendingMode ? "INGRESO RESERVADO" : "INGRESO DEL DÍA"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(dayRevenue)}</div>
            {dayRevenueUSD !== null && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{formatUSD(dayRevenueUSD)}</div>
            )}
          </div>
        )}

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{ordersLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ordersToday}</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>HL {pendingMode ? "RESERVADOS" : "VENDIDOS"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{hlSoldToday.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
        POR PRODUCTO
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
          Sin productos activos.
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {rows.map((row, i) => (
            <div
              key={row.product.code}
              style={{
                display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                gap: 6, padding: "12px 16px", fontSize: 14,
                borderTop: i === 0 ? "none" : "1px solid var(--divider)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 24, borderRadius: 3, background: row.product.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{row.product.short}</span>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  {soldLabel}: <span style={{ fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{row.soldToday}</span>
                </span>
                {row.pendingToday > 0 && (
                  <span style={{ fontSize: 12.5, color: "var(--accent-orange-soft-text)" }}>
                    Pendiente: <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.pendingToday}</span>
                  </span>
                )}
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  Stock: <span style={{ fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{row.stockLeft}</span>
                </span>
                {row.pendingToday > 0 && (
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    Disponible libre: <span style={{ fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{row.disponibleLibre}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 2: `Tomorrow.jsx` — activar `pendingMode`**

Reemplazar todo el archivo por:

```jsx
import Today from "./Today.jsx";

export default function Tomorrow(props) {
  return (
    <Today
      {...props}
      title="MAÑANA"
      ordersLabel="PEDIDOS DE MAÑANA"
      soldLabel="Reservado para mañana"
      pendingMode
    />
  );
}
```

- [ ] **Paso 3: Verificar**

Pestaña "Hoy" del menú: sigue mostrando lo mismo que antes (unidades/ingreso/HL de hoy, comprometidos). Pestaña "Mañana": muestra el banner de aviso arriba, y las stat-cards reflejan el pedido reservado creado en la Tarea 6 (deja de mostrarlo apenas se marca Enviado, porque ya no es "pendiente").

---

### Task 9: Verificación final end-to-end

**Files:** ninguno (solo verificación manual).

- [ ] **Paso 1: Datos existentes no se rompen**

Con datos ya guardados de sesiones anteriores (movimientos sin `bucket`), recargar la app: stock, ingreso acumulado, HL, resumen semanal, historial de movimientos en Productos -- todo tiene que verse exactamente igual que antes de este cambio (todos esos pedidos son `bucket` default `"hoy"` → comprometidos → mismo comportamiento).

- [ ] **Paso 2: Recorrido completo**

1. Crear pedido Hoy → stock baja ya.
2. Crear pedido Mañana → stock no baja; aparece en panel "Disponible para mañana" y en la línea del producto en Productos.
3. Intentar reservar más de lo libre para mañana → bloqueado.
4. Marcar Enviado el pedido de mañana → stock baja, ingreso/HL suben, sale de la pestaña Mañana del menú.
5. Desmarcar Enviado → todo vuelve.
6. Enviar por WhatsApp otro pedido de mañana → también compromete.
7. Envío masivo en Hoy y en Mañana por separado.
8. Editar pedido: cambiar Hoy→Mañana y Mañana→Hoy, confirmar que el stock se ajusta en ambos sentidos.
9. Eliminar pedido de mañana sin enviar (con undo de 5s) → stock no se toca en ningún momento.
10. Eliminar pedido comprometido → revierte, con undo funcionando igual que antes.
11. Resumen semanal: los totales de ingreso/HL no incluyen pedidos de mañana todavía sin enviar.
12. Modo oscuro: repasar visualmente el selector Hoy/Mañana, el panel "Disponible para mañana" y el banner de la pestaña Mañana en `data-theme="dark"`.
13. Confirmar que no quedan referencias rotas a `Aplazar`/`postponeOrder`/`CalendarClock` en consola ni en la UI.

- [ ] **Paso 3: Commit**

Un commit por archivo lógico (helpers, money, useInventoryStore, Orders, ProductsView, Today/Tomorrow) o uno solo agrupando todo el feature -- a decidir con el usuario al terminar, siguiendo el patrón de esta sesión (siempre verificar en navegador antes de cada commit, nunca commitear con la app rota).
