import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Pedidos: bajo el total en CUP de cada pedido va el total en dólares
// (total en CUP / tasa de cambio). Sin tasa cargada no hay USD que mostrar.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "VODKA", name: "Vodka", short: "Vodka", color: "#6B4C9A", hl: 0.005, format: "Sixpack" },
];

function line(id, code, qty, unitPrice, orderId, seq, name) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice, unitHl: 0.03, date: "2026-09-21",
    timestamp: `2026-09-21T0${id}:00:00.000Z`, orderId, orderSeq: seq, customerName: name,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false,
  };
}

function seed(extra = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products,
    movements: [
      line(1, "P500", 3, 100, "o1", 1, "Ana"),   // 300 CUP
      line(2, "VODKA", 2, 250, "o1", 1, "Ana"),  // +500 = 800 CUP
      line(3, "P500", 1, 150, "o2", 2, "Beto"),  // 150 CUP
    ],
    customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100, VODKA: 100 }, prices: { P500: 1, VODKA: 2.5 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...extra,
  }));
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Pedidos: total en dólares bajo el total en CUP", () => {
  it("muestra el total de cada pedido en USD con la tasa de cambio", async () => {
    seed();
    render(<InventoryApp />);
    expect(await screen.findByText("US$8.00")).toBeTruthy();  // 800 CUP / 100
    expect(screen.getByText("US$1.50")).toBeTruthy();         // 150 CUP / 100
  });

  it("va debajo del total en CUP", async () => {
    seed();
    render(<InventoryApp />);
    const usd = await screen.findByText("US$8.00");
    const cup = screen.getByText("800");
    expect(cup.compareDocumentPosition(usd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(usd.parentElement).toBe(cup.parentElement.parentElement); // misma columna del total
  });

  it("sin tasa de cambio no muestra dólares", async () => {
    seed({ exchangeRate: null, pricesAreUsd: false });
    render(<InventoryApp />);
    await screen.findByText("800");
    expect(screen.queryByText(/US\$/)).toBeNull();
  });

  it("con los precios ocultos no muestra ningún total", async () => {
    seed({ showPrices: false });
    render(<InventoryApp />);
    expect((await screen.findAllByText(/Ana/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/US\$/)).toBeNull();
  });
});
