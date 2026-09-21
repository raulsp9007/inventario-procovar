import { describe, it, expect } from "vitest";
import {
  buildRegistryFromMovements, upsertCustomer, patchCustomer, renameCustomer, removeCustomer,
  registryNames, findRegistryCustomer, registryBusinessNames, registryCustomerNameForBusiness,
  getRegistryStats, buildVcf,
} from "./customerRegistry";

function mv(overrides) {
  return { type: "venta", code: "P500", qty: 1, date: "2026-09-01", timestamp: "2026-09-01T10:00:00.000Z", orderId: "o1", ...overrides };
}

function cust(name, extra = {}) {
  return { id: `id-${name}`, name, businessName: "", phone: "", createdAt: "2026-09-01T00:00:00.000Z", ...extra };
}

describe("buildRegistryFromMovements", () => {
  it("arma un cliente por nombre con negocio y teléfono más recientes", () => {
    const movements = [
      mv({ customerName: "Ana", businessName: "Viejo", customerPhone: "5355550001", timestamp: "2026-09-01T10:00:00.000Z" }),
      mv({ customerName: "Ana", businessName: "Cafetería", customerPhone: "5355550002", timestamp: "2026-09-05T10:00:00.000Z", orderId: "o2" }),
      mv({ customerName: "Beto", timestamp: "2026-09-03T10:00:00.000Z", orderId: "o3" }),
    ];
    const registry = buildRegistryFromMovements(movements);
    expect(registry).toHaveLength(2);
    const ana = registry.find((c) => c.name === "Ana");
    expect(ana.businessName).toBe("Cafetería");
    expect(ana.phone).toBe("5355550002");
    expect(ana.createdAt).toBe("2026-09-01T10:00:00.000Z");
    expect(ana.id).toMatch(/^cust-/);
    expect(registry.find((c) => c.name === "Beto")).toMatchObject({ businessName: "", phone: "" });
  });

  it("ignora movimientos sin cliente y la 'Venta manual'", () => {
    const movements = [mv({ customerName: "Venta manual" }), mv({ customerName: undefined }), { type: "ajuste", code: "P500", qty: 5 }];
    expect(buildRegistryFromMovements(movements)).toEqual([]);
  });
});

describe("upsertCustomer", () => {
  it("crea al cliente si no existe, con teléfono normalizado a 53 + 8 dígitos", () => {
    const next = upsertCustomer([], { name: "Ana", businessName: " Cafetería ", phone: "5555 1234" });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "Ana", businessName: "Cafetería", phone: "5355551234" });
  });

  it("un dato vacío no borra el que ya estaba guardado", () => {
    const start = [cust("Ana", { businessName: "Cafetería", phone: "5355551234" })];
    const next = upsertCustomer(start, { name: "Ana", businessName: "", phone: "" });
    expect(next).toBe(start);
  });

  it("un dato nuevo pisa el anterior", () => {
    const start = [cust("Ana", { phone: "5355551234" })];
    const next = upsertCustomer(start, { name: "Ana", businessName: "Bodega", phone: "55559999" });
    expect(next[0]).toMatchObject({ businessName: "Bodega", phone: "5355559999" });
  });

  it("no crea 'Venta manual' ni nombres vacíos", () => {
    expect(upsertCustomer([], { name: "Venta manual" })).toEqual([]);
    expect(upsertCustomer([], { name: "" })).toEqual([]);
  });
});

describe("patchCustomer", () => {
  it("puede vaciar el teléfono si viene definido y vacío", () => {
    const start = [cust("Ana", { phone: "5355551234", businessName: "Cafetería" })];
    const next = patchCustomer(start, "Ana", { phone: "" });
    expect(next[0]).toMatchObject({ phone: "", businessName: "Cafetería" });
  });

  it("no toca lo que no viene", () => {
    const start = [cust("Ana", { phone: "5355551234", businessName: "Cafetería" })];
    const next = patchCustomer(start, "Ana", { businessName: "Bodega" });
    expect(next[0]).toMatchObject({ phone: "5355551234", businessName: "Bodega" });
  });

  it("crea al cliente si no estaba", () => {
    expect(patchCustomer([], "Ana", { phone: "55551234" })[0]).toMatchObject({ name: "Ana", phone: "5355551234" });
  });
});

