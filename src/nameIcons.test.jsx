import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { todayStr } from "./dateUtils";

// Los iconos se agregan solo al mostrar: el nombre guardado sigue limpio.

const STORAGE_KEY = "procovar-inventario-v1";

function seed(view) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements: [{
      id: "m1", code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0, date: todayStr(),
      timestamp: new Date().toISOString(), orderId: "o1", orderSeq: 1, customerName: "Ana Lopez",
      businessName: "Cafetería El Punto", customerPhone: "", isDelivery: false, note: "",
      bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true,
    }],
    customers: [
      { id: "c1", name: "Ana Lopez", businessName: "Cafetería El Punto", phone: "", createdAt: new Date().toISOString() },
      { id: "c2", name: "Carla Gómez", businessName: "", phone: "", createdAt: new Date().toISOString() },
    ],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
  }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("iconos de cliente y negocio en la app", () => {
  it("Pedidos: la fila del pedido muestra 👤 antes del cliente y 🏪 antes del negocio", async () => {
    seed("pedidos");
    render(<InventoryApp />);
    expect(await screen.findByText("👤 Ana Lopez")).toBeTruthy();
    expect(screen.getByText("🏪 Cafetería El Punto")).toBeTruthy();
  });

  it("Clientes: la lista muestra los iconos, y sin negocio no aparece 🏪", async () => {
    seed("clientes");
    render(<InventoryApp />);
    expect(await screen.findByText("👤 Ana Lopez")).toBeTruthy();
    expect(screen.getByText("🏪 Cafetería El Punto")).toBeTruthy();
    expect(screen.getByText("👤 Carla Gómez")).toBeTruthy();
    expect(screen.getAllByText(/🏪/)).toHaveLength(1);
  });

  it("el nombre guardado no lleva el icono", async () => {
    seed("clientes");
    render(<InventoryApp />);
    await screen.findByText("👤 Ana Lopez");
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy());
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(saved.customers.map((c) => c.name)).toEqual(["Ana Lopez", "Carla Gómez"]);
    expect(saved.movements[0].customerName).toBe("Ana Lopez");
    expect(saved.movements[0].businessName).toBe("Cafetería El Punto");
  });
});
