import { describe, it, expect } from "vitest";
import { upsertCustomer, renameCustomer, findCustomerByCode } from "./customerRegistry";

// El código del cliente (el del portal) es el dato más importante: solo se
// cambia cuando se pide explícitamente; "no tocar" es undefined.

const cust = (id, name, extra = {}) => ({ id, name, businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", ...extra });

describe("upsertCustomer con código", () => {
  it("un cliente nuevo guarda el código que se le da", () => {
    const next = upsertCustomer([], { name: "Ana López", code: "AB1001" });
    expect(next[0]).toMatchObject({ name: "Ana López", code: "AB1001" });
  });

  it("sin código no agrega el campo", () => {
    expect(upsertCustomer([], { name: "Ana López" })[0]).not.toHaveProperty("code");
  });

  it("a uno que ya existe sin código se lo completa, pero nunca pisa el que ya tiene", () => {
    const sin = upsertCustomer([cust("a", "Ana López")], { name: "Ana López", code: "AB1001" });
    expect(sin[0].code).toBe("AB1001");
    const con = [cust("a", "Ana López", { code: "AB1001" })];
    expect(upsertCustomer(con, { name: "Ana López", code: "OTRO" })).toBe(con);
  });
});

describe("renameCustomer con código", () => {
  const list = () => [cust("a", "Ana López", { code: "AB1001" }), cust("b", "Beto Ruiz")];

  it("undefined no toca el código", () => {
    expect(renameCustomer(list(), "Ana López", "Ana L.", "", undefined, undefined)[0]).toMatchObject({ name: "Ana L.", code: "AB1001" });
  });

  it("un código nuevo reemplaza al guardado (con espacios recortados)", () => {
    expect(renameCustomer(list(), "Ana López", "Ana López", "", undefined, "  AB2002 ")[0].code).toBe("AB2002");
  });

  it("vacío borra el código", () => {
    expect(renameCustomer(list(), "Ana López", "Ana López", "", undefined, "")[0].code).toBe("");
  });

  it("agrega el código a uno que no tenía", () => {
    expect(renameCustomer(list(), "Beto Ruiz", "Beto Ruiz", "", undefined, "BT1")[1].code).toBe("BT1");
  });

  it("al fusionar por nombre, el código pedido gana; si no se pide, se completa con el del otro", () => {
    const merged = renameCustomer([cust("a", "Ana", { code: "AB1" }), cust("b", "Ana López")], "Ana", "Ana López", "", undefined, undefined);
    expect(merged).toHaveLength(1);
    expect(merged[0].code).toBe("AB1");
    const asked = renameCustomer([cust("a", "Ana", { code: "AB1" }), cust("b", "Ana López")], "Ana", "Ana López", "", undefined, "ZZ9");
    expect(asked[0].code).toBe("ZZ9");
  });
});

describe("findCustomerByCode", () => {
  const list = [cust("a", "Ana López", { code: "AB1001" }), cust("b", "Beto Ruiz")];

  it("encuentra al dueño de un código sin importar mayúsculas ni espacios", () => {
    expect(findCustomerByCode(list, " ab1001 ").name).toBe("Ana López");
  });

  it("puede ignorar al propio cliente", () => {
    expect(findCustomerByCode(list, "AB1001", "Ana López")).toBeNull();
  });

  it("un código vacío no es de nadie", () => {
    expect(findCustomerByCode(list, "")).toBeNull();
    expect(findCustomerByCode(list, "  ")).toBeNull();
  });
});
