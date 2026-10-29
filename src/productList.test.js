import { describe, it, expect } from "vitest";
import {
  LIST_KIND, LIST_VERSION, LIST_FIELDS, buildProductListExport, parseProductList, planProductImport, normalizeProductName,
} from "./productList";

// Exportar/importar la lista de productos eligiendo qué datos mover: nombre
// (siempre, es la llave), precio USD, cantidad, foto y formato. No toca
// pedidos, clientes ni historial.

const products = [
  { code: "P500", name: "Parranda 500ml", short: "Parranda 500ml", color: "#C77A2E", hl: 0.005, format: "sixpack" },
  { code: "M330", name: "Malta 330ml", short: "Malta 330ml", color: "#274E37", format: "paca12u" },
  { code: "OLD", name: "Viejo", short: "Viejo", color: "#000000", archived: true },
];
const prices = { P500: 12, M330: 9, OLD: 1 };
const stock = { P500: 100, M330: 40, OLD: 5 };
const productFormats = [{ code: "sixpack", units: 6 }, { code: "paca12u", units: 12 }];
const photos = { P500: { type: "image/jpeg", data: "QUJD" } };
const getPhoto = async (code) => photos[code] || null;
const base = { products, prices, stock, productFormats, exchangeRate: 120 };

describe("buildProductListExport", () => {
  it("sin datos opcionales solo lleva los nombres de los productos activos", async () => {
    const out = await buildProductListExport({ ...base, fields: [], getPhoto, now: "2026-10-28T10:00:00.000Z" });
    expect(out.kind).toBe(LIST_KIND);
    expect(out.version).toBe(LIST_VERSION);
    expect(out.exportedAt).toBe("2026-10-28T10:00:00.000Z");
    expect(out.fields).toEqual([]);
    expect(out.products).toEqual([{ nombre: "Parranda 500ml" }, { nombre: "Malta 330ml" }]); // sin el archivado
  });

  it("lleva solo los datos elegidos", async () => {
    const out = await buildProductListExport({ ...base, fields: ["precio", "cantidad"], getPhoto });
    expect(out.fields).toEqual(["precio", "cantidad"]);
    expect(out.products[0]).toEqual({ nombre: "Parranda 500ml", precio: 12, cantidad: 100 });
    expect(out.products[1]).toEqual({ nombre: "Malta 330ml", precio: 9, cantidad: 40 });
    expect(out.formats).toBeUndefined();
  });

  it("el formato va con sus unidades, solo los que usan los productos exportados", async () => {
    const out = await buildProductListExport({ ...base, fields: ["formato"], getPhoto, products: [products[0]] });
    expect(out.products[0].formato).toBe("sixpack");
    expect(out.formats).toEqual([{ code: "sixpack", units: 6 }]);
  });

  it("la foto va incrustada; el producto sin foto no lleva el campo", async () => {
    const out = await buildProductListExport({ ...base, fields: ["foto"], getPhoto });
    expect(out.products[0].foto).toEqual({ type: "image/jpeg", data: "QUJD" });
    expect(out.products[1].foto).toBeUndefined();
  });

  it("sin tasa de conversión no se puede exportar el precio en USD", async () => {
    const out = await buildProductListExport({ ...base, exchangeRate: null, fields: ["precio", "cantidad"], getPhoto });
    expect(out.fields).toEqual(["cantidad"]);
    expect(out.products[0]).toEqual({ nombre: "Parranda 500ml", cantidad: 100 });
  });

  it("ignora campos desconocidos", async () => {
    const out = await buildProductListExport({ ...base, fields: ["cantidad", "magia"], getPhoto });
    expect(out.fields).toEqual(["cantidad"]);
    expect(LIST_FIELDS).toEqual(["precio", "cantidad", "foto", "formato"]);
  });
});

