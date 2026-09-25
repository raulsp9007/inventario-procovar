import { describe, it, expect } from "vitest";
import { groupAllOrders, formatOrderForWhatsApp, formatOrderForCustomer, isCommittedOrder, isCommittedMovement, reservedForTomorrow, computeScheduledTransition, nextOrderSeq, renumberOpenOrders, isPastCierre, getCierrePending } from "./orderHelpers";

function makeMovement(overrides = {}) {
  return {
    id: "m1", code: "P1500", type: "venta", qty: 2,
    date: "2026-08-25", timestamp: "2026-08-25T10:00:00.000Z",
    unitPrice: 100, unitHl: 0.15,
    orderId: "order-1", orderSeq: 1, customerName: "Cliente A",
    isDelivery: false, note: "", bucket: "hoy",
    ...overrides,
  };
}

describe("isCommittedOrder / isCommittedMovement", () => {
  it("hoy siempre está comprometido, enviado o no", () => {
    expect(isCommittedOrder({ bucket: "hoy", sent: false })).toBe(true);
    expect(isCommittedOrder({ bucket: "hoy", sent: true })).toBe(true);
    expect(isCommittedMovement({ bucket: "hoy", sent: false })).toBe(true);
  });

  it("sin bucket definido se trata como hoy (dato viejo)", () => {
    expect(isCommittedOrder({ sent: false })).toBe(true);
    expect(isCommittedMovement({})).toBe(true);
  });

  it("manana solo está comprometido si sent=true", () => {
    expect(isCommittedOrder({ bucket: "manana", sent: false })).toBe(false);
    expect(isCommittedOrder({ bucket: "manana", sent: undefined })).toBe(false);
    expect(isCommittedOrder({ bucket: "manana", sent: true })).toBe(true);
    expect(isCommittedMovement({ bucket: "manana", sent: true })).toBe(true);
  });
});

describe("reservedForTomorrow", () => {
  const orders = [
    { orderId: "o1", bucket: "manana", sent: false, lines: [{ code: "P1500", qty: 5 }] },
    { orderId: "o2", bucket: "manana", sent: false, lines: [{ code: "P1500", qty: 3 }] },
    { orderId: "o3", bucket: "manana", sent: true, lines: [{ code: "P1500", qty: 10 }] },
    { orderId: "o4", bucket: "hoy", sent: true, lines: [{ code: "P1500", qty: 7 }] },
    { orderId: "o5", bucket: "manana", sent: false, lines: [{ code: "P500", qty: 4 }] },
  ];

  it("suma solo pedidos manana sin enviar del producto pedido", () => {
    expect(reservedForTomorrow(orders, "P1500")).toBe(8);
  });

  it("ignora pedidos ya enviados y pedidos de hoy", () => {
    expect(reservedForTomorrow(orders, "P1500")).not.toBe(18);
  });

  it("excluye el orderId indicado (para no contarse a sí mismo al editar)", () => {
    expect(reservedForTomorrow(orders, "P1500", "o1")).toBe(3);
  });

  it("devuelve 0 si no hay reservas de ese producto", () => {
    expect(reservedForTomorrow(orders, "M330")).toBe(0);
  });
});

describe("groupAllOrders", () => {
  it("agrupa movimientos con el mismo orderId en un solo pedido con lines[]", () => {
    const movements = [
      makeMovement({ id: "m1", code: "P1500", qty: 2 }),
      makeMovement({ id: "m2", code: "P500", qty: 3, timestamp: "2026-08-25T10:00:01.000Z" }),
    ];
    const orders = groupAllOrders(movements);
    expect(orders).toHaveLength(1);
    expect(orders[0].lines).toEqual([
      { code: "P1500", qty: 2, unitPrice: 100 },
      { code: "P500", qty: 3, unitPrice: 100 },
    ]);
    expect(orders[0].customerName).toBe("Cliente A");
  });

  it("ignora movimientos sin orderId (ajustes de stock)", () => {
    const movements = [
      { id: "adj1", code: "P1500", type: "ajuste", qty: 10, date: "2026-08-25", timestamp: "2026-08-25T09:00:00.000Z" },
      makeMovement(),
    ];
    expect(groupAllOrders(movements)).toHaveLength(1);
  });

  it("ordena por timestamp ascendente", () => {
    const movements = [
      makeMovement({ orderId: "order-2", timestamp: "2026-08-25T12:00:00.000Z", customerName: "Segundo" }),
      makeMovement({ orderId: "order-1", timestamp: "2026-08-25T09:00:00.000Z", customerName: "Primero" }),
    ];
    const orders = groupAllOrders(movements);
    expect(orders.map((o) => o.customerName)).toEqual(["Primero", "Segundo"]);
  });

  it("default bucket a 'hoy' si el movimiento no lo trae (dato viejo)", () => {
    const movements = [makeMovement({ bucket: undefined })];
    expect(groupAllOrders(movements)[0].bucket).toBe("hoy");
  });
});

