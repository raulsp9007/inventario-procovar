// Datos de la app de la facturadora. Lo que ella ve incluye sus 👍 todavía sin
// enviar (cola), para que al confirmar sin internet el pedido ya se vea
// confirmado. Funciones puras.

function recount(seller) {
  return {
    ...seller,
    pending: seller.orders.filter((o) => o.status === "pendiente").length,
    confirmed: seller.orders.filter((o) => o.status === "confirmado").length,
  };
}

// Aplica la cola de operaciones ({ kind: "confirm" | "unconfirm", ids }) sobre los
// vendedores tal como los dio la nube, y vuelve a contar.
export function overlayOps(sellers, queue, nowIso) {
  if (!queue || queue.length === 0) return sellers;
  const orders = new Map();
  sellers.forEach((s) => s.orders.forEach((o) => orders.set(o.id, { ...o })));

  queue.forEach((op) => {
    op.ids.forEach((id) => {
      const o = orders.get(id);
      if (!o) return;
      if (op.kind === "confirm" && o.status === "pendiente") {
        orders.set(id, { ...o, status: "confirmado", confirmedBy: "facturadora", confirmedAt: nowIso, modified: false });
      } else if (op.kind === "unconfirm" && o.status === "confirmado" && o.confirmedBy === "facturadora") {
        orders.set(id, { ...o, status: "pendiente", confirmedBy: null, confirmedAt: null });
      }
    });
  });

  return sellers.map((s) => recount({ ...s, orders: s.orders.map((o) => orders.get(o.id)) }));
}

// ----- Vista de escritorio: una tabla con los pedidos de todos los vendedores -----

// Todos los pedidos juntos, cada uno con su vendedor, del más viejo al más nuevo.
export function flattenOrders(sellers) {
  const all = sellers.flatMap((s) => s.orders.map((o) => ({ ...o, sellerId: s.id, sellerName: s.name })));
  return all.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)));
}

const inTab = (o, tab) => (tab === "sin" ? o.status === "pendiente" : tab === "ok" ? o.status === "confirmado" : true);

// Filtra por vendedor ("todos" o vacío = todos), pestaña ("sin" | "ok" | "todos") y
// texto (cliente, negocio, código o vendedor; sin importar tildes ni mayúsculas; todas
// las palabras escritas deben aparecer, en cualquier orden).
export function filterOrders(orders, { sellerId = "", tab = "todos", query = "" } = {}) {
  const words = keyOf(query).split(" ").filter(Boolean);
  return orders.filter((o) => {
    if (sellerId && sellerId !== "todos" && o.sellerId !== sellerId) return false;
    if (!inTab(o, tab)) return false;
    if (words.length === 0) return true;
    const haystack = keyOf(`${o.customerName} ${o.businessName || ""} ${o.customerCode || ""} ${o.sellerName || ""}`);
    return words.every((w) => haystack.includes(w));
  });
}

// Cuántos pedidos hay en cada pestaña, dentro del vendedor elegido.
export function tabCounts(orders, sellerId = "") {
  const mine = filterOrders(orders, { sellerId, tab: "todos" });
  return { sin: mine.filter((o) => inTab(o, "sin")).length, todos: mine.length, ok: mine.filter((o) => inTab(o, "ok")).length };
}

// Deja solo los pedidos de un día (AAAA-MM-DD) y vuelve a contar. No modifica lo que recibe.
export function onlyDay(sellers, day) {
  return sellers.map((s) => recount({ ...s, orders: s.orders.filter((o) => o.date === day) }));
}

export const totalPending =(sellers) => sellers.reduce((sum, s) => sum + s.pending, 0);

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const keyOf = (text) => String(text || "").normalize("NFD").replace(DIACRITICS, "").toLowerCase().replace(/\s+/g, " ").trim();
const collator = new Intl.Collator("es", { sensitivity: "base" });

// Los vendedores que se muestran: los actuales (`known`, solo nombres) siempre, con
// o sin pedidos, más cualquier otro que traiga el buzón, por orden alfabético
// (sin importar tildes). El del buzón se reconoce por nombre, también si trae
// apellido ("Raúl Salgado" es "Raul"). No modifica lo que recibe.
export function mergeKnownSellers(sellers, known) {
  const used = new Set();
  const list = [];
  known.forEach((name) => {
    const key = keyOf(name);
    const found = sellers.find((s, i) => {
      if (used.has(i)) return false;
      const sellerKey = keyOf(s.name);
      return sellerKey === key || sellerKey.startsWith(`${key} `);
    });
    if (found) {
      used.add(sellers.indexOf(found));
      list.push(found);
    } else {
      list.push({ id: `actual-${key.replace(/[^a-z0-9]+/g, "-")}`, name, pending: 0, confirmed: 0, orders: [] });
    }
  });
  sellers.forEach((s, i) => { if (!used.has(i)) list.push(s); });
  return list.sort((a, b) => collator.compare(a.name, b.name));
}

// Suma una operación a la cola: confirmar y deshacer lo mismo antes de que salga
// se compensan; lo demás se agrega al final.
export function mergeFactOps(queue, op) {
  const opposite = op.kind === "confirm" ? "unconfirm" : "confirm";
  let remaining = new Set(op.ids);
  const next = [];
  queue.forEach((queued) => {
    if (queued.kind === opposite) {
      const kept = queued.ids.filter((id) => !remaining.has(id));
      queued.ids.forEach((id) => remaining.delete(id));
      if (kept.length > 0) next.push({ ...queued, ids: kept });
    } else {
      next.push({ ...queued, ids: [...queued.ids] });
    }
  });
  const rest = op.ids.filter((id) => remaining.has(id));
  if (rest.length > 0) next.push({ kind: op.kind, ids: rest });
  return next;
}
