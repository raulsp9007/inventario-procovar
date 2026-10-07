import { getMonthStartStr } from "./dateUtils";
import { totalHlSold } from "./money";

// Metas de venta de cerveza y malta. Solo cuentan los productos marcados como
// "Cerveza o malta" (`inGoals`): el resto (vodka, refrescos, aceite, arroz...)
// no entra ni en los blísteres ni en el HL de las metas diarias. Un blíster
// es un sixpack = una unidad vendida de esos productos.

export function isGoalProduct(product) {
  return !!product && product.inGoals === true;
}

// Blísteres y HL de un grupo de movimientos, solo de productos marcados. Quien
// llama decide qué movimientos pasar (los vendidos de hoy); acá solo se
// filtra por tipo venta y por producto.
export function goalTotals(movements, products) {
  const goalByCode = new Map(products.filter(isGoalProduct).map((p) => [p.code, p]));
  let blisters = 0;
  let hl = 0;
  movements.forEach((m) => {
    if (m.type !== "venta") return;
    const product = goalByCode.get(m.code);
    if (!product) return;
    blisters += m.qty;
    hl += m.qty * (m.unitHl != null ? m.unitHl : product.hl || 0);
  });
  return { blisters, hl };
}

// Migración única de datos guardados antes de que esto existiera: marca los
// productos cuyo código es P o M seguido de un número (P500, P1500, M330,
// M1500...) y que vienen en Sixpack -- la cerveza (Parranda) y la malta
// (Malta Guajira). Cada persona ajusta después lo que haga falta.
export function defaultGoalProductCodes(products) {
  return products
    .filter((p) => !p.archived && /^[PM]\d/i.test(p.code) && String(p.format || "").toLowerCase() === "sixpack")
    .map((p) => p.code);
}

export function applyDefaultGoalProducts(products) {
  const codes = new Set(defaultGoalProductCodes(products));
  return products.map((p) => (codes.has(p.code) ? { ...p, inGoals: true } : p));
}

// HL vendido en el mes en curso (del día 1 hasta hoy), para la meta general:
// esa meta se acumula por mes y vuelve a cero al empezar el siguiente. Misma
// regla que el día: solo ventas ya enviadas (Facturado) y solo los productos
// marcados como cerveza o malta; sin ninguno marcado cuenta todo lo que
// tenga HL, igual que el resumen de hoy.
export function monthHl(movements, products, today) {
  const start = getMonthStartStr(today);
  const inMonth = movements.filter((m) => m.type === "venta" && m.sent && m.date >= start && m.date <= today);
  const anyGoalProduct = products.some((p) => !p.archived && isGoalProduct(p));
  return anyGoalProduct ? goalTotals(inMonth, products).hl : totalHlSold(inMonth, products);
}
