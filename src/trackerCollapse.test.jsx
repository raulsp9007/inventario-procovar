import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Un pedido con los 3 pasos hechos se ve como la pastilla "Confirmado".
// Si se reabre a mano para corregir un paso y se vuelve a completar, tiene
// que volver a colapsar a la pastilla.

const STORAGE_KEY = "procovar-inventario-v1";

function seedDoneOrder() {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements: [{
      id: "m1", code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0, date: "2026-09-21",
      timestamp: "2026-09-21T01:00:00.000Z", orderId: "o1", orderSeq: 1, customerName: "Ana",
      businessName: "", customerPhone: "", isDelivery: false, note: "",
      bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true,
    }],
    customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
});

const pill = () => screen.queryByText("tocar para editar");

describe("pastilla 'Confirmado' del pedido", () => {
  it("al reabrirla, desmarcar un paso y volver a completarlo, vuelve a colapsar", async () => {
    seedDoneOrder();
    render(<InventoryApp />);
    await waitFor(() => expect(pill()).toBeTruthy());

    fireEvent.click(screen.getByText("Confirmado")); // reabre para editar
    expect(pill()).toBeNull();
    const confirmedStep = () => screen.getByLabelText("Confirmado");
    expect(confirmedStep().getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(confirmedStep()); // desconfirma
    await waitFor(() => expect(confirmedStep().getAttribute("aria-pressed")).toBe("false"));
    expect(pill()).toBeNull();

    fireEvent.click(confirmedStep()); // vuelve a confirmar
    await waitFor(() => expect(pill()).toBeTruthy());
  });

  it("reabierta sin tocar nada sigue abierta (no se vuelve a cerrar sola)", async () => {
    seedDoneOrder();
    render(<InventoryApp />);
    await waitFor(() => expect(pill()).toBeTruthy());
    fireEvent.click(screen.getByText("Confirmado"));
    expect(pill()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pill()).toBeNull();
    expect(screen.getByLabelText("Confirmado").getAttribute("aria-pressed")).toBe("true");
  });
});