describe("parseProductList", () => {
  const valid = {
    kind: LIST_KIND, version: 1, exportedAt: "2026-10-28T10:00:00.000Z", fields: ["precio", "cantidad"],
    products: [{ nombre: "  Parranda   500ml ", precio: 12.5, cantidad: 3 }, { nombre: "Malta 330ml", precio: "9", cantidad: -4 }],
  };

  it("lee un archivo válido y limpia los datos", () => {
    const parsed = parseProductList(JSON.stringify(valid));
    expect(parsed.fields).toEqual(["precio", "cantidad"]);
    expect(parsed.exportedAt).toBe("2026-10-28T10:00:00.000Z");
    expect(parsed.products[0]).toEqual({ nombre: "Parranda 500ml", precio: 12.5, cantidad: 3 });
    // precio numérico en texto se acepta; cantidad negativa se descarta
    expect(parsed.products[1]).toEqual({ nombre: "Malta 330ml", precio: 9 });
  });

  it("rechaza lo que no es una lista de productos", () => {
    expect(() => parseProductList("no es json")).toThrow("El archivo no es una lista de productos válida.");
    expect(() => parseProductList(JSON.stringify({ products: [] }))).toThrow("Este archivo no es una lista de productos de Procovar.");
    expect(() => parseProductList(JSON.stringify({ ...valid, version: 99 }))).toThrow("Este archivo es de una versión más nueva de la app.");
    expect(() => parseProductList(JSON.stringify({ ...valid, products: [] }))).toThrow("El archivo no trae productos.");
  });

  it("descarta los productos sin nombre y los datos de campos que el archivo no declara", () => {
    const text = JSON.stringify({ ...valid, fields: ["precio"], products: [{ nombre: "" }, { nombre: "A", precio: 2, cantidad: 9 }] });
    const parsed = parseProductList(text);
    expect(parsed.products).toEqual([{ nombre: "A", precio: 2 }]);
  });

  it("acepta solo fotos de imagen", () => {
    const text = JSON.stringify({ ...valid, fields: ["foto"], products: [
      { nombre: "A", foto: { type: "image/png", data: "QUJD" } },
      { nombre: "B", foto: { type: "text/html", data: "QUJD" } },
    ] });
    const parsed = parseProductList(text);
    expect(parsed.products[0].foto).toEqual({ type: "image/png", data: "QUJD" });
    expect(parsed.products[1].foto).toBeUndefined();
  });
});

describe("normalizeProductName", () => {
  it("ignora mayúsculas, tildes y espacios repetidos", () => {
    expect(normalizeProductName("  PARRANDA   500ML ")).toBe(normalizeProductName("parranda 500ml"));
    expect(normalizeProductName("Malta Guajíra")).toBe(normalizeProductName("malta guajira"));
  });
});

