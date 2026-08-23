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
        orderSeq: m.orderSeq || null,
        date: m.date,
        timestamp: m.timestamp,
        lines: [],
      });
    }
    byId.get(m.orderId).lines.push({ code: m.code, qty: m.qty, unitPrice: m.unitPrice || 0 });
  });
  return Array.from(byId.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function groupOrders(movements, dateStr) {
  return groupAllOrders(movements).filter((order) => order.date === dateStr);
}

export function formatOrderForWhatsApp(order, products, { senderName, sendSenderName } = {}) {
  const lines = [];
  if (sendSenderName && senderName && senderName.trim()) lines.push(senderName.trim());
  if (order.isDelivery) lines.push("🛺 Domicilio 🛺");
  lines.push(order.customerName);
  if (order.note && order.note.trim()) lines.push(order.note.trim());
  order.lines.forEach((line) => {
    const product = products.find((p) => p.code === line.code);
    lines.push(`${product ? product.name : line.code} - ${line.qty}`);
  });
  return lines.join("\n");
}

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
