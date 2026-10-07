import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { useInventoryStore } from "./useInventoryStore";
import InventoryApp from "./InventoryApp";
import { getHlBackfill } from "./hlBackfill";

// El HL por unidad de cada producto es el de una botella; cada venta cuenta
// el formato completo (sixpack = 6). Al abrir datos viejos se recalcula todo
// el historial una sola vez.

const STORAGE_KEY = "procovar-inventario-v1";
const formats = [{ code: "Sixpack", units: 6 }, { code: "Caja24u", units: 24 }];
const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack", inGoals: true },
  { code: "M1500", name: "Malta 1500ml", short: "M-1500", color: "#274E37", hl: 0.015, format: "Sixpack", inGoals: true },
  { code: "ARROZ", name: "Arroz", short: "Arroz", color: "#8A8574" },
];

function sale(id, code, qty, unitHl, extra = {}) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice: 100, unitHl, date: "2026-09-21",
    timestamp: `2026-09-21T0${id}:00:00.000Z`, orderId: `o${id}`, orderSeq: id, customerName: `Cliente ${id}`,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: false, sentToCustomer: false, ...extra,
  };
}

function seed({ movements = [], extra = {}, view = "stock" } = {}) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, goalProductsMigrated: true,
    lastBackupAt: new Date().toISOString(), stock: { P500: 400, M1500: 100, ARROZ: 50 },
    prices: { P500: 1, M1500: 1, ARROZ: 1 }, pricesAreUsd: true, exchangeRate: 100, productFormats: formats,
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

describe("migración del historial al abrir datos viejos", () => {
  it("recalcula el HL de cada venta y del acumulado, y lo guarda", async () => {
    seed({
      movements: [sale(1, "P500", 30, 0.005), sale(2, "M1500", 10, 0.015), sale(3, "ARROZ", 5, 0)],
      extra: { cumulativeHl: 0.3 }, // 30 x 0.005 + 10 x 0.015, sin el factor del formato
    });
    render(<InventoryApp />);
    await waitFor(() => expect(stored().hlPerFormatMigrated).toBe(true));
    const byId = Object.fromEntries(stored().movements.map((m) => [m.id, m.unitHl]));
    expect(byId["m-1"]).toBe(0.03);
    expect(byId["m-2"]).toBe(0.09);
    expect(byId["m-3"]).toBe(0);
    // 0.3 + 30 x (0.03 - 0.005) + 10 x (0.09 - 0.015) = 0.3 + 0.75 + 0.75 = 1.8
    expect(stored().cumulativeHl).toBeCloseTo(1.8, 6);
  });

  it("no se repite: con la bandera puesta no vuelve a multiplicar", async () => {
    seed({
      movements: [sale(1, "P500", 30, 0.03)],
      extra: { cumulativeHl: 0.9, hlPerFormatMigrated: true },
    });
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Ajustar" });
    expect(stored().movements[0].unitHl).toBe(0.03);
    expect(stored().cumulativeHl).toBe(0.9);
  });

  it("el resumen de hoy en Pedidos ya muestra el HL del blíster completo", async () => {
    seed({
      view: "pedidos",
      movements: [sale(1, "P500", 30, 0.005), sale(2, "M1500", 10, 0.015)],
      extra: { cumulativeHl: 0.3, dailyHlGoal: 12.56 },
    });
    render(<InventoryApp />);
    const label = await screen.findByText("HL CERVEZA Y MALTA");
    // 30 x 0.03 + 10 x 0.09 = 1.80
    expect(within(label.parentElement).getByText("1.80")).toBeTruthy();
  });

  it("importar un respaldo viejo (sin la bandera) también lo recalcula", async () => {
    seed({ extra: { hlPerFormatMigrated: true } });
    const { result } = renderHook(() => useInventoryStore());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // Un respaldo de antes: sin bandera y con HL por botella.
    const backup = {
      products, productFormats: formats, stock: { P500: 10 }, prices: {}, orderSeqPerDay: true, goalProductsMigrated: true,
      movements: [sale(1, "P500", 10, 0.005)], cumulativeHl: 0.05,
    };
    const file = new File([JSON.stringify(backup)], "respaldo.json", { type: "application/json" });
    act(() => { result.current.handleImportFileChange({ target: { files: [file], value: "" } }); });
    await waitFor(() => expect(result.current.pendingImport).toBeTruthy());
    act(() => { result.current.confirmImport(); });
    await waitFor(() => expect(stored().movements[0].unitHl).toBe(0.03));
    expect(stored().cumulativeHl).toBeCloseTo(0.3, 6);
  });
});

