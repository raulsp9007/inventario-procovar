import { describe, it, expect } from "vitest";
import {
  MIN_ORDERS, businessDaysBetween, buildCustomerProfile, availableTypical, customersToContact, formatReorderMessage,
} from "./recommendations";

// Recomendaciones de compra por cliente a partir de su historial: lo que suele
// pedir ("lo de siempre"), cada cuántos días, y a quién le toca ya.
// Hoy fijo: lunes 2026-09-21.

const TODAY = "2026-09-21";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500" },
  { code: "M330", name: "Malta 330ml", short: "M-330" },
  { code: "VODKA", name: "Vodka", short: "Vodka" },
  { code: "OLD", name: "Viejo", short: "Viejo", archived: true },
];

let n = 0;
// Un pedido del cliente en una fecha, con sus líneas [[code, qty], ...].
function order(customerName, date, lines, extra = {}) {
  n += 1;
  return lines.map(([code, qty], i) => ({
    id: `m-${n}-${i}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0, date,
    timestamp: `${date}T10:00:00.000Z`, orderId: `o-${n}`, orderSeq: n, customerName,
    businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true, ...extra,
  }));
}

// Ana pide cada lunes (6 días hábiles entre pedidos, sin contar domingos).
const WEEKLY = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
const anaMovements = [
  ...order("Ana", WEEKLY[0], [["P500", 40], ["M330", 30]]),
  ...order("Ana", WEEKLY[1], [["P500", 40], ["M330", 30]]),
  ...order("Ana", WEEKLY[2], [["P500", 50], ["M330", 30]]),
  ...order("Ana", WEEKLY[3], [["P500", 40], ["VODKA", 6]]),
];

describe("businessDaysBetween", () => {
  it("cuenta los días después de la primera fecha hasta la segunda, sin domingos", () => {
    expect(businessDaysBetween("2026-09-07", "2026-09-08")).toBe(1);
    expect(businessDaysBetween("2026-09-07", "2026-09-14")).toBe(6); // un domingo en medio
    expect(businessDaysBetween("2026-09-07", "2026-09-21")).toBe(12);
  });

  it("la misma fecha es 0 y una fecha anterior también", () => {
    expect(businessDaysBetween("2026-09-07", "2026-09-07")).toBe(0);
    expect(businessDaysBetween("2026-09-08", "2026-09-07")).toBe(0);
  });
});

describe("buildCustomerProfile", () => {
  it("sin suficiente historial no hay perfil", () => {
    expect(MIN_ORDERS).toBe(3);
    const two = [...order("Beto", "2026-09-01", [["P500", 10]]), ...order("Beto", "2026-09-08", [["P500", 10]])];
    expect(buildCustomerProfile(two, "Beto", { today: TODAY, products })).toBeNull();
    expect(buildCustomerProfile([], "Nadie", { today: TODAY, products })).toBeNull();
  });

  it("calcula cada cuántos días pide (mediana, sin domingos) y hace cuánto fue el último", () => {
    const p = buildCustomerProfile(anaMovements, "Ana", { today: TODAY, products });
    expect(p.orders).toBe(4);
    expect(p.medianInterval).toBe(6);
    expect(p.lastOrderDate).toBe("2026-09-07");
    expect(p.daysSince).toBe(12);
  });

  it("lo de siempre: productos que compra en la mitad o más de sus pedidos, con la cantidad habitual", () => {
    const p = buildCustomerProfile(anaMovements, "Ana", { today: TODAY, products });
    expect(p.typical).toEqual([
      { code: "P500", short: "P-500", name: "Parranda 500ml", qty: 40, boughtIn: 4, of: 4 },
      { code: "M330", short: "M-330", name: "Malta 330ml", qty: 30, boughtIn: 3, of: 4 },
    ]);
  });

  it("un producto comprado una sola vez no es 'lo de siempre'", () => {
    const p = buildCustomerProfile(anaMovements, "Ana", { today: TODAY, products });
    expect(p.typical.map((l) => l.code)).not.toContain("VODKA");
  });

  it("solo mira los últimos 6 pedidos", () => {
    const old = ["2026-06-01", "2026-06-08", "2026-06-15"].flatMap((d) => order("Ana", d, [["VODKA", 99]]));
    const recent = order("Ana", "2026-09-14", [["P500", 40], ["M330", 30]]);
    const p = buildCustomerProfile([...old, ...anaMovements, ...recent], "Ana", { today: TODAY, products });
    // Con los 8 pedidos el vodka estaría en la mitad; en los últimos 6 solo en 2.
    expect(p.typical.map((l) => l.code)).toEqual(["P500", "M330"]);
    expect(p.typical[0]).toMatchObject({ boughtIn: 5, of: 6 });
  });

  it("ignora productos archivados o que ya no existen", () => {
    const m = [
      ...order("Ana", "2026-09-01", [["OLD", 5], ["GONE", 5]]),
      ...order("Ana", "2026-09-08", [["OLD", 5], ["GONE", 5]]),
      ...order("Ana", "2026-09-15", [["OLD", 5], ["GONE", 5]]),
    ];
    expect(buildCustomerProfile(m, "Ana", { today: TODAY, products }).typical).toEqual([]);
  });

  it("no cuenta pedidos futuros (reservas de mañana)", () => {
    const m = [...anaMovements, ...order("Ana", "2026-09-22", [["P500", 999]], { bucket: "manana", sent: false })];
    const p = buildCustomerProfile(m, "Ana", { today: TODAY, products });
    expect(p.orders).toBe(4);
    expect(p.lastOrderDate).toBe("2026-09-07");
  });

  it("dos pedidos el mismo día cuentan como un día para el ritmo", () => {
    const m = [
      ...order("Ana", "2026-09-01", [["P500", 10]]),
      ...order("Ana", "2026-09-01", [["M330", 10]]),
      ...order("Ana", "2026-09-08", [["P500", 10]]),
      ...order("Ana", "2026-09-15", [["P500", 10]]),
    ];
    const p = buildCustomerProfile(m, "Ana", { today: TODAY, products });
    expect(p.medianInterval).toBe(6);
  });

  it("avisa de un producto que compraba siempre y dejó de pedir en los últimos 3 pedidos", () => {
    const dates = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
    const m = [
      ...order("Ana", dates[0], [["P500", 40], ["M330", 30]]),
      ...order("Ana", dates[1], [["P500", 40], ["M330", 30]]),
      ...order("Ana", dates[2], [["P500", 40], ["M330", 30]]),
      ...order("Ana", dates[3], [["P500", 40]]),
      ...order("Ana", dates[4], [["P500", 40]]),
      ...order("Ana", dates[5], [["P500", 40]]),
    ];
    const p = buildCustomerProfile(m, "Ana", { today: TODAY, products });
    expect(p.dropped).toEqual([{ code: "M330", short: "M-330" }]);
  });

  it("lo que dejó de pedir ya no se sugiere como 'de siempre'", () => {
    const dates = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
    const m = dates.flatMap((d, i) => order("Ana", d, i < 3 ? [["P500", 40], ["M330", 30]] : [["P500", 40]]));
    const p = buildCustomerProfile(m, "Ana", { today: TODAY, products });
    expect(p.typical.map((l) => l.code)).toEqual(["P500"]);
  });

  it("sin suficientes pedidos no hay 'dejó de pedir'", () => {
    const p = buildCustomerProfile(anaMovements, "Ana", { today: TODAY, products });
    expect(p.dropped).toEqual([]);
  });
});

describe("availableTypical", () => {
  const profile = buildCustomerProfile(anaMovements, "Ana", { today: TODAY, products });

  it("deja fuera lo que no hay en stock", () => {
    const lines = availableTypical(profile, { P500: 100, M330: 0 });
    expect(lines.map((l) => l.code)).toEqual(["P500"]);
  });

  it("marca lo que no alcanza con la cantidad de siempre", () => {
    const lines = availableTypical(profile, { P500: 25, M330: 100 });
    expect(lines.find((l) => l.code === "P500")).toMatchObject({ qty: 40, stock: 25, lacks: true });
    expect(lines.find((l) => l.code === "M330")).toMatchObject({ stock: 100, lacks: false });
  });

  it("sin perfil no hay líneas", () => {
    expect(availableTypical(null, { P500: 100 })).toEqual([]);
  });
});

describe("customersToContact", () => {
  const stock = { P500: 100, M330: 100, VODKA: 100 };
  const customers = [{ id: "c1", name: "Ana", businessName: "Bodega Sol", phone: "5353551234", createdAt: "2026-01-01" }];
  const run = (movements, extra = {}) => customersToContact({ movements, products, stock, customers, today: TODAY, ...extra });

  it("lista a quien ya pasó su ritmo, con negocio, teléfono, días y lo de siempre", () => {
    const [item] = run(anaMovements);
    expect(item).toMatchObject({
      customerName: "Ana", businessName: "Bodega Sol", phone: "5353551234", medianInterval: 6, daysSince: 12, overdue: 6,
    });
    expect(item.typical.map((l) => l.code)).toEqual(["P500", "M330"]);
  });

  it("no lista a quien todavía no le toca", () => {
    expect(run(anaMovements, { today: "2026-09-10" })).toEqual([]);
  });

  it("no lista a quien ya pidió hoy", () => {
    expect(run([...anaMovements, ...order("Ana", TODAY, [["P500", 40]])])).toEqual([]);
  });

  it("no lista a quien ya tiene un pedido reservado para mañana", () => {
    const reserved = order("Ana", "2026-09-22", [["P500", 40]], { bucket: "manana", sent: false });
    expect(run([...anaMovements, ...reserved])).toEqual([]);
  });

  it("no lista a clientes con poca historia", () => {
    const few = [...order("Beto", "2026-09-01", [["P500", 10]]), ...order("Beto", "2026-09-08", [["P500", 10]])];
    expect(run(few)).toEqual([]);
  });

  it("no lista si ya no hay stock de nada de lo que suele pedir", () => {
    expect(run(anaMovements, { stock: { P500: 0, M330: 0 } })).toEqual([]);
  });

  it("ordena primero al que más se pasó", () => {
    const weekly = (name, dates) => dates.flatMap((d) => order(name, d, [["P500", 10]]));
    const items = run([
      ...weekly("Dora", ["2026-08-17", "2026-08-24", "2026-08-31"]),
      ...weekly("Carlos", ["2026-08-03", "2026-08-10", "2026-08-17"]),
    ]);
    expect(items.map((i) => i.customerName)).toEqual(["Carlos", "Dora"]);
    expect(items[0].overdue).toBeGreaterThan(items[1].overdue);
  });

  it("respeta el límite", () => {
    const wk = (name) => [
      ...order(name, "2026-08-10", [["P500", 10]]),
      ...order(name, "2026-08-17", [["P500", 10]]),
      ...order(name, "2026-08-24", [["P500", 10]]),
    ];
    const items = run([...wk("A1"), ...wk("A2"), ...wk("A3")], { limit: 2 });
    expect(items).toHaveLength(2);
  });
});

describe("formatReorderMessage", () => {
  it("saluda por el primer nombre y lista lo de siempre con nombres completos", () => {
    const item = {
      customerName: "Ana López",
      typical: [
        { code: "P500", name: "Parranda 500ml", qty: 40 },
        { code: "M330", name: "Malta 330ml", qty: 30 },
      ],
    };
    expect(formatReorderMessage(item)).toBe([
      "Hola Ana, ¿te preparo lo de siempre?",
      "40x Parranda 500ml",
      "30x Malta 330ml",
    ].join("\n"));
  });
});
