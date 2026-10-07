import { describe, it, expect } from "vitest";
import { formatUnits, hlPerFormat, migrateHlToFormat } from "./hl";

// "HL por unidad" de un producto es el de UNA unidad (una botella). Lo que se
// vende y se cuenta es el formato completo (un sixpack = 6 unidades), así que
// el HL de cada venta es cantidad x HL de la unidad x unidades del formato.

const formats = [{ code: "Sixpack", units: 6 }, { code: "Caja24u", units: 24 }];
const p500 = { code: "P500", hl: 0.005, format: "Sixpack" };

describe("formatUnits / hlPerFormat", () => {
  it("unidades del formato del producto, 1 si no tiene formato o ya no existe", () => {
    expect(formatUnits(p500, formats)).toBe(6);
    expect(formatUnits({ code: "X" }, formats)).toBe(1);
    expect(formatUnits({ code: "X", format: "Borrado" }, formats)).toBe(1);
    expect(formatUnits(undefined, formats)).toBe(1);
    expect(formatUnits(p500, undefined)).toBe(1);
  });

  it("HL de un formato completo = HL de la unidad x unidades", () => {
    expect(hlPerFormat(p500, formats)).toBeCloseTo(0.03, 10);
    expect(hlPerFormat({ code: "REF", hl: 0.0033, format: "Caja24u" }, formats)).toBeCloseTo(0.0792, 10);
  });

  it("sin formato queda el HL de la unidad; sin HL queda 0", () => {
    expect(hlPerFormat({ code: "X", hl: 0.9 }, formats)).toBe(0.9);
    expect(hlPerFormat({ code: "ARROZ", format: "Sixpack" }, formats)).toBe(0);
    expect(hlPerFormat(undefined, formats)).toBe(0);
  });

  it("no arrastra decimales de punto flotante", () => {
    expect(hlPerFormat({ code: "P330", hl: 0.0033, format: "Sixpack" }, formats)).toBe(0.0198);
  });
});

describe("migrateHlToFormat (historial)", () => {
  const products = [
    p500,
    { code: "M1500", hl: 0.015, format: "Sixpack" },
    { code: "REF", hl: 0.0033, format: "Caja24u" },
    { code: "ARROZ", hl: 0.2 },
    { code: "SINHL", format: "Sixpack" },
  ];
  const venta = (over) => ({ id: Math.random().toString(36), type: "venta", code: "P500", qty: 10, unitHl: 0.005, bucket: "hoy", ...over });

  it("multiplica el HL guardado en cada venta por las unidades de su formato", () => {
    const { movements } = migrateHlToFormat([
      venta({ qty: 10 }),
      venta({ code: "M1500", qty: 2, unitHl: 0.015 }),
      venta({ code: "REF", qty: 3, unitHl: 0.0033 }),
    ], products, formats);
    expect(movements.map((m) => m.unitHl)).toEqual([0.03, 0.09, 0.0792]);
  });

  it("respeta el HL que tenía cada venta (no el de hoy del producto)", () => {
    const { movements } = migrateHlToFormat([venta({ unitHl: 0.004 })], products, formats);
    expect(movements[0].unitHl).toBe(0.024);
  });

  it("el cambio en el acumulado es la diferencia de lo comprometido", () => {
    const { hlDelta } = migrateHlToFormat([
      venta({ qty: 10 }), // 10 x (0.03 - 0.005) = 0.25
      venta({ qty: 4, bucket: "manana", sent: true }), // enviada: comprometida -> 4 x 0.025 = 0.1
    ], products, formats);
    expect(hlDelta).toBeCloseTo(0.35, 10);
  });

  it("una reserva de mañana sin enviar se migra pero no cambia el acumulado", () => {
    const { movements, hlDelta } = migrateHlToFormat([venta({ qty: 10, bucket: "manana", sent: false })], products, formats);
    expect(movements[0].unitHl).toBe(0.03);
    expect(hlDelta).toBe(0);
  });

  it("una corrección (cantidad negativa) resta", () => {
    const { hlDelta } = migrateHlToFormat([venta({ qty: -2 })], products, formats);
    expect(hlDelta).toBeCloseTo(-0.05, 10);
  });

  it("no toca productos sin formato, ajustes, ni ventas con HL en 0", () => {
    const input = [
      venta({ code: "ARROZ", unitHl: 0.2 }),
      { id: "a", type: "ajuste", code: "P500", qty: 50 },
      venta({ unitHl: 0 }),
    ];
    const { movements, hlDelta } = migrateHlToFormat(input, products, formats);
    expect(movements).toEqual(input);
    expect(hlDelta).toBe(0);
  });

  it("una venta sin HL guardado (null) toma el del producto por formato y suma al acumulado", () => {
    const { movements, hlDelta } = migrateHlToFormat([venta({ unitHl: null, qty: 10 })], products, formats);
    expect(movements[0].unitHl).toBe(0.03);
    expect(hlDelta).toBeCloseTo(0.3, 10);
  });

  it("devuelve el mismo arreglo si no había nada que cambiar", () => {
    const input = [venta({ code: "ARROZ", unitHl: 0.2 })];
    expect(migrateHlToFormat(input, products, formats).movements).toBe(input);
  });
});