describe("computeScheduledTransition", () => {
  const TODAY = "2026-08-27";

  it("devuelve null si no hay nada programado para transicionar", () => {
    const movements = [makeMovement({ bucket: "hoy" })];
    expect(computeScheduledTransition(movements, TODAY)).toBeNull();
  });

  it("transiciona un programado cuya fecha ya llegó (hoy)", () => {
    const movements = [makeMovement({ bucket: "manana", date: TODAY, sent: false, qty: 3, unitPrice: 100, unitHl: 0.1 })];
    const result = computeScheduledTransition(movements, TODAY);
    expect(result).not.toBeNull();
    expect(result.nextMovements[0].bucket).toBe("hoy");
    expect(result.nextMovements[0].date).toBe(TODAY);
    expect(result.stockDeltas.P1500).toBe(3);
    expect(result.addedRevenue).toBe(300);
    expect(result.addedHl).toBeCloseTo(0.3);
  });

  it("transiciona un programado con fecha atrasada (la app estuvo cerrada varios días)", () => {
    const movements = [makeMovement({ bucket: "manana", date: "2026-08-20", sent: false, qty: 2 })];
    const result = computeScheduledTransition(movements, TODAY);
    expect(result).not.toBeNull();
    expect(result.nextMovements[0].date).toBe(TODAY);
  });

  it("NO transiciona un programado con fecha futura", () => {
    const movements = [makeMovement({ bucket: "manana", date: "2026-09-01", sent: false })];
    expect(computeScheduledTransition(movements, TODAY)).toBeNull();
  });

  it("NO transiciona un programado que ya está enviado (evita descuento doble)", () => {
    const movements = [makeMovement({ bucket: "manana", date: TODAY, sent: true, qty: 5 })];
    expect(computeScheduledTransition(movements, TODAY)).toBeNull();
  });

  it("no toca pedidos que ya son de hoy", () => {
    const movements = [makeMovement({ bucket: "hoy", date: TODAY, sent: false })];
    expect(computeScheduledTransition(movements, TODAY)).toBeNull();
  });

  it("suma stock/ingreso/HL de varias líneas del mismo pedido por producto", () => {
    const orderId = "order-multi";
    const movements = [
      makeMovement({ orderId, bucket: "manana", date: TODAY, sent: false, code: "P1500", qty: 2, unitPrice: 100, unitHl: 0.15 }),
      makeMovement({ orderId, bucket: "manana", date: TODAY, sent: false, code: "P500", qty: 4, unitPrice: 50, unitHl: 0.05 }),
    ];
    const result = computeScheduledTransition(movements, TODAY);
    expect(result.stockDeltas).toEqual({ P1500: 2, P500: 4 });
    expect(result.addedRevenue).toBe(400);
    expect(result.addedHl).toBeCloseTo(0.5);
  });

  it("transiciona varios pedidos distintos a la vez y deja el resto sin tocar", () => {
    const movements = [
      makeMovement({ orderId: "o1", bucket: "manana", date: TODAY, sent: false, code: "P1500", qty: 2 }),
      makeMovement({ orderId: "o2", bucket: "manana", date: "2026-08-25", sent: false, code: "P1500", qty: 3 }),
      makeMovement({ orderId: "o3", bucket: "manana", date: "2026-09-05", sent: false, code: "P1500", qty: 10 }),
      makeMovement({ orderId: "o4", bucket: "hoy", date: TODAY, sent: true, code: "P1500", qty: 1 }),
    ];
    const result = computeScheduledTransition(movements, TODAY);
    expect(result.orderIdsToTransition.has("o1")).toBe(true);
    expect(result.orderIdsToTransition.has("o2")).toBe(true);
    expect(result.orderIdsToTransition.has("o3")).toBe(false);
    expect(result.orderIdsToTransition.has("o4")).toBe(false);
    expect(result.stockDeltas.P1500).toBe(5);
    const untouched = result.nextMovements.find((m) => m.orderId === "o3");
    expect(untouched.bucket).toBe("manana");
    expect(untouched.date).toBe("2026-09-05");
  });

  it("trata bucket sin definir como 'hoy' (dato viejo) y no lo transiciona", () => {
    const movements = [makeMovement({ bucket: undefined, date: "2026-08-01", sent: false })];
    expect(computeScheduledTransition(movements, TODAY)).toBeNull();
  });

  it("al transicionar, el pedido toma el siguiente número del día nuevo", () => {
    const movements = [
      makeMovement({ orderId: "hoy1", bucket: "hoy", date: TODAY, sent: true, orderSeq: 1 }),
      makeMovement({ orderId: "hoy2", bucket: "hoy", date: TODAY, sent: true, orderSeq: 2 }),
      makeMovement({ orderId: "prog", bucket: "manana", date: TODAY, sent: false, orderSeq: 1 }),
    ];
    const result = computeScheduledTransition(movements, TODAY);
    expect(result.nextMovements.find((m) => m.orderId === "prog").orderSeq).toBe(3);
    expect(result.nextMovements.find((m) => m.orderId === "hoy2").orderSeq).toBe(2);
  });

  it("varios programados que transicionan conservan su orden relativo (fecha, luego número)", () => {
    const movements = [
      makeMovement({ orderId: "b", bucket: "manana", date: TODAY, sent: false, orderSeq: 2 }),
      makeMovement({ orderId: "a", bucket: "manana", date: TODAY, sent: false, orderSeq: 1 }),
      makeMovement({ orderId: "viejo", bucket: "manana", date: "2026-08-25", sent: false, orderSeq: 7 }),
    ];
    const result = computeScheduledTransition(movements, TODAY);
    const seqOf = (id) => result.nextMovements.find((m) => m.orderId === id).orderSeq;
    expect(seqOf("viejo")).toBe(1);
    expect(seqOf("a")).toBe(2);
    expect(seqOf("b")).toBe(3);
  });
});

