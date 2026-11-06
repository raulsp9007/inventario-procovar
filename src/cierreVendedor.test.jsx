import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { cierreBlockMessage } from "./cierreFacturacion";

// Cierre de facturación del día (lo pone el administrador): pasada la hora, el vendedor ya no puede
// enviar a facturación un pedido de hoy (queda para mañana); los de otro día sí. Hoy fijo: lunes
// 2026-09-21, 09:00.

const STORAGE_KEY = "procovar-inventario-v1";
const URL_OK = "https://buzon.test";
const TOKEN = "k3J9xQ2mVb7LpR4tYw8NaZ5cHd1FgUe6";
const MENSAJE_8AM = "La facturación de hoy cerró a las 8:00 a. m. Pasa el pedido para mañana.";

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const line = (over = {}) => ({
  id: "m-1", code: "P500", type: "venta", qty: 40, unitPrice: 120, unitHl: 0.03, date: "2026-09-21",
  timestamp: "2026-09-21T08:00:00.000Z", orderId: "o1", orderSeq: 1, customerName: "Ana López",
  businessName: "", customerPhone: "5353551234", isDelivery: false, note: "", bucket: "hoy",
  sent: false, confirmed: false, sentToCustomer: true, ...over,
});

function seed({ movements = [line()], billToCloud = true } = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    whatsappPhone: "5355111222", supervisorPhone: "5355333444",
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true, billToCloud,
  }));
  localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Raul", role: "vendedor" }));
}

let calls;
let server;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00"));
  calls = [];
  server = { cierre: { activo: true, hora: "08:00", cerrado: true, mensaje: MENSAJE_8AM }, rejectPut: null };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const path = url.replace(URL_OK, "");
    calls.push({ method: init.method, path });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (server.rejectPut && init.method === "PUT") return { ok: false, status: 409, json: async () => ({ error: server.rejectPut }), text: async () => "x" };
    if (path === "/me") return ok({ id: "raul", name: "Raul", role: "vendedor" });
    if (path.startsWith("/orders/status")) return ok({ now: "2026-09-21T15:00:00.000Z", orders: [], cierre: server.cierre });
    return ok({});
  }));
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const sent = (orderId = "o1") => saved().movements.find((m) => m.orderId === orderId).sent;
const puts = () => calls.filter((c) => c.method === "PUT");
// La app no consulta el buzón al abrir: se entera del cierre justo al tocar FACT.
const asksCierre = () => calls.filter((c) => c.path.startsWith("/orders/status"));

describe("cierreBlockMessage", () => {
  const at = (h, m) => new Date(2026, 8, 21, h, m);
  const cierre = { activo: true, hora: "10:00", cerrado: false, mensaje: "" };

  it("sin cierre o apagado no bloquea", () => {
    expect(cierreBlockMessage(null, at(23, 0))).toBe("");
    expect(cierreBlockMessage({ activo: false, hora: "10:00" }, at(23, 0))).toBe("");
  });

  it("antes de la hora no bloquea; a la hora y después sí, con el motivo", () => {
    expect(cierreBlockMessage(cierre, at(9, 59))).toBe("");
    expect(cierreBlockMessage(cierre, at(10, 0))).toBe("La facturación de hoy cerró a las 10:00 a. m. Pasa el pedido para mañana.");
    expect(cierreBlockMessage({ ...cierre, hora: "15:30" }, at(16, 0))).toContain("3:30 p. m.");
  });
});

describe("vendedor: cierre de facturación del día", () => {
  it("pasada la hora, FACT. de un pedido de hoy no lo envía y explica por qué", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    expect(await screen.findByText(MENSAJE_8AM)).toBeTruthy();
    expect(sent()).toBe(false);
    await new Promise((r) => setTimeout(r, 200));
    expect(puts()).toHaveLength(0);
  });

  it("pasada la hora, el paso FACT. de la tarjeta tampoco lo envía", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturado" }));
    expect(await screen.findByText(MENSAJE_8AM)).toBeTruthy();
    expect(sent()).toBe(false);
  });

  it("pasada la hora, un pedido para mañana sí se puede enviar", async () => {
    seed({ movements: [line({ bucket: "manana", date: "2026-09-22" })] });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Para mañana/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(sent()).toBe(true));
    expect(screen.queryByText(MENSAJE_8AM)).toBeNull();
  });

  it("antes de la hora de cierre se envía normal", async () => {
    server.cierre = { activo: true, hora: "15:00", cerrado: false, mensaje: "" };
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(sent()).toBe(true));
  });

  it("con el cierre apagado se envía a cualquier hora", async () => {
    server.cierre = { activo: false, hora: "08:00", cerrado: false, mensaje: "" };
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(sent()).toBe(true));
  });

  it("un pedido a domicilio (va al supervisor, no a la nube) no se bloquea", async () => {
    seed({ movements: [line({ isDelivery: true })] });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Enviar a supervisor(a)" }));
    await waitFor(() => expect(sent()).toBe(true));
  });

  it("sin 'Facturar a la nube' (por WhatsApp) el cierre no aplica", async () => {
    seed({ billToCloud: false });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar (negocio)" }));
    await waitFor(() => expect(sent()).toBe(true));
  });

  it("si la nube lo rechaza por el cierre (se cerró entre medias), la tarjeta lo muestra en rojo", async () => {
    server.cierre = { activo: true, hora: "15:00", cerrado: false, mensaje: "" };
    server.rejectPut = MENSAJE_8AM;
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    expect(await screen.findByText(new RegExp(`La nube rechazó este pedido: ${MENSAJE_8AM}`))).toBeTruthy();
  });
});

describe("vendedor: cuándo se revisa el cierre", () => {
  it("no consulta el buzón al abrir la app; lo hace justo al tocar FACT. de un pedido de hoy", async () => {
    server.cierre = { activo: true, hora: "15:00", cerrado: false, mensaje: "" };
    seed();
    render(<InventoryApp />);
    const button = await screen.findByRole("button", { name: "Facturar a la nube" });
    await new Promise((r) => setTimeout(r, 200));
    expect(asksCierre()).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(sent()).toBe(true));
    expect(asksCierre()).toHaveLength(1);
  });

  it("un pedido para mañana se envía sin preguntar nada al buzón", async () => {
    seed({ movements: [line({ bucket: "manana", date: "2026-09-22" })] });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Para mañana/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(sent()).toBe(true));
    expect(asksCierre()).toHaveLength(0);
  });

  it("sin conexión no se sabe el cierre: se envía y, si ya había cerrado, la nube lo rechaza al subir", async () => {
    seed();
    fetch.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(sent()).toBe(true));
    expect(screen.queryByText(MENSAJE_8AM)).toBeNull();
  });
});
