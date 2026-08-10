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
        date: m.date,
        timestamp: m.timestamp,
        lines: [],
      });
    }
    byId.get(m.orderId).lines.push({ code: m.code, qty: m.qty });
  });
  return Array.from(byId.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function groupOrders(movements, dateStr) {
  return groupAllOrders(movements).filter((order) => order.date === dateStr);
}

export function formatOrderForWhatsApp(order, products) {
  const nameLine = order.isDelivery ? `${order.customerName} (a domicilio)` : order.customerName;
  const productLines = order.lines.map((line) => {
    const product = products.find((p) => p.code === line.code);
    return `${product ? product.name : line.code} - ${line.qty}`;
  });
  return [nameLine, ...productLines].join("\n");
}
