import { describe, it, expect } from "vitest";
import { groupAllOrders, formatOrderForWhatsApp, formatOrderForCustomer, isCommittedOrder, isCommittedMovement, reservedForTomorrow, computeScheduledTransition } from "./orderHelpers";

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

  it("nunca manda el nombre del negocio en el mensaje, aunque el pedido tenga uno guardado (es solo para mostrar en la app)", () => {
    const order = { customerName: "Cliente A", businessName: "Bar Cliente A", isDelivery: false, note: "", lines: [{ code: "P1500", qty: 1 }] };
    const text = formatOrderForWhatsApp(order, products, {});
    expect(text).toBe("Cliente A\nParranda 1500ml - 1");
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
