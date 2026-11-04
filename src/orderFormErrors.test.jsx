import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Los avisos de error al guardar un pedido (código ya usado, falta de stock, datos incompletos...)
// se ven DENTRO de la ventana del pedido, junto a "Confirmar pedido", y no detrás de ella donde
// nadie los veía. Hoy fijo: viernes 2026-10-30.

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
    products, movements: [move()], customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 100 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true, ...extra,
  }));
}

async function openEdit() {
  render(<InventoryApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
  await screen.findByRole("button", { name: /Guardar cambios/ });
  return screen.getByPlaceholderText("Nombre del cliente");
}
async function setCode(value) {
  const field = await screen.findByRole("group", { name: "Código del cliente" });
  fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
  fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value } });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
const formAlert = () => document.querySelector("[data-order-form-error]");

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

describe("Pedido: los errores se ven dentro de la ventana del pedido", () => {
  it("un código que ya es de otro cliente avisa dentro de la ventana y no guarda", async () => {
    seed();
    await openEdit();
    await setCode("BT1");
    save();
    const alert = await waitFor(() => { const a = formAlert(); expect(a).toBeTruthy(); return a; });
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("El código BT1 ya es de Beto Ruiz.");
    expect(screen.getByRole("button", { name: /Guardar cambios/ })).toBeTruthy();
  });

  it("si es el código del mismo cliente con el nombre cambiado, explica cómo renombrarlo", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Ana Lopez M" } });
    await setCode("AB1001");
    save();
    const alert = await waitFor(() => { const a = formAlert(); expect(a).toBeTruthy(); return a; });
    expect(alert.textContent).toContain("El código AB1001 ya es de Ana López.");
    expect(alert.textContent).toContain("Clientes");
  });

  it("el aviso se quita al seguir escribiendo y a los pocos segundos", async () => {
    seed();
    const input = await openEdit();
    await setCode("BT1");
    save();
    await waitFor(() => expect(formAlert()).toBeTruthy());
    fireEvent.change(input, { target: { value: "Ana López X" } });
    await waitFor(() => expect(formAlert()).toBeNull());
    await setCode("BT1");
    save();
    await waitFor(() => expect(formAlert()).toBeTruthy());
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(formAlert()).toBeNull();
  });

  it("no queda un aviso viejo al abrir otra vez la ventana", async () => {
    seed();
    await openEdit();
    await setCode("BT1");
    save();
    await waitFor(() => expect(formAlert()).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Cerrar|Cancelar/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
    await screen.findByRole("button", { name: /Guardar cambios/ });
    expect(formAlert()).toBeNull();
  });

  it("cuando todo está bien, guarda y no sale ningún aviso", async () => {
    seed();
    const input = await openEdit();
    fireEvent.change(input, { target: { value: "Ana Lopez M" } });
    await setCode("AB9999");
    save();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    expect(formAlert()).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).movements.find((m) => m.orderId === "o1").customerName).toBe("Ana Lopez M");
  });
});
