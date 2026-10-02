import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Clientes > ficha > "Por pedido": cada producto del pedido lleva su cantidad.

const STORAGE_KEY = "procovar-inventario-v1";

function line(id, code, qty) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0, date: "2026-09-21",
    timestamp: "2026-09-21T01:00:00.000Z", orderId: "o1", orderSeq: 1, customerName: "Ana",
    businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00"));
  localStorage.setItem("procovar-active-tab", "clientes");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements: [line("a", "P500", 3), line("b", "M330", 12)],
    customers: [{ id: "c1", name: "Ana", businessName: "", phone: "", createdAt: new Date().toISOString() }],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50, M330: 50 }, prices: { P500: 1, M330: 1 }, pricesAreUsd: true, exchangeRate: 100,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ficha de cliente, subpestaña 'Por pedido'", () => {
  it("cada producto del pedido muestra su cantidad", async () => {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByText("👤 Ana"));
    expect(screen.getByText("P-500 x3")).toBeTruthy();
    expect(screen.getByText("M-330 x12")).toBeTruthy();
  });
});