describe("ventas nuevas: el HL de cada una es el del formato completo", () => {
  async function loadedStore() {
    seed({ extra: { hlPerFormatMigrated: true } });
    const view = renderHook(() => useInventoryStore());
    await waitFor(() => expect(view.result.current.loaded).toBe(true));
    return view;
  }

  it("un pedido guarda HL por unidad x unidades del formato y suma al acumulado", async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.confirmOrder({
        customerName: "Ana", businessName: "", customerPhone: "", isDelivery: false, note: "",
        lines: [{ code: "P500", qty: 10 }, { code: "ARROZ", qty: 2 }], bucket: "hoy",
      });
    });
    await waitFor(() => expect(result.current.movements.length).toBe(2));
    const p500 = result.current.movements.find((m) => m.code === "P500");
    expect(p500.unitHl).toBe(0.03);
    expect(result.current.movements.find((m) => m.code === "ARROZ").unitHl).toBe(0);
    expect(result.current.cumulativeHl).toBeCloseTo(0.3, 6);
  });

  it("una venta manual hace lo mismo", async () => {
    const { result } = await loadedStore();
    act(() => { result.current.registerManualSale("M1500", 4); });
    await waitFor(() => expect(result.current.movements.length).toBe(1));
    expect(result.current.movements[0].unitHl).toBe(0.09);
    expect(result.current.cumulativeHl).toBeCloseTo(0.36, 6);
  });

  it("editar un pedido recalcula con el formato", async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.confirmOrder({
        customerName: "Ana", businessName: "", customerPhone: "", isDelivery: false, note: "",
        lines: [{ code: "P500", qty: 1 }], bucket: "hoy",
      });
    });
    await waitFor(() => expect(result.current.movements.length).toBe(1));
    const orderId = result.current.movements[0].orderId;
    act(() => {
      result.current.editOrder(orderId, {
        customerName: "Ana", businessName: "", customerPhone: "", isDelivery: false, note: "",
        lines: [{ code: "P500", qty: 5 }], bucket: "hoy",
      });
    });
    await waitFor(() => expect(result.current.movements.find((m) => m.orderId === orderId).qty).toBe(5));
    expect(result.current.movements.find((m) => m.orderId === orderId).unitHl).toBe(0.03);
    expect(result.current.cumulativeHl).toBeCloseTo(0.15, 6);
  });
});

describe("Recalcular HL de ventas anteriores (relleno)", () => {
  const sinHl = [{ id: "a", type: "venta", code: "P500", qty: 10, unitHl: 0, bucket: "hoy" }];

  it("rellena con el HL del formato completo cuando se le pasan los formatos", () => {
    const info = getHlBackfill(sinHl, products, "P500", formats);
    expect(info.hl).toBeCloseTo(0.03, 10);
    expect(info.hlAdded).toBeCloseTo(0.3, 6);
  });

  it("sin formatos se comporta como antes", () => {
    expect(getHlBackfill(sinHl, products, "P500").hl).toBe(0.005);
  });
});

describe("Ajustar: aclara cuánto es un formato completo", () => {
  it("muestra el HL del sixpack junto al HL por unidad", async () => {
    seed({ extra: { hlPerFormatMigrated: true } });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(document.querySelector('[data-product-code="P500"]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-product-code="P500"]'));
    const card = document.querySelector('[data-product-code="P500"]');
    expect(within(card).getByText(/Un Sixpack \(6 uds\) = 0\.03 hL/)).toBeTruthy();
  });

  it("no lo muestra en productos sin formato", async () => {
    seed({ extra: { hlPerFormatMigrated: true } });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(document.querySelector('[data-product-code="ARROZ"]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-product-code="ARROZ"]'));
    expect(within(document.querySelector('[data-product-code="ARROZ"]')).queryByText(/hL$/)).toBeNull();
  });
});