describe("nextOrderSeq", () => {
  it("empieza en 1 si ese día no tiene pedidos numerados", () => {
    expect(nextOrderSeq([], "2026-08-27")).toBe(1);
    expect(nextOrderSeq([makeMovement({ date: "2026-08-26", orderSeq: 9 })], "2026-08-27")).toBe(1);
  });

  it("es el más alto de esa fecha más uno, sin mirar otras fechas", () => {
    const movements = [
      makeMovement({ date: "2026-08-27", orderSeq: 1 }),
      makeMovement({ date: "2026-08-27", orderSeq: 4 }),
      makeMovement({ date: "2026-08-28", orderSeq: 20 }),
    ];
    expect(nextOrderSeq(movements, "2026-08-27")).toBe(5);
    expect(nextOrderSeq(movements, "2026-08-28")).toBe(21);
  });

  it("puede excluir el propio pedido (al editarlo)", () => {
    const movements = [makeMovement({ orderId: "o1", date: "2026-08-27", orderSeq: 3 }), makeMovement({ orderId: "o2", date: "2026-08-27", orderSeq: 2 })];
    expect(nextOrderSeq(movements, "2026-08-27", "o1")).toBe(3);
  });

  it("ignora movimientos sin número (ajustes, datos viejos)", () => {
    expect(nextOrderSeq([makeMovement({ date: "2026-08-27", orderSeq: undefined })], "2026-08-27")).toBe(1);
  });
});

describe("renumberOpenOrders", () => {
  const TODAY = "2026-08-27";

  it("renumera hoy y los días futuros desde 1, por hora de creación", () => {
    const movements = [
      makeMovement({ orderId: "b", date: TODAY, orderSeq: 41, timestamp: "2026-08-27T12:00:00.000Z" }),
      makeMovement({ orderId: "a", date: TODAY, orderSeq: 42, timestamp: "2026-08-27T09:00:00.000Z" }),
      makeMovement({ orderId: "m", date: "2026-08-28", orderSeq: 43, timestamp: "2026-08-26T18:00:00.000Z" }),
      makeMovement({ orderId: "f", date: "2026-08-30", orderSeq: 44, timestamp: "2026-08-26T19:00:00.000Z" }),
    ];
    const next = renumberOpenOrders(movements, TODAY);
    const seqOf = (id) => next.find((m) => m.orderId === id).orderSeq;
    expect(seqOf("a")).toBe(1);
    expect(seqOf("b")).toBe(2);
    expect(seqOf("m")).toBe(1);
    expect(seqOf("f")).toBe(1);
  });

  it("no toca pedidos anteriores a hoy", () => {
    const movements = [makeMovement({ orderId: "old", date: "2026-08-20", orderSeq: 30 })];
    expect(renumberOpenOrders(movements, TODAY)[0].orderSeq).toBe(30);
  });

  it("un pedido con varias líneas recibe el mismo número en todas", () => {
    const movements = [
      makeMovement({ orderId: "x", date: TODAY, orderSeq: 9, code: "P1500", timestamp: "2026-08-27T09:00:00.000Z" }),
      makeMovement({ orderId: "x", date: TODAY, orderSeq: 9, code: "P500", timestamp: "2026-08-27T09:00:00.000Z" }),
    ];
    const next = renumberOpenOrders(movements, TODAY);
    expect(next.map((m) => m.orderSeq)).toEqual([1, 1]);
  });

  it("deja intactos los movimientos sin pedido (ajustes de stock)", () => {
    const adjustment = { id: "adj", type: "ajuste", code: "P1500", qty: 5, date: TODAY, timestamp: "2026-08-27T08:00:00.000Z" };
    expect(renumberOpenOrders([adjustment], TODAY)[0]).toBe(adjustment);
  });
});

