import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Configuración > "Facturar a la nube": con la opción activada (y la app enlazada
// con la nube), el botón FACT. de un pedido ya no manda el WhatsApp a la
// facturadora: solo lo marca como facturado, y de ahí sube a la nube.

const STORAGE_KEY = "procovar-inventario-v1";
const URL_OK = "https://buzon.test";
const TOKEN = "k3J9xQ2mVb7LpR4tYw8NaZ5cHd1FgUe6";

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];

const line = (over = {}) => ({
  id: "m-1", code: "P500", type: "venta", qty: 40, unitPrice: 120, unitHl: 0.03, date: "2026-09-21",
  timestamp: "2026-09-21T08:00:00.000Z", orderId: "o1", orderSeq: 1, customerName: "Ana López",
  businessName: "", customerPhone: "5353551234", isDelivery: false, note: "", bucket: "hoy",
  sent: false, confirmed: false, sentToCustomer: true, ...over,
});

function seed({ tab = "pedidos", movements = [line()], linked = true, billToCloud, cloudEnabled = true } = {}) {
  localStorage.setItem("procovar-active-tab", tab);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    whatsappPhone: "5355111222", supervisorPhone: "5355333444",
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...(billToCloud === undefined ? {} : { billToCloud }),
  }));
  if (linked) localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Raul", role: "vendedor" }));
  if (!cloudEnabled) localStorage.setItem("procovar-nube-activo", "0");
}

let calls;
let openSpy;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00"));
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    calls.push({ method: init.method, path: url.replace(URL_OK, "") });
    const data = url.endsWith("/me") ? { id: "raul", name: "Raul", role: "vendedor" } : { now: "2026-09-21T15:00:00.000Z", orders: [] };
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  }));
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const whatsappToBilling = () => openSpy.mock.calls.filter((c) => String(c[0]).startsWith("https://wa.me/5355111222"));

describe("Configuración: Facturar a la nube", () => {
  async function openCard() {
    render(<InventoryApp />);
    return await screen.findByRole("group", { name: "Nube de facturación" });
  }

  it("está en la tarjeta de la nube, apagada por defecto", async () => {
    seed({ tab: "config" });
    const card = await openCard();
    const toggle = within(card).getByLabelText("Facturar a la nube");
    expect(toggle.checked).toBe(false);
  });

  it("al activarla se guarda y se recuerda", async () => {
    seed({ tab: "config" });
    const card = await openCard();
    fireEvent.click(within(card).getByLabelText("Facturar a la nube"));
    await waitFor(() => expect(saved().billToCloud).toBe(true));
  });

  it("si ya estaba activada aparece marcada", async () => {
    seed({ tab: "config", billToCloud: true });
    const card = await openCard();
    expect(within(card).getByLabelText("Facturar a la nube").checked).toBe(true);
  });

  it("activada sin enlazar con la nube, avisa que primero hay que enlazar", async () => {
    seed({ tab: "config", linked: false, billToCloud: true });
    const card = await openCard();
    expect(within(card).getByLabelText("Facturar a la nube").checked).toBe(true);
    expect(within(card).getByText(/Enlaza primero/)).toBeTruthy();
  });

  it("apagada no muestra ese aviso, esté enlazada o no", async () => {
    seed({ tab: "config", linked: false });
    const card = await openCard();
    expect(within(card).queryByText(/Enlaza primero/)).toBeNull();
  });

  it("activada y enlazada no muestra el aviso", async () => {
    seed({ tab: "config", billToCloud: true });
    const card = await openCard();
    await within(card).findByText(/Enlazado como Raul/);
    expect(within(card).queryByText(/Enlaza primero/)).toBeNull();
  });
});

describe("pedidos: botón FACT. con 'Facturar a la nube'", () => {
  it("apagada: FACT. abre el WhatsApp de la facturadora y marca facturado (como siempre)", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar (negocio)" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    expect(whatsappToBilling()).toHaveLength(1);
  });

  it("activada y enlazada: FACT. solo marca facturado, sin WhatsApp, y el pedido sube a la nube", async () => {
    seed({ billToCloud: true });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    expect(openSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/orders/o1")).toBe(true));
  });

  it("activada pero sin enlazar: sigue yendo por WhatsApp (si no, el pedido no llegaría a ningún lado)", async () => {
    seed({ billToCloud: true, linked: false });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar (negocio)" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    expect(whatsappToBilling()).toHaveLength(1);
  });

  it("activada pero con la sincronización apagada: también va por WhatsApp", async () => {
    seed({ billToCloud: true, cloudEnabled: false });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar (negocio)" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    expect(whatsappToBilling()).toHaveLength(1);
  });

  it("un pedido a domicilio sigue yendo al supervisor por WhatsApp (no sube a la nube)", async () => {
    seed({ billToCloud: true, movements: [line({ isDelivery: true })] });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Enviar a supervisor(a)" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    expect(openSpy.mock.calls.some((c) => String(c[0]).startsWith("https://wa.me/5355333444"))).toBe(true);
  });
});
