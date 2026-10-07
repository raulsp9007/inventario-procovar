import { describe, it, expect } from "vitest";
import { isGoalProduct, goalTotals, monthHl, defaultGoalProductCodes, applyDefaultGoalProducts } from "./goals";

// Metas de venta de cerveza y malta: solo cuentan los productos marcados
// (inGoals). Un blíster es un sixpack = una unidad vendida de esos productos.

const products = [
  { code: "P500", name: "Parranda 500ml", hl: 0.005, format: "Sixpack", inGoals: true },
  { code: "M1500", name: "Malta 1500ml", hl: 0.015, format: "Sixpack", inGoals: true },
  { code: "VODKA", name: "Vodka", hl: 0.005, format: "Sixpack" },
  { code: "ACEITE900ML", name: "Aceite", hl: 0.009, format: "Caja20u" },
  { code: "ARROZ", name: "Arroz" },
];

function sale(code, qty, extra = {}) {
  return { id: `${code}-${qty}`, code, type: "venta", qty, ...extra };
}

describe("isGoalProduct", () => {
  it("solo es de las metas si está marcado", () => {
    expect(isGoalProduct(products[0])).toBe(true);
    expect(isGoalProduct(products[2])).toBe(false);
    expect(isGoalProduct({})).toBe(false);
    expect(isGoalProduct(undefined)).toBe(false);
  });
});

describe("goalTotals", () => {
  it("suma blísteres y HL solo de los productos marcados", () => {
    const totals = goalTotals([
      sale("P500", 30, { unitHl: 0.005 }),
      sale("M1500", 10, { unitHl: 0.015 }),
      sale("VODKA", 99, { unitHl: 0.005 }),
      sale("ACEITE900ML", 50, { unitHl: 0.009 }),
    ], products);
    expect(totals.blisters).toBe(40);
    expect(totals.hl).toBeCloseTo(30 * 0.005 + 10 * 0.015, 6);
  });

  it("usa el HL del producto cuando la venta no lo guardó", () => {
    expect(goalTotals([sale("M1500", 10)], products).hl).toBeCloseTo(0.15, 6);
  });

  it("ignora lo que no es venta (ajustes de stock)", () => {
    const adjustment = { id: "a", code: "P500", type: "ajuste", qty: 500 };
    expect(goalTotals([adjustment, sale("P500", 3, { unitHl: 0.005 })], products).blisters).toBe(3);
  });

  it("sin ventas o sin productos marcados da cero", () => {
    expect(goalTotals([], products)).toEqual({ blisters: 0, hl: 0 });
    expect(goalTotals([sale("VODKA", 5)], products)).toEqual({ blisters: 0, hl: 0 });
  });
});

describe("defaultGoalProductCodes (migración)", () => {
  const legacy = [
    { code: "P1500", format: "Sixpack" },
    { code: "P500", format: "Sixpack" },
    { code: "M330", format: "Sixpack" },
    { code: "M1500", format: "sixpack" },
    { code: "VODKA", format: "Sixpack" },
    { code: "PAPELLIRIO", format: "Paca48u" },
    { code: "PAPELMANATI", format: null },
    { code: "P330", format: "Caja24u" },
    { code: "MARGARINA" },
    { code: "REFRESCOCOLA", format: "Caja24u" },
  ];

  it("marca los P o M seguidos de un número que vienen en Sixpack", () => {
    expect(defaultGoalProductCodes(legacy).sort()).toEqual(["M1500", "M330", "P1500", "P500"]);
  });

  it("no marca productos archivados", () => {
    expect(defaultGoalProductCodes([{ code: "P500", format: "Sixpack", archived: true }])).toEqual([]);
  });

  it("applyDefaultGoalProducts devuelve los productos con inGoals solo en esos", () => {
    const result = applyDefaultGoalProducts(legacy);
    expect(result.filter((p) => p.inGoals).map((p) => p.code).sort()).toEqual(["M1500", "M330", "P1500", "P500"]);
    expect(result.find((p) => p.code === "VODKA").inGoals).toBeUndefined();
  });
});

describe("monthHl (meta general del mes)", () => {
  const today = "2026-09-21";
  const sold = (code, qty, date, extra = {}) => ({ id: `${code}-${date}-${qty}`, code, type: "venta", qty, unitHl: 0.01, date, bucket: "hoy", sent: true, ...extra });

  it("suma el HL del 1 del mes hasta hoy, solo de los productos marcados", () => {
    const hl = monthHl([
      sold("P500", 10, "2026-09-01"),
      sold("P500", 10, "2026-09-15"),
      sold("M1500", 5, today),
      sold("VODKA", 100, today),
    ], products, today);
    expect(hl).toBeCloseTo(0.25, 6); // 25 unidades x 0.01
  });

  it("no cuenta el mes anterior ni fechas futuras", () => {
    const hl = monthHl([
      sold("P500", 100, "2026-08-31"),
      sold("P500", 10, today),
      sold("P500", 100, "2026-09-22"),
    ], products, today);
    expect(hl).toBeCloseTo(0.1, 6);
  });

  it("solo cuenta lo ya enviado (Facturado), igual que el día", () => {
    const hl = monthHl([
      sold("P500", 10, today),
      sold("P500", 40, today, { sent: false }),
    ], products, today);
    expect(hl).toBeCloseTo(0.1, 6);
  });

  it("una corrección (cantidad negativa) resta", () => {
    expect(monthHl([sold("P500", 10, today), sold("P500", -4, today)], products, today)).toBeCloseTo(0.06, 6);
  });

  it("sin productos marcados cuenta todo lo que tenga HL, como el resumen de hoy", () => {
    const none = products.map(({ inGoals, ...rest }) => rest);
    expect(monthHl([sold("P500", 10, today), sold("VODKA", 10, today)], none, today)).toBeCloseTo(0.2, 6);
  });

  it("sin ventas da cero", () => {
    expect(monthHl([], products, today)).toBe(0);
  });
});