describe("formatOrderForWhatsApp", () => {
  const products = [{ code: "P1500", name: "Parranda 1500ml" }];

  it("arma el mensaje con nombre y productos", () => {
    const order = { customerName: "Cliente A", isDelivery: false, note: "", lines: [{ code: "P1500", qty: 2 }] };
    const text = formatOrderForWhatsApp(order, products, {});
    expect(text).toBe("Cliente A\nParranda 1500ml - 2");
  });

  it("agrega marca de domicilio y nota si están presentes", () => {
    const order = { customerName: "Cliente A", isDelivery: true, note: "Sin hielo", lines: [{ code: "P1500", qty: 1 }] };
    const text = formatOrderForWhatsApp(order, products, {});
    expect(text).toBe("🛺 Domicilio 🛺\nCliente A\nSin hielo\nParranda 1500ml - 1");
  });

  it("incluye el negocio (si el pedido tiene uno guardado) justo debajo del cliente", () => {
    const order = { customerName: "Cliente A", businessName: "Bar Cliente A", isDelivery: false, note: "", lines: [{ code: "P1500", qty: 1 }] };
    const text = formatOrderForWhatsApp(order, products, {});
    expect(text).toBe("Cliente A\nBar Cliente A\nParranda 1500ml - 1");
  });

  it("sin negocio guardado, no agrega esa línea", () => {
    const order = { customerName: "Cliente A", businessName: "", isDelivery: false, note: "", lines: [{ code: "P1500", qty: 1 }] };
    const text = formatOrderForWhatsApp(order, products, {});
    expect(text).toBe("Cliente A\nParranda 1500ml - 1");
    expect(formatOrderForWhatsApp({ ...order, businessName: undefined }, products, {})).toBe(text);
    expect(formatOrderForWhatsApp({ ...order, businessName: "   " }, products, {})).toBe(text);
  });

  it("negocio, domicilio, nota y remitente juntos van en el orden: remitente, domicilio, cliente, negocio, nota, productos", () => {
    const order = {
      customerName: "Cliente A", businessName: "Bar Cliente A", isDelivery: true, note: "Sin hielo",
      lines: [{ code: "P1500", qty: 1 }],
    };
    const text = formatOrderForWhatsApp(order, products, { senderName: "Raul", sendSenderName: true });
    expect(text).toBe("Raul\n🛺 Domicilio 🛺\nCliente A\nBar Cliente A\nSin hielo\nParranda 1500ml - 1");
  });

  it("agrega el nombre del remitente solo si sendSenderName está activo", () => {
    const order = { customerName: "Cliente A", isDelivery: false, note: "", lines: [{ code: "P1500", qty: 1 }] };
    const withSender = formatOrderForWhatsApp(order, products, { senderName: "Raul", sendSenderName: true });
    expect(withSender.startsWith("Raul\n")).toBe(true);
    const withoutSender = formatOrderForWhatsApp(order, products, { senderName: "Raul", sendSenderName: false });
    expect(withoutSender.startsWith("Raul")).toBe(false);
  });
});

