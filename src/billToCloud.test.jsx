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

const CODED = [{ id: "c1", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", code: "AB1001" }];

function seed({ tab = "pedidos", movements = [line()], linked = true, billToCloud, cloudEnabled = true, messageToBilling, customers = [] } = {}) {
  localStorage.setItem("procovar-active-tab", tab);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    whatsappPhone: "5355111222", supervisorPhone: "5355333444",
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...(billToCloud === undefined ? {} : { billToCloud }),
    ...(messageToBilling === undefined ? {} : { messageToBilling }),
  }));
  if (linked) localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Raul", role: "vendedor" }));
  if (!cloudEnabled) localStorage.setItem("procovar-nube-activo", "0");
}

let calls;
let openSpy;
let statusExtra;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00"));
  calls = [];
  statusExtra = null;
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    calls.push({ method: init.method, path: url.replace(URL_OK, "") });
    const data = url.endsWith("/me") ? { id: "raul", name: "Raul", role: "vendedor" } : { now: "2026-09-21T15:00:00.000Z", orders: [], ...(statusExtra || {}) };
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

// "Enviar mensaje a la facturadora": con "Facturar a la nube" activado, FACT. no manda el WhatsApp a la facturadora; con esta
// opción activada también lo manda (además de subir el pedido a la nube). El mensaje lleva el código del cliente si lo tiene.
describe("Configuración: Enviar mensaje a la facturadora", () => {
  async function openCard() {
    render(<InventoryApp />);
    return await screen.findByRole("group", { name: "Nube de facturación" });
  }

  it("está en la tarjeta de la nube, apagada por defecto", async () => {
    seed({ tab: "config" });
    const card = await openCard();
    expect(within(card).getByLabelText("Enviar mensaje a la facturadora").checked).toBe(false);
  });

  it("al activarla se guarda y se recuerda", async () => {
    seed({ tab: "config" });
    const card = await openCard();
    fireEvent.click(within(card).getByLabelText("Enviar mensaje a la facturadora"));
    await waitFor(() => expect(saved().messageToBilling).toBe(true));
  });

  it("si ya estaba activada aparece marcada, y es independiente de 'Facturar a la nube'", async () => {
    seed({ tab: "config", messageToBilling: true });
    const card = await openCard();
    expect(within(card).getByLabelText("Enviar mensaje a la facturadora").checked).toBe(true);
    expect(within(card).getByLabelText("Facturar a la nube").checked).toBe(false);
  });

  it("explica qué hace", async () => {
    seed({ tab: "config" });
    const card = await openCard();
    expect(within(card).getByText(/aunque .Facturar a la nube. esté activado/i)).toBeTruthy();
  });
});

describe("pedidos: botón FACT. con 'Enviar mensaje a la facturadora'", () => {
  const sentText = () => {
    const call = openSpy.mock.calls.find((c) => String(c[0]).startsWith("https://wa.me/5355111222"));
    return call ? decodeURIComponent(String(call[0]).split("?text=")[1]) : null;
  };

  it("con 'Facturar a la nube' y la opción: marca facturado, sube a la nube y abre el WhatsApp a la facturadora", async () => {
    seed({ billToCloud: true, messageToBilling: true, customers: CODED });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    await waitFor(() => expect(whatsappToBilling()).toHaveLength(1));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/orders/o1")).toBe(true));
  });

  it("el mensaje lleva el código del cliente", async () => {
    seed({ billToCloud: true, messageToBilling: true, customers: CODED });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(whatsappToBilling()).toHaveLength(1));
    expect(sentText()).toContain("Ana López");
    expect(sentText()).toContain("🔖 Código: AB1001");
    expect(sentText()).toContain("Parranda 500ml - 40");
  });

  it("si el cliente no tiene código, el mensaje no trae esa línea", async () => {
    seed({ billToCloud: true, messageToBilling: true });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(whatsappToBilling()).toHaveLength(1));
    expect(sentText()).not.toContain("Código");
  });

  it("con 'Facturar a la nube' y sin la opción, no manda el WhatsApp (como siempre)", async () => {
    seed({ billToCloud: true, messageToBilling: false, customers: CODED });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("si la facturación del día ya cerró, no se marca ni se manda el mensaje", async () => {
    statusExtra = { cierre: { activo: true, hora: "08:00", cerrado: true, mensaje: "La facturación de hoy cerró a las 8:00 a. m. Pasa el pedido para mañana." }, zona: "America/Havana", ajuste: 0 };
    seed({ billToCloud: true, messageToBilling: true, customers: CODED });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    expect(await screen.findByText(/cerró a las 8:00 a\. m\./)).toBeTruthy();
    expect(saved().movements[0].sent).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("un pedido para mañana también manda el mensaje", async () => {
    seed({ billToCloud: true, messageToBilling: true, customers: CODED, movements: [line({ bucket: "manana", date: "2026-09-22" })] });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Para mañana/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(() => expect(whatsappToBilling()).toHaveLength(1));
    expect(saved().movements[0].sent).toBe(true);
  });

  it("un pedido a domicilio sigue yendo solo al supervisor (una vez), con el código", async () => {
    seed({ billToCloud: true, messageToBilling: true, customers: CODED, movements: [line({ isDelivery: true })] });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Enviar a supervisor(a)" }));
    await waitFor(() => expect(saved().movements[0].sent).toBe(true));
    expect(whatsappToBilling()).toHaveLength(0);
    const sup = openSpy.mock.calls.filter((c) => String(c[0]).startsWith("https://wa.me/5355333444"));
    expect(sup).toHaveLength(1);
    expect(decodeURIComponent(String(sup[0][0]).split("?text=")[1])).toContain("🔖 Código: AB1001");
  });

  it("sin 'Facturar a la nube' el mensaje a la facturadora sale como siempre, ahora con el código", async () => {
    seed({ customers: CODED });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar (negocio)" }));
    await waitFor(() => expect(whatsappToBilling()).toHaveLength(1));
    expect(sentText()).toContain("🔖 Código: AB1001");
  });

  it("sin enlazar con la nube, FACT. manda un solo mensaje (no uno por cada motivo)", async () => {
    seed({ billToCloud: true, messageToBilling: true, linked: false, customers: CODED });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar (negocio)" }));
    await waitFor(() => expect(whatsappToBilling()).toHaveLength(1));
  });
});
