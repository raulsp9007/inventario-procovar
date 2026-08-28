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

function normalizeCustomerName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Detecta un cliente "casi igual" ya guardado (typo de mayúsculas, espacios
// de más/de menos) cuando el nombre escrito no es exactamente ninguno de
// los existentes -- para avisar antes de crear sin querer un cliente
// duplicado. Devuelve el nombre EXISTENTE (tal como está guardado) o null
// si no hay ambigüedad (ya es exacto, o no se parece a ninguno).
export function findNearDuplicateCustomerName(names, query) {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (names.includes(trimmed)) return null;
  const normalizedQuery = normalizeCustomerName(trimmed);
  return names.find((name) => normalizeCustomerName(name) === normalizedQuery) || null;
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
      byCustomer.set(m.customerName, { qtyByCode: {}, lastPurchaseDate: m.date, businessName: "", businessNameTimestamp: "" });
    }
    const entry = byCustomer.get(m.customerName);
    entry.qtyByCode[m.code] = (entry.qtyByCode[m.code] || 0) + m.qty;
    if (m.date > entry.lastPurchaseDate) entry.lastPurchaseDate = m.date;
    // El nombre del negocio puede haberse cargado en cualquier pedido de
    // este cliente (o editado aparte en Clientes) -- nos quedamos con el
    // más reciente por timestamp, no importa en qué movimiento haya quedado.
    if (m.businessName && m.timestamp > entry.businessNameTimestamp) {
      entry.businessName = m.businessName;
      entry.businessNameTimestamp = m.timestamp;
    }
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
    return { customerName, favoriteProductCode, lastPurchaseDate: entry.lastPurchaseDate, businessName: entry.businessName };
  });

  stats.sort((a, b) => b.lastPurchaseDate.localeCompare(a.lastPurchaseDate));
  return stats;
}

// Nombre de negocio guardado para ese cliente (el más reciente entre todos
// sus pedidos) -- usado para autocompletar al armar un pedido nuevo.
export function getCustomerBusinessName(movements, customerName) {
  let businessName = "";
  let latestTimestamp = "";
  movements.forEach((m) => {
    if (m.customerName !== customerName || !m.businessName) return;
    if (m.timestamp > latestTimestamp) {
      businessName = m.businessName;
      latestTimestamp = m.timestamp;
    }
  });
  return businessName;
}

// Teléfono guardado para ese cliente (el más reciente entre todos sus
// pedidos) -- usado para autocompletar al armar un pedido nuevo, igual que
// getCustomerBusinessName.
export function getCustomerPhone(movements, customerName) {
  let phone = "";
  let latestTimestamp = "";
  movements.forEach((m) => {
    if (m.customerName !== customerName || !m.customerPhone) return;
    if (m.timestamp > latestTimestamp) {
      phone = m.customerPhone;
      latestTimestamp = m.timestamp;
    }
  });
  return phone;
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
