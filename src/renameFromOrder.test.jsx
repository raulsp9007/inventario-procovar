import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Al editar un pedido y cambiar el nombre del cliente por uno nuevo, la app pregunta si se renombra
// al cliente (en todos sus pedidos y en Clientes, con su código) o solo se cambia este pedido.
// Hoy fijo: viernes 2026-10-30.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const customers = [
  { id: "a", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", code: "AB1001" },
  { id: "b", name: "Beto Ruiz", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", code: "BT1" },
];
const move = (over = {}) => ({
  id: "m1", code: "P500", type: "venta", qty: 6, date: "2026-10-30", timestamp: "2026-10-30T08:00:00.000Z", unitPrice: 100, unitHl: 0.03,
  orderId: "o1", orderSeq: 1, customerName: "Ana López", isDelivery: false, note: "", bucket: "hoy", sent: false, ...over,
});

function seed(extra = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products,
    // o1 es el pedido que se edita; o2 es otro pedido de Ana, de otro día, y o3 es de Beto.
    movements: [
      move(),
      move({ id: "m2", orderId: "o2", orderSeq: 2, date: "2026-10-29", timestamp: "2026-10-29T08:00:00.000Z" }),
      move({ id: "m3", orderId: "o3", orderSeq: 3, customerName: "Beto Ruiz", timestamp: "2026-10-30T07:00:00.000Z" }),
    ],
    customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 100 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    waitlist: [{ id: "w1", code: "P500", customerName: "Ana López", qty: 6, createdAt: "2026-10-28T10:00:00.000Z" }],
    ...extra,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const names = (orderId) => [...new Set(saved().movements.filter((m) => m.orderId === orderId).map((m) => m.customerName))];

// Abre la edición del pedido de Ana de hoy (o1): es el primero con ese botón.
async function openEdit() {
  render(<InventoryApp />);
  const buttons = await screen.findAllByRole("button", { name: "Editar pedido" });
  fireEvent.click(buttons[0]);
  await screen.findByRole("button", { name: /Guardar cambios/ });
  return screen.getByPlaceholderText("Nombre del cliente");
}
async function setCode(value) {
  const field = await screen.findByRole("group", { name: "Código del cliente" });
  fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
  fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value } });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
const renameDialog = () => screen.findByRole("dialog", { name: "Renombrar cliente" });

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-30T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Pedido: renombrar al cliente al editar", () => {
  it("con un nombre nuevo pregunta, y al aceptar renombra al cliente en todos sus pedidos, en Clientes y en la lista de espera", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Ana Lopez M" } });
    save();
    const dialog = await renameDialog();
    expect(dialog.textContent).toContain("Ana López");
    expect(dialog.textContent).toContain("Ana Lopez M");
    expect(dialog.textContent).toContain("2 pedidos");
    expect(saved().movements.find((m) => m.orderId === "o1").customerName).toBe("Ana López");
    fireEvent.click(within(dialog).getByRole("button", { name: "Renombrar cliente" }));
    await waitFor(() => expect(names("o1")).toEqual(["Ana Lopez M"]));
    expect(names("o2")).toEqual(["Ana Lopez M"]);
    expect(names("o3")).toEqual(["Beto Ruiz"]);
    const next = saved();
    expect(next.customers.map((c) => c.name).sort()).toEqual(["Ana Lopez M", "Beto Ruiz"]);
    expect(next.customers.find((c) => c.name === "Ana Lopez M").code).toBe("AB1001");
    expect(next.waitlist[0].customerName).toBe("Ana Lopez M");
    expect(screen.queryByRole("dialog", { name: "Renombrar cliente" })).toBeNull();
  });

  it("'Solo este pedido' cambia únicamente este pedido y deja al cliente como estaba", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Ana Lopez M" } });
    save();
    const dialog = await renameDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Solo este pedido" }));
    await waitFor(() => expect(names("o1")).toEqual(["Ana Lopez M"]));
    expect(names("o2")).toEqual(["Ana López"]);
    const next = saved();
    expect(next.customers.find((c) => c.name === "Ana López").code).toBe("AB1001");
    expect(next.customers.map((c) => c.name)).toContain("Ana Lopez M");
    expect(next.waitlist[0].customerName).toBe("Ana López");
  });

  it("Cancelar no guarda nada y deja la ventana del pedido abierta", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Ana Lopez M" } });
    save();
    const dialog = await renameDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Renombrar cliente" })).toBeNull());
    expect(screen.getByRole("button", { name: /Guardar cambios/ })).toBeTruthy();
    expect(names("o1")).toEqual(["Ana López"]);
    expect(saved().customers.map((c) => c.name).sort()).toEqual(["Ana López", "Beto Ruiz"]);
  });

  it("con el código del propio cliente (antes daba error) solo se ofrece renombrar y el código se conserva", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Ana Lopez M" } });
    await setCode("AB1001");
    save();
    const dialog = await renameDialog();
    expect(within(dialog).queryByRole("button", { name: "Solo este pedido" })).toBeNull();
    expect(dialog.textContent).toContain("AB1001");
    fireEvent.click(within(dialog).getByRole("button", { name: "Renombrar cliente" }));
    await waitFor(() => expect(names("o1")).toEqual(["Ana Lopez M"]));
    const next = saved();
    expect(next.customers.filter((c) => c.code === "AB1001").map((c) => c.name)).toEqual(["Ana Lopez M"]);
  });

  it("si el nombre nuevo es el de otro cliente que ya existe, no pregunta (es pasar el pedido a ese cliente)", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Beto Ruiz" } });
    save();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Renombrar cliente" })).toBeNull();
    expect(names("o1")).toEqual(["Beto Ruiz"]);
    expect(names("o2")).toEqual(["Ana López"]);
  });

  it("si no se toca el nombre no pregunta", async () => {
    seed();
    await openEdit();
    save();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Renombrar cliente" })).toBeNull();
  });

  it("al deshacer la edición vuelve el nombre anterior en todos los pedidos", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Ana Lopez M" } });
    save();
    fireEvent.click(within(await renameDialog()).getByRole("button", { name: "Renombrar cliente" }));
    await waitFor(() => expect(names("o2")).toEqual(["Ana Lopez M"]));
    fireEvent.click(await screen.findByRole("button", { name: /Deshacer/ }));
    await waitFor(() => expect(names("o1")).toEqual(["Ana López"]));
    expect(names("o2")).toEqual(["Ana López"]);
    expect(saved().customers.map((c) => c.name).sort()).toEqual(["Ana López", "Beto Ruiz"]);
    expect(saved().customers.find((c) => c.name === "Ana López").code).toBe("AB1001");
  });
});
