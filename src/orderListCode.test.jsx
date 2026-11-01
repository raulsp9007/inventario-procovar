import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Pedidos: en cada tarjeta, el código del cliente (si lo tiene) va debajo del
// nombre del negocio, con las mismas letras que el negocio.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];

const cust = (id, name, extra = {}) => ({ id, name, businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", ...extra });
const line = (orderId, seq, customerName, businessName = "") => ({
  id: `m-${orderId}`, code: "P500", type: "venta", qty: 10, unitPrice: 120, unitHl: 0.03, date: "2026-09-21",
  timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq, customerName, businessName,
  customerPhone: "", isDelivery: false, note: "", bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false,
});

function seed({ sendBusinessName } = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products,
    movements: [
      line("o1", 1, "Ana López", "Kiosco Sol"),
      line("o2", 2, "Beto Ruiz", "Bar Beto"),
      line("o3", 3, "Carla Gil"),
    ],
    customers: [
      cust("a", "Ana López", { businessName: "Kiosco Sol", code: "AB1001" }),
      cust("b", "Beto Ruiz", { businessName: "Bar Beto" }),
      cust("c", "Carla Gil", { code: "CD2002" }),
    ],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...(sendBusinessName === undefined ? {} : { sendBusinessName }),
  }));
}

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

// La tarjeta del pedido: sube desde el nombre del cliente hasta la fila del pedido.
const cardOf = (name) => [...document.querySelectorAll(".rise")].find((el) => el.textContent.includes(name));
const cardReady = (name) => waitFor(() => expect(cardOf(name)).toBeTruthy());

describe("Pedidos: código del cliente en la tarjeta", () => {
  it("se ve debajo del negocio, 'Cód. AB1001'", async () => {
    seed();
    render(<InventoryApp />);
    await cardReady("Ana López");
    const card = cardOf("Ana López");
    const code = within(card).getByText("Cód. AB1001");
    const business = within(card).getByText(/Kiosco Sol/);
    expect(business.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("con las mismas letras que el negocio", async () => {
    seed();
    render(<InventoryApp />);
    await cardReady("Ana López");
    const card = cardOf("Ana López");
    const code = within(card).getByText("Cód. AB1001");
    const business = within(card).getByText(/Kiosco Sol/);
    ["fontSize", "fontWeight", "color"].forEach((prop) => {
      expect(code.style[prop]).toBe(business.style[prop]);
      expect(code.style[prop]).not.toBe("");
    });
  });

  it("un cliente sin código no muestra nada extra", async () => {
    seed();
    render(<InventoryApp />);
    await cardReady("Beto Ruiz");
    expect(within(cardOf("Beto Ruiz")).queryByText(/^Cód\./)).toBeNull();
  });

  it("sin negocio, el código igual se ve debajo del nombre", async () => {
    seed();
    render(<InventoryApp />);
    await cardReady("Carla Gil");
    expect(within(cardOf("Carla Gil")).getByText("Cód. CD2002")).toBeTruthy();
  });

  it("con 'mostrar negocio' apagado, el negocio se oculta pero el código sigue", async () => {
    seed({ sendBusinessName: false });
    render(<InventoryApp />);
    await cardReady("Ana López");
    const card = cardOf("Ana López");
    expect(within(card).queryByText(/Kiosco Sol/)).toBeNull();
    expect(within(card).getByText("Cód. AB1001")).toBeTruthy();
  });
});
