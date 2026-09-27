import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor, renderHook } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { useInventoryStore } from "./useInventoryStore";

// Simulaciones de punta a punta de la regla "los domingos no se despacha":
// un pedido para mañana armado un sábado siempre cae en lunes, y "Hoy" queda
// bloqueado los domingos (igual que el cierre de ventas), sin importar si
// ese ajuste está desactivado.

const STORAGE_KEY = "procovar-inventario-v1";
// Semana fija de referencia: 25 vie, 26 sáb, 27 dom, 28 lun (2026-09-28).
const FRIDAY = "2026-09-25";
const SATURDAY = "2026-09-26";
const SUNDAY = "2026-09-27";
const MONDAY = "2026-09-28";

function mv(orderId, customerName, seq, overrides = {}) {
  return {
    id: `m-${orderId}`, code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0,
    date: SATURDAY, timestamp: `${SATURDAY}T09:00:00.000Z`, orderId, orderSeq: seq,
    customerName, businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false,
    ...overrides,
  };
}

function seed({ movements = [], cierreVentasHour = null, view = "pedidos" } = {}) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
    cierreVentasHour,
  }));
}

function saved() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

function setClock(dateStr, hour = 10) {
  vi.setSystemTime(new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`));
}

async function renderApp() {
  render(<InventoryApp />);
  await waitFor(() => expect(screen.getByLabelText("Nuevo pedido")).toBeTruthy());
}

function fillAndAddProduct(qty = "1") {
  fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: qty } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("simulación: pedido 'para mañana' según el día", () => {
  it("un viernes normal, 'para mañana' sigue siendo el sábado (sin saltar nada)", async () => {
    setClock(FRIDAY);
    seed();
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput.value).toBe(SATURDAY);
    expect(dateInput.min).toBe(SATURDAY);
  });

  it("un sábado, 'para mañana' salta el domingo y ofrece el lunes por defecto", async () => {
    setClock(SATURDAY);
    seed();
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput.value).toBe(MONDAY);
    expect(dateInput.min).toBe(MONDAY);
  });

  it("un sábado, confirmar un pedido 'para mañana' sin tocar la fecha lo guarda para el lunes", async () => {
    setClock(SATURDAY);
    seed();
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "Ana" } });
    fillAndAddProduct("2");
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));

    await waitFor(() => expect(saved().movements.some((m) => m.customerName === "Ana")).toBe(true));
    const created = saved().movements.find((m) => m.customerName === "Ana");
    expect(created.bucket).toBe("manana");
    expect(created.date).toBe(MONDAY);
  });

  it("un sábado, si se elige el domingo a mano, se rechaza y no se guarda nada", async () => {
    setClock(SATURDAY);
    seed();
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    fireEvent.click(screen.getByRole("button", { name: "Para mañana" }));
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: SUNDAY } });
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "Beto" } });
    fillAndAddProduct("1");
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));

    await waitFor(() => expect(screen.getByText(/No se despacha los domingos/)).toBeTruthy());
    expect(saved().movements.some((m) => m.customerName === "Beto")).toBe(false);
  });
});

describe("simulación: posponer un pedido de Hoy un sábado", () => {
  it("posponer a mañana (individual) desde el aviso de cierre cae en lunes", async () => {
    // Cierre de ventas a las 10 am, reloj a las 8 pm -- ya pasó, sin que
    // tenga nada que ver con el sábado en sí (se prueba aparte que el
    // salto de domingo funciona igual).
    setClock(SATURDAY, 20);
    seed({ cierreVentasHour: 10, movements: [mv("o1", "Ana", 1)] });
    await renderApp();
    fireEvent.click(screen.getAllByRole("button", { name: /^Hoy/ })[0]);
    const postponeButton = () => screen.getByLabelText("Posponer a mañana");
    await waitFor(() => expect(postponeButton()).toBeTruthy());
    fireEvent.click(postponeButton()); // arma
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    fireEvent.click(postponeButton()); // confirma (2do toque)
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    await waitFor(() => expect(saved().movements.find((m) => m.customerName === "Ana").bucket).toBe("manana"));
    expect(saved().movements.find((m) => m.customerName === "Ana").date).toBe(MONDAY);
  });

  it("posponer todos un sábado también manda a lunes", async () => {
    setClock(SATURDAY, 20);
    seed({ cierreVentasHour: 10, movements: [mv("o1", "Ana", 1), mv("o2", "Beto", 2)] });
    await renderApp();
    fireEvent.click(screen.getAllByRole("button", { name: /^Hoy/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Posponer todos" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    fireEvent.click(screen.getByRole("button", { name: /Seguro/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    await waitFor(() => expect(saved().movements.filter((m) => m.bucket === "manana")).toHaveLength(2));
    expect(saved().movements.every((m) => m.date === MONDAY)).toBe(true);
  });
});

describe("simulación: domingo, 'Hoy' bloqueado aunque el cierre de ventas esté desactivado", () => {
  it("con cierreVentasHour desactivado, 'Hoy' igual queda bloqueado un domingo", async () => {
    setClock(SUNDAY);
    seed({ cierreVentasHour: null });
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    expect(screen.getByRole("button", { name: "Hoy" }).disabled).toBe(true);
    expect(screen.getByText(/Los domingos no se despacha/)).toBeTruthy();
    expect(document.querySelector('input[type="date"]').value).toBe(MONDAY);
  });

  it("un domingo se puede seguir armando y confirmando pedidos: quedan para el lunes", async () => {
    setClock(SUNDAY);
    seed({ cierreVentasHour: null });
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "Carla" } });
    fillAndAddProduct("3");
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));

    await waitFor(() => expect(saved().movements.some((m) => m.customerName === "Carla")).toBe(true));
    const created = saved().movements.find((m) => m.customerName === "Carla");
    expect(created.bucket).toBe("manana");
    expect(created.date).toBe(MONDAY);
    expect(saved().stock.P500).toBe(50); // no comprometido (no es un pedido de Hoy)
  });

  it("editar un pedido que YA es de Hoy sigue permitido un domingo", async () => {
    setClock(SUNDAY);
    seed({ cierreVentasHour: null, movements: [mv("o1", "Ana", 1, { date: SUNDAY })] });
    await renderApp();
    fireEvent.click(screen.getAllByRole("button", { name: /^Hoy/ })[0]);
    fireEvent.click(await screen.findByLabelText("Editar pedido"));
    expect(screen.getByRole("button", { name: "Hoy" }).disabled).toBe(false);
  });
});

describe("simulación: datos viejos con un pedido agendado en domingo se corrigen solos", () => {
  it("un pedido 'para mañana' sin facturar que quedó en domingo se corre al lunes al abrir la app", async () => {
    setClock(SATURDAY);
    seed({ movements: [mv("o1", "Ana", 1, { bucket: "manana", date: SUNDAY, sent: false })] });
    await renderApp();

    await waitFor(() => expect(saved().movements.find((m) => m.customerName === "Ana").date).toBe(MONDAY));
    expect(saved().movements.find((m) => m.customerName === "Ana").bucket).toBe("manana");
  });

  it("no toca un pedido de Hoy ya facturado aunque su fecha sea domingo (no se reescribe el pasado)", async () => {
    setClock(MONDAY);
    seed({ movements: [mv("o1", "Ana", 1, { bucket: "hoy", date: SUNDAY, sent: true, confirmed: true, sentToCustomer: true })] });
    await renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(saved().movements.find((m) => m.customerName === "Ana").date).toBe(SUNDAY);
  });
});

describe("simulación: un pedido para el lunes ya cuenta como 'pendiente para mañana' el sábado", () => {
  it("mananaMovements incluye un pedido sin enviar fechado el lunes, estando hoy en sábado", async () => {
    // Prueba a nivel de store (no de UI): mananaMovements es lo que alimenta
    // el resumen embebido de "Para mañana" -- antes comparaba contra el
    // domingo literal (tomorrowStr()), así que un pedido ya correctamente
    // agendado para el lunes no iba a aparecer ahí hasta el domingo.
    setClock(SATURDAY);
    seed({ movements: [mv("o1", "Ana", 1, { bucket: "manana", date: MONDAY, sent: false })] });
    const { result } = renderHook(() => useInventoryStore());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.mananaMovements.some((m) => m.customerName === "Ana")).toBe(true);
  });

  it("ese mismo pedido NO aparece ahí el viernes (todavía no es el próximo día hábil)", async () => {
    setClock(FRIDAY);
    seed({ movements: [mv("o1", "Ana", 1, { bucket: "manana", date: MONDAY, sent: false })] });
    const { result } = renderHook(() => useInventoryStore());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.mananaMovements.some((m) => m.customerName === "Ana")).toBe(false);
  });
});
