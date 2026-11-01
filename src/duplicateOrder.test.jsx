import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Al armar un pedido nuevo se avisa si ese cliente (por su código; sin código, por
// su nombre) ya tiene un pedido el mismo día, para no duplicarlo sin querer.
// Hoy fijo: viernes 2026-10-30.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const customers = [
  { id: "a", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", code: "LT05TCP0001" },
  { id: "b", name: "Beto Ruiz", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" },
];
const move = (orderId, customerName, date, over = {}) => ({
  id: `m-${orderId}`, code: "P500", type: "venta", qty: 6, date, timestamp: `${date}T08:00:00.000Z`,
  unitPrice: 1, unitHl: 0.03, orderId, orderSeq: 1, customerName, isDelivery: false, note: "", bucket: "hoy", ...over,
});

function seed(movements, extraCustomers = []) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [...customers, ...extraCustomers], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const orderCount = () => new Set(saved().movements.map((m) => m.orderId)).size;

async function fillOrder(name) {
  render(<InventoryApp />);
  fireEvent.click(await screen.findByLabelText("Nuevo pedido"));
  fireEvent.change(await screen.findByPlaceholderText("Nombre del cliente"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
}
const confirm = () => fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
const warning = () => screen.findByRole("dialog", { name: "Cliente con pedido repetido" });

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

describe("Pedido nuevo: aviso de pedido repetido el mismo día", () => {
  it("si el cliente ya tiene pedido hoy, avisa antes de guardar y no guarda todavía", async () => {
    seed([move("o1", "Ana López", "2026-10-30")]);
    await fillOrder("Ana López");
    confirm();
    const dialog = await warning();
    expect(within(dialog).getByText(/Ana López ya tiene un pedido hoy/)).toBeTruthy();
    expect(within(dialog).getByText(/Parranda 500ml/)).toBeTruthy();
    expect(orderCount()).toBe(1);
  });

  it("Cancelar vuelve al pedido sin guardar nada", async () => {
    seed([move("o1", "Ana López", "2026-10-30")]);
    await fillOrder("Ana López");
    confirm();
    fireEvent.click(within(await warning()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog", { name: "Cliente con pedido repetido" })).toBeNull();
    expect(screen.getByPlaceholderText("Nombre del cliente").value).toBe("Ana López");
    expect(orderCount()).toBe(1);
  });

  it("Hacer otro pedido lo guarda igual", async () => {
    seed([move("o1", "Ana López", "2026-10-30")]);
    await fillOrder("Ana López");
    confirm();
    fireEvent.click(within(await warning()).getByRole("button", { name: "Hacer otro pedido" }));
    await waitFor(() => expect(orderCount()).toBe(2));
  });

  it("sin pedido previo, guarda directo y sin aviso", async () => {
    seed([move("o1", "Ana López", "2026-10-30")]);
    await fillOrder("Beto Ruiz");
    confirm();
    await waitFor(() => expect(orderCount()).toBe(2));
    expect(screen.queryByRole("dialog", { name: "Cliente con pedido repetido" })).toBeNull();
  });

  it("un pedido de otro día no cuenta", async () => {
    seed([move("o1", "Ana López", "2026-10-29")]);
    await fillOrder("Ana López");
    confirm();
    await waitFor(() => expect(orderCount()).toBe(2));
    expect(screen.queryByRole("dialog", { name: "Cliente con pedido repetido" })).toBeNull();
  });

  it("encuentra al cliente por su código aunque el pedido viejo esté a otro nombre del mismo código", async () => {
    seed(
      [move("o1", "Ana Lopez (viejo)", "2026-10-30")],
      [{ id: "x", name: "Ana Lopez (viejo)", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", code: "lt05tcp0001" }],
    );
    await fillOrder("Ana López");
    confirm();
    expect(await warning()).toBeTruthy();
  });

  it("un cliente sin código se compara por su nombre", async () => {
    seed([move("o1", "Beto Ruiz", "2026-10-30")]);
    await fillOrder("Beto Ruiz");
    confirm();
    expect(await warning()).toBeTruthy();
  });

  it("si el pedido es programado, compara con ese día (no con hoy)", async () => {
    seed([move("o1", "Ana López", "2026-10-30")]);
    await fillOrder("Ana López");
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    confirm();
    await waitFor(() => expect(orderCount()).toBe(2));
    expect(screen.queryByRole("dialog", { name: "Cliente con pedido repetido" })).toBeNull();
  });

  it("y si ya tiene uno programado para ese día, avisa diciendo el día", async () => {
    seed([move("o1", "Ana López", "2026-10-31", { bucket: "manana" })]);
    await fillOrder("Ana López");
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    confirm();
    const dialog = await warning();
    expect(within(dialog).getByText(/Ana López ya tiene un pedido el /)).toBeTruthy();
    expect(within(dialog).queryByText(/ hoy:/)).toBeNull();
  });

  it("al editar un pedido existente no avisa", async () => {
    seed([move("o1", "Ana López", "2026-10-30"), move("o2", "Ana López", "2026-10-30", { id: "m-o2", orderSeq: 2 })]);
    render(<InventoryApp />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Editar pedido/ }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Cliente con pedido repetido" })).toBeNull();
  });
});
