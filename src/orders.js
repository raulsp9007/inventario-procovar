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
