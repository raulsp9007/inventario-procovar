import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

  it("tocarlo abre el portal buscando a ese cliente, en una ventana pequeña", async () => {
    seed("pedidos");
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana López" } });
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana",
      "procovar-portal",
      "popup,width=480,height=820",
    );
  });

  it("otro toque con otro cliente usa la misma ventana (mismo nombre)", async () => {
    seed("pedidos");
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana López" } });
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    fireEvent.change(input, { target: { value: "Beto Ruiz" } });
    fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(openSpy.mock.calls[0][1]).toBe(openSpy.mock.calls[1][1]);
    expect(openSpy.mock.calls[1][0]).toContain("buscar=Beto");
  });

  // Primero el código del cliente (es lo que mejor lo encuentra en el portal);
  // si no tiene, solo su primer nombre (el portal encuentra mejor con una palabra).
  describe("qué busca: primero el código, luego el nombre", () => {
    const customers = [
      { id: "a", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", code: "LT05TCP0932" },
      { id: "b", name: "Beto Ruiz", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const urlOf = () => openSpy.mock.calls[openSpy.mock.calls.length - 1][0];
    const typeCode = async (value) => {
      const field = await screen.findByRole("group", { name: "Código del cliente" });
      fireEvent.click(within(field).getByRole("button", { name: "Editar código" }));
      fireEvent.change(within(field).getByRole("textbox", { name: "Código" }), { target: { value } });
    };

    it("un cliente guardado con código: busca por su código", async () => {
      seed("pedidos", { customers });
      const input = await openForm();
      fireEvent.change(input, { target: { value: "Ana López" } });
      fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
      expect(urlOf()).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=LT05TCP0932");
    });

    it("un cliente guardado sin código: busca solo por su primer nombre", async () => {
      seed("pedidos", { customers });
      const input = await openForm();
      fireEvent.change(input, { target: { value: "Beto Ruiz" } });
      fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
      expect(urlOf()).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Beto");
    });

    it("un cliente nuevo con el código que se escribió en el pedido: busca por ese código", async () => {
      seed("pedidos", { customers });
      const input = await openForm();
      fireEvent.change(input, { target: { value: "Gina Paz" } });
      await typeCode(" LT05TCP0777 ");
      fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
      expect(urlOf()).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=LT05TCP0777");
    });

    it("si se cambia el código en el pedido, manda el que se ve (no el guardado)", async () => {
      seed("pedidos", { customers });
      const input = await openForm();
      fireEvent.change(input, { target: { value: "Ana López" } });
      await typeCode("LT05TCP0001");
      fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
      expect(urlOf()).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=LT05TCP0001");
    });

    it("si se borra el código en el pedido, vuelve a buscar por el primer nombre", async () => {
      seed("pedidos", { customers });
      const input = await openForm();
      fireEvent.change(input, { target: { value: "Ana López" } });
      await typeCode("   ");
      fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
      expect(urlOf()).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana");
    });

    it("sigue abriendo la misma ventana pequeña", async () => {
      seed("pedidos", { customers });
      const input = await openForm();
      fireEvent.change(input, { target: { value: "Ana López" } });
      fireEvent.click(await screen.findByRole("button", { name: BUTTON }));
      expect(openSpy.mock.calls[0].slice(1)).toEqual(["procovar-portal", "popup,width=480,height=820"]);
    });
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
