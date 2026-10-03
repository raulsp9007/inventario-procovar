import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Supervisor(a): segundo contacto de WhatsApp, configurado en Config igual que
// el facturador. Los pedidos con domicilio se mandan a él/ella en vez de al
// facturador: en la tarjeta del pedido el botón FACT. pasa a SUP., y ese paso
// del seguimiento (el que antes era "Facturado") se llama "Supervisor".

const STORAGE_KEY = "procovar-inventario-v1";
const FACTURADOR = "5359000000";
const SUPERVISOR = "5355512345";

function order(orderId, customerName, seq, { isDelivery = false, sent = false } = {}) {
  return {
    id: `m-${orderId}`, code: "P500", type: "venta", qty: 2, unitPrice: 100, unitHl: 0, date: "2026-09-21",
    timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq, customerName,
    businessName: "", customerPhone: "5353551234", isDelivery, note: "",
    bucket: "hoy", sent, confirmed: false, sentToCustomer: false,
  };
}

function seed({ view, movements = [], extra = {} }) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
    whatsappPhone: FACTURADOR,
    ...extra,
  }));
}

function stored() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

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

describe("Config: tarjeta Supervisor(a)", () => {
  it("aparece debajo de la tarjeta Facturador(a)", async () => {
    seed({ view: "config" });
    render(<InventoryApp />);
    const facturador = await screen.findByText("Facturador(a)");
    const supervisor = screen.getByText("Supervisor(a)");
    expect(facturador.compareDocumentPosition(supervisor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("guarda el teléfono del supervisor sin tocar el del facturador", async () => {
    seed({ view: "config" });
    render(<InventoryApp />);
    await screen.findByText("Supervisor(a)");
    const input = screen.getByLabelText("Teléfono del supervisor(a)");
    fireEvent.change(input, { target: { value: SUPERVISOR } });
    const card = input.closest("[data-contact-card]");
    fireEvent.click(within(card).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(stored().supervisorPhone).toBe(SUPERVISOR));
    expect(stored().whatsappPhone).toBe(FACTURADOR);
  });

  it("solo deja dígitos al guardar", async () => {
    seed({ view: "config" });
    render(<InventoryApp />);
    await screen.findByText("Supervisor(a)");
    const input = screen.getByLabelText("Teléfono del supervisor(a)");
    fireEvent.change(input, { target: { value: "+53 5551-2345" } });
    fireEvent.blur(input);
    await waitFor(() => expect(stored().supervisorPhone).toBe("5355512345"));
  });

  it("muestra el contacto ya guardado", async () => {
    seed({ view: "config", extra: { supervisorPhone: SUPERVISOR, supervisorContactName: "Marta" } });
    render(<InventoryApp />);
    expect(await screen.findByText(`Guardado: Marta · ${SUPERVISOR}`)).toBeTruthy();
    expect(screen.getByLabelText("Teléfono del supervisor(a)").value).toBe(SUPERVISOR);
  });

  it("un respaldo viejo sin supervisor carga con el campo vacío", async () => {
    seed({ view: "config" });
    render(<InventoryApp />);
    await screen.findByText("Supervisor(a)");
    expect(screen.getByLabelText("Teléfono del supervisor(a)").value).toBe("");
    expect(screen.getByLabelText("Teléfono del facturador(a)").value).toBe(FACTURADOR);
  });
});

describe("Pedidos: botón Supervisor en los pedidos con domicilio", () => {
  const extra = { supervisorPhone: SUPERVISOR };

  it("con domicilio el botón es SUP.; sin domicilio sigue siendo FACT.", async () => {
    seed({
      view: "pedidos", extra,
      movements: [order("o1", "Ana", 1, { isDelivery: true }), order("o2", "Beto", 2)],
    });
    render(<InventoryApp />);
    await screen.findByText("👤 Ana");
    const sup = screen.getByRole("button", { name: "Enviar a supervisor(a)" });
    const fact = screen.getByRole("button", { name: "Registrar (negocio)" });
    expect(within(sup).getByText("SUP.")).toBeTruthy();
    expect(within(fact).getByText("FACT.")).toBeTruthy();
  });

  it("SUP. abre el chat del supervisor con el mensaje del pedido y marca el paso", async () => {
    seed({ view: "pedidos", extra, movements: [order("o1", "Ana", 1, { isDelivery: true })] });
    render(<InventoryApp />);
    await screen.findByText("👤 Ana");
    const step = screen.getByRole("button", { name: "Supervisor" });
    expect(step.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Enviar a supervisor(a)" }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.mock.calls[0][0];
    expect(url.startsWith(`https://wa.me/${SUPERVISOR}?text=`)).toBe(true);
    expect(decodeURIComponent(url)).toContain("Domicilio");
    expect(decodeURIComponent(url)).toContain("Ana");
    await waitFor(() => expect(screen.getByRole("button", { name: "Supervisor" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("FACT. sigue yendo al facturador en los pedidos sin domicilio", async () => {
    seed({ view: "pedidos", extra, movements: [order("o2", "Beto", 2)] });
    render(<InventoryApp />);
    await screen.findByText("👤 Beto");
    fireEvent.click(screen.getByRole("button", { name: "Registrar (negocio)" }));
    expect(openSpy.mock.calls[0][0].startsWith(`https://wa.me/${FACTURADOR}?text=`)).toBe(true);
  });

  it("sin supervisor configurado abre WhatsApp sin número (para elegir el contacto)", async () => {
    seed({ view: "pedidos", movements: [order("o1", "Ana", 1, { isDelivery: true })] });
    render(<InventoryApp />);
    await screen.findByText("👤 Ana");
    fireEvent.click(screen.getByRole("button", { name: "Enviar a supervisor(a)" }));
    expect(openSpy.mock.calls[0][0].startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("en el seguimiento, el paso se llama SUP. con domicilio y FACT. sin domicilio", async () => {
    seed({
      view: "pedidos", extra,
      movements: [order("o1", "Ana", 1, { isDelivery: true }), order("o2", "Beto", 2)],
    });
    render(<InventoryApp />);
    await screen.findByText("👤 Ana");
    // Dos tarjetas: cada una con su propio paso.
    expect(screen.getAllByRole("button", { name: "Supervisor" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Facturado" })).toHaveLength(1);
    const supStep = screen.getByRole("button", { name: "Supervisor" });
    expect(within(supStep).getByText("SUP.")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "Facturado" })).getByText("FACT.")).toBeTruthy();
  });

  it("editar un pedido ya enviado para ponerle domicilio cambia el botón y conserva el paso", async () => {
    seed({ view: "pedidos", extra, movements: [order("o2", "Beto", 2, { sent: true })] });
    render(<InventoryApp />);
    await screen.findByText("👤 Beto");
    expect(screen.getByRole("button", { name: "Facturado" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Editar pedido" }));
    fireEvent.click(await screen.findByRole("button", { name: "Entrega a domicilio" }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar a supervisor(a)" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Supervisor" }).getAttribute("aria-pressed")).toBe("true");
  });
});
