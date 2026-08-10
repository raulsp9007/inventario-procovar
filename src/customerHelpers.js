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
