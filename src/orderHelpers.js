export function groupAllOrders(movements) {
  const orderMovements = movements.filter((m) => m.orderId);
  const byId = new Map();
  orderMovements.forEach((m) => {
    if (!byId.has(m.orderId)) {
      byId.set(m.orderId, {
        orderId: m.orderId,
        customerName: m.customerName,
        isDelivery: !!m.isDelivery,
        sent: !!m.sent,
        confirmed: !!m.confirmed,
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
  order.lines.forEach((line) => {
    const product = products.find((p) => p.code === line.code);
    lines.push(`${product ? product.name : line.code} - ${line.qty}`);
  });
  return lines.join("\n");
}
