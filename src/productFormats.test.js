import { describe, it, expect } from "vitest";
import { DEFAULT_PRODUCT_FORMATS, buildInitialProductFormats, getFormat, unitPrice, upsertProductFormat, removeProductFormat } from "./productFormats";

describe("unitPrice", () => {
  it("divide el precio USD y el CUP entre las unidades del formato", () => {
    const u = unitPrice(DEFAULT_PRODUCT_FORMATS, 12, "sixpack", 120);
    expect(u.units).toBe(6);
    expect(u.usd).toBe(2);
    expect(u.cup).toBe(240);
  });

  it("sin tasa, el precio es CUP directo y no hay USD", () => {
    const u = unitPrice(DEFAULT_PRODUCT_FORMATS, 300, "caja24u", null);
    expect(u.usd).toBeNull();
    expect(u.cup).toBe(12.5);
  });

  it("devuelve null sin formato, con formato desconocido o sin precio", () => {
    expect(unitPrice(DEFAULT_PRODUCT_FORMATS, 12, "", 120)).toBeNull();
    expect(unitPrice(DEFAULT_PRODUCT_FORMATS, 12, "otro", 120)).toBeNull();
    expect(unitPrice(DEFAULT_PRODUCT_FORMATS, 0, "sixpack", 120)).toBeNull();
  });

  it("las 7 opciones de siempre traen las unidades pedidas", () => {
    expect(DEFAULT_PRODUCT_FORMATS.map((f) => [f.code, f.units])).toEqual([
      ["sixpack", 6], ["paca12u", 12], ["paca48u", 48], ["saco25kg", 55],
      ["paca10kg", 10], ["caja24u", 24], ["caja12u", 12],
    ]);
    expect(getFormat(DEFAULT_PRODUCT_FORMATS, "saco25kg").units).toBe(55);
  });
});

describe("buildInitialProductFormats", () => {
  it("arranca de la lista de siempre aunque no haya productos", () => {
    expect(buildInitialProductFormats([])).toEqual(DEFAULT_PRODUCT_FORMATS);
  });

  it("agrega el formato de un producto que no esté en la lista de siempre, con 1 unidad", () => {
    const products = [{ code: "P1", name: "Uno", format: "rareza" }];
    const result = buildInitialProductFormats(products);
    expect(result).toHaveLength(DEFAULT_PRODUCT_FORMATS.length + 1);
    expect(result.find((f) => f.code === "rareza")).toEqual({ code: "rareza", units: 1 });
  });

  it("no duplica un formato que un producto ya tiene y que ya está en la lista de siempre", () => {
    const products = [{ code: "P1", name: "Uno", format: "sixpack" }];
    expect(buildInitialProductFormats(products)).toEqual(DEFAULT_PRODUCT_FORMATS);
  });

  it("ignora productos sin formato", () => {
    expect(buildInitialProductFormats([{ code: "P1", name: "Uno" }])).toEqual(DEFAULT_PRODUCT_FORMATS);
  });
});

describe("upsertProductFormat", () => {
  it("agrega un formato nuevo al final", () => {
    const { formats, error } = upsertProductFormat(DEFAULT_PRODUCT_FORMATS, { code: "docena", units: "12" });
    expect(error).toBeNull();
    expect(formats).toHaveLength(DEFAULT_PRODUCT_FORMATS.length + 1);
    expect(formats[formats.length - 1]).toEqual({ code: "docena", units: 12 });
  });

  it("recorta espacios del nombre", () => {
    const { formats } = upsertProductFormat([], { code: "  docena  ", units: 12 });
    expect(formats[0].code).toBe("docena");
  });

  it("mismo nombre ya existente (sin importar mayúsculas) edita las unidades en el lugar, no duplica", () => {
    const start = [{ code: "docena", units: 12 }, { code: "sixpack", units: 6 }];
    const { formats, error } = upsertProductFormat(start, { code: "Docena", units: 13 });
    expect(error).toBeNull();
    expect(formats).toHaveLength(2);
    expect(formats[0]).toEqual({ code: "docena", units: 13 });
  });

  it("rechaza nombre vacío sin tocar la lista", () => {
    const start = [{ code: "sixpack", units: 6 }];
    const { formats, error } = upsertProductFormat(start, { code: "   ", units: 6 });
    expect(error).toMatch(/nombre/i);
    expect(formats).toBe(start);
  });

  it("rechaza unidades no numéricas o menores que 1 sin tocar la lista", () => {
    const start = [{ code: "sixpack", units: 6 }];
    expect(upsertProductFormat(start, { code: "nuevo", units: "" }).error).toMatch(/unidades/i);
    expect(upsertProductFormat(start, { code: "nuevo", units: "0" }).error).toMatch(/unidades/i);
    expect(upsertProductFormat(start, { code: "nuevo", units: "-3" }).error).toMatch(/unidades/i);
    expect(upsertProductFormat(start, { code: "nuevo", units: "abc" }).formats).toBe(start);
  });
});

describe("removeProductFormat", () => {
  const formats = [{ code: "sixpack", units: 6 }, { code: "docena", units: 12 }];

  it("elimina un formato que ningún producto usa", () => {
    const { formats: next, error } = removeProductFormat(formats, "docena", [{ code: "P1", name: "Uno", format: "sixpack" }]);
    expect(error).toBeNull();
    expect(next.map((f) => f.code)).toEqual(["sixpack"]);
  });

  it("no elimina uno que algún producto tiene puesto, y avisa cuál", () => {
    const products = [{ code: "P1", name: "Parranda 1500ml", format: "sixpack" }];
    const { formats: next, error } = removeProductFormat(formats, "sixpack", products);
    expect(next).toBe(formats);
    expect(error).toMatch(/Parranda 1500ml/);
  });

  it("cuenta todos los productos que lo usan, no solo el primero", () => {
    const products = [
      { code: "P1", name: "Uno", format: "sixpack" },
      { code: "P2", name: "Dos", format: "sixpack" },
    ];
    const { error } = removeProductFormat(formats, "sixpack", products);
    expect(error).toMatch(/2 productos/);
    expect(error).toMatch(/Uno, Dos/);
  });
});
