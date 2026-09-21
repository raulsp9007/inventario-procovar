import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { todayStr, tomorrowStr } from "./dateUtils";

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

function seed({ movements = [], cierreVentasHour = 16, view = "pedidos" } = {}) {
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

function setClock(hour) {
  vi.setSystemTime(new Date(`${todayStr()}T${String(hour).padStart(2, "0")}:00:00`));
}

async function renderApp() {
  render(<InventoryApp />);
  await waitFor(() => expect(screen.getByLabelText("Nuevo pedido")).toBeTruthy());
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cierre de ventas: nuevos pedidos van para mañana", () => {
  it("pasada la hora, 'Hoy' queda bloqueado y se avisa que el pedido va para mañana", async () => {
    setClock(20);
    seed();
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    expect(screen.getByRole("button", { name: "Hoy" }).disabled).toBe(true);
    expect(screen.getByText(/Ya pasó el cierre de ventas/)).toBeTruthy();
  });

  it("un pedido creado pasada la hora se guarda para mañana, no para hoy", async () => {
    setClock(20);
    seed();
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "Cliente tarde" } });
    fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
    await waitFor(() => expect(saved().movements.some((m) => m.customerName === "Cliente tarde")).toBe(true));
    const created = saved().movements.find((m) => m.customerName === "Cliente tarde");
    expect(created.bucket).toBe("manana");
    expect(created.date).toBe(tomorrowStr());
    expect(saved().stock.P500).toBe(50);
  });

  it("antes de la hora, 'Hoy' sigue disponible", async () => {
    setClock(10);
    seed();
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    expect(screen.getByRole("button", { name: "Hoy" }).disabled).toBe(false);
    expect(screen.queryByText(/Ya pasó el cierre de ventas/)).toBeNull();
  });

  it("con el cierre desactivado nada cambia, ni de noche", async () => {
    setClock(22);
    seed({ cierreVentasHour: null });
    await renderApp();
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    expect(screen.getByRole("button", { name: "Hoy" }).disabled).toBe(false);
  });

  it("editar un pedido que ya es de hoy sigue permitido después del cierre", async () => {
    setClock(20);
    seed({ movements: [mv("o1", "Ana", 1)] });
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^Hoy/ }));
    fireEvent.click(await screen.findByLabelText("Editar pedido"));
    expect(screen.getByRole("button", { name: "Hoy" }).disabled).toBe(false);
  });
});

describe("cierre de ventas: aviso de pendientes", () => {
  it("desde otra pestaña avisa cuántos pedidos de hoy quedaron sin cerrar", async () => {
    setClock(20);
    seed({ view: "clientes", movements: [
      mv("o1", "Ana", 1),
      mv("o2", "Beto", 2, { sentToCustomer: true }),
      mv("o3", "Carla", 3, { sentToCustomer: true, sent: true, confirmed: true }),
    ] });
    render(<InventoryApp />);
    const banner = await screen.findByText(/Los nuevos ya van para mañana/);
    const box = banner.closest("div").parentElement;
    expect(within(box).getByText("sin enviar").previousSibling.textContent).toBe("1");
    expect(within(box).getByText("sin facturar").previousSibling.textContent).toBe("2");
    expect(within(box).getByText("sin confirmar").previousSibling.textContent).toBe("2");
  });

  it("no avisa antes de la hora, ni si no hay pendientes, ni con el cierre desactivado", async () => {
    setClock(10);
    seed({ view: "clientes", movements: [mv("o1", "Ana", 1)] });
    const { unmount } = render(<InventoryApp />);
    await screen.findByText(/CLIENTES/);
    expect(screen.queryByText(/Los nuevos ya van para mañana/)).toBeNull();
    unmount();

    localStorage.clear();
    setClock(20);
    seed({ view: "clientes", movements: [mv("o3", "Carla", 3, { sentToCustomer: true, sent: true, confirmed: true })] });
    const second = render(<InventoryApp />);
    await screen.findByText(/CLIENTES/);
    expect(screen.queryByText(/Los nuevos ya van para mañana/)).toBeNull();
    second.unmount();

    localStorage.clear();
    seed({ view: "clientes", cierreVentasHour: null, movements: [mv("o1", "Ana", 1)] });
    render(<InventoryApp />);
    await screen.findByText(/CLIENTES/);
    expect(screen.queryByText(/Los nuevos ya van para mañana/)).toBeNull();
  });

  it("'Revisar pendientes' lleva a Pedidos > Hoy con los filtros de pendientes activos", async () => {
    setClock(20);
    seed({ view: "clientes", movements: [mv("o1", "Ana", 1)] });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar pendientes" }));
    await waitFor(() => expect(screen.getByLabelText("Nuevo pedido")).toBeTruthy());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^No enviados/ }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: /^No facturados/ }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: /^No confirmados/ }).getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("en Pedidos > Para mañana también avisa, y 'Revisar pendientes' pasa a Hoy", async () => {
    setClock(20);
    seed({ movements: [mv("o1", "Ana", 1)] });
    await renderApp();
    // Pasado el cierre, Pedidos abre en "Para mañana".
    fireEvent.click(await screen.findByRole("button", { name: "Revisar pendientes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^No enviados/ }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByLabelText("Posponer a mañana")).toBeTruthy();
  });

  it("'Posponer todos' programa para mañana todos los pedidos sin confirmar", async () => {
    setClock(20);
    seed({ movements: [mv("o1", "Ana", 1), mv("o2", "Beto", 2), mv("o3", "Carla", 3, { sentToCustomer: true, sent: true, confirmed: true })] });
    await renderApp();
    fireEvent.click(screen.getAllByRole("button", { name: /^Hoy/ })[0]);
    const postponeAll = await screen.findByRole("button", { name: "Posponer todos" });
    fireEvent.click(postponeAll);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    fireEvent.click(screen.getByRole("button", { name: /Seguro/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    await waitFor(() => expect(saved().movements.filter((m) => m.bucket === "manana")).toHaveLength(2));
    const stayed = saved().movements.filter((m) => m.bucket === "hoy");
    expect(stayed.map((m) => m.customerName)).toEqual(["Carla"]);
    expect(saved().movements.filter((m) => m.bucket === "manana").every((m) => m.date === tomorrowStr())).toBe(true);
  });
});

describe("el día se refresca solo al volver a la app", () => {
  it("pasada la medianoche, el contador de Hoy se actualiza sin tocar nada", async () => {
    setClock(23);
    seed({ view: "stock", cierreVentasHour: null, movements: [mv("o1", "Ana", 1)] });
    render(<InventoryApp />);
    await screen.findByText("VENDIDO HOY");
    expect(screen.getByText("VENDIDO HOY").parentElement.textContent).toContain("1");
    // Se dejan correr los temporizadores de arranque (guardado, almacenamiento)
    // para que después no quede ningún re-render pendiente que "ayude".
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    // Pasa la medianoche con la app abierta (sin ninguna acción del usuario).
    vi.setSystemTime(new Date(`${tomorrowStr()}T00:05:00`));
    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    expect(screen.getByText("VENDIDO HOY").parentElement.textContent).toContain("0");
  });
});
