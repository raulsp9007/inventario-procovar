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

// Totales por producto (unidades + ingreso), solo ventas comprometidas,
// opcionalmente acotado a un rango de fechas [start, end] inclusive.
export function getProductSalesTotals(movements, products, { start, end } = {}) {
  const byCode = new Map();
  movements.forEach((m) => {
    if (m.type !== "venta" || !isCommittedMovement(m)) return;
    if (start && m.date < start) return;
    if (end && m.date > end) return;
    const cur = byCode.get(m.code) || { qty: 0, revenue: 0 };
    cur.qty += m.qty;
    cur.revenue += m.qty * (m.unitPrice || 0);
    byCode.set(m.code, cur);
  });
  return products
    .map((p) => ({ product: p, qty: byCode.get(p.code)?.qty || 0, revenue: byCode.get(p.code)?.revenue || 0 }))
    .filter((row) => row.qty > 0);
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
