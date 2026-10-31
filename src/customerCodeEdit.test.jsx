import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Editar el código del cliente: en la edición de Clientes y al armar un pedido
// para un cliente nuevo. El campo nunca está abierto de entrada: un lápiz lo
// habilita a demanda, para no cambiar sin querer el dato más importante.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const cust = (id, name, extra = {}) => ({ id, name, businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", ...extra });

function seed(tab) {
  localStorage.setItem("procovar-active-tab", tab);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [],
    customers: [
      cust("a", "Ana López", { phone: "5355000001", code: "AB1001" }),
      cust("b", "Beto Ruiz", { code: "BT1" }),
      cust("d", "Dora Mena"),
    ],
    waitlist: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const byName = (name) => saved().customers.find((c) => c.name === name);

async function openEdit(search) {
  render(<InventoryApp />);
  fireEvent.change(await screen.findByPlaceholderText("Buscar cliente o negocio"), { target: { value: search } });
  fireEvent.click(await screen.findByRole("button", { name: "Editar cliente" }));
  return await screen.findByRole("group", { name: "Código del cliente" });
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-31T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Editar cliente: código", () => {
  it("el código se ve pero no se puede escribir hasta tocar el lápiz", async () => {
    seed("clientes");
    const field = await openEdit("ana");
    expect(within(field).getByText("AB1001")).toBeTruthy();
    expect(within(field).queryByRole("textbox")).toBeNull();
    fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
    expect((within(field).getByRole("textbox", { name: "Código" })).value).toBe("AB1001");
  });

  it("un cliente sin código muestra 'Sin código' y también se le puede poner", async () => {
    seed("clientes");
    const field = await openEdit("dora");
    expect(within(field).getByText("Sin código")).toBeTruthy();
    fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
    fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value: " DM77 " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(byName("Dora Mena").code).toBe("DM77"));
  });

  it("cambiar el código lo guarda y no toca los demás datos", async () => {
    seed("clientes");
    const field = await openEdit("ana");
    fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
    fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value: "AB2002" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(byName("Ana López").code).toBe("AB2002"));
    expect(byName("Ana López").phone).toBe("5355000001");
  });

  it("guardar otros cambios sin tocar el lápiz deja el código como estaba", async () => {
    seed("clientes");
    await openEdit("ana");
    fireEvent.change(screen.getByPlaceholderText("Negocio (opcional)"), { target: { value: "Kiosco Sol" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(byName("Ana López").businessName).toBe("Kiosco Sol"));
    expect(byName("Ana López").code).toBe("AB1001");
  });

  it("si el código ya es de otro cliente, avisa y no guarda", async () => {
    seed("clientes");
    const field = await openEdit("dora");
    fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
    fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value: "ab1001" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Ese código ya es de Ana López.")).toBeTruthy();
    expect(byName("Dora Mena").code).toBeUndefined();
  });
});

describe("Pedido nuevo: código del cliente nuevo", () => {
  async function openForm() {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByLabelText("Nuevo pedido"));
    return await screen.findByPlaceholderText("Nombre del cliente");
  }
  const addLine = () => {
    fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  };

  it("con un nombre nuevo aparece el código, cerrado, con su lápiz", async () => {
    seed("pedidos");
    fireEvent.change(await openForm(), { target: { value: "Gina Paz" } });
    const field = await screen.findByRole("group", { name: "Código del cliente" });
    expect(within(field).getByText("Sin código")).toBeTruthy();
    expect(within(field).queryByRole("textbox")).toBeNull();
  });

  it("sin nombre, o con un cliente que ya existe, no se ofrece el código", async () => {
    seed("pedidos");
    const input = await openForm();
    expect(screen.queryByRole("group", { name: "Código del cliente" })).toBeNull();
    fireEvent.change(input, { target: { value: "Ana López" } });
    expect(screen.queryByRole("group", { name: "Código del cliente" })).toBeNull();
  });

  it("se escribe el código con el lápiz y queda guardado en el cliente nuevo", async () => {
    seed("pedidos");
    fireEvent.change(await openForm(), { target: { value: "Gina Paz" } });
    const field = await screen.findByRole("group", { name: "Código del cliente" });
    fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
    fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value: "GP55" } });
    addLine();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
    await waitFor(() => expect(byName("Gina Paz")).toMatchObject({ code: "GP55" }));
  });

  it("si el código ya es de otro cliente, avisa y no guarda el pedido", async () => {
    seed("pedidos");
    fireEvent.change(await openForm(), { target: { value: "Gina Paz" } });
    const field = await screen.findByRole("group", { name: "Código del cliente" });
    fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
    fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value: "BT1" } });
    addLine();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
    expect(await screen.findByText("El código BT1 ya es de Beto Ruiz.")).toBeTruthy();
    expect(saved().movements).toHaveLength(0);
  });
});
