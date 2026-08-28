import { formatDate } from "./dateUtils";
import { formatCUP } from "./money";

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
        confirmed: !!m.confirmed,
        bucket: m.bucket || "hoy",
        orderSeq: m.orderSeq || null,
        date: m.date,
        timestamp: m.timestamp,
        lines: [],
      });
    }
    byId.get(m.orderId).lines.push({ code: m.code, qty: m.qty, unitPrice: m.unitPrice || 0 });
  });
  return Array.from(byId.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function groupOrders(movements, dateStr) {
  return groupAllOrders(movements).filter((order) => order.date === dateStr);
}

// El nombre del negocio es solo para mostrar dentro de la app (fila del
// pedido) -- nunca se manda en el mensaje de WhatsApp, sin importar el
// checkbox "Mostrar negocio en todos los pedidos".
export function formatOrderForWhatsApp(order, products, { senderName, sendSenderName } = {}) {
  const lines = [];
  if (sendSenderName && senderName && senderName.trim()) lines.push(senderName.trim());
  if (order.isDelivery) lines.push("🛺 Domicilio 🛺");
  lines.push(order.customerName);
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
  const pickupInfo = order.isDelivery ? "(Domicilio)" : "(recoger entre 9:00 am y 3:00pm)";
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

  const stockDeltas = {};
  let addedRevenue = 0;
  let addedHl = 0;
  const nextMovements = movements.map((m) => {
    if (!orderIdsToTransition.has(m.orderId)) return m;
    stockDeltas[m.code] = (stockDeltas[m.code] || 0) + m.qty;
    addedRevenue += m.qty * (m.unitPrice || 0);
    addedHl += m.qty * (m.unitHl || 0);
    return { ...m, bucket: "hoy", date: todayCal };
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
