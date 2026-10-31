import { describe, it, expect } from "vitest";
import { mergeCustomerData } from "./customerRegistry";

// Fusionar dos clientes: se conserva uno (su nombre es el que ya usan sus
// pedidos), se le completan los datos que le faltaban con los del otro, y los
// pedidos y la lista de espera del otro pasan al que se conserva. Nada se pierde.

const keep = () => ({ id: "k", name: "Ana López", businessName: "", phone: "5355123456", createdAt: "2026-03-01T00:00:00.000Z" });
const drop = () => ({
  id: "d", name: "Ana Lopez R.", businessName: "Kiosco El Sol", phone: "5355999999", createdAt: "2026-01-15T00:00:00.000Z",
  code: "AB1", address: "Calle 1", clientType: "Kiosko", consumptionType: "Off-Premise",
});
const other = () => ({ id: "o", name: "Beto Ruiz", businessName: "Cafetería Beto", phone: "5355000001", createdAt: "2026-02-01T00:00:00.000Z" });
const mov = (id, customerName, extra = {}) => ({ id, code: "P500", type: "venta", qty: 5, orderId: `o-${id}`, customerName, businessName: "", customerPhone: "", ...extra });
const data = () => ({
  customers: [keep(), drop(), other()],
  movements: [mov("1", "Ana López", { businessName: "Viejo Negocio", customerPhone: "5355123456" }), mov("2", "Ana Lopez R.", { businessName: "Kiosco El Sol", customerPhone: "5355999999" }), mov("3", "Beto Ruiz")],
  waitlist: [{ id: "w1", code: "P500", customerName: "Ana Lopez R.", qty: 3 }, { id: "w2", code: "P500", customerName: "Beto Ruiz", qty: 1 }],
});

describe("mergeCustomerData", () => {
  it("se queda con un solo cliente (el que se conserva) y quita el otro", () => {
    const out = mergeCustomerData(data(), "Ana López", "Ana Lopez R.");
    expect(out.customers.map((c) => c.name)).toEqual(["Ana López", "Beto Ruiz"]);
    expect(out.customers[0].id).toBe("k");
  });

  it("lo que el cliente conservado ya tenía no se pisa", () => {
    const merged = mergeCustomerData(data(), "Ana López", "Ana Lopez R.").customers[0];
    expect(merged.phone).toBe("5355123456");
    expect(merged.name).toBe("Ana López");
  });

  it("lo que le faltaba se completa con los datos del otro", () => {
    expect(mergeCustomerData(data(), "Ana López", "Ana Lopez R.").customers[0]).toMatchObject({
      businessName: "Kiosco El Sol", code: "AB1", address: "Calle 1", clientType: "Kiosko", consumptionType: "Off-Premise",
    });
  });

  it("conserva la fecha de alta más antigua", () => {
    expect(mergeCustomerData(data(), "Ana López", "Ana Lopez R.").customers[0].createdAt).toBe("2026-01-15T00:00:00.000Z");
  });

  it("si se conserva el otro, el resultado es el mismo pero con su nombre", () => {
    const merged = mergeCustomerData(data(), "Ana Lopez R.", "Ana López").customers.find((c) => c.id === "d");
    expect(merged).toMatchObject({ name: "Ana Lopez R.", businessName: "Kiosco El Sol", phone: "5355999999", code: "AB1" });
  });

  it("los pedidos del otro pasan al cliente conservado, con su negocio y teléfono unificados", () => {
    const out = mergeCustomerData(data(), "Ana López", "Ana Lopez R.");
    expect(out.movements.filter((m) => m.customerName === "Ana López").map((m) => m.id).sort()).toEqual(["1", "2"]);
    expect(out.movements.find((m) => m.id === "2")).toMatchObject({ customerName: "Ana López", businessName: "Kiosco El Sol", customerPhone: "5355123456" });
    expect(out.movements).toHaveLength(3); // ningún pedido se pierde
  });

  it("no toca los pedidos de nadie más", () => {
    const out = mergeCustomerData(data(), "Ana López", "Ana Lopez R.");
    expect(out.movements.find((m) => m.id === "3")).toEqual(data().movements[2]);
  });

  it("la lista de espera del otro pasa al conservado", () => {
    const out = mergeCustomerData(data(), "Ana López", "Ana Lopez R.");
    expect(out.waitlist.map((w) => w.customerName)).toEqual(["Ana López", "Beto Ruiz"]);
  });

  it("si algún nombre no existe o son el mismo, no cambia nada", () => {
    const base = data();
    expect(mergeCustomerData(base, "Ana López", "Nadie")).toEqual(base);
    expect(mergeCustomerData(base, "Nadie", "Ana López")).toEqual(base);
    expect(mergeCustomerData(base, "Ana López", "Ana López")).toEqual(base);
  });

  it("no modifica los datos de entrada", () => {
    const base = data();
    const snapshot = JSON.stringify(base);
    mergeCustomerData(base, "Ana López", "Ana Lopez R.");
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
