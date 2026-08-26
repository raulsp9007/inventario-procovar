import { describe, it, expect } from "vitest";
import { getCustomerNames, matchCustomerNames, getCustomerSalesTotals } from "./customerHelpers";

const products = [
  { code: "P1500", name: "Parranda 1500ml" },
  { code: "P500", name: "Parranda 500ml" },
];

function venta(overrides = {}) {
  return {
    code: "P1500", type: "venta", qty: 2, date: "2026-08-25",
    unitPrice: 100, bucket: "hoy", customerName: "Cliente A",
    ...overrides,
  };
}

describe("getCustomerNames / matchCustomerNames", () => {
  it("dedupe nombres de cliente", () => {
    const movements = [venta({ customerName: "Ana" }), venta({ customerName: "Ana" }), venta({ customerName: "Beto" })];
    expect(getCustomerNames(movements).sort()).toEqual(["Ana", "Beto"]);
  });

  it("matchCustomerNames filtra sin importar mayúsculas", () => {
    expect(matchCustomerNames(["Ana", "Beto"], "an")).toEqual(["Ana"]);
  });

  it("matchCustomerNames devuelve vacío si la query está vacía", () => {
    expect(matchCustomerNames(["Ana", "Beto"], "  ")).toEqual([]);
  });
});

describe("getCustomerSalesTotals", () => {
  it("excluye 'Venta manual' -- no es un cliente real", () => {
    const movements = [venta({ customerName: "Venta manual" }), venta({ customerName: "Ana" })];
    const totals = getCustomerSalesTotals(movements, products);
    expect(totals.map((t) => t.customerName)).toEqual(["Ana"]);
  });

  it("excluye ventas no comprometidas (manana sin enviar)", () => {
    const movements = [venta({ customerName: "Ana", bucket: "manana", sent: false })];
    expect(getCustomerSalesTotals(movements, products)).toEqual([]);
  });

  it("suma qty/revenue por cliente y calcula su producto favorito", () => {
    const movements = [
      venta({ customerName: "Ana", code: "P1500", qty: 3, unitPrice: 100 }),
      venta({ customerName: "Ana", code: "P500", qty: 1, unitPrice: 50 }),
    ];
    const [ana] = getCustomerSalesTotals(movements, products);
    expect(ana.qty).toBe(4);
    expect(ana.revenue).toBe(350);
    expect(ana.favoriteProductCode).toBe("P1500");
  });

  it("ordena de mayor a menor ingreso", () => {
    const movements = [
      venta({ customerName: "Chico", qty: 1, unitPrice: 100 }),
      venta({ customerName: "Grande", qty: 10, unitPrice: 100 }),
    ];
    const totals = getCustomerSalesTotals(movements, products);
    expect(totals.map((t) => t.customerName)).toEqual(["Grande", "Chico"]);
  });

  it("respeta el rango de fechas", () => {
    const movements = [
      venta({ customerName: "Ana", date: "2026-08-01", qty: 5 }),
      venta({ customerName: "Ana", date: "2026-08-25", qty: 2 }),
    ];
    const totals = getCustomerSalesTotals(movements, products, { start: "2026-08-25", end: "2026-08-25" });
    expect(totals[0].qty).toBe(2);
  });
});
