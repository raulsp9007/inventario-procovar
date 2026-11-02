import { CloudError } from "./cloudApi";

// Sincronización del vendedor con la nube de facturación (ver
// docs/superpowers/specs/2026-10-30-facturacion-nube-design.md). Todo son
// funciones puras: el hook que las usa (useCloudSync) solo las llama y guarda.
//
// `map` es lo que esta app sabe de cada pedido en la nube:
//   { [orderId]: { hash, published, status, confirmedBy, confirmedAt, appliedAt, autoConfirmed } }

const lineTotal = (lines) => lines.reduce((sum, l) => sum + l.qty * (l.unitPrice || 0), 0);

// Lo único que sube a la nube de un pedido (sin teléfono ni notas).
// Además del pedido, el código del cliente (del portal) y su negocio, para que la
// facturadora lo encuentre; el buzón los guarda aparte del contenido.
export function toCloudContent(order, products, customers = []) {
  const lines = order.lines.map((l) => {
    const product = products.find((p) => p.code === l.code);
    return { code: l.code, name: (product && (product.name || product.short)) || l.code, qty: l.qty, unitPrice: l.unitPrice || 0 };
  });
  const customer = customers.find((c) => c.name === order.customerName);
  const customerCode = (customer && customer.code) || "";
  const businessName = (order.businessName || (customer && customer.businessName) || "").trim();
  return {
    customerName: order.customerName,
    ...(customerCode ? { customerCode } : {}),
    ...(businessName ? { businessName } : {}),
    date: order.date,
    total: lineTotal(order.lines),
    lines,
  };
}

// Pedidos que van a la facturadora: los enviados a facturación que no son
// domicilio (esos van al supervisor).
const isWanted = (o) => o.sent && !o.isDelivery;

// Qué hay que mandar a la nube según los pedidos de la app: subir los nuevos o
// cambiados, borrar los que ya no van, y confirmar los que el vendedor confirmó
// a mano. Devuelve las operaciones y el mapa ya actualizado.
// `today` (AAAA-MM-DD): solo cuentan los pedidos de "Hoy" (la facturadora ve el día
// y a las 12 am se limpia). Un pedido de otro día no se sube; si ya estaba subido
// y su día pasó, se deja quieto (no se borra ni se vuelve a subir). Sin `today`
// no se filtra por fecha.
export function reconcile({ orders, products, customers = [], map, today }) {
  const ops = [];
  const nextMap = { ...map };
  const wanted = new Map(orders.filter(isWanted).map((o) => [o.orderId, o]));

  wanted.forEach((order, id) => {
    if (today && order.date !== today) return;
    const content = toCloudContent(order, products, customers);
    const hash = JSON.stringify(content);
    let entry = nextMap[id];
    // Uno que la nube rechazó no se reenvía igual: solo si el vendedor lo cambia.
    if (!entry || entry.hash !== hash || (!entry.published && !entry.rejected)) {
      ops.push({ kind: "put", orderId: id, content });
      entry = { hash, published: true, status: "pendiente", confirmedBy: null, confirmedAt: null, appliedAt: null, autoConfirmed: false };
      nextMap[id] = entry;
    }
    if (order.confirmed && entry.status === "pendiente") {
      ops.push({ kind: "confirm", orderId: id });
      nextMap[id] = { ...entry, status: "confirmado", confirmedBy: "vendedor" };
    }
  });

  Object.keys(map).forEach((id) => {
    const entry = map[id];
    if (entry.rejected && !wanted.has(id)) nextMap[id] = { ...entry, rejected: null };
    if (entry.published && !wanted.has(id)) {
      ops.push({ kind: "delete", orderId: id });
      nextMap[id] = { ...entry, published: false, status: "cancelado" };
    }
  });

  return { ops, nextMap };
}

// Marca en el mapa los pedidos cuyo envío la nube rechazó (datos inválidos), con el motivo.
// Devuelve el mismo mapa si no hay nada que marcar.
export function markRejected(map, rejected) {
  const puts = rejected.filter((r) => r.kind === "put" && map[r.orderId]);
  if (puts.length === 0) return map;
  const next = { ...map };
  puts.forEach((r) => { next[r.orderId] = { ...next[r.orderId], published: false, rejected: r.message || "Datos no válidos." }; });
  return next;
}

