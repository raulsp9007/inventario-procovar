import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Pedidos: el texto de las etiquetas de producto sigue el tema -- un color
// oscuro de producto se aclara en modo oscuro para poder leerse.

const STORAGE_KEY = "procovar-inventario-v1";

function seed() {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products: [{ code: "M330", name: "Malta 330ml", short: "M-330", color: "#274E37", hl: 0.003, format: "Sixpack" }],
    movements: [{
      id: "m1", code: "M330", type: "venta", qty: 3, unitPrice: 100, unitHl: 0, date: "2026-09-21",
      timestamp: "2026-09-21T09:00:00.000Z", orderId: "o1", orderSeq: 1, customerName: "Ana",
      businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
      bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false,
    }],
    customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { M330: 50 }, prices: { M330: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

function channels(color) {
  return (color.match(/\d+/g) || []).slice(0, 3).map(Number);
}

async function chipTextColor() {
  render(<InventoryApp />);
  const labels = await screen.findAllByText("M-330");
  const chip = labels.find((el) => el.style.color); // la etiqueta del pedido (las demás no llevan color propio)
  return channels(chip.style.color);
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
});

describe("etiquetas de producto en Pedidos según el tema", () => {
  it("en modo claro el color oscuro del producto se mantiene oscuro", async () => {
    seed();
    localStorage.setItem("procovar-theme", "light");
    const [r, g, b] = await chipTextColor();
    expect(Math.max(r, g, b)).toBeLessThan(110);
  });

  it("en modo oscuro el mismo color se aclara para leerse", async () => {
    seed();
    localStorage.setItem("procovar-theme", "dark");
    const [r, g, b] = await chipTextColor();
    expect(Math.max(r, g, b)).toBeGreaterThan(130);
  });
});
