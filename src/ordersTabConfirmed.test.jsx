import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Pestaña Pedidos: al lado de cuántos pedidos hay en el día va, entre paréntesis, cuántos están confirmados (a mano o por la
// facturadora): "Hoy 10 (8)". Hoy fijo: viernes 2026-10-30.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const move = (id, name, over = {}) => ({
  id: `m-${id}`, code: "P500", type: "venta", qty: 6, date: "2026-10-30", timestamp: `2026-10-30T0${id}:00:00.000Z`, unitPrice: 100, unitHl: 0.03,
  orderId: `o${id}`, orderSeq: id, customerName: name, isDelivery: false, note: "", bucket: "hoy", sent: true, sentToCustomer: true, confirmed: false, ...over,
});

function seed(movements) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 100 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}
const confirmedOf = (key) => document.querySelector(`[data-tab-confirmed="${key}"]`);
const totalOf = (key) => document.querySelector(`[data-tab-total="${key}"]`);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-30T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Pedidos: confirmados entre paréntesis en las pestañas", () => {
  it("Hoy muestra cuántos pedidos hay y, entre paréntesis, cuántos están confirmados", async () => {
    seed([move(1, "Ana", { confirmed: true }), move(2, "Beto"), move(3, "Carla", { confirmed: true }), move(4, "Diego")]);
    render(<InventoryApp />);
    await waitFor(() => expect(totalOf("hoy")).toBeTruthy());
    expect(totalOf("hoy").textContent).toBe("4");
    expect(confirmedOf("hoy").textContent).toBe("(2)");
  });

  it("Para mañana lleva el suyo, aparte del de Hoy", async () => {
    seed([
      move(1, "Ana", { confirmed: true }),
      move(2, "Beto", { bucket: "manana", date: "2026-10-31", confirmed: true }),
      move(3, "Carla", { bucket: "manana", date: "2026-10-31" }),
      move(4, "Diego", { bucket: "manana", date: "2026-11-02" }),
    ]);
    render(<InventoryApp />);
    await waitFor(() => expect(totalOf("manana")).toBeTruthy());
    expect([totalOf("hoy").textContent, confirmedOf("hoy").textContent]).toEqual(["1", "(1)"]);
    expect([totalOf("manana").textContent, confirmedOf("manana").textContent]).toEqual(["3", "(1)"]);
  });

  it("sin ninguno confirmado dice (0)", async () => {
    seed([move(1, "Ana"), move(2, "Beto")]);
    render(<InventoryApp />);
    await waitFor(() => expect(confirmedOf("hoy")).toBeTruthy());
    expect(confirmedOf("hoy").textContent).toBe("(0)");
  });

  it("sin pedidos: 0 (0)", async () => {
    seed([]);
    render(<InventoryApp />);
    await waitFor(() => expect(totalOf("hoy")).toBeTruthy());
    expect([totalOf("hoy").textContent, confirmedOf("hoy").textContent]).toEqual(["0", "(0)"]);
  });

  it("al confirmar un pedido a mano, sube el número entre paréntesis", async () => {
    seed([move(1, "Ana", { confirmed: true }), move(2, "Beto")]);
    render(<InventoryApp />);
    await waitFor(() => expect(confirmedOf("hoy")).toBeTruthy());
    expect(confirmedOf("hoy").textContent).toBe("(1)");
    fireEvent.click(screen.getByRole("button", { name: "Confirmado", pressed: false }));
    await waitFor(() => expect(confirmedOf("hoy").textContent).toBe("(2)"));
    expect(totalOf("hoy").textContent).toBe("2");
  });

  it("al deshacer la confirmación, baja", async () => {
    seed([move(1, "Ana", { confirmed: true }), move(2, "Beto")]);
    render(<InventoryApp />);
    await waitFor(() => expect(confirmedOf("hoy")).toBeTruthy());
    expect(confirmedOf("hoy").textContent).toBe("(1)");
    // con los tres pasos hechos el control está plegado en una pastilla "Confirmado": se abre y se desmarca CONF.
    fireEvent.click(await screen.findByText("tocar para editar").then((el) => el.previousSibling));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmado", pressed: true }));
    await waitFor(() => expect(confirmedOf("hoy").textContent).toBe("(0)"));
    expect(totalOf("hoy").textContent).toBe("2");
  });

  it("los números dicen lo que son para quien usa lector de pantalla", async () => {
    seed([move(1, "Ana", { confirmed: true }), move(2, "Beto")]);
    render(<InventoryApp />);
    await waitFor(() => expect(confirmedOf("hoy")).toBeTruthy());
    expect(totalOf("hoy").getAttribute("aria-label")).toBe("2 pedidos");
    expect(confirmedOf("hoy").getAttribute("aria-label")).toBe("1 confirmado");
  });
});
