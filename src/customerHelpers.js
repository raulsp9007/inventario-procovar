import { isCommittedMovement } from "./orderHelpers";

export function getCustomerNames(movements) {
  const names = new Set();
  movements.forEach((m) => {
    if (m.customerName) names.add(m.customerName);
  });
  return Array.from(names);
}

export function matchCustomerNames(names, query) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  return names.filter((name) => name.toLowerCase().includes(lower));
}

export function getCustomerOrders(movements, customerName) {
  const orderMovements = movements.filter((m) => m.customerName === customerName && m.orderId);
  const byId = new Map();
  orderMovements.forEach((m) => {
    if (!byId.has(m.orderId)) {
      byId.set(m.orderId, {
        orderId: m.orderId,
        date: m.date,
        timestamp: m.timestamp,
        isDelivery: !!m.isDelivery,
        lines: [],
      });
    }
    byId.get(m.orderId).lines.push({ code: m.code, qty: m.qty, unitPrice: m.unitPrice || 0 });
  });
  return Array.from(byId.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getCustomerStats(movements, products) {
  const byCustomer = new Map();

  movements.forEach((m) => {
    if (!m.customerName) return;
    if (!byCustomer.has(m.customerName)) {
      byCustomer.set(m.customerName, { qtyByCode: {}, lastPurchaseDate: m.date });
    }
    const entry = byCustomer.get(m.customerName);
    entry.qtyByCode[m.code] = (entry.qtyByCode[m.code] || 0) + m.qty;
    if (m.date > entry.lastPurchaseDate) entry.lastPurchaseDate = m.date;
  });

  const stats = Array.from(byCustomer.entries()).map(([customerName, entry]) => {
    let favoriteProductCode = null;
    let bestQty = -1;
    products.forEach((p) => {
      const qty = entry.qtyByCode[p.code] || 0;
      if (qty > bestQty) {
        bestQty = qty;
        favoriteProductCode = p.code;
      }
    });
    return { customerName, favoriteProductCode, lastPurchaseDate: entry.lastPurchaseDate };
  });

  stats.sort((a, b) => b.lastPurchaseDate.localeCompare(a.lastPurchaseDate));
  return stats;
}

// Totales por cliente (unidades + ingreso), solo ventas comprometidas y con
// cliente real -- "Venta manual" queda afuera porque no es una relación con
// un cliente, es un ajuste de conteo. Opcionalmente acotado a [start, end].
// Incluye favoriteProductCode (el producto que más le compró en el rango).
export function getCustomerSalesTotals(movements, products, { start, end } = {}) {
  const byCustomer = new Map();
  movements.forEach((m) => {
    if (!m.customerName || m.customerName === "Venta manual") return;
    if (m.type !== "venta" || !isCommittedMovement(m)) return;
    if (start && m.date < start) return;
    if (end && m.date > end) return;
    if (!byCustomer.has(m.customerName)) {
      byCustomer.set(m.customerName, { customerName: m.customerName, qty: 0, revenue: 0, qtyByCode: {} });
    }
    const entry = byCustomer.get(m.customerName);
    entry.qty += m.qty;
    entry.revenue += m.qty * (m.unitPrice || 0);
    entry.qtyByCode[m.code] = (entry.qtyByCode[m.code] || 0) + m.qty;
  });
  return Array.from(byCustomer.values())
    .map((entry) => {
      let favoriteProductCode = null;
      let bestQty = -1;
      products.forEach((p) => {
        const qty = entry.qtyByCode[p.code] || 0;
        if (qty > bestQty) {
          bestQty = qty;
          favoriteProductCode = p.code;
        }
      });
      return { customerName: entry.customerName, qty: entry.qty, revenue: entry.revenue, favoriteProductCode };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
