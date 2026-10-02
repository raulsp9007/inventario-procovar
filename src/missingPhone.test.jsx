import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Clientes sin teléfono: no se les puede llamar ni mandar WhatsApp. La app lo
// marca en Clientes (aviso en la fila y un filtro) y en Pedidos (un botón que
// lleva directo a editar el teléfono).

const STORAGE_KEY = "procovar-inventario-v1";

function order(orderId, customerName, seq, customerPhone) {
  return {
    id: `m-${orderId}`, code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0, date: "2026-09-21",
    timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq, customerName,
    businessName: "", customerPhone, isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false,
  };
}

function customer(id, name, phone) {
  return { id, name, businessName: "", phone, createdAt: new Date().toISOString() };
}

function seed({ view, movements = [], customers = [] }) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements, customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
  }));
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

describe("Clientes: sin teléfono", () => {
  const customers = [
    customer("c1", "Ana", ""),
    customer("c2", "Beto", "5353551234"),
    customer("c3", "Carla", ""),
  ];

  it("la fila de un cliente sin teléfono lo dice; la de uno con teléfono no", async () => {
    seed({ view: "clientes", customers });
    render(<InventoryApp />);
    const ana = (await screen.findByText("👤 Ana")).closest("button");
    const beto = screen.getByText("👤 Beto").closest("button");
    expect(within(ana).getByText("Sin teléfono")).toBeTruthy();
    expect(within(beto).queryByText("Sin teléfono")).toBeNull();
  });

  it("el filtro 'Sin teléfono' muestra el total y deja solo a esos clientes", async () => {
    seed({ view: "clientes", customers });
    render(<InventoryApp />);
    await screen.findByText("👤 Ana");
    const chip = screen.getByRole("button", { name: /Sin teléfono · 2/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("👤 Ana")).toBeTruthy();
    expect(screen.getByText("👤 Carla")).toBeTruthy();
    expect(screen.queryByText("👤 Beto")).toBeNull();

    fireEvent.click(chip);
    expect(screen.getByText("👤 Beto")).toBeTruthy();
  });

  it("si todos tienen teléfono no aparece el filtro", async () => {
    seed({ view: "clientes", customers: [customer("c2", "Beto", "5353551234")] });
    render(<InventoryApp />);
    await screen.findByText("👤 Beto");
    expect(screen.queryByRole("button", { name: /Sin teléfono/ })).toBeNull();
  });
});

describe("Pedidos: pedido de un cliente sin teléfono", () => {
  const customers = [customer("c1", "Ana", ""), customer("c2", "Beto", "5353551234")];
  const movements = [order("o1", "Ana", 1, ""), order("o2", "Beto", 2, "5353551234")];

  it("tiene el botón para agregar el teléfono; el que sí tiene muestra llamar y WhatsApp", async () => {
    seed({ view: "pedidos", movements, customers });
    render(<InventoryApp />);
    expect(await screen.findByRole("button", { name: "Agregar teléfono de Ana" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Agregar teléfono de Beto" })).toBeNull();
    expect(screen.getByLabelText("Llamar a Beto")).toBeTruthy();
    expect(screen.queryByLabelText("Llamar a Ana")).toBeNull();
  });

  it("tocarlo lleva a Clientes con la edición de ese cliente abierta y el cursor en el teléfono", async () => {
    seed({ view: "pedidos", movements, customers });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar teléfono de Ana" }));

    const phoneInput = await screen.findByLabelText("Teléfono");
    expect(document.activeElement).toBe(phoneInput);
    expect(screen.getByPlaceholderText("Nombre y apellidos").value).toBe("Ana");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("guardar el teléfono ahí lo deja en el cliente y en su pedido", async () => {
    seed({ view: "pedidos", movements, customers });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar teléfono de Ana" }));
    fireEvent.change(await screen.findByLabelText("Teléfono"), { target: { value: "55512345" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).customers.find((c) => c.name === "Ana").phone).toBe("5355512345"));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).movements.find((m) => m.customerName === "Ana").customerPhone).toBe("5355512345");
  });
});
