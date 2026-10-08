import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Pedidos > Hoy: botón "Enviar resumen al supervisor". Abre WhatsApp con el
// contacto del supervisor y el resumen de los pedidos de hoy (cliente y
// productos de cada pedido).

const STORAGE_KEY = "procovar-inventario-v1";
const SUPERVISOR = "5355512345";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M330", name: "Malta 330ml", short: "M-330", color: "#274E37", hl: 0.003, format: "Sixpack" },
];

function line(id, code, qty, orderId, seq, name, extra = {}) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0, date: "2026-09-21",
    timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq, customerName: name,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false, ...extra,
  };
}

function seed(movements, extra = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100, M330: 100 }, prices: { P500: 1, M330: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    supervisorPhone: SUPERVISOR,
    ...extra,
  }));
}

const button = () => screen.getByRole("button", { name: "Enviar resumen al supervisor" });
const sentText = () => decodeURIComponent(window.open.mock.calls.at(-1)[0].split("?text=")[1]);

let openSpy;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Pedidos: enviar resumen al supervisor", () => {
  it("abre WhatsApp con el supervisor y el resumen de los pedidos de hoy", async () => {
    seed([
      line(1, "P500", 40, "o1", 1, "Ana López", { businessName: "Bodega La Esquina" }),
      line(2, "M330", 30, "o1", 1, "Ana López", { businessName: "Bodega La Esquina" }),
      line(3, "P500", 25, "o2", 2, "Marta Díaz", { isDelivery: true, sent: true }),
    ], { senderName: "Raúl" });
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");

    fireEvent.click(button());
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0].startsWith(`https://wa.me/${SUPERVISOR}?text=`)).toBe(true);
    expect(sentText()).toBe([
      "*Pedidos del día · lun 21 sep*",
      "Gestor: Raúl · 2 pedidos",
      "",
      "1. *Ana López* (Bodega La Esquina)",
      "    P-500 ×40 · M-330 ×30",
      "",
      "2. *Marta Díaz* 🛵",
      "    P-500 ×25",
      "",
      "🛵 = domicilio",
    ].join("\n"));
  });

  it("no se limita por los filtros de la lista: manda todos los pedidos de hoy", async () => {
    seed([
      line(1, "P500", 10, "o1", 1, "Ana", { sent: true }),
      line(2, "P500", 20, "o2", 2, "Beto"),
    ]);
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");
    fireEvent.click(screen.getByRole("button", { name: /^No facturados/ })); // deja visible solo a Beto
    fireEvent.click(button());
    expect(sentText()).toContain("*Ana*");
    expect(sentText()).toContain("*Beto*");
  });

  it("sin teléfono de supervisor abre WhatsApp para elegir el contacto", async () => {
    seed([line(1, "P500", 10, "o1", 1, "Ana")], { supervisorPhone: "" });
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");
    fireEvent.click(button());
    expect(openSpy.mock.calls[0][0].startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("sin pedidos hoy avisa y no abre WhatsApp", async () => {
    seed([]);
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Enviar resumen al supervisor" }));
    await waitFor(() => expect(screen.getByText("No hay pedidos hoy para enviar.")).toBeTruthy());
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("solo está en la pestaña Hoy, no en Para mañana", async () => {
    seed([line(1, "P500", 10, "o1", 1, "Ana")]);
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");
    expect(screen.queryByRole("button", { name: "Enviar resumen al supervisor" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Para mañana/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enviar resumen al supervisor" })).toBeNull());
  });

  it("no cuenta pedidos de otros días", async () => {
    seed([
      line(1, "P500", 10, "o1", 1, "Ana"),
      line(2, "P500", 99, "o2", 2, "Beto", { date: "2026-09-22", bucket: "manana" }),
    ]);
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");
    fireEvent.click(button());
    expect(sentText()).toContain("1 pedido");
    expect(sentText()).not.toContain("Beto");
  });
});
