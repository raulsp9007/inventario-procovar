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