// Qué cambió en la nube desde la última vez: confirma (o des-confirma) en la app
// los pedidos que la facturadora marcó con 👍 (o deshizo). Solo toca lo que esta
// app subió, y no vuelve a marcar un 👍 que ya aplicó (el vendedor puede
// desmarcarlo a mano si quiere).
export function applyStatuses({ rows, orders, map }) {
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  const nextMap = { ...map };
  const toConfirm = [];
  const toUnconfirm = [];

  rows.forEach((row) => {
    const entry = map[row.id];
    if (!entry) return;
    const local = byId.get(row.id);

    if (row.status === "confirmado") {
      if (row.confirmedBy === "facturadora") {
        if (entry.appliedAt !== row.confirmedAt) {
          const needsMark = !!local && !local.confirmed;
          if (needsMark) toConfirm.push(row.id);
          nextMap[row.id] = { ...entry, status: "confirmado", confirmedBy: "facturadora", confirmedAt: row.confirmedAt, appliedAt: row.confirmedAt, autoConfirmed: needsMark };
        } else {
          nextMap[row.id] = { ...entry, status: "confirmado", confirmedBy: "facturadora", confirmedAt: row.confirmedAt };
        }
      } else {
        nextMap[row.id] = { ...entry, status: "confirmado", confirmedBy: "vendedor", confirmedAt: row.confirmedAt };
      }
    } else if (row.status === "pendiente") {
      if (entry.status === "confirmado" && entry.confirmedBy === "facturadora") {
        if (entry.autoConfirmed && local && local.confirmed) toUnconfirm.push(row.id);
        nextMap[row.id] = { ...entry, status: "pendiente", confirmedBy: null, confirmedAt: null, appliedAt: null, autoConfirmed: false };
      }
    } else if (row.status === "cancelado") {
      nextMap[row.id] = { ...entry, status: "cancelado" };
    }
  });

  return { toConfirm, toUnconfirm, nextMap };
}

// Suma operaciones nuevas a la cola sin repetir ni contradecir lo que ya espera:
// subir o borrar un pedido sustituye todo lo anterior de ese pedido; confirmar no
// se duplica.
export function mergeOps(queue, newOps) {
  let next = queue.map((op) => ({ ...op }));
  newOps.forEach((op) => {
    if (op.kind === "confirm") next = next.filter((o) => !(o.orderId === op.orderId && o.kind === "confirm"));
    else next = next.filter((o) => o.orderId !== op.orderId);
    next.push(op);
  });
  return next;
}

// Manda la cola en orden. Sin conexión, código vencido o fallo del servidor se
// detiene y conserva lo que falta; lo que la nube rechaza (datos inválidos) se
// descarta y se reporta; borrar o confirmar algo que no existe cuenta como hecho.
export async function flushQueue({ queue, api }) {
  const remaining = [...queue];
  const rejected = [];
  let sent = 0;
  let stopped = null;

  while (remaining.length > 0) {
    const op = remaining[0];
    try {
      if (op.kind === "put") await api.putOrder(op.orderId, op.content);
      else if (op.kind === "confirm") await api.confirmOrder(op.orderId);
      else await api.deleteOrder(op.orderId);
      remaining.shift();
      sent += 1;
    } catch (e) {
      const kind = e instanceof CloudError ? e.kind : "server";
      if (kind === "network" || kind === "auth" || kind === "server") {
        stopped = kind;
        break;
      }
      remaining.shift();
      if (kind !== "notfound") rejected.push({ orderId: op.orderId, kind: op.kind, message: e.message });
    }
  }
  return { remaining, rejected, sent, stopped };
}

const pad = (n) => String(n).padStart(2, "0");

// Lo que se ve en la tarjeta del pedido. null si no está en la nube.
export function chipFor({ entry, queued }) {
  if (entry && entry.rejected) return { state: "rejected", text: entry.rejected };
  if (!entry || !entry.published) return null;
  if (queued) return { state: "queued", text: "En cola" };
  if (entry.status === "confirmado" && entry.confirmedBy === "facturadora") {
    const date = entry.confirmedAt ? new Date(entry.confirmedAt) : null;
    const at = date && !Number.isNaN(date.getTime()) ? ` a las ${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
    return { state: "confirmed", text: `Confirmado por facturación${at}` };
  }
  return { state: "cloud", text: "En nube" };
}
