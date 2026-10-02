import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import PulseNumber from "./PulseNumber";
import { leaveAnimationMs, LEAVE_ANIMATION_MS } from "./motion";

// Animaciones de interfaz: solo se comprueba que las clases (que el CSS de
// theme.css anima) aparecen en el momento justo y que lo funcional no se
// rompe ni se demora de más.

const STORAGE_KEY = "procovar-inventario-v1";

function mv(orderId, customerName, seq, overrides = {}) {
  return {
    id: `m-${orderId}`, code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0,
    date: "2026-09-21", timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq,
    customerName, businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false,
    ...overrides,
  };
}

function seed({ movements = [], customers = [], view = "pedidos" } = {}) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements, customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
  }));
}

function saved() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

function stubReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
  delete window.matchMedia;
});

describe("leaveAnimationMs", () => {
  it("sin matchMedia (entorno sin navegador) no demora nada", () => {
    expect(leaveAnimationMs()).toBe(0);
  });

  it("con movimiento normal dura lo que la animación; con 'reducir movimiento' es 0", () => {
    stubReducedMotion(false);
    expect(leaveAnimationMs()).toBe(LEAVE_ANIMATION_MS);
    stubReducedMotion(true);
    expect(leaveAnimationMs()).toBe(0);
  });
});

describe("PulseNumber", () => {
  it("no pulsa al aparecer, pulsa cuando el número cambia", () => {
    const { container, rerender } = render(<PulseNumber value={5} />);
    expect(container.querySelector(".numpulse")).toBeNull();
    rerender(<PulseNumber value={6} />);
    expect(container.querySelector(".numpulse")?.textContent).toBe("6");
  });

  it("si el valor no cambia no pulsa", () => {
    const { container, rerender } = render(<PulseNumber value={5} />);
    rerender(<PulseNumber value={5} />);
    expect(container.querySelector(".numpulse")).toBeNull();
  });
});

describe("pedido que se elimina", () => {
  async function renderPedidos() {
    render(<InventoryApp />);
    await waitFor(() => expect(screen.getAllByLabelText("Eliminar pedido").length).toBe(2));
  }
  function deleteFirstCard() {
    fireEvent.click(screen.getAllByLabelText("Eliminar pedido")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  }

  it("con movimiento normal la tarjeta sale animada y el borrado igual se aplica a los 5 s", async () => {
    stubReducedMotion(false);
    seed({ movements: [mv("o1", "Ana", 1), mv("o2", "Beto", 2)] });
    await renderPedidos();

    deleteFirstCard();
    expect(document.querySelectorAll(".orderleave")).toHaveLength(1);
    expect(screen.getAllByLabelText("Eliminar pedido")).toHaveLength(2); // todavía está

    await act(async () => { await vi.advanceTimersByTimeAsync(LEAVE_ANIMATION_MS + 50); });
    expect(document.querySelectorAll(".orderleave")).toHaveLength(0);
    expect(screen.getAllByLabelText("Eliminar pedido")).toHaveLength(1); // ya se escondió

    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    await waitFor(() => expect(new Set(saved().movements.map((m) => m.orderId)).size).toBe(1));
  });

  it("con 'reducir movimiento' no hay animación ni demora: se esconde de una", async () => {
    stubReducedMotion(true);
    seed({ movements: [mv("o1", "Ana", 1), mv("o2", "Beto", 2)] });
    await renderPedidos();

    deleteFirstCard();
    expect(document.querySelectorAll(".orderleave")).toHaveLength(0);
    expect(screen.getAllByLabelText("Eliminar pedido")).toHaveLength(1);
  });
});

describe("paso de pedido recién marcado", () => {
  it("el círculo hace 'pop' solo al marcarlo, no al abrir la app", async () => {
    seed({ movements: [mv("o1", "Ana", 1, { sentToCustomer: true }), mv("o2", "Beto", 2)] });
    render(<InventoryApp />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Enviado" }).length).toBe(2));
    expect(document.querySelectorAll(".steppop")).toHaveLength(0); // el ya marcado de entrada no anima

    const sinMarcar = screen.getAllByRole("button", { name: "Enviado" }).find((b) => b.getAttribute("aria-pressed") === "false");
    expect(sinMarcar).toBeTruthy();
    fireEvent.click(sinMarcar);
    await waitFor(() => expect(document.querySelectorAll(".steppop")).toHaveLength(1));
  });
});

describe("ficha de cliente", () => {
  it("al abrirse entra con transición", async () => {
    seed({
      view: "clientes",
      movements: [mv("o1", "Ana", 1)],
      customers: [{ id: "c1", name: "Ana", businessName: "", phone: "", createdAt: new Date().toISOString() }],
    });
    render(<InventoryApp />);
    const row = await screen.findByText("👤 Ana");
    expect(document.querySelector(".expandin")).toBeNull();
    fireEvent.click(row);
    expect(document.querySelector(".expandin")).toBeTruthy();
  });
});

describe("cambio de pestaña", () => {
  it("la vista activa va envuelta en el fundido y se reinicia al cambiar de pestaña", async () => {
    seed({ view: "pedidos" });
    render(<InventoryApp />);
    await waitFor(() => expect(screen.getByLabelText("Nuevo pedido")).toBeTruthy());
    const before = document.querySelector(".viewfade");
    expect(before).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    await waitFor(() => expect(screen.getByText(/CLIENTES/)).toBeTruthy());
    const after = document.querySelector(".viewfade");
    expect(after).toBeTruthy();
    expect(after).not.toBe(before); // otro nodo: la animación arranca de nuevo
  });
});
