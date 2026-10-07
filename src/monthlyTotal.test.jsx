import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Resumen: "Total general acumulado" cuenta solo el mes en curso (del día 1
// hasta hoy) y vuelve a cero el día 1 de cada mes, igual que su comisión.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];

function sale(id, qty, date) {
  return {
    id: `m-${id}`, code: "P500", type: "venta", qty, unitPrice: 100, unitHl: 0.03, date,
    timestamp: `${date}T10:00:00.000Z`, orderId: `o${id}`, orderSeq: id, customerName: `Cliente ${id}`,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: false, sentToCustomer: false,
  };
}

function seed(extra = {}) {
  localStorage.setItem("procovar-active-tab", "resumen");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products,
    movements: [
      sale(1, 10, "2026-09-05"), // este mes
      sale(2, 5, "2026-09-21"),  // hoy
      sale(3, 50, "2026-08-31"), // mes anterior: no cuenta
    ],
    customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 100 }, pricesAreUsd: false, exchangeRate: null,
    cumulativeRevenue: 99999, // el acumulado de siempre ya no se usa en la tarjeta
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...extra,
  }));
}

function card() {
  const title = screen.getByText("TOTAL GENERAL ACUMULADO");
  return within(title.parentElement.parentElement);
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

describe("Resumen: total general acumulado del mes", () => {
  it("suma del día 1 hasta hoy, sin el mes anterior ni el acumulado de siempre", async () => {
    seed();
    render(<InventoryApp />);
    await screen.findByText("TOTAL GENERAL ACUMULADO");
    expect(card().getByText("1500 CUP")).toBeTruthy(); // 10 x 100 + 5 x 100
    expect(card().queryByText(/99999/)).toBeNull();
  });

  it("indica que se reinicia el día 1 de cada mes", async () => {
    seed();
    render(<InventoryApp />);
    await screen.findByText("TOTAL GENERAL ACUMULADO");
    expect(card().getByText(/septiembre de 2026/i)).toBeTruthy();
    expect(card().getByText(/se reinicia el día 1/i)).toBeTruthy();
  });

  it("el día 1 de un mes nuevo vuelve a cero", async () => {
    vi.setSystemTime(new Date("2026-10-01T09:00:00"));
    seed();
    render(<InventoryApp />);
    await screen.findByText("TOTAL GENERAL ACUMULADO");
    expect(card().getByText("0 CUP")).toBeTruthy();
  });

  it("la comisión se calcula sobre el total del mes", async () => {
    seed({ commissionPercent: 10 });
    render(<InventoryApp />);
    await screen.findByText("TOTAL GENERAL ACUMULADO");
    expect(card().getByText("150 CUP")).toBeTruthy(); // 10% de 1500
  });
});
