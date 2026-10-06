import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Metas de venta (Productos): blísteres diarios y HL diarios de cerveza y
// malta, más la meta general en HL. Solo cuentan los productos marcados como
// "Cerveza o malta"; el avance de hoy se ve en Productos y en Pedidos.

const STORAGE_KEY = "procovar-inventario-v1";

const baseProducts = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M1500", name: "Malta 1500ml", short: "M-1500", color: "#274E37", hl: 0.015, format: "Sixpack" },
  { code: "VODKA", name: "Vodka", short: "Vodka", color: "#6B4C9A", hl: 0.005, format: "Sixpack" },
];

function sale(id, code, qty, hl) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice: 100, unitHl: hl, date: "2026-09-21",
    timestamp: `2026-09-21T0${id}:00:00.000Z`, orderId: `o${id}`, orderSeq: id, customerName: `Cliente ${id}`,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: false, sentToCustomer: false,
  };
}

function seed({ view = "stock", products = baseProducts, movements = [], extra = {} } = {}) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 400, M1500: 100, VODKA: 50 }, prices: { P500: 1, M1500: 1, VODKA: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }],
    ...extra,
  }));
}

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Productos: metas de venta", () => {
  it("tiene los tres campos y guarda cada uno", async () => {
    seed({ extra: { goalProductsMigrated: true } });
    render(<InventoryApp />);
    const blisters = await screen.findByLabelText("Blísteres diarios (cerveza y malta)");
    fireEvent.change(blisters, { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("HL diarios (cerveza y malta)"), { target: { value: "13.7" } });
    fireEvent.change(screen.getByLabelText("Meta general (hL)"), { target: { value: "500" } });

    await waitFor(() => {
      expect(stored().dailyBlisterGoal).toBe(200);
      expect(stored().dailyHlGoal).toBe(13.7);
      expect(stored().hlGoal).toBe(500);
    });
  });

  it("vaciar un campo quita la meta", async () => {
    seed({ extra: { goalProductsMigrated: true, dailyBlisterGoal: 200 } });
    render(<InventoryApp />);
    const blisters = await screen.findByLabelText("Blísteres diarios (cerveza y malta)");
    expect(blisters.value).toBe("200");
    fireEvent.change(blisters, { target: { value: "" } });
    await waitFor(() => expect(stored().dailyBlisterGoal).toBeNull());
  });

  it("muestra el avance de hoy solo con los productos marcados", async () => {
    seed({
      products: baseProducts.map((p) => (p.code === "VODKA" ? p : { ...p, inGoals: true })),
      movements: [sale(1, "P500", 30, 0.005), sale(2, "M1500", 10, 0.015), sale(3, "VODKA", 99, 0.005)],
      extra: { goalProductsMigrated: true, dailyBlisterGoal: 200, dailyHlGoal: 4 },
    });
    render(<InventoryApp />);
    // 30 + 10 = 40 blísteres de 200 (20%); HL = 0.15 + 0.15 = 0.30 de 4 (8%); el vodka no cuenta.
    expect(await screen.findByText("Hoy: 40 de 200 blísteres (20%)")).toBeTruthy();
    expect(screen.getByText("Hoy: 0.30 de 4 hL (8%)")).toBeTruthy();
  });

  it("sin meta cargada igual muestra lo vendido hoy", async () => {
    seed({
      products: baseProducts.map((p) => (p.code === "P500" ? { ...p, inGoals: true } : p)),
      movements: [sale(1, "P500", 7, 0.005)],
      extra: { goalProductsMigrated: true },
    });
    render(<InventoryApp />);
    expect(await screen.findByText("Hoy: 7 blísteres")).toBeTruthy();
  });

  it("la meta general muestra lo vendido en total contra la meta", async () => {
    seed({ extra: { goalProductsMigrated: true, hlGoal: 200, cumulativeHl: 50 } });
    render(<InventoryApp />);
    expect(await screen.findByText("Vendido: 50.00 hL de 200 hL (25%)")).toBeTruthy();
  });
});

