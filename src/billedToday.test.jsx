import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Contador de lo que el vendedor envió hoy a facturación, producto por producto, en Pedidos > Hoy.
// Hoy fijo: lunes 2026-09-21.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M330", name: "Malta 330ml", short: "M-330", color: "#7A5A2E", hl: 0.003, format: "Sixpack" },
];
const move = (orderId, code, qty, over = {}) => ({
  id: `m-${orderId}-${code}`, code, type: "venta", qty, date: "2026-09-21", timestamp: "2026-09-21T08:00:00.000Z", unitPrice: 100, unitHl: 0.03,
  orderId, orderSeq: 1, customerName: `Cliente ${orderId}`, isDelivery: false, note: "", bucket: "hoy", sent: true, ...over,
});

function seed(movements) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 500, M330: 500 }, prices: { P500: 100, M330: 100 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const card = () => screen.findByRole("group", { name: "Enviado a facturación hoy" });

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

describe("Pedidos: contador de lo enviado a facturación hoy", () => {
  it("muestra cuántos pedidos y unidades, y cada producto", async () => {
    seed([move("a", "P500", 40), move("a", "M330", 30), move("b", "P500", 25)]);
    render(<InventoryApp />);
    const group = await card();
    expect(within(group).getByText("2 pedidos · 95 unidades")).toBeTruthy();
    expect(within(group).getByText("Parranda 500ml")).toBeTruthy();
    expect(within(group).getByText("65")).toBeTruthy();
    expect(within(group).getByText("Malta 330ml")).toBeTruthy();
    expect(within(group).getByText("30")).toBeTruthy();
  });

  it("solo cuenta lo enviado: no lo que falta por facturar, ni domicilios ni otros días", async () => {
    seed([
      move("a", "P500", 10),
      move("b", "P500", 99, { sent: false }),
      move("c", "P500", 77, { isDelivery: true }),
      move("d", "P500", 55, { date: "2026-09-20", timestamp: "2026-09-20T08:00:00.000Z" }),
    ]);
    render(<InventoryApp />);
    expect(within(await card()).getByText("1 pedido · 10 unidades")).toBeTruthy();
  });

  it("si no se envió nada hoy, no aparece", async () => {
    seed([move("a", "P500", 10, { sent: false })]);
    render(<InventoryApp />);
    await screen.findAllByRole("button", { name: /Cliente a/ });
    expect(screen.queryByRole("group", { name: "Enviado a facturación hoy" })).toBeNull();
  });
});
