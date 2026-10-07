import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Productos: la agarradera para mover (reordenar) un producto solo existe en
// modo Ajustar; en la vista normal no está, para no arrastrar sin querer.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M330", name: "Malta 330ml", short: "M-330", color: "#274E37", hl: 0.003, format: "Sixpack" },
];

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
  localStorage.setItem("procovar-active-tab", "stock");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [], customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 10, M330: 20 }, prices: { P500: 1, M330: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Productos: mover solo en modo Ajustar", () => {
  it("en la vista normal no hay agarraderas para mover", async () => {
    render(<InventoryApp />);
    await screen.findByText("PRODUCTOS");
    await waitFor(() => expect(document.querySelectorAll("[data-product-code]").length).toBe(2));
    expect(screen.queryAllByLabelText("Arrastrar para reordenar")).toHaveLength(0);
  });

  it("en modo Ajustar hay una agarradera por producto", async () => {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(screen.queryAllByLabelText("Arrastrar para reordenar")).toHaveLength(2));
  });

  it("al salir del modo Ajustar las agarraderas desaparecen", async () => {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(screen.queryAllByLabelText("Arrastrar para reordenar")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /Guardar existencias/ }));
    await waitFor(() => expect(screen.queryAllByLabelText("Arrastrar para reordenar")).toHaveLength(0));
  });
});
