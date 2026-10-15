import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Pasado el cierre de ventas, Pedidos > Hoy muestra el listado de pedidos de
// hoy sin confirmar. Tocar el nombre de uno se desplaza hasta ese pedido en la
// lista de abajo y lo resalta un momento. Hoy fijo: lunes 2026-09-21, 15:00.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", color: "#E0A040", hl: 0.015, format: "Sixpack" },
];

function line(id, code, qty, orderId, seq, name, extra = {}) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0.03, date: "2026-09-21",
    timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq, customerName: name,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: false, sentToCustomer: true, ...extra,
  };
}

const MOVEMENTS = [
  line(1, "P500", 40, "o1", 1, "Ana"),
  line(2, "P500", 30, "o2", 2, "Beto"),
  line(3, "P1500", 20, "o3", 3, "Marta", { isDelivery: true }),
];

let scrolled;

function seed(extra = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: MOVEMENTS, customers: [], orderSeqPerDay: true,
    lastBackupAt: new Date().toISOString(),
    stock: { P500: 100, P1500: 40 }, prices: { P500: 1, P1500: 1 }, pricesAreUsd: false, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    cierreVentasHour: 14, ...extra,
  }));
}

beforeEach(() => {
  localStorage.clear();
  scrolled = [];
  Element.prototype.scrollIntoView = vi.fn(function scrollIntoView() { scrolled.push(this); });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T15:00:00")); // pasado el cierre de las 2 p. m.
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Cierre de ventas: ir al pedido sin confirmar", () => {
  async function openHoyWithBanner() {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: /^Hoy/ })); // pasado el cierre arranca en Para mañana
    return await screen.findByRole("button", { name: "Ir al pedido de Marta" });
  }

  it("tocar el nombre se desplaza hasta ese pedido en la lista", async () => {
    seed();
    fireEvent.click(await openHoyWithBanner());
    await waitFor(() => expect(scrolled).toHaveLength(1));
    expect(scrolled[0].textContent).toContain("Marta");
    expect(scrolled[0].textContent).not.toContain("Beto");
  });

  it("deja el pedido resaltado un momento y luego lo suelta", async () => {
    seed();
    fireEvent.click(await openHoyWithBanner());
    await waitFor(() => expect(scrolled).toHaveLength(1));
    expect(scrolled[0].className).toContain("orderenter");
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(scrolled[0].className).not.toContain("orderenter");
  });

  it("si un filtro escondía el pedido, lo quita para que se vea", async () => {
    seed();
    localStorage.setItem("procovar-pedidos-filtros", JSON.stringify({ filterProductCode: "P500" })); // Marta pidió P1500
    const button = await openHoyWithBanner();
    fireEvent.click(button);
    await waitFor(() => expect(scrolled).toHaveLength(1));
    expect(scrolled[0].textContent).toContain("Marta");
  });
});
