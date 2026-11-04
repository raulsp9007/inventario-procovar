import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// "Ocultar productos en 0": en Productos esconde todos los que tienen inventario 0, también los
// que tienen clientes en "Anotar en espera" (la lista de espera no los mantiene a la vista).
// Hoy fijo: lunes 2026-09-21.

const STORAGE_KEY = "procovar-inventario-v1";
const HIDE_KEY = "procovar-ocultar-productos-cero";
const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M330", name: "Malta 330ml", short: "M-330", color: "#7A5A2E", hl: 0.003, format: "Sixpack" },
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", color: "#2E7A5A", hl: 0.015, format: "Sixpack" },
];
// P500 y M330 en 0; P500 además tiene un cliente en espera.
const waitlist = [{ id: "w1", code: "P500", customerName: "Ana López", qty: 12, createdAt: "2026-09-20T10:00:00.000Z" }];

function seed() {
  localStorage.setItem("procovar-active-tab", "productos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [], customers: [{ id: "a", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" }],
    waitlist, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 0, M330: 0, P1500: 10 }, prices: { P500: 1, M330: 1, P1500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const shown = () => [...document.querySelectorAll("[data-product-code]")].map((el) => el.getAttribute("data-product-code"));
const toggle = (label) => screen.findByRole("button", { name: label });

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

describe("Productos: ocultar los que están en 0", () => {
  it("sin ocultar, se ven todos, también los que están en 0", async () => {
    seed();
    render(<InventoryApp />);
    await toggle("Ocultar productos en 0 (2)");
    expect(shown().sort()).toEqual(["M330", "P1500", "P500"]);
  });

  it("al ocultar, desaparecen los que están en 0, incluso el que tiene clientes en espera", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await toggle("Ocultar productos en 0 (2)"));
    await waitFor(() => expect(shown()).toEqual(["P1500"]));
    expect(localStorage.getItem(HIDE_KEY)).toBe("1");
  });

  it("al mostrar de nuevo, vuelve el que tiene clientes en espera", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await toggle("Ocultar productos en 0 (2)"));
    fireEvent.click(await toggle("Mostrar productos en 0 (2)"));
    await waitFor(() => expect(shown().sort()).toEqual(["M330", "P1500", "P500"]));
    expect(localStorage.getItem(HIDE_KEY)).toBe("0");
  });

  it("si ya estaba activado al abrir la app, también oculta el que tiene clientes en espera", async () => {
    seed();
    localStorage.setItem(HIDE_KEY, "1");
    render(<InventoryApp />);
    await toggle("Mostrar productos en 0 (2)");
    expect(shown()).toEqual(["P1500"]);
  });

  it("un producto con clientes en espera pero con inventario sigue a la vista", async () => {
    seed();
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    data.stock.P500 = 5;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(HIDE_KEY, "1");
    render(<InventoryApp />);
    await toggle("Mostrar productos en 0 (1)");
    expect(shown().sort()).toEqual(["P1500", "P500"]);
  });

  it("al ajustar (modo edición) se ven todos, para poder reponerlos", async () => {
    seed();
    localStorage.setItem(HIDE_KEY, "1");
    render(<InventoryApp />);
    await toggle("Mostrar productos en 0 (2)");
    fireEvent.click(screen.getByRole("button", { name: /^Ajustar/ }));
    await waitFor(() => expect(shown().sort()).toEqual(["M330", "P1500", "P500"]));
  });
});
