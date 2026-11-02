import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// "Actualizar a la tasa actual" también para los pedidos de Hoy: recalcula el CUP de los
// que todavía no están facturados; los facturados (ya consumados) no se tocan. Como los
// pedidos de Hoy ya cuentan en el ingreso, el ingreso se ajusta por la diferencia.
// Hoy fijo: lunes 2026-09-21. Precio 1 USD, tasa actual 100 → 100 CUP por unidad.

const STORAGE_KEY = "procovar-inventario-v1";
const BUTTON = /Actualizar a la tasa actual/;
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const sale = (id, over = {}) => ({
  id: `m-${id}`, code: "P500", type: "venta", qty: 6, date: "2026-09-21", timestamp: "2026-09-21T08:00:00.000Z",
  unitPrice: 80, unitHl: 0.03, exchangeRate: 80, orderId: id, orderSeq: 1, customerName: `Cliente ${id}`,
  isDelivery: false, note: "", bucket: "hoy", sent: false, ...over,
});

function seed(movements, extra = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100, cumulativeRevenue: 1000,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...extra,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const byId = (id) => saved().movements.find((m) => m.orderId === id);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Actualizar a la tasa actual (pedidos de Hoy)", () => {
  it("con pedidos de Hoy sin facturar, el botón está en la lista de Hoy", async () => {
    seed([sale("a")]);
    render(<InventoryApp />);
    expect(await screen.findByRole("button", { name: BUTTON })).toBeTruthy();
    expect(screen.getByRole("button", { name: BUTTON }).textContent).toContain("1 USD = 100");
  });

  it("recalcula el CUP de los pedidos de Hoy sin facturar a la tasa actual", async () => {
    seed([sale("a"), sale("b", { qty: 12 })]);
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    await waitFor(() => expect(byId("a").unitPrice).toBe(100));
    expect(byId("b").unitPrice).toBe(100);
    expect(byId("a").exchangeRate).toBe(100);
  });

  it("ajusta el ingreso acumulado por la diferencia (los pedidos de Hoy ya cuentan)", async () => {
    seed([sale("a"), sale("b", { qty: 12 })]);
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    // (6 + 12) unidades × (100 − 80) = +360
    await waitFor(() => expect(saved().cumulativeRevenue).toBe(1360));
  });

  it("no toca los ya facturados, ni los de otros días, ni los programados", async () => {
    seed([
      sale("a"),
      sale("facturado", { sent: true }),
      sale("ayer", { date: "2026-09-20", timestamp: "2026-09-20T08:00:00.000Z" }),
      sale("manana", { bucket: "manana", date: "2026-09-22" }),
    ]);
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    await waitFor(() => expect(byId("a").unitPrice).toBe(100));
    expect(byId("facturado").unitPrice).toBe(80);
    expect(byId("ayer").unitPrice).toBe(80);
    expect(byId("manana").unitPrice).toBe(80);
    expect(saved().cumulativeRevenue).toBe(1120);
  });

  it("no cambia el stock", async () => {
    seed([sale("a")]);
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    await waitFor(() => expect(byId("a").unitPrice).toBe(100));
    expect(saved().stock.P500).toBe(100);
  });

  it("si todos los de Hoy ya están facturados, no se ofrece", async () => {
    seed([sale("a", { sent: true })]);
    render(<InventoryApp />);
    await screen.findAllByRole("button", { name: /Cliente a/ });
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("sin tasa de cambio no se ofrece", async () => {
    seed([sale("a")], { exchangeRate: 0, pricesAreUsd: false });
    render(<InventoryApp />);
    await screen.findAllByRole("button", { name: /Cliente a/ });
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("en la lista de Programar sigue el botón de siempre, que no toca lo de Hoy", async () => {
    seed([sale("a"), sale("manana", { bucket: "manana", date: "2026-09-22" })]);
    render(<InventoryApp />);
    await screen.findByRole("button", { name: BUTTON });
    fireEvent.click(screen.getAllByRole("button", { name: /^Para mañana/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    await waitFor(() => expect(byId("manana").unitPrice).toBe(100));
    expect(byId("a").unitPrice).toBe(80);
    expect(saved().cumulativeRevenue).toBe(1000);
  });
});
