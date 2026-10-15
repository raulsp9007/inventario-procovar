import { groupAllOrders } from "./orderHelpers";
import { addDaysStr, isSundayStr } from "./dateUtils";
import { findRegistryCustomer } from "./customerRegistry";

// Recomendaciones de compra por cliente a partir de su historial. Son reglas
// simples y explicables (no adivina): lo que suele pedir, cada cuánto, y a
// quién le toca ya. Con poca historia no sugiere nada.

// Pedidos (en días distintos) que hacen falta para hablar de un patrón.
export const MIN_ORDERS = 3;
// Cuántos de sus últimos pedidos se miran para "lo de siempre".
const WINDOW = 6;
// Qué parte de esos pedidos tiene que incluir un producto para ser "de siempre".
const TYPICAL_SHARE = 0.5;
// Cuántos intervalos recientes se usan para su ritmo.
const INTERVALS = 5;

// Días hábiles (sin domingos) después de `from` hasta `to` inclusive.
export function businessDaysBetween(from, to) {
  if (to <= from) return 0;
  let count = 0;
  for (let day = addDaysStr(from, 1); day <= to; day = addDaysStr(day, 1)) {
    if (!isSundayStr(day)) count += 1;
  }
  return count;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Qué pidió el cliente en cada pedido: { code: qty total }.
function qtyByCode(order) {
  const map = {};
  order.lines.forEach((l) => { map[l.code] = (map[l.code] || 0) + l.qty; });
  return map;
}

// Perfil de compra de un cliente: cuántos pedidos tiene, cada cuántos días
// pide, hace cuánto fue el último, qué suele pedir y qué dejó de pedir. null
// si no hay historial suficiente (MIN_ORDERS días distintos).
export function buildCustomerProfile(movements, customerName, { today, products }) {
  const orders = groupAllOrders(movements)
    .filter((o) => o.customerName === customerName && o.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp));
  const days = [...new Set(orders.map((o) => o.date))];
  if (days.length < MIN_ORDERS) return null;

  const intervals = days.slice(1).map((d, i) => businessDaysBetween(days[i], d)).slice(-INTERVALS);
  const lastOrderDate = days[days.length - 1];

  const usable = (code) => {
    const product = products.find((p) => p.code === code);
    return product && !product.archived ? product : null;
  };

  const window = orders.slice(-WINDOW).map(qtyByCode);
  const codes = [...new Set(window.flatMap((m) => Object.keys(m)))];

  // Lo que compraba casi siempre y no apareció en sus últimos 3 pedidos.
  let dropped = [];
  if (window.length >= 5) {
    const older = window.slice(0, -3);
    const recent = window.slice(-3);
    dropped = codes
      .filter((code) => {
        const product = usable(code);
        const inOlder = older.filter((m) => m[code]).length;
        return product && inOlder >= 2 && inOlder / older.length >= TYPICAL_SHARE && recent.every((m) => !m[code]);
      })
      .map((code) => ({ code, short: usable(code).short || usable(code).name }));
  }
  const droppedCodes = new Set(dropped.map((d) => d.code));

  // Lo de siempre: lo que está en la mitad o más de sus pedidos, menos lo que
  // ya dejó de pedir (no se le propone algo que ya no compra).
  const typical = codes
    .filter((code) => !droppedCodes.has(code))
    .map((code) => {
      const product = usable(code);
      const qtys = window.filter((m) => m[code]).map((m) => m[code]);
      return product && qtys.length >= 2 && qtys.length / window.length >= TYPICAL_SHARE
        ? { code, short: product.short || product.name, name: product.name, qty: median(qtys), boughtIn: qtys.length, of: window.length }
        : null;
    })
    .filter(Boolean)
    .sort((x, y) => y.boughtIn - x.boughtIn || y.qty - x.qty);

  return {
    orders: orders.length,
    medianInterval: Math.max(1, median(intervals)),
    lastOrderDate,
    daysSince: businessDaysBetween(lastOrderDate, today),
    typical,
    dropped,
  };
}

// Lo de siempre que de verdad se puede ofrecer hoy: sin lo que no hay en
// stock, y marcando (lacks) lo que no alcanza con la cantidad habitual.
export function availableTypical(profile, stock) {
  if (!profile) return [];
  return profile.typical
    .filter((l) => (stock[l.code] || 0) > 0)
    .map((l) => ({ ...l, stock: stock[l.code] || 0, lacks: (stock[l.code] || 0) < l.qty }));
}

// Clientes a los que ya les toca comprar (pasó su ritmo), para escribirles hoy.
// No entran: quien ya pidió hoy, quien ya tiene un pedido reservado para
// después, quien tiene poca historia, ni quien no tendría nada que ofrecerle
// por falta de stock. Primero el que más se pasó.
export function customersToContact({ movements, products, stock, customers = [], today, limit = 10 }) {
  const orders = groupAllOrders(movements);
  const names = [...new Set(orders.map((o) => o.customerName).filter(Boolean))];

  return names
    .map((name) => {
      if (orders.some((o) => o.customerName === name && o.date > today)) return null;
      const profile = buildCustomerProfile(movements, name, { today, products });
      if (!profile || profile.daysSince <= 0 || profile.daysSince < profile.medianInterval) return null;
      const typical = availableTypical(profile, stock);
      if (typical.length === 0) return null;
      const mine = orders.filter((o) => o.customerName === name && o.date <= today);
      const last = mine[mine.length - 1];
      const registry = findRegistryCustomer(customers, name);
      const lastWithPhone = [...mine].reverse().find((o) => o.customerPhone);
      return {
        customerName: name,
        businessName: (registry && registry.businessName) || last.businessName || "",
        phone: (registry && registry.phone) || (lastWithPhone && lastWithPhone.customerPhone) || "",
        medianInterval: profile.medianInterval,
        daysSince: profile.daysSince,
        overdue: profile.daysSince - profile.medianInterval,
        lastOrderDate: profile.lastOrderDate,
        typical,
        dropped: profile.dropped,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.overdue - a.overdue || a.customerName.localeCompare(b.customerName))
    .slice(0, limit);
}

// Mensaje para el cliente (lo revisa y lo envía la persona, la app no manda
// nada sola): saluda por su primer nombre y le propone lo de siempre.
export function formatReorderMessage(item) {
  const firstName = item.customerName.trim().split(/\s+/)[0];
  return [`Hola ${firstName}, ¿te preparo lo de siempre?`, ...item.typical.map((l) => `${l.qty}x ${l.name}`)].join("\n");
}
