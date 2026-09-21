import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { todayStr } from "./dateUtils";

// Borrar y posponer pedidos se aplican 5 s después de tocar el botón (para
// poder deshacer). Antes usaban el estado del render en que se tocó, así que
// cualquier cosa hecha en esos 5 s -- otro borrado, un cambio de paso -- se
// pisaba (por ejemplo, un pedido borrado "resucitaba").

const STORAGE_KEY = "procovar-inventario-v1";

function mv(orderId, customerName, seq, overrides = {}) {
  return {
    id: `m-${orderId}`, code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0,
    date: todayStr(), timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq,
    customerName, businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false,
    ...overrides,
  };
}

function seed(movements) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
  }));
}

function saved() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

function orderIds() {
  return [...new Set(saved().movements.filter((m) => m.orderId).map((m) => m.orderId))].sort();
}

async function renderPedidos() {
  render(<InventoryApp />);
  await waitFor(() => expect(screen.getAllByLabelText("Eliminar pedido").length).toBeGreaterThan(0));
}

// Arma la confirmación de la tarjeta y la acepta (queda "en espera" 5 s).
function stageDeleteFirstCard() {
  fireEvent.click(screen.getAllByLabelText("Eliminar pedido")[0]);
  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("acciones diferidas de Pedidos (borrar / posponer)", () => {
  it("dos borrados seguidos eliminan los dos pedidos (el primero no reaparece)", async () => {
    seed([mv("o1", "Ana", 1), mv("o2", "Beto", 2), mv("o3", "Carla", 3)]);
    await renderPedidos();

    stageDeleteFirstCard();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    stageDeleteFirstCard();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    await waitFor(() => expect(orderIds()).toHaveLength(1));
    expect(orderIds()).toHaveLength(1);
  });

  it("un cambio hecho mientras hay un borrado pendiente no se pierde", async () => {
    seed([mv("o1", "Ana", 1), mv("o2", "Beto", 2)]);
    await renderPedidos();

    stageDeleteFirstCard();
    // Mientras el borrado espera, se marca "Enviado" en el otro pedido.
    fireEvent.click(screen.getAllByRole("button", { name: "Enviado" })[0]);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    await waitFor(() => expect(orderIds()).toHaveLength(1));
    const remaining = saved().movements.filter((m) => m.orderId);
    expect(remaining.every((m) => m.sentToCustomer === true)).toBe(true);
  });

  it("posponer un pedido a mañana no pisa un cambio hecho durante la espera", async () => {
    // Pasado el cierre de ventas (20:00, cierre a las 16:00) aparece el aviso
    // con "Posponer a mañana" para los pedidos de hoy sin confirmar.
    vi.setSystemTime(new Date(`${todayStr()}T20:00:00`));
    seed([mv("o1", "Ana", 1), mv("o2", "Beto", 2)]);
    const state = saved();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, cierreVentasHour: 16 }));
    render(<InventoryApp />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Hoy/ }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /^Hoy/ })[0]);
    await waitFor(() => expect(screen.getAllByLabelText("Posponer a mañana").length).toBe(2));

    const postponeButton = () => screen.getAllByLabelText("Posponer a mañana")[0];
    fireEvent.click(postponeButton());
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    fireEvent.click(postponeButton());

    // Durante los 5 s de espera se marca "Enviado" en el otro pedido.
    fireEvent.click(screen.getAllByRole("button", { name: "Enviado" })[0]);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    await waitFor(() => expect(saved().movements.filter((m) => m.bucket === "manana")).toHaveLength(1));
    const stayed = saved().movements.filter((m) => m.bucket === "hoy");
    expect(stayed).toHaveLength(1);
    expect(stayed[0].sentToCustomer).toBe(true);
  });
});