describe("formatOrderForCustomer", () => {
  const products = [
    { code: "P1500", name: "Parranda 1500ml" },
    { code: "M330", name: "Malta Guajira 330ml" },
  ];

  it("arma el mensaje con fecha, horario de recogida, productos y total -- sin negocio ni remitente", () => {
    const order = {
      date: "2026-08-28", isDelivery: false,
      lines: [{ code: "P1500", qty: 5, unitPrice: 100 }, { code: "M330", qty: 1, unitPrice: 200 }],
    };
    const text = formatOrderForCustomer(order, products);
    expect(text).toBe(
      "Tu pedido para 28 ago 2026: (recoger entre 9:00 am y 3:00pm)\n\n5x Parranda 1500ml\n1x Malta Guajira 330ml\n\nTotal: 700 CUP"
    );
  });

  it("si la fecha cae sábado, la ventana de recogida es más corta (9 a 11)", () => {
    // 2026-08-29 es sábado
    const order = { date: "2026-08-29", isDelivery: false, lines: [{ code: "P1500", qty: 1, unitPrice: 100 }] };
    const text = formatOrderForCustomer(order, products);
    expect(text.startsWith("Tu pedido para 29 ago 2026: (recoger entre 9:00 am y 11am)\n")).toBe(true);
  });

  it("un sábado con domicilio sigue mostrando (Domicilio), no la ventana corta", () => {
    const order = { date: "2026-08-29", isDelivery: true, lines: [{ code: "P1500", qty: 1, unitPrice: 100 }] };
    const text = formatOrderForCustomer(order, products);
    expect(text.startsWith("Tu pedido para 29 ago 2026: (Domicilio)\n")).toBe(true);
  });

  it("si es domicilio, muestra (Domicilio) en vez del horario de recogida", () => {
    const order = { date: "2026-08-28", isDelivery: true, lines: [{ code: "P1500", qty: 1, unitPrice: 100 }] };
    const text = formatOrderForCustomer(order, products);
    expect(text.startsWith("Tu pedido para 28 ago 2026: (Domicilio)\n")).toBe(true);
  });

  it("nunca incluye nombre del negocio, nota, ni remitente", () => {
    const order = {
      date: "2026-08-28", isDelivery: false, businessName: "Bar X", note: "nota interna",
      lines: [{ code: "P1500", qty: 1, unitPrice: 100 }],
    };
    const text = formatOrderForCustomer(order, products);
    expect(text).not.toContain("Bar X");
    expect(text).not.toContain("nota interna");
  });
});

describe("isPastCierre", () => {
  const at = (h, m = 0) => new Date(2026, 8, 21, h, m);

  it("sin hora configurada (null) nunca está pasado el cierre", () => {
    expect(isPastCierre(null, at(23))).toBe(false);
    expect(isPastCierre(undefined, at(23))).toBe(false);
  });

  it("antes de la hora no, desde la hora en punto sí", () => {
    expect(isPastCierre(16, at(15, 59))).toBe(false);
    expect(isPastCierre(16, at(16, 0))).toBe(true);
    expect(isPastCierre(16, at(23, 30))).toBe(true);
  });

  it("la hora 0 (medianoche) cuenta como configurada: siempre pasada", () => {
    expect(isPastCierre(0, at(0, 5))).toBe(true);
  });
});

describe("getCierrePending", () => {
  const TODAY = "2026-08-27";
  const order = (o) => ({ orderId: "x", date: TODAY, bucket: "hoy", manual: false, sentToCustomer: false, sent: false, confirmed: false, ...o });

  it("cuenta cuántos pedidos de hoy les falta cada paso", () => {
    const orders = [
      order({ orderId: "a" }),
      order({ orderId: "b", sentToCustomer: true }),
      order({ orderId: "c", sentToCustomer: true, sent: true }),
      order({ orderId: "d", sentToCustomer: true, sent: true, confirmed: true }),
    ];
    const p = getCierrePending(orders, TODAY);
    expect(p.total).toBe(3);
    expect(p.unsentToCustomer).toBe(1);
    expect(p.unsent).toBe(2);
    expect(p.unconfirmed).toBe(3);
  });

  it("un pedido con todos los pasos hechos no es pendiente", () => {
    const p = getCierrePending([order({ sentToCustomer: true, sent: true, confirmed: true })], TODAY);
    expect(p.total).toBe(0);
  });

  it("ignora ventas manuales, pedidos de otros días y los programados", () => {
    const orders = [
      order({ orderId: "m", manual: true }),
      order({ orderId: "ayer", date: "2026-08-26" }),
      order({ orderId: "prog", bucket: "manana", date: "2026-08-28" }),
    ];
    expect(getCierrePending(orders, TODAY).total).toBe(0);
  });

  it("devuelve los pedidos sin confirmar, que son los que se pueden posponer", () => {
    const orders = [
      order({ orderId: "a" }),
      order({ orderId: "b", sentToCustomer: true, sent: true, confirmed: true }),
      order({ orderId: "c", confirmed: true }),
    ];
    const p = getCierrePending(orders, TODAY);
    expect(p.unconfirmedOrders.map((o) => o.orderId)).toEqual(["a"]);
    expect(p.orders.map((o) => o.orderId).sort()).toEqual(["a", "c"]);
  });
});
