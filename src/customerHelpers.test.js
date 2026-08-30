import { describe, it, expect } from "vitest";
import { getCustomerNames, matchCustomerNames, getCustomerSalesTotals, findNearDuplicateCustomerName, getCustomerPhone, cubanPhoneLocalPart, toCubanPhone } from "./customerHelpers";

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

describe("findNearDuplicateCustomerName", () => {
  const names = ["Pepe Aguilar", "Ana"];

  it("detecta diferencia solo de mayúsculas", () => {
    expect(findNearDuplicateCustomerName(names, "pepe aguilar")).toBe("Pepe Aguilar");
  });

  it("detecta espacios de más/de menos", () => {
    expect(findNearDuplicateCustomerName(names, "Pepe  Aguilar ")).toBe("Pepe Aguilar");
  });

  it("no avisa si el nombre ya es exactamente igual a uno existente", () => {
    expect(findNearDuplicateCustomerName(names, "Pepe Aguilar")).toBeNull();
  });

  it("no avisa si el nombre es realmente distinto", () => {
    expect(findNearDuplicateCustomerName(names, "Juan Pérez")).toBeNull();
  });

  it("no avisa con query vacía", () => {
    expect(findNearDuplicateCustomerName(names, "   ")).toBeNull();
  });
});

describe("getCustomerPhone", () => {
  it("devuelve el teléfono más reciente guardado para ese cliente", () => {
    const movements = [
      venta({ customerName: "Ana", customerPhone: "5355550001", timestamp: "2026-08-01T10:00:00.000Z" }),
      venta({ customerName: "Ana", customerPhone: "5355550002", timestamp: "2026-08-20T10:00:00.000Z" }),
    ];
    expect(getCustomerPhone(movements, "Ana")).toBe("5355550002");
  });

  it("devuelve vacío si el cliente nunca tuvo teléfono guardado", () => {
    const movements = [venta({ customerName: "Ana" })];
    expect(getCustomerPhone(movements, "Ana")).toBe("");
  });
});

describe("cubanPhoneLocalPart", () => {
  it("quita el 53 cuando el número completo mide exactamente 10 dígitos (53 + 8 locales)", () => {
    expect(cubanPhoneLocalPart("5355512345")).toBe("55512345");
  });

  it("no toca un número que no mida 10 dígitos, aunque empiece con 53", () => {
    expect(cubanPhoneLocalPart("53555123456")).toBe("53555123456");
  });

  it("no toca números que no tengan la forma esperada (53 + 8 dígitos)", () => {
    expect(cubanPhoneLocalPart("55512345")).toBe("55512345");
  });

  it("vacío da vacío", () => {
    expect(cubanPhoneLocalPart("")).toBe("");
  });
});

describe("toCubanPhone", () => {
  it("antepone 53 a un número de 8 dígitos sin prefijo (dato viejo, importado, etc.)", () => {
    expect(toCubanPhone("55512345")).toBe("5355512345");
  });

  it("es idempotente -- aplicarlo a un número ya prefijado da el mismo resultado", () => {
    expect(toCubanPhone("5355512345")).toBe("5355512345");
  });

  it("ignora espacios/guiones al normalizar", () => {
    expect(toCubanPhone("5551-2345")).toBe("5355512345");
  });

  it("un número local que empieza justo con '53' (coincidencia, no prefijo) también queda bien anteponiendo 53", () => {
    // Ej. del usuario: escribe "53192093" como sus 8 dígitos locales.
    expect(toCubanPhone("53192093")).toBe("5353192093");
  });

  it("vacío da vacío", () => {
    expect(toCubanPhone("")).toBe("");
    expect(toCubanPhone(null)).toBe("");
    expect(toCubanPhone(undefined)).toBe("");
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
