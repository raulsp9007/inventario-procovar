import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// "Comprobar en el portal": en el pedido nuevo, con un cliente escrito, un
// botón abre el portal de pedidos ya buscando a ese cliente. Se puede apagar
// en Configuración (activo por defecto). Hoy fijo: lunes 2026-09-21.

const STORAGE_KEY = "procovar-inventario-v1";
const BUTTON = "Comprobar en el portal";
const SETTING = "Mostrar comprobación en el portal";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
];

function seed(tab, extra = {}) {
  localStorage.setItem("procovar-active-tab", tab);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [], customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...extra,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

async function openForm() {
  render(<InventoryApp />);
  fireEvent.click(await screen.findByLabelText("Nuevo pedido"));
  return await screen.findByPlaceholderText("Nombre del cliente");
}

let openSpy;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Comprobar en el portal (pedido nuevo)", () => {
  it("sin nombre de cliente no hay botón", async () => {
    seed("pedidos");
    await openForm();
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("al escribir un cliente aparece el botón", async () => {
    seed("pedidos");
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana López" } });
    expect(await screen.findByRole("button", { name: BUTTON })).toBeTruthy();
  });

  it("tocarlo abre el portal buscando a ese cliente, en otra pestaña", async () => {
    seed("pedidos");
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana López" } });
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana%20L%C3%B3pez",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("no cambia el pedido que se está armando", async () => {
    seed("pedidos");
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana López" } });
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    expect(input.value).toBe("Ana López");
  });

  it("apagado en Configuración, no aparece", async () => {
    seed("pedidos", { showPortalCheck: false });
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana López" } });
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });
});

describe("Interruptor de la comprobación en el portal", () => {
  it("en Configuración está activo por defecto", async () => {
    seed("config");
    render(<InventoryApp />);
    expect((await screen.findByLabelText(SETTING)).checked).toBe(true);
  });

  it("apagarlo lo guarda y vuelve a encenderse", async () => {
    seed("config");
    render(<InventoryApp />);
    const toggle = await screen.findByLabelText(SETTING);
    fireEvent.click(toggle);
    await waitFor(() => expect(saved().showPortalCheck).toBe(false));
    fireEvent.click(screen.getByLabelText(SETTING));
    await waitFor(() => expect(saved().showPortalCheck).toBe(true));
  });
});