describe("Productos: qué cuenta como cerveza o malta", () => {
  it("al cargar datos viejos marca los P/M en Sixpack y lo guarda", async () => {
    seed(); // sin goalProductsMigrated
    render(<InventoryApp />);
    await screen.findByLabelText("Blísteres diarios (cerveza y malta)");
    await waitFor(() => expect(stored().goalProductsMigrated).toBe(true));
    const byCode = Object.fromEntries(stored().products.map((p) => [p.code, p.inGoals]));
    expect(byCode.P500).toBe(true);
    expect(byCode.M1500).toBe(true);
    expect(byCode.VODKA).toBeUndefined();
  });

  it("no pisa lo que ya elegiste: con la migración hecha no vuelve a marcar nada", async () => {
    seed({ extra: { goalProductsMigrated: true } });
    render(<InventoryApp />);
    await screen.findByLabelText("Blísteres diarios (cerveza y malta)");
    expect(stored().products.some((p) => p.inGoals)).toBe(false);
  });

  it("en Ajustar se marca o desmarca por producto y se guarda al guardar", async () => {
    seed({ extra: { goalProductsMigrated: true } });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(document.querySelector('[data-product-code="P500"]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-product-code="P500"]'));
    const card = document.querySelector('[data-product-code="P500"]');
    const box = within(card).getByLabelText("Cerveza o malta: Parranda 500ml");
    expect(box.checked).toBe(false);

    fireEvent.click(box);
    expect(screen.getByText("1 cambio sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Guardar existencias/ }));

    await waitFor(() => expect(stored().products.find((p) => p.code === "P500").inGoals).toBe(true));
    expect(stored().products.find((p) => p.code === "M1500").inGoals).toBeUndefined();
  });

  it("desmarcar quita la marca", async () => {
    seed({
      products: baseProducts.map((p) => (p.code === "P500" ? { ...p, inGoals: true } : p)),
      extra: { goalProductsMigrated: true },
    });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(document.querySelector('[data-product-code="P500"]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-product-code="P500"]'));
    const box = within(document.querySelector('[data-product-code="P500"]')).getByLabelText("Cerveza o malta: Parranda 500ml");
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /Guardar existencias/ }));
    await waitFor(() => expect(stored().products.find((p) => p.code === "P500").inGoals).toBeFalsy());
  });
});

describe("Pedidos > Resumen de hoy: blísteres y HL de cerveza y malta", () => {
  const goalProducts = baseProducts.map((p) => (p.code === "VODKA" ? p : { ...p, inGoals: true }));

  it("muestra los blísteres de hoy con el porcentaje de la meta", async () => {
    seed({
      view: "pedidos", products: goalProducts,
      movements: [sale(1, "P500", 30, 0.005), sale(2, "M1500", 10, 0.015), sale(3, "VODKA", 99, 0.005)],
      extra: { goalProductsMigrated: true, dailyBlisterGoal: 200 },
    });
    render(<InventoryApp />);
    const label = await screen.findByText("BLÍSTERES");
    const card = label.parentElement;
    expect(within(card).getByText("40")).toBeTruthy();
    expect(within(card).getByText("20% de la meta diaria")).toBeTruthy();
  });

  it("el HL de hoy cuenta solo cerveza y malta cuando hay productos marcados", async () => {
    seed({
      view: "pedidos", products: goalProducts,
      movements: [sale(1, "P500", 30, 0.005), sale(2, "M1500", 10, 0.015), sale(3, "VODKA", 99, 0.005)],
      extra: { goalProductsMigrated: true, dailyHlGoal: 4 },
    });
    render(<InventoryApp />);
    const label = await screen.findByText("HL CERVEZA Y MALTA");
    const card = label.parentElement;
    expect(within(card).getByText("0.30")).toBeTruthy();
    expect(within(card).getByText("8% de la meta diaria")).toBeTruthy();
  });

  it("sin productos marcados todo queda como antes: HL de todo y sin tarjeta de blísteres", async () => {
    seed({
      view: "pedidos",
      movements: [sale(1, "P500", 30, 0.005), sale(3, "VODKA", 99, 0.005)],
      extra: { goalProductsMigrated: true },
    });
    render(<InventoryApp />);
    const label = await screen.findByText("HL VENDIDOS");
    expect(within(label.parentElement).getByText("0.65")).toBeTruthy();
    expect(screen.queryByText("BLÍSTERES")).toBeNull();
  });
});
