import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import SalesSummary from "./SalesSummary";

// Contador de ventas por día: lo enviado a facturación, producto por producto y por vendedor,
// con un selector de día. Lo usan la administración y la supervisión. Hoy fijo: 2026-10-30.

const summary = (over = {}) => ({
  fecha: "2026-10-30",
  vendedores: [
    { id: "carlos", name: "Carlos Pérez", pedidos: 2, unidades: 80, productos: [{ code: "P500", name: "Parranda 500ml", qty: 50 }, { code: "M330", name: "Malta 330ml", qty: 30 }] },
    { id: "marta", name: "Marta Díaz", pedidos: 1, unidades: 5, productos: [{ code: "P500", name: "Parranda 500ml", qty: 5 }] },
    { id: "rosa", name: "Rosa Vega", pedidos: 0, unidades: 0, productos: [] },
  ],
  productos: [{ code: "P500", name: "Parranda 500ml", qty: 55 }, { code: "M330", name: "Malta 330ml", qty: 30 }],
  totales: { pedidos: 3, unidades: 85 },
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-30T11:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SalesSummary", () => {
  it("pide el día de hoy y muestra el total del día producto por producto", async () => {
    const load = vi.fn(async () => summary());
    render(<SalesSummary load={load} />);
    const region = await screen.findByRole("region", { name: "Ventas por día" });
    expect(load).toHaveBeenCalledWith("2026-10-30");
    expect(await within(region).findByText("3 pedidos · 85 unidades")).toBeTruthy();
    const total = within(region).getByRole("group", { name: "Total del día" });
    expect(within(total).getByText("Parranda 500ml")).toBeTruthy();
    expect(within(total).getByText("55")).toBeTruthy();
    expect(within(total).getByText("Malta 330ml")).toBeTruthy();
    expect(within(total).getByText("30")).toBeTruthy();
  });

  it("separa por vendedor, con sus pedidos, unidades y productos", async () => {
    render(<SalesSummary load={async () => summary()} />);
    const carlos = await screen.findByRole("group", { name: "Ventas de Carlos Pérez" });
    expect(within(carlos).getByText("2 pedidos · 80 unidades")).toBeTruthy();
    expect(within(carlos).getByText("50")).toBeTruthy();
    expect(within(carlos).getByText("30")).toBeTruthy();
    const marta = screen.getByRole("group", { name: "Ventas de Marta Díaz" });
    expect(within(marta).getByText("1 pedido · 5 unidades")).toBeTruthy();
  });

  it("un vendedor sin ventas ese día lo dice", async () => {
    render(<SalesSummary load={async () => summary()} />);
    const rosa = await screen.findByRole("group", { name: "Ventas de Rosa Vega" });
    expect(within(rosa).getByText("Sin ventas")).toBeTruthy();
  });

  it("al cambiar el día vuelve a pedir ese día", async () => {
    const load = vi.fn(async (fecha) => summary({ fecha }));
    render(<SalesSummary load={load} />);
    await screen.findByRole("group", { name: "Total del día" });
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-10-29" } });
    await waitFor(() => expect(load).toHaveBeenLastCalledWith("2026-10-29"));
  });

  it("el botón Hoy vuelve al día de hoy", async () => {
    const load = vi.fn(async (fecha) => summary({ fecha }));
    render(<SalesSummary load={load} />);
    await screen.findByRole("group", { name: "Total del día" });
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(load).toHaveBeenLastCalledWith("2026-10-01"));
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith("2026-10-30"));
    expect(screen.getByLabelText("Día").value).toBe("2026-10-30");
  });

  it("un día sin ventas lo dice", async () => {
    render(<SalesSummary load={async () => summary({ vendedores: [], productos: [], totales: { pedidos: 0, unidades: 0 } })} />);
    expect(await screen.findByText("No hay ventas enviadas a facturación ese día.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Total del día" })).toBeNull();
  });

  it("si falla, avisa con el motivo", async () => {
    render(<SalesSummary load={async () => { throw new Error("Sin conexión con la nube."); }} />);
    expect(await screen.findByText("Sin conexión con la nube.")).toBeTruthy();
  });

  it("una fecha vacía no pide nada", async () => {
    const load = vi.fn(async (fecha) => summary({ fecha }));
    render(<SalesSummary load={load} />);
    await screen.findByRole("group", { name: "Total del día" });
    const calls = load.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "" } });
    expect(load.mock.calls.length).toBe(calls);
  });
});
