import { formatDate } from "./dateUtils";
import { formatCUP } from "./money";
import { customerLabel, businessLabel } from "./nameLabels";

export function groupAllOrders(movements) {
  const orderMovements = movements.filter((m) => m.orderId);
  const byId = new Map();
  orderMovements.forEach((m) => {
    if (!byId.has(m.orderId)) {
      byId.set(m.orderId, {
        orderId: m.orderId,
        customerName: m.customerName,
        businessName: m.businessName || "",
        customerPhone: m.customerPhone || "",
        isDelivery: !!m.isDelivery,
        note: m.note || "",
        sent: !!m.sent,
        sentAt: m.sentAt || null,
        sentToCustomer: !!m.sentToCustomer,
        confirmed: !!m.confirmed,
        bucket: m.bucket || "hoy",
        orderSeq: m.orderSeq || null,
        manual: !!m.manual,
        date: m.date,
        timestamp: m.timestamp,
        lines: [],
      });
    }
    byId.get(m.orderId).lines.push({ code: m.code, qty: m.qty, unitPrice: m.unitPrice || 0 });
  });
  return Array.from(byId.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// El número de pedido (#N) se reinicia cada día: es el más alto de esa
// fecha + 1. Hoy, mañana y cada día programado arrancan en #1. Al borrar un
// pedido los demás no se renumeran (un número no cambia de dueño), y un
// pedido que cambia de día toma el siguiente número del día nuevo.
export function nextOrderSeq(movements, date, excludeOrderId = null) {
  let max = 0;
  movements.forEach((m) => {
    if (m.date !== date || !m.orderSeq || m.orderId === excludeOrderId) return;
    if (m.orderSeq > max) max = m.orderSeq;
  });
  return max + 1;
}

// Migración única del esquema global (#1, #2, ... sin fin) al reinicio
// diario: renumera desde 1 los pedidos de hoy y de los días futuros, en
// orden de creación. Los anteriores a hoy conservan su número.
export function renumberOpenOrders(movements, todayCal) {
  const meta = new Map();
  movements.forEach((m) => {
    if (!m.orderId || !m.date || m.date < todayCal) return;
    const ts = m.timestamp || "";
    const current = meta.get(m.orderId);
    if (!current) {
      meta.set(m.orderId, { date: m.date, ts, seq: m.orderSeq || 0 });
    } else if (ts < current.ts) {
      current.ts = ts;
    }
  });
  const newSeq = new Map();
  const byDate = new Map();
  meta.forEach((info, orderId) => {
    if (!byDate.has(info.date)) byDate.set(info.date, []);
    byDate.get(info.date).push([orderId, info]);
  });
  byDate.forEach((entries) => {
    entries
      .sort((a, b) => a[1].ts.localeCompare(b[1].ts) || a[1].seq - b[1].seq || a[0].localeCompare(b[0]))
      .forEach(([orderId], i) => newSeq.set(orderId, i + 1));
  });
  return movements.map((m) => (newSeq.has(m.orderId) ? { ...m, orderSeq: newSeq.get(m.orderId) } : m));
}

// Cierre de ventas: pasada esa hora ya no se capturan pedidos para hoy (los
// nuevos van para mañana) y se avisa de lo que quedó sin cerrar. `hour` es el
// ajuste cierreVentasHour (0-23), o null si está desactivado.
export function isPastCierre(hour, now = new Date()) {
  return hour != null && now.getHours() >= hour;
}

// Pedidos de hoy que quedaron sin cerrar: a los que les falta algún paso
// (enviar al cliente, facturar, confirmar). Las ventas manuales no cuentan
// (son un conteo, no un pedido con pasos) ni los programados. `unconfirmedOrders`
// son los que se pueden posponer para mañana o eliminar desde el aviso.
export function getCierrePending(orders, todayCal) {
  const pending = orders.filter((o) => (
    o.date === todayCal && o.bucket === "hoy" && !o.manual && !(o.sentToCustomer && o.sent && o.confirmed)
  ));
  return {
    total: pending.length,
    unsentToCustomer: pending.filter((o) => !o.sentToCustomer).length,
    unsent: pending.filter((o) => !o.sent).length,
    unconfirmed: pending.filter((o) => !o.confirmed).length,
    orders: pending,
    unconfirmedOrders: pending.filter((o) => !o.confirmed),
  };
}

export function groupOrders(movements, dateStr) {
  return groupAllOrders(movements).filter((order) => order.date === dateStr);
}

// Mensaje al facturador (contacto de negocio configurado en Config): lleva
// el negocio del cliente si está guardado, justo debajo de su nombre --
// ayuda a identificar el pedido cuando el cliente compra a nombre de un
// local. Independiente del checkbox "Mostrar negocio en Pedidos" (ese solo
// controla la fila del pedido dentro de la app). El mensaje AL CLIENTE
// (formatOrderForCustomer) no lleva esto -- no tiene sentido decirle a él
// mismo el nombre de su propio negocio.
export function formatOrderForWhatsApp(order, products, { senderName, sendSenderName } = {}) {
  const lines = [];
  if (sendSenderName && senderName && senderName.trim()) lines.push(senderName.trim());
  if (order.isDelivery) lines.push("🛺 Domicilio 🛺");
  lines.push(customerLabel(order.customerName));
  const business = businessLabel(order.businessName);
  if (business) lines.push(business);
  if (order.note && order.note.trim()) lines.push(order.note.trim());
  order.lines.forEach((line) => {
    const product = products.find((p) => p.code === line.code);
    lines.push(`${product ? product.name : line.code} - ${line.qty}`);
  });
  return lines.join("\n");
}

// Copia del pedido para mandarle directo al cliente (a su propio teléfono,
// no al contacto de negocio configurado) -- a propósito NO lleva nombre del
// negocio, remitente ni nota interna: solo lo que el cliente necesita ver
// para confirmar qué compró, cuándo pasa a buscarlo (o si es domicilio) y
// cuánto paga.
export function formatOrderForCustomer(order, products) {
  const total = order.lines.reduce((sum, l) => sum + l.qty * (l.unitPrice || 0), 0);
  // Los sábados el local cierra temprano -- la ventana de recogida es más
  // corta. getDay() 6 = sábado.
  const isSaturday = new Date(order.date + "T00:00:00").getDay() === 6;
  const pickupWindow = isSaturday ? "(recoger entre 9:00 am y 11am)" : "(recoger entre 9:00 am y 3:00pm)";
  const pickupInfo = order.isDelivery ? "(Domicilio)" : pickupWindow;
  const lines = [`Tu pedido para ${formatDate(order.date)}: ${pickupInfo}`, ""];
  order.lines.forEach((line) => {
    const product = products.find((p) => p.code === line.code);
    lines.push(`${line.qty}x ${product ? product.name : line.code}`);
  });
  lines.push("", `Total: ${formatCUP(total)}`);
  return lines.join("\n");
}

// "Comprometido" = ya afecta stock/ingreso/HL. Hoy siempre; Mañana solo si
// ya se marcó Enviado (o se envió por WhatsApp, que también marca Enviado).
export function isCommittedOrder(order) {
  const bucket = order.bucket || "hoy";
  return bucket === "hoy" || (bucket === "manana" && !!order.sent);
}

export function isCommittedMovement(m) {
  const bucket = m.bucket || "hoy";
  return bucket === "hoy" || (bucket === "manana" && !!m.sent);
}

// Pedidos programados (bucket "manana") sin enviar cuya fecha ya llegó (o
// pasó) deben pasar a "hoy" solos -- devuelve todo lo necesario para
// aplicar el cambio (nuevos movimientos + cuánto sumar a stock/ingreso/HL),
// pero no toca nada por sí misma: pura, para poder testearla sin React.
// null si no hay nada que transicionar.
export function computeScheduledTransition(movements, todayCal) {
  const orderIdsToTransition = new Set(
    movements
      .filter((m) => m.orderId && (m.bucket || "hoy") === "manana" && !m.sent && m.date <= todayCal)
      .map((m) => m.orderId)
  );
  if (orderIdsToTransition.size === 0) return null;

  // Cambian de día, así que toman los siguientes números de hoy -- los que
  // vienen de un día más viejo primero, y dentro del mismo día por su número.
  const meta = new Map();
  movements.forEach((m) => {
    if (!orderIdsToTransition.has(m.orderId) || meta.has(m.orderId)) return;
    meta.set(m.orderId, { date: m.date, seq: m.orderSeq || 0, ts: m.timestamp || "" });
  });
  const firstSeq = nextOrderSeq(movements.filter((m) => !orderIdsToTransition.has(m.orderId)), todayCal);
  const newSeq = new Map(
    Array.from(meta.entries())
      .sort((a, b) => a[1].date.localeCompare(b[1].date) || a[1].seq - b[1].seq || a[1].ts.localeCompare(b[1].ts))
      .map(([orderId], i) => [orderId, firstSeq + i])
  );

  const stockDeltas = {};
  let addedRevenue = 0;
  let addedHl = 0;
  const nextMovements = movements.map((m) => {
    if (!orderIdsToTransition.has(m.orderId)) return m;
    stockDeltas[m.code] = (stockDeltas[m.code] || 0) + m.qty;
    addedRevenue += m.qty * (m.unitPrice || 0);
    addedHl += m.qty * (m.unitHl || 0);
    return { ...m, bucket: "hoy", date: todayCal, orderSeq: newSeq.get(m.orderId) };
  });

  return { orderIdsToTransition, nextMovements, stockDeltas, addedRevenue, addedHl };
}

// Unidades ya reservadas en pedidos de mañana sin enviar (no descuentan
// stock todavía, pero igual comprometen disponibilidad futura). Se excluye
// opcionalmente un pedido (el que se está editando) para no contarse a sí mismo.
export function reservedForTomorrow(orders, code, excludeOrderId = null) {
  return orders
    .filter((o) => o.bucket === "manana" && !o.sent && o.orderId !== excludeOrderId)
    .reduce((sum, o) => {
      const line = o.lines.find((l) => l.code === code);
      return sum + (line ? line.qty : 0);
    }, 0);
}
