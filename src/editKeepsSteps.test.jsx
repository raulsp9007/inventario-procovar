import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Editar un pedido no borra sus marcas: "Enviado" al cliente y lo facturado se conservan, y la
// confirmación hecha a mano (con su hora) también. La que vino de facturación se quita (hay que
// volver a confirmar lo editado) y al pasar a "Para mañana" ya no queda facturado ni confirmado.
// Hoy fijo: viernes 2026-10-30.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const customers = [{ id: "a", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" }];
const CONFIRMED_AT = "2026-10-30T14:31:00.000Z";
const move = (over = {}) => ({
  id: "m1", code: "P500", type: "venta", qty: 6, date: "2026-10-30", timestamp: "2026-10-30T08:00:00.000Z", unitPrice: 100, unitHl: 0.03,
  orderId: "o1", orderSeq: 1, customerName: "Ana López", isDelivery: false, note: "", bucket: "hoy",
  sent: true, sentAt: "2026-10-30T13:00:00.000Z", sentToCustomer: true, confirmed: true, confirmedAt: CONFIRMED_AT, ...over,
});

function seed(over = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [move(over)], customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 100 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const stored = () => saved().movements.find((m) => m.orderId === "o1");

async function openEdit() {
  render(<InventoryApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
  await screen.findByRole("button", { name: /Guardar cambios/ });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
const closed = () => waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());

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

describe("Editar un pedido conserva sus marcas", () => {
  it("cambiar la cantidad deja Enviado, Facturado y Confirmado a mano (con su hora) como estaban", async () => {
    seed();
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    save();
    await closed();
    expect(stored()).toMatchObject({ sent: true, sentAt: "2026-10-30T13:00:00.000Z", sentToCustomer: true, confirmed: true, confirmedAt: CONFIRMED_AT });
    expect(document.querySelector("[data-manual-confirmed]")).toBeTruthy();
  });

  it("una confirmación que no trae hora (la que aplicó facturación) se quita al editar", async () => {
    seed({ confirmedAt: undefined });
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    save();
    await closed();
    expect(stored().confirmed).toBeFalsy();
    expect(stored().sentToCustomer).toBe(true);
    expect(stored().sent).toBe(true);
  });

  it("un pedido sin ninguna marca sigue sin marcas", async () => {
    seed({ sent: false, sentAt: undefined, sentToCustomer: false, confirmed: false, confirmedAt: undefined });
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    save();
    await closed();
    expect(stored()).toMatchObject({ sent: false, sentToCustomer: false });
    expect(stored().confirmed).toBeFalsy();
    expect(stored().confirmedAt).toBeUndefined();
  });

  it("pasarlo a Para mañana quita lo facturado y lo confirmado, pero no el Enviado al cliente", async () => {
    seed();
    await openEdit();
    // el selector Hoy / Para mañana de la ventana del pedido (la lista de atrás tiene otro igual)
    let modal = screen.getByRole("button", { name: /Guardar cambios/ }).parentElement;
    while (modal && !within(modal).queryByRole("button", { name: /Para mañana/ })) modal = modal.parentElement;
    fireEvent.click(within(modal).getByRole("button", { name: /Para mañana/ }));
    save();
    await closed();
    expect(stored()).toMatchObject({ bucket: "manana", sent: false, sentToCustomer: true });
    expect(stored().confirmed).toBeFalsy();
    expect(stored().confirmedAt).toBeUndefined();
  });
});