describe("planProductImport", () => {
  const parsed = {
    fields: ["precio", "cantidad", "foto", "formato"],
    formats: [{ code: "caja24u", units: 24 }, { code: "sixpack", units: 6 }],
    products: [
      { nombre: "PARRANDA 500ML", precio: 15, cantidad: 30, formato: "caja24u", foto: { type: "image/jpeg", data: "QUJD" } },
      { nombre: "Cerveza Nueva", precio: 20, cantidad: 8, formato: "sixpack" },
    ],
  };
  const run = (opts = {}) => planProductImport({
    ...base, parsed, fields: ["precio", "cantidad", "foto", "formato"], existing: "actualizar", qty: "reemplazar", ...opts,
  });

  it("separa nuevos y existentes (por nombre, sin importar mayúsculas)", () => {
    const plan = run();
    expect(plan.rows.map((r) => [r.name, r.status])).toEqual([["PARRANDA 500ML", "actualiza"], ["Cerveza Nueva", "nuevo"]]);
    expect(plan.counts).toEqual({ nuevos: 1, actualizan: 1, iguales: 0, existentes: 0 });
  });

  it("actualiza un existente solo en los datos elegidos", () => {
    const plan = run({ fields: ["precio"] });
    const row = plan.rows[0];
    expect(row.changes).toEqual([{ field: "precio", from: 12, to: 15 }]);
    expect(plan.nextPrices.P500).toBe(15);
    expect(plan.nextStock.P500).toBe(100); // cantidad no elegida: no se toca
    expect(plan.stockDiffs).toEqual([]);
    expect(plan.photos).toEqual([]);
  });

  it("cantidad 'reemplazar': el stock queda como el archivo y se anota el ajuste", () => {
    const plan = run({ fields: ["cantidad"], qty: "reemplazar" });
    expect(plan.nextStock.P500).toBe(30);
    expect(plan.rows[0].changes).toEqual([{ field: "cantidad", from: 100, to: 30 }]);
    expect(plan.stockDiffs).toContainEqual({ code: "P500", diff: -70 });
  });

  it("cantidad 'sumar': se suma al stock actual", () => {
    const plan = run({ fields: ["cantidad"], qty: "sumar" });
    expect(plan.nextStock.P500).toBe(130);
    expect(plan.rows[0].changes).toEqual([{ field: "cantidad", from: 100, to: 130 }]);
    expect(plan.stockDiffs).toContainEqual({ code: "P500", diff: 30 });
  });

  it("modo 'solo nuevos': los existentes no se tocan", () => {
    const plan = run({ existing: "nuevos" });
    expect(plan.rows[0].status).toBe("existe");
    expect(plan.rows[0].changes).toEqual([]);
    expect(plan.nextPrices.P500).toBe(12);
    expect(plan.nextStock.P500).toBe(100);
    expect(plan.counts).toEqual({ nuevos: 1, actualizan: 0, iguales: 0, existentes: 1 });
  });

  it("un existente sin diferencias queda como 'igual'", () => {
    const same = { ...parsed, fields: ["precio"], products: [{ nombre: "Parranda 500ml", precio: 12 }] };
    const plan = planProductImport({ ...base, parsed: same, fields: ["precio"], existing: "actualizar", qty: "reemplazar" });
    expect(plan.rows[0].status).toBe("igual");
    expect(plan.counts.iguales).toBe(1);
  });

  it("crea el producto nuevo con código, color y los datos elegidos", () => {
    const plan = run();
    const created = plan.nextProducts.find((p) => p.name === "Cerveza Nueva");
    expect(created).toMatchObject({ code: "CERVEZANUEVA", name: "Cerveza Nueva", short: "Cerveza Nueva", format: "sixpack" });
    expect(created.color).toBeTruthy();
    expect(plan.nextPrices.CERVEZANUEVA).toBe(20);
    expect(plan.nextStock.CERVEZANUEVA).toBe(8);
    expect(plan.stockDiffs).toContainEqual({ code: "CERVEZANUEVA", diff: 8 });
  });

  it("un nuevo sin datos elegidos queda en 0 y sin formato", () => {
    const plan = run({ fields: [] });
    const created = plan.nextProducts.find((p) => p.name === "Cerveza Nueva");
    expect(created.format).toBeUndefined();
    expect(plan.nextPrices[created.code]).toBe(0);
    expect(plan.nextStock[created.code]).toBe(0);
  });

  it("formato: cambia el del existente y agrega el formato nuevo con sus unidades", () => {
    const plan = run({ fields: ["formato"] });
    expect(plan.nextProducts.find((p) => p.code === "P500").format).toBe("caja24u");
    expect(plan.nextFormats).toContainEqual({ code: "caja24u", units: 24 });
    expect(plan.rows[0].changes).toEqual([{ field: "formato", from: "sixpack", to: "caja24u" }]);
  });

  it("formato desconocido y sin unidades en el archivo: se omite y avisa", () => {
    const odd = { ...parsed, formats: [], products: [{ nombre: "Parranda 500ml", formato: "rarisimo" }] };
    const plan = planProductImport({ ...base, parsed: odd, fields: ["formato"], existing: "actualizar", qty: "reemplazar" });
    expect(plan.nextProducts.find((p) => p.code === "P500").format).toBe("sixpack");
    expect(plan.warnings.join(" ")).toMatch(/rarisimo/);
  });

  it("fotos: lista las que se van a guardar con el código final", () => {
    const plan = run({ fields: ["foto"] });
    expect(plan.photos).toEqual([{ code: "P500", type: "image/jpeg", data: "QUJD" }]);
    expect(plan.rows[0].changes).toEqual([{ field: "foto" }]);
  });

  it("sin tasa de conversión el precio no se importa", () => {
    const plan = planProductImport({ ...base, exchangeRate: 0, parsed, fields: ["precio", "cantidad"], existing: "actualizar", qty: "reemplazar" });
    expect(plan.nextPrices.P500).toBe(12);
    expect(plan.rows[0].changes.map((c) => c.field)).toEqual(["cantidad"]);
  });

  it("nombres repetidos en el archivo: vale el primero y avisa", () => {
    const dup = { ...parsed, products: [parsed.products[1], { ...parsed.products[1], precio: 99 }] };
    const plan = planProductImport({ ...base, parsed: dup, fields: ["precio"], existing: "actualizar", qty: "reemplazar" });
    expect(plan.rows).toHaveLength(1);
    expect(plan.nextPrices.CERVEZANUEVA).toBe(20);
    expect(plan.warnings.join(" ")).toMatch(/repetido/i);
  });

  it("dos nuevos con el mismo código base reciben códigos distintos", () => {
    const twin = { ...parsed, products: [{ nombre: "Agua Sola" }, { nombre: "Agua-Sola" }] };
    const plan = planProductImport({ ...base, parsed: twin, fields: [], existing: "actualizar", qty: "reemplazar" });
    const codes = plan.nextProducts.slice(-2).map((p) => p.code);
    expect(new Set(codes).size).toBe(2);
  });

  it("avisa que los productos nuevos quedan sin HL", () => {
    expect(run().warnings.join(" ")).toMatch(/HL/);
  });

  it("no modifica los datos de entrada", () => {
    const snapshot = JSON.stringify({ products, prices, stock, productFormats });
    run();
    expect(JSON.stringify({ products, prices, stock, productFormats })).toBe(snapshot);
  });

  it("los archivados no cuentan como existentes", () => {
    const arch = { ...parsed, products: [{ nombre: "Viejo", precio: 3 }] };
    const plan = planProductImport({ ...base, parsed: arch, fields: ["precio"], existing: "actualizar", qty: "reemplazar" });
    expect(plan.rows[0].status).toBe("nuevo");
    expect(plan.nextPrices.OLD).toBe(1);
  });
});
