import { describe, it, expect } from "vitest";
import { FORMAT_OPTIONS, getFormat, unitPrice } from "./productFormats";

describe("unitPrice", () => {
  it("divide el precio USD y el CUP entre las unidades del formato", () => {
    const u = unitPrice(12, "sixpack", 120);
    expect(u.units).toBe(6);
    expect(u.usd).toBe(2);
    expect(u.cup).toBe(240);
  });

  it("sin tasa, el precio es CUP directo y no hay USD", () => {
    const u = unitPrice(300, "caja24u", null);
    expect(u.usd).toBeNull();
    expect(u.cup).toBe(12.5);
  });

  it("devuelve null sin formato, con formato desconocido o sin precio", () => {
    expect(unitPrice(12, "", 120)).toBeNull();
    expect(unitPrice(12, "otro", 120)).toBeNull();
    expect(unitPrice(0, "sixpack", 120)).toBeNull();
  });

  it("las 7 opciones traen las unidades pedidas", () => {
    expect(FORMAT_OPTIONS.map((f) => [f.code, f.units])).toEqual([
      ["sixpack", 6], ["paca12u", 12], ["paca48u", 48], ["saco25kg", 55],
      ["paca10kg", 10], ["caja24u", 24], ["caja12u", 12],
    ]);
    expect(getFormat("saco25kg").units).toBe(55);
  });
});
