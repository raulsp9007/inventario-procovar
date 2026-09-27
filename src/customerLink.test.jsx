import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { todayStr } from "./dateUtils";

// Tocar el nombre de un cliente en un pedido (Pedidos) lleva a su ficha en
// Clientes, ya expandida.

const STORAGE_KEY = "procovar-inventario-v1";

beforeEach(() => {
  localStorage.clear();
  // jsdom no implementa scrollIntoView.
  Element.prototype.scrollIntoView = () => {};
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements: [{
      id: "m1", code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0, date: todayStr(),
      timestamp: new Date().toISOString(), orderId: "o1", orderSeq: 1, customerName: "Ana Lopez",
      businessName: "", customerPhone: "", isDelivery: false, note: "",
      bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true,
    }],
    customers: [{ id: "c1", name: "Ana Lopez", businessName: "", phone: "", createdAt: new Date().toISOString() }],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
  }));
});

describe("tocar el nombre de un cliente en Pedidos", () => {
  it("cambia a Clientes y abre la ficha de ese cliente", async () => {
    render(<InventoryApp />);
    // El reloj real puede caer domingo (Pedidos abre en "Para mañana"); nos
    // aseguramos de estar en "Hoy", donde está sembrado el pedido.
    fireEvent.click(await screen.findByRole("button", { name: /^Hoy/ }));
    const nameButton = await screen.findByRole("button", { name: /Ana Lopez/ });
    fireEvent.click(nameButton);

    await waitFor(() => expect(screen.getByText(/CLIENTES/)).toBeTruthy());
    // La ficha abierta muestra el pedido del cliente (fecha del pedido visible).
    await waitFor(() => expect(screen.getAllByText(/Ana Lopez/).length).toBeGreaterThan(0));
  });
});
