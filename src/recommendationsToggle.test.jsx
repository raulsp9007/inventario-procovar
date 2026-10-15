import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Interruptor "Mostrar recomendaciones de compra" (Configuración). Apagado
// desaparecen la tarjeta "Para escribir hoy" y la sugerencia "Lo de siempre"
// del pedido nuevo; el historial no se toca. Por defecto está activo.
// Hoy fijo: lunes 2026-09-21.

const STORAGE_KEY = "procovar-inventario-v1";
const LABEL = "Mostrar recomendaciones de compra";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M330", name: "Malta 330ml", short: "M-330", color: "#274E37", hl: 0.003, format: "Sixpack" },
];

let n = 0;
function order(customerName, date, lines) {
  n += 1;
  return lines.map(([code, qty], i) => ({
    id: `m-${n}-${i}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0, date,
    timestamp: `${date}T10:00:00.000Z`, orderId: `o-${n}`, orderSeq: n, customerName,
    businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true,
  }));
}

// Ana pide cada lunes; hoy le toca (último pedido el 7 de septiembre).
const history = () => ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"].flatMap((d) => order("Ana", d, [["P500", 40], ["M330", 30]]));

function seed(tab, extra = {}) {
  localStorage.setItem("procovar-active-tab", tab);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: history(),
    customers: [{ id: "c1", name: "Ana", businessName: "Bodega Sol", phone: "5353551234", createdAt: "2026-01-01T00:00:00.000Z" }],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100, M330: 100 }, prices: { P500: 1, M330: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...extra,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

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

describe("Interruptor de recomendaciones de compra", () => {
  it("en Configuración está activo por defecto", async () => {
    seed("config");
    render(<InventoryApp />);
    const toggle = await screen.findByLabelText(LABEL);
    expect(toggle.checked).toBe(true);
  });

  it("apagado: no aparece la tarjeta 'Para escribir hoy'", async () => {
    seed("pedidos", { showRecommendations: false });
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Cierre del día" });
    expect(screen.queryByRole("button", { name: /Para escribir hoy/ })).toBeNull();
  });

  it("apagado: al armar un pedido no propone 'lo de siempre'", async () => {
    seed("pedidos", { showRecommendations: false });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByLabelText("Nuevo pedido"));
    fireEvent.change(await screen.findByPlaceholderText("Nombre del cliente"), { target: { value: "Ana" } });
    expect(screen.queryByLabelText("Sugerencia para Ana")).toBeNull();
  });

  it("apagarlo desde Configuración lo guarda y quita la tarjeta de Pedidos", async () => {
    seed("config");
    render(<InventoryApp />);
    fireEvent.click(await screen.findByLabelText(LABEL));
    await waitFor(() => expect(saved().showRecommendations).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Pedidos" }));
    await screen.findByRole("button", { name: "Cierre del día" });
    expect(screen.queryByRole("button", { name: /Para escribir hoy/ })).toBeNull();
  });

  it("volver a encenderlo trae la tarjeta, y el historial siguió intacto", async () => {
    seed("config", { showRecommendations: false });
    render(<InventoryApp />);
    const toggle = await screen.findByLabelText(LABEL);
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => expect(saved().showRecommendations).toBe(true));
    expect(saved().movements).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Pedidos" }));
    expect(await screen.findByRole("button", { name: /Para escribir hoy/ })).toBeTruthy();
  });
});
