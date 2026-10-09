import { groupAllOrders, reservedForTomorrow } from "./orderHelpers";
import { goalTotals, isGoalProduct, monthHl } from "./goals";
import { totalHlSold, convertToUSD } from "./money";

// Cierre del día: repaso de lo que falta antes de cerrar. Solo lee los datos
// (no cambia nada). Tres cosas se pueden resolver -- pedidos, stock para mañana
// y respaldo --; las metas y las ventas son informativas (una meta no cumplida
// no se arregla al cerrar, así que no cuenta como pendiente).

function localDay(isoOrDate) {
  const d = new Date(isoOrDate);
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function calendarDaysBetween(fromDay, toDay) {
  return Math.round((new Date(`${toDay}T00:00:00`) - new Date(`${fromDay}T00:00:00`)) / 86400000);
}

export function buildClosingSummary({
  movements, products, stock, today, dailyBlisterGoal, dailyHlGoal, hlGoal, exchangeRate, lastBackupAt,
}) {
  const allOrders = groupAllOrders(movements);
  const todays = allOrders.filter((o) => o.date === today);

  const pendingBill = todays
    .filter((o) => !o.sent)
    .sort((a, b) => (a.orderSeq || 0) - (b.orderSeq || 0))
    .map((o) => ({ orderId: o.orderId, orderSeq: o.orderSeq, customerName: o.customerName, isDelivery: o.isDelivery }));
  const billed = todays.filter((o) => o.sent).length;
  const confirmed = todays.filter((o) => o.confirmed).length;
  const pedidos = {
    total: todays.length,
    billed,
    confirmed,
    unconfirmed: todays.length - confirmed,
    pendingBill,
    done: todays.every((o) => o.sent && o.confirmed),
  };

  // Lo "vendido" es lo ya facturado (igual que el resumen de hoy).
  const todaysSentSales = movements.filter((m) => m.type === "venta" && m.date === today && m.sent);
  const useGoalProducts = products.some((p) => !p.archived && isGoalProduct(p));
  const goalSums = useGoalProducts ? goalTotals(todaysSentSales, products) : null;
  const metas = {
    blisters: useGoalProducts ? goalSums.blisters : null,
    blisterGoal: dailyBlisterGoal ?? null,
    hl: useGoalProducts ? goalSums.hl : totalHlSold(todaysSentSales, products),
    hlGoal: dailyHlGoal ?? null,
    monthHl: monthHl(movements, products, today),
    monthGoal: hlGoal ?? null,
  };

  const revenue = todaysSentSales.reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
  const ventas = {
    revenue,
    revenueUsd: convertToUSD(revenue, exchangeRate),
    units: todaysSentSales.reduce((sum, m) => sum + m.qty, 0),
    ordersBilled: billed,
  };

  // Las reservas de mañana sin facturar todavía no descontaron stock: si
  // suman más de lo que queda, no alcanza.
  const shortages = products
    .filter((p) => !p.archived)
    .map((p) => {
      const reserved = reservedForTomorrow(allOrders, p.code);
      const have = stock[p.code] || 0;
      return { code: p.code, short: p.short || p.name, stock: have, reserved, missing: reserved - have };
    })
    .filter((row) => row.reserved > 0 && row.missing > 0);
  const stockSummary = { shortages, done: shortages.length === 0 };

  const daysAgo = lastBackupAt ? Math.max(0, calendarDaysBetween(localDay(lastBackupAt), today)) : null;
  const respaldo = { daysAgo, doneToday: daysAgo === 0, done: daysAgo === 0 };

  const pending = [pedidos.done, stockSummary.done, respaldo.done].filter((ok) => !ok).length;
  return { pedidos, metas, ventas, stock: stockSummary, respaldo, pending, total: 3 };
}
