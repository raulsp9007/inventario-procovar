import { describe, it, expect } from "vitest";
import { getHlBackfill, isHlBackfillable } from "./hlBackfill";

const venta = (over) => ({ id: Math.random().toString(36), type: "venta", code: "P1500", qty: 10, unitHl: 0, bucket: "hoy", ...over });

describe("getHlBackfill", () => {
  const products = [{ code: "P1500", hl: 0.15 }, { code: "M330" }];

  it("suma solo lo comprometido y solo las ventas con unitHl en 0", () => {
    const movements = [
      venta({ qty: 10 }),
      venta({ qty: 5, unitHl: null }),
      venta({ qty: 4, unitHl: 0.15 }),
      venta({ qty: 3, code: "M330" }),
      venta({ qty: 7, bucket: "manana", sent: false }),
    ];
    const info = getHlBackfill(movements, products, "P1500");
    expect(info.count).toBe(3);
    expect(info.units).toBe(15);
    expect(info.hlAdded).toBe(2.25);
    expect(info.hl).toBe(0.15);
  });

  it("null si el producto no tiene HL guardado", () => {
    expect(getHlBackfill([venta({ code: "M330" })], products, "M330")).toBeNull();
  });

  it("null si no hay ventas por rellenar", () => {
    expect(getHlBackfill([venta({ unitHl: 0.15 })], products, "P1500")).toBeNull();
  });

  it("una corrección (qty negativa) resta HL", () => {
    const info = getHlBackfill([venta({ qty: 10 }), venta({ qty: -2 })], products, "P1500");
    expect(info.units).toBe(8);
    expect(info.hlAdded).toBe(1.2);
  });

  it("isHlBackfillable ignora ajustes de stock", () => {
    expect(isHlBackfillable({ code: "P1500", type: "ajuste", qty: 5 }, "P1500")).toBe(false);
  });
});
