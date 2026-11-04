import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { groupAllOrders } from "./orderHelpers";
import { manualConfirmText } from "./cloudSync";

// Cuando el vendedor confirma a mano (paso CONF.), la tarjeta muestra una franja naranja claro
// "Confirmado manualmente a las HH:MM", con el mismo diseño que la verde de facturación.
// Hoy fijo: viernes 2026-10-30, 09:00.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const move = (over = {}) => ({
  id: "m1", code: "P500", type: "venta", qty: 6, date: "2026-10-30", timestamp: "2026-10-30T08:00:00.000Z", unitPrice: 100, unitHl: 0.03,
  orderId: "o1", orderSeq: 1, customerName: "Ana López", isDelivery: false, note: "", bucket: "hoy", sent: true, sentToCustomer: true, confirmed: false, ...over,
});

function seed(movements = [move()]) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 100 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}
const banner = () => document.querySelector("[data-manual-confirmed]");
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

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

describe("manualConfirmText", () => {
  it("lleva la hora de la confirmación (24 h, como la de facturación)", () => {
    expect(manualConfirmText(new Date(2026, 9, 30, 9, 5).toISOString())).toBe("Confirmado manualmente a las 09:05");
  });
  it("sin hora guardada (pedidos viejos) dice solo 'Confirmado manualmente'", () => {
    expect(manualConfirmText(null)).toBe("Confirmado manualmente");
    expect(manualConfirmText("no-es-fecha")).toBe("Confirmado manualmente");
  });
});

describe("groupAllOrders", () => {
  it("lleva la hora de confirmación al pedido", () => {
    const [order] = groupAllOrders([move({ confirmed: true, confirmedAt: "2026-10-30T14:05:00.000Z" })]);
    expect(order.confirmedAt).toBe("2026-10-30T14:05:00.000Z");
  });
});

describe("Pedido: confirmado manualmente", () => {
  it("al tocar CONF. aparece la franja naranja con la hora y se guarda la hora", async () => {
    seed();
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Confirmado" });
    expect(banner()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmado" }));
    const text = await screen.findByText("Confirmado manualmente a las 09:00");
    const el = text.closest("[data-manual-confirmed]");
    expect(el).toBeTruthy();
    expect(el.getAttribute("role")).toBe("status");
    expect(document.querySelector("[data-cloud-confirmed]")).toBeNull();
    const stored = saved().movements.find((m) => m.orderId === "o1");
    expect(stored.confirmed).toBe(true);
    expect(new Date(stored.confirmedAt).getHours()).toBe(9);
  });

  it("al deshacer la confirmación la franja desaparece y se borra la hora", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirmado" }));
    await screen.findByText("Confirmado manualmente a las 09:00");
    // con los 3 pasos hechos el control se pliega en una pastilla; se abre y se desmarca CONF.
    fireEvent.click(screen.getByRole("button", { name: /^Confirmado$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmado", pressed: true }));
    await waitFor(() => expect(banner()).toBeNull());
    expect(saved().movements.find((m) => m.orderId === "o1").confirmedAt).toBeFalsy();
  });

  it("un pedido ya confirmado de antes (sin hora) muestra la franja sin hora", async () => {
    seed([move({ confirmed: true })]);
    render(<InventoryApp />);
    expect(await screen.findByText("Confirmado manualmente")).toBeTruthy();
    expect(banner()).toBeTruthy();
  });

  it("un pedido sin confirmar no tiene franja", async () => {
    seed();
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Confirmado" });
    expect(banner()).toBeNull();
  });
});