describe("renameCustomer", () => {
  it("renombra en el lugar conservando el id", () => {
    const start = [cust("Ana", { phone: "5355551234" })];
    const next = renameCustomer(start, "Ana", "Ana López", "Cafetería", undefined);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: "id-Ana", name: "Ana López", businessName: "Cafetería", phone: "5355551234" });
  });

  it("edita el teléfono y lo puede borrar con cadena vacía", () => {
    const start = [cust("Ana", { phone: "5355551234" })];
    expect(renameCustomer(start, "Ana", "Ana", "", "55550000")[0].phone).toBe("5355550000");
    expect(renameCustomer(start, "Ana", "Ana", "", "")[0].phone).toBe("");
  });

  it("nombre vacío conserva el anterior", () => {
    const start = [cust("Ana")];
    expect(renameCustomer(start, "Ana", "   ", "", undefined)[0].name).toBe("Ana");
  });

  it("si el nombre nuevo ya es de otro cliente, los fusiona en ese", () => {
    const start = [
      cust("Ana", { phone: "5355551111", createdAt: "2026-01-01T00:00:00.000Z" }),
      cust("Ana L", { phone: "", createdAt: "2026-06-01T00:00:00.000Z" }),
    ];
    const next = renameCustomer(start, "Ana", "Ana L", "Bodega", undefined);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: "id-Ana L", name: "Ana L", businessName: "Bodega", phone: "5355551111", createdAt: "2026-01-01T00:00:00.000Z" });
  });
});

describe("removeCustomer y consultas", () => {
  const list = [cust("Ana", { businessName: "Cafetería", phone: "5355551234" }), cust("Beto", { businessName: "Cafetería" }), cust("Carla")];

  it("removeCustomer quita solo a ese cliente", () => {
    expect(registryNames(removeCustomer(list, "Beto"))).toEqual(["Ana", "Carla"]);
  });

  it("findRegistryCustomer devuelve el cliente o null", () => {
    expect(findRegistryCustomer(list, "Ana").phone).toBe("5355551234");
    expect(findRegistryCustomer(list, "Nadie")).toBeNull();
  });

  it("registryBusinessNames no repite ni incluye vacíos", () => {
    expect(registryBusinessNames(list)).toEqual(["Cafetería"]);
  });

  it("registryCustomerNameForBusiness devuelve el primer cliente de ese negocio", () => {
    expect(registryCustomerNameForBusiness(list, "Cafetería")).toBe("Ana");
    expect(registryCustomerNameForBusiness(list, "Otro")).toBe("");
  });
});

describe("getRegistryStats", () => {
  const products = [{ code: "P500" }, { code: "M330" }];

  it("mantiene en la lista al cliente sin pedidos", () => {
    const customers = [cust("Ana", { businessName: "Cafetería", phone: "5355551234" }), cust("María")];
    const movements = [mv({ customerName: "Ana", code: "M330", qty: 4, date: "2026-09-10" })];
    const rows = getRegistryStats(customers, movements, products);
    expect(rows).toHaveLength(2);
    const ana = rows.find((r) => r.customerName === "Ana");
    expect(ana).toMatchObject({ hasOrders: true, favoriteProductCode: "M330", lastPurchaseDate: "2026-09-10", businessName: "Cafetería", phone: "5355551234" });
    const maria = rows.find((r) => r.customerName === "María");
    expect(maria).toMatchObject({ hasOrders: false, favoriteProductCode: null, lastPurchaseDate: "" });
  });

  it("un cliente con pedidos que no está en el registro no aparece", () => {
    const rows = getRegistryStats([cust("Ana")], [mv({ customerName: "Fantasma" })], products);
    expect(rows.map((r) => r.customerName)).toEqual(["Ana"]);
  });
});

describe("buildVcf", () => {
  it("genera una tarjeta por cliente con teléfono, con +53 y negocio", () => {
    const vcf = buildVcf([
      cust("Ana López", { businessName: "Cafetería, El Punto", phone: "5355551234" }),
      cust("Sin teléfono"),
    ]);
    expect(vcf).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana López\r\n");
    expect(vcf).toContain("ORG:Cafetería\\, El Punto");
    expect(vcf).toContain("TEL;TYPE=CELL:+5355551234");
    expect(vcf).not.toContain("Sin teléfono");
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(1);
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("devuelve cadena vacía si nadie tiene teléfono", () => {
    expect(buildVcf([cust("Ana")])).toBe("");
  });
});
