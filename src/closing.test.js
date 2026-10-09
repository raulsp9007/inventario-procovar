import { describe, it, expect } from "vitest";
import { buildClosingSummary } from "./closing";

// Cierre del día: repaso de lo que falta antes de cerrar -- pedidos sin
// facturar o confirmar, metas, ventas, stock para mañana y respaldo.

const TODAY = "2026-09-21";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", hl: 0.005, inGoals: true },
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", hl: 0.015, inGoals: true },
  { code: "VODKA", name: "Vodka", short: "Vodka", hl: 0.005 },
  { code: "OLD", name: "Viejo", short: "Viejo", archived: true },
];

let n = 0;
function line(orderId, seq, code, qty, extra = {}) {
  n += 1;
  return {
    id: `m-${n}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0.03, date: TODAY,
    timestamp: `${TODAY}T0${seq}:00:00.000Z`, orderId, orderSeq: seq, customerName: `Cliente ${seq}`,
    businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false, ...extra,
  };
}

function summary(overrides = {}) {
  return buildClosingSummary({
    movements: [], products, stock: {}, today: TODAY, dailyBlisterGoal: null, dailyHlGoal: null, hlGoal: null,
    exchangeRate: null, lastBackupAt: null, now: new Date(`${TODAY}T15:00:00`), ...overrides,
  });
}

describe("buildClosingSummary: pedidos", () => {
  const movements = [
    line("a", 1, "P500", 10, { sent: true, confirmed: true }),
    line("b", 2, "P500", 5, { sent: true }),
    line("c", 3, "P1500", 2, { isDelivery: true }),
  ];

  it("cuenta facturados, confirmados y lista los que faltan por facturar", () => {
    const { pedidos } = summary({ movements });
    expect(pedidos.total).toBe(3);
    expect(pedidos.billed).toBe(2);
    expect(pedidos.confirmed).toBe(1);
    expect(pedidos.unconfirmed).toBe(2);
    expect(pedidos.pendingBill).toEqual([{ orderId: "c", orderSeq: 3, customerName: "Cliente 3", isDelivery: true }]);
    expect(pedidos.done).toBe(false);
  });

  it("solo cuenta los pedidos de hoy", () => {
    const { pedidos } = summary({
      movements: [...movements, line("d", 4, "P500", 7, { date: "2026-09-22", bucket: "manana" })],
    });
    expect(pedidos.total).toBe(3);
  });

  it("queda resuelto cuando todo está facturado y confirmado", () => {
    const { pedidos } = summary({ movements: [line("a", 1, "P500", 10, { sent: true, confirmed: true })] });
    expect(pedidos.done).toBe(true);
    expect(pedidos.pendingBill).toEqual([]);
  });

  it("sin pedidos hoy también está resuelto", () => {
    expect(summary().pedidos).toMatchObject({ total: 0, done: true });
  });

  it("los pendientes salen en orden de número de pedido", () => {
    const { pedidos } = summary({ movements: [line("x", 5, "P500", 1), line("y", 2, "P500", 1)] });
    expect(pedidos.pendingBill.map((o) => o.orderSeq)).toEqual([2, 5]);
  });
});

describe("buildClosingSummary: metas", () => {
  const movements = [
    line("a", 1, "P500", 40, { sent: true }),
    line("b", 2, "VODKA", 99, { sent: true }),
    line("c", 3, "P1500", 10),
  ];

  it("con productos marcados cuenta solo los marcados y solo lo facturado", () => {
    const { metas } = summary({ movements, dailyBlisterGoal: 30, dailyHlGoal: 2, hlGoal: 300 });
    expect(metas.blisters).toBe(40);
    expect(metas.hl).toBeCloseTo(40 * 0.03, 6);
    expect(metas.blisterGoal).toBe(30);
    expect(metas.hlGoal).toBe(2);
    expect(metas.monthGoal).toBe(300);
  });

  it("incluye el HL del mes", () => {
    const { metas } = summary({
      movements: [...movements, line("m", 4, "P500", 100, { sent: true, date: "2026-09-02" })],
      hlGoal: 300,
    });
    expect(metas.monthHl).toBeCloseTo((40 + 100) * 0.03, 6);
  });

  it("sin productos marcados no hay blísteres y el HL cuenta todo lo facturado", () => {
    const none = products.map(({ inGoals, ...rest }) => rest);
    const { metas } = summary({ products: none, movements });
    expect(metas.blisters).toBeNull();
    expect(metas.hl).toBeCloseTo((40 + 99) * 0.03, 6);
  });
});

describe("buildClosingSummary: ventas", () => {
  const movements = [
    line("a", 1, "P500", 10, { sent: true }),
    line("b", 2, "P1500", 5, { sent: true }),
    line("c", 3, "P500", 99),
  ];

  it("suma solo lo facturado, en CUP y USD con la tasa", () => {
    const { ventas } = summary({ movements, exchangeRate: 100 });
    expect(ventas).toMatchObject({ revenue: 1500, units: 15, ordersBilled: 2, revenueUsd: 15 });
  });

  it("sin tasa no hay USD", () => {
    expect(summary({ movements }).ventas.revenueUsd).toBeNull();
  });
});

describe("buildClosingSummary: stock para mañana", () => {
  const reserved = (orderId, seq, code, qty, extra = {}) =>
    line(orderId, seq, code, qty, { bucket: "manana", date: "2026-09-22", ...extra });

  it("avisa de los productos cuya reserva de mañana no alcanza con lo que queda", () => {
    const { stock } = summary({
      movements: [reserved("r1", 1, "P1500", 60), reserved("r2", 2, "P500", 10)],
      stock: { P1500: 40, P500: 50 },
    });
    expect(stock.shortages).toEqual([{ code: "P1500", short: "P-1500", stock: 40, reserved: 60, missing: 20 }]);
    expect(stock.done).toBe(false);
  });

  it("suma varias reservas del mismo producto", () => {
    const { stock } = summary({
      movements: [reserved("r1", 1, "P500", 30), reserved("r2", 2, "P500", 30)],
      stock: { P500: 50 },
    });
    expect(stock.shortages[0]).toMatchObject({ reserved: 60, missing: 10 });
  });

  it("las reservas ya facturadas no cuentan (ya descontaron stock)", () => {
    const { stock } = summary({ movements: [reserved("r1", 1, "P500", 80, { sent: true })], stock: { P500: 10 } });
    expect(stock.shortages).toEqual([]);
    expect(stock.done).toBe(true);
  });

  it("sin reservas está resuelto", () => {
    expect(summary({ stock: { P500: 5 } }).stock.done).toBe(true);
  });
});

describe("buildClosingSummary: respaldo", () => {
  it("hecho hoy: resuelto", () => {
    const { respaldo } = summary({ lastBackupAt: `${TODAY}T08:00:00` });
    expect(respaldo).toMatchObject({ doneToday: true, done: true, daysAgo: 0 });
  });

  it("de hace días: pendiente, con cuántos días", () => {
    const { respaldo } = summary({ lastBackupAt: "2026-09-18T08:00:00" });
    expect(respaldo).toMatchObject({ doneToday: false, done: false, daysAgo: 3 });
  });

  it("nunca hecho: pendiente sin días", () => {
    expect(summary().respaldo).toMatchObject({ done: false, daysAgo: null });
  });
});

describe("buildClosingSummary: avance", () => {
  it("cuenta cuántas de las tres cosas por resolver faltan", () => {
    const all = summary({ lastBackupAt: `${TODAY}T08:00:00` });
    expect(all).toMatchObject({ pending: 0, total: 3 });
    const none = summary({
      movements: [line("a", 1, "P500", 1), line("r", 2, "P500", 50, { bucket: "manana", date: "2026-09-22" })],
      stock: { P500: 5 },
    });
    expect(none).toMatchObject({ pending: 3, total: 3 });
  });
});
