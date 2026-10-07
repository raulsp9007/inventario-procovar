import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Productos: el campo "1$ = ... CUP" lleva el rótulo "Tasa de conversión".

const STORAGE_KEY = "procovar-inventario-v1";

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
  localStorage.setItem("procovar-active-tab", "stock");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products: [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }],
    movements: [], customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 10 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Productos: tasa de conversión", () => {
  it("muestra el rótulo «Tasa de conversión» junto al campo de la tasa", async () => {
    render(<InventoryApp />);
    const label = await screen.findByText("Tasa de conversión");
    expect(label).toBeTruthy();
    const field = screen.getByPlaceholderText("tasa");
    expect(field.value).toBe("100");
  });

  it("el rótulo nombra el campo para lectores de pantalla", async () => {
    render(<InventoryApp />);
    expect((await screen.findByLabelText("Tasa de conversión")).value).toBe("100");
  });
});
