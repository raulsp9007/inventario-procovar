import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Pasar un pedido de Hoy a "Para mañana" al editarlo lo deja sin facturar (igual que
// posponerlo desde el aviso de cierre): lo facturado era para hoy. Hoy fijo:
// viernes 2026-10-30.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const customers = [{ id: "a", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" }];
const move = (over = {}) => ({
  id: "m1", code: "P500", type: "venta", qty: 6, date: "2026-10-30", timestamp: "2026-10-30T08:00:00.000Z",
  unitPrice: 1, unitHl: 0.03, orderId: "o1", orderSeq: 1, customerName: "Ana López", isDelivery: false, note: "",
  bucket: "hoy", sent: true, ...over,
});

function seed(movement) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [movement], customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 94 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const order = () => saved().movements.find((m) => m.orderId === "o1");

async function editOrder({ fromTomorrowList = false } = {}) {
  render(<InventoryApp />);
  if (fromTomorrowList) fireEvent.click((await screen.findAllByRole("button", { name: /^Para mañana/ }))[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
  await screen.findByRole("button", { name: /Guardar cambios/ });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

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

describe("Editar un pedido: de Hoy a Para mañana", () => {
  it("un pedido facturado queda sin facturar, para mañana, y devuelve su stock", async () => {
    seed(move({ sent: true }));
    await editOrder();
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    save();
    await waitFor(() => expect(order().bucket).toBe("manana"));
    expect(order().sent).toBe(false);
    expect(order().date).toBe("2026-10-31");
    expect(saved().stock.P500).toBe(100);
  });

  it("uno que no estaba facturado sigue sin facturar", async () => {
    seed(move({ sent: false }));
    await editOrder();
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    save();
    await waitFor(() => expect(order().bucket).toBe("manana"));
    expect(order().sent).toBe(false);
  });

  it("editar un pedido de Hoy sin cambiarlo de día conserva lo facturado", async () => {
    seed(move({ sent: true }));
    await editOrder();
    save();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    expect(order().bucket).toBe("hoy");
    expect(order().sent).toBe(true);
    expect(saved().stock.P500).toBe(94);
  });

  it("un pedido programado ya facturado que se edita sigue facturado (no es de Hoy)", async () => {
    seed(move({ sent: true, bucket: "manana", date: "2026-10-31" }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved(), stock: { P500: 94 } }));
    await editOrder({ fromTomorrowList: true });
    save();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    expect(order().bucket).toBe("manana");
    expect(order().sent).toBe(true);
  });
});
