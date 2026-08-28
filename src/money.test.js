import { describe, it, expect } from "vitest";
import { formatCUP, formatUSD, convertToUSD, priceToCUP, revenueInRange, totalRevenueInRange, totalHlSold, getProductSalesTotals } from "./money";

const products = [
  { code: "P1500", name: "Parranda 1500ml", hl: 0.15 },
  { code: "P500", name: "Parranda 500ml", hl: 0.05 },
];

function venta(overrides = {}) {
  return {
    code: "P1500", type: "venta", qty: 2, date: "2026-08-25",
    unitPrice: 100, bucket: "hoy", ...overrides,
  };
}

describe("formatCUP / formatUSD / convertToUSD", () => {
  it("formatea CUP sin decimales cuando son enteros", () => {
    // El separador de miles depende de los datos ICU del entorno (Node de
    // CI puede no traer el locale es-ES completo) -- lo que importa acá es
    // que un entero no arrastre decimales, no el caracter separador exacto.
    expect(formatCUP(1500)).toMatch(/^1[.,]?500 CUP$/);
  });

  it("convierte a USD dividiendo por la tasa", () => {
    expect(convertToUSD(1200, 400)).toBe(3);
  });

  it("devuelve null si no hay tasa de cambio", () => {
    expect(convertToUSD(1200, null)).toBeNull();
    expect(convertToUSD(1200, 0)).toBeNull();
  });

  it("formatUSD siempre con 2 decimales", () => {
    expect(formatUSD(3)).toBe("US$3.00");
  });
});

describe("priceToCUP", () => {
  it("multiplica el precio (USD) por la tasa vigente", () => {
    expect(priceToCUP(10, 400)).toBe(4000);
  });

  it("sin tasa, usa el precio tal cual como CUP directo (compatibilidad con negocios sin tasa configurada)", () => {
    expect(priceToCUP(4000, null)).toBe(4000);
    expect(priceToCUP(4000, 0)).toBe(4000);
  });

  it("el precio en USD no se mueve solo porque cambia la tasa -- cada llamada recalcula el CUP desde el mismo USD fijo", () => {
    const usdPrice = 10;
    expect(priceToCUP(usdPrice, 400)).toBe(4000);
    expect(priceToCUP(usdPrice, 690)).toBe(6900);
    // el "precio" en sí (usdPrice) nunca cambió entre las dos llamadas.
  });

  it("precio vacío/no numérico se trata como 0", () => {
    expect(priceToCUP(undefined, 400)).toBe(0);
    expect(priceToCUP(NaN, 400)).toBe(0);
  });
});

describe("revenueInRange / totalRevenueInRange", () => {
  const movements = [
    venta({ date: "2026-08-20", unitPrice: 100, qty: 2 }),
    venta({ date: "2026-08-25", unitPrice: 100, qty: 3 }),
    venta({ date: "2026-08-30", unitPrice: 100, qty: 5 }),
    venta({ date: "2026-08-25", bucket: "manana", sent: false, qty: 99 }),
    { code: "P1500", type: "ajuste", qty: 50, date: "2026-08-25" },
  ];

  it("suma solo ventas comprometidas dentro del rango de fechas", () => {
    expect(revenueInRange(movements, "P1500", "2026-08-21", "2026-08-29")).toBe(300);
  });

  it("ignora reservas de mañana sin enviar (no comprometidas)", () => {
    expect(revenueInRange(movements, "P1500", "2026-08-25", "2026-08-25")).toBe(300);
  });

  it("ignora movimientos que no son venta", () => {
    expect(totalRevenueInRange(movements, "2026-08-25", "2026-08-25")).toBe(300);
  });

  it("totalRevenueInRange suma todos los productos en el rango", () => {
    expect(totalRevenueInRange(movements, "2026-01-01", "2026-12-31")).toBe(1000);
  });
});

describe("totalHlSold", () => {
  it("usa unitHl del movimiento si está presente", () => {
    const movements = [venta({ unitHl: 0.2, qty: 2 })];
    expect(totalHlSold(movements, products)).toBeCloseTo(0.4);
  });

  it("si no hay unitHl, cae al hl del producto", () => {
    const movements = [venta({ unitHl: undefined, qty: 2, code: "P500" })];
    expect(totalHlSold(movements, products)).toBeCloseTo(0.1);
  });

  it("no cuenta ventas de mañana sin enviar", () => {
    const movements = [venta({ unitHl: 0.2, qty: 2, bucket: "manana", sent: false })];
    expect(totalHlSold(movements, products)).toBe(0);
  });
});

describe("getProductSalesTotals", () => {
  const movements = [
    venta({ code: "P1500", qty: 2, unitPrice: 100, date: "2026-08-20" }),
    venta({ code: "P1500", qty: 3, unitPrice: 100, date: "2026-08-25" }),
    venta({ code: "P500", qty: 1, unitPrice: 50, date: "2026-08-25" }),
    venta({ code: "P1500", qty: 4, unitPrice: 100, bucket: "manana", sent: false, date: "2026-08-25" }),
  ];

  it("agrupa unidades e ingreso por producto, solo comprometido", () => {
    const totals = getProductSalesTotals(movements, products);
    const p1500 = totals.find((r) => r.product.code === "P1500");
    expect(p1500.qty).toBe(5);
    expect(p1500.revenue).toBe(500);
  });

  it("excluye productos sin ventas comprometidas", () => {
    const totals = getProductSalesTotals(
      [venta({ code: "P1500", qty: 4, bucket: "manana", sent: false })],
      products
    );
    expect(totals.find((r) => r.product.code === "P1500")).toBeUndefined();
  });

  it("respeta el rango de fechas [start, end]", () => {
    const totals = getProductSalesTotals(movements, products, { start: "2026-08-25", end: "2026-08-25" });
    const p1500 = totals.find((r) => r.product.code === "P1500");
    expect(p1500.qty).toBe(3);
  });
});
