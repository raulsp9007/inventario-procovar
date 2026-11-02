import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { makeLinkCode } from "./linkCode";

// La app del vendedor con la nube de facturación: sube lo enviado a facturación
// y, cuando la facturadora da 👍, marca sola el paso CONF. Hoy fijo: lunes
// 2026-09-21. El buzón se simula con un fetch falso.

const STORAGE_KEY = "procovar-inventario-v1";
const URL_OK = "https://buzon.test";
const TOKEN = "k3J9xQ2mVb7LpR4tYw8NaZ5cHd1FgUe6";
const CODE = makeLinkCode({ url: URL_OK, token: TOKEN });
const FACT_CODE = makeLinkCode({ url: URL_OK, token: "f".repeat(24) });

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];

const line = (over = {}) => ({
  id: "m-1", code: "P500", type: "venta", qty: 40, unitPrice: 120, unitHl: 0.03, date: "2026-09-21",
  timestamp: "2026-09-21T08:00:00.000Z", orderId: "o1", orderSeq: 1, customerName: "Ana López",
  businessName: "", customerPhone: "5353551234", isDelivery: false, note: "", bucket: "hoy",
  sent: true, confirmed: false, sentToCustomer: true, ...over,
});

function seed({ movements = [line()], linked = true, prices = { P500: 1 } } = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
  if (linked) localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Carlos Pérez", role: "vendedor" }));
}

let server;
let calls;

function installFetch() {
  calls = [];
  server = { rows: [], now: "2026-09-21T15:00:00.000Z", role: "vendedor", offline: false };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (server.offline) throw new TypeError("Failed to fetch");
    calls.push({ method: init.method, path: url.replace(URL_OK, ""), headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const path = url.replace(URL_OK, "");
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (server.rejectPut && init.method === "PUT") return { ok: false, status: 400, json: async () => ({ error: server.rejectPut }), text: async () => "x" };
    if (path === "/me") return ok({ id: "carlos", name: "Carlos Pérez", role: server.role });
    if (path.startsWith("/orders/status")) return ok({ now: server.now, orders: server.rows });
    return ok({});
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00"));
  installFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("vendedor: pedidos y nube", () => {
  it("sin enlace no habla con la nube y no muestra estados", async () => {
    seed({ linked: false });
    render(<InventoryApp />);
    await screen.findByRole("button", { name: /Ana López/ });
    expect(calls).toEqual([]);
    expect(screen.queryByText("En nube")).toBeNull();
  });

  it("sube el pedido enviado a facturación, con el código del vendedor, y lo marca 'En nube'", async () => {
    seed();
    render(<InventoryApp />);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/orders/o1")).toBe(true));
    const put = calls.find((c) => c.method === "PUT");
    expect(put.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(put.body).toEqual({
      customerName: "Ana López", date: "2026-09-21", total: 4800,
      lines: [{ code: "P500", name: "Parranda 500ml", qty: 40, unitPrice: 120 }],
    });
    expect(await screen.findByText("En nube")).toBeTruthy();
    expect(JSON.stringify(put.body)).not.toContain("5353551234");
  });

  it("un pedido que no está enviado a facturación no se sube", async () => {
    seed({ movements: [line({ sent: false })] });
    render(<InventoryApp />);
    await screen.findByRole("button", { name: /Ana López/ });
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("al pulsar Comprobar, si la facturadora dio 👍, la app marca CONF. y lo dice", async () => {
    seed();
    server.rows = [{
      id: "o1", status: "confirmado", rev: 1, modified: false,
      confirmedAt: new Date(2026, 8, 21, 10, 42).toISOString(), confirmedBy: "facturadora", updatedAt: "2026-09-21T15:42:00.000Z",
    }];
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Comprobar" }));
    expect(await screen.findByText("Confirmado por facturación a las 10:42")).toBeTruthy();
    await waitFor(() => expect(saved().movements.every((m) => m.confirmed === true)).toBe(true));
  });
});

// El botón "Comprobar" mira al momento; sola, la app comprueba cada hora (ver
// useCloudSync.test.jsx), así que al abrir no consulta.
describe("vendedor: botón Comprobar (Pedidos)", () => {
  const confirmedRow = () => ({
    id: "o1", status: "confirmado", rev: 1, modified: false,
    confirmedAt: new Date(2026, 8, 21, 10, 42).toISOString(), confirmedBy: "facturadora", updatedAt: "2026-09-21T15:42:00.000Z",
  });
  const statusCalls = () => calls.filter((c) => c.path.startsWith("/orders/status"));
  const bar = () => screen.findByRole("group", { name: "Comprobar confirmaciones" });

  it("sin enlace no hay botón", async () => {
    seed({ linked: false });
    render(<InventoryApp />);
    await screen.findByRole("button", { name: /Ana López/ });
    expect(screen.queryByRole("button", { name: "Comprobar" })).toBeNull();
  });

  it("con enlace está en Pedidos y no consulta al abrir, solo al pulsar", async () => {
    seed();
    render(<InventoryApp />);
    expect(await screen.findByRole("button", { name: "Comprobar" })).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    await new Promise((r) => setTimeout(r, 80));
    expect(statusCalls()).toHaveLength(0);
  });

  it("al pulsarlo consulta una vez y dice la hora y que no hay novedades", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Comprobar" }));
    expect(await within(await bar()).findByText("Comprobado a las 09:00 · sin novedades")).toBeTruthy();
    expect(statusCalls()).toHaveLength(1);
  });

  it("dice cuántos pedidos confirmó la facturadora", async () => {
    seed();
    server.rows = [confirmedRow()];
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Comprobar" }));
    expect(await within(await bar()).findByText("Comprobado a las 09:00 · 1 pedido confirmado")).toBeTruthy();
  });

  it("sin conexión avisa y no da la comprobación por hecha", async () => {
    seed();
    render(<InventoryApp />);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    server.offline = true;
    fireEvent.click(await screen.findByRole("button", { name: "Comprobar" }));
    expect(await within(await bar()).findByText(/Sin conexión/)).toBeTruthy();
    expect(within(await bar()).queryByText(/Comprobado a las/)).toBeNull();
  });

  it("con la sincronización apagada no se ofrece", async () => {
    seed();
    localStorage.setItem("procovar-nube-activo", "0");
    render(<InventoryApp />);
    await screen.findByRole("button", { name: /Ana López/ });
    expect(screen.queryByRole("button", { name: "Comprobar" })).toBeNull();
  });
});

describe("vendedor: Configuración > Nube de facturación", () => {
  async function openCard() {
    localStorage.setItem("procovar-active-tab", "config");
    render(<InventoryApp />);
    return await screen.findByRole("group", { name: "Nube de facturación" });
  }

  it("sin enlace pide el código y no habla con la nube", async () => {
    seed({ linked: false });
    const card = await openCard();
    expect(within(card).getByLabelText("Código de enlace")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Enlazar" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("enlazar con un código válido muestra quién es y sube lo enviado, sin consultar por su cuenta", async () => {
    seed({ linked: false });
    const card = await openCard();
    fireEvent.change(within(card).getByLabelText("Código de enlace"), { target: { value: CODE } });
    fireEvent.click(within(card).getByRole("button", { name: "Enlazar" }));
    expect(await within(card).findByText(/Enlazado como Carlos Pérez/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("procovar-nube-enlace")).token).toBe(TOKEN);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.some((c) => c.path.startsWith("/orders/status"))).toBe(false);
  });

  it("la tarjeta también tiene Comprobar", async () => {
    seed();
    const card = await openCard();
    fireEvent.click(await within(card).findByRole("button", { name: "Comprobar" }));
    expect(await within(card).findByText("Comprobado a las 09:00.")).toBeTruthy();
  });

  it("el código de la facturadora se rechaza con un mensaje claro", async () => {
    seed({ linked: false });
    server.role = "facturadora";
    const card = await openCard();
    fireEvent.change(within(card).getByLabelText("Código de enlace"), { target: { value: FACT_CODE } });
    fireEvent.click(within(card).getByRole("button", { name: "Enlazar" }));
    expect(await within(card).findByText("Este código es de la facturadora. Úsalo en su app.")).toBeTruthy();
    expect(localStorage.getItem("procovar-nube-enlace")).toBeNull();
  });

  it("un código mal escrito dice por qué", async () => {
    seed({ linked: false });
    const card = await openCard();
    fireEvent.change(within(card).getByLabelText("Código de enlace"), { target: { value: "hola" } });
    fireEvent.click(within(card).getByRole("button", { name: "Enlazar" }));
    expect(await within(card).findByText("Ese no es un código de enlace de Procovar.")).toBeTruthy();
  });

  it("con enlace: se puede apagar la sincronización y desenlazar", async () => {
    seed();
    const card = await openCard();
    expect(await within(card).findByText(/Enlazado como Carlos Pérez/)).toBeTruthy();
    const toggle = within(card).getByLabelText("Sincronizar con la facturadora");
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(localStorage.getItem("procovar-nube-activo")).toBe("0"));
    fireEvent.click(within(card).getByRole("button", { name: "Desenlazar" }));
    await waitFor(() => expect(localStorage.getItem("procovar-nube-enlace")).toBeNull());
    expect(await within(card).findByLabelText("Código de enlace")).toBeTruthy();
  });

  it("el código secreto no entra en los respaldos de la app", async () => {
    seed();
    await openCard();
    expect(JSON.stringify(saved())).not.toContain(TOKEN);
  });
});

// Corregir un pedido que ya está en la nube: se edita en la app y el mismo pedido de la
// nube se actualiza con el cambio (la facturadora lo ve como MODIFICADO).
describe("vendedor: corregir un pedido ya en la nube", () => {
  const puts = () => calls.filter((c) => c.method === "PUT" && c.path === "/orders/o1");
  async function openEdit() {
    render(<InventoryApp />);
    await waitFor(() => expect(puts()).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
    await screen.findByRole("button", { name: /Guardar cambios/ });
  }

  it("al cambiar las cantidades y guardar, el mismo pedido se actualiza en la nube", async () => {
    seed({ prices: { P500: 120 } });
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1].body.lines).toEqual([{ code: "P500", name: "Parranda 500ml", qty: 41, unitPrice: 120 }]);
    expect(puts()[1].body.total).toBe(4920);
    expect(calls.filter((c) => c.method === "PUT").every((c) => c.path === "/orders/o1")).toBe(true);
  });

  it("el pedido sigue enviado a facturación (no hace falta tocar FACT. otra vez) y sigue 'En nube'", async () => {
    seed({ prices: { P500: 120 } });
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(saved().movements.every((m) => m.sent === true)).toBe(true);
    expect(await screen.findByText("En nube")).toBeTruthy();
  });

  it("guardar sin cambiar nada no vuelve a subir el pedido", async () => {
    seed({ prices: { P500: 120 } });
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    await new Promise((r) => setTimeout(r, 120));
    expect(puts()).toHaveLength(1);
  });

  it("un pedido que todavía no se envió a facturación no se sube al editarlo", async () => {
    seed({ movements: [line({ sent: false })], prices: { P500: 120 } });
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
    await screen.findByRole("button", { name: /Guardar cambios/ });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar cambios/ })).toBeNull());
    await new Promise((r) => setTimeout(r, 120));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});

// Solo cuentan los pedidos de Hoy: uno facturado "para mañana" no sale a la nube hoy; sale
// el día que le toca.
describe("vendedor: pedidos para mañana ya facturados", () => {
  const tomorrow = () => line({ bucket: "manana", date: "2026-09-22", sent: true, timestamp: "2026-09-20T08:00:00.000Z" });

  it("hoy no se sube a la nube", async () => {
    seed({ movements: [tomorrow()] });
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Comprobar" });
    await new Promise((r) => setTimeout(r, 150));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("el día que le toca, sí se sube", async () => {
    vi.setSystemTime(new Date("2026-09-22T09:00:00"));
    seed({ movements: [tomorrow()] });
    render(<InventoryApp />);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/orders/o1")).toBe(true));
    expect(calls.find((c) => c.method === "PUT").body.date).toBe("2026-09-22");
  });
});

// Si la nube rechaza un pedido, se avisa en rojo sobre su tarjeta, con el motivo.
describe("vendedor: pedido rechazado por la nube", () => {
  const banner = () => screen.findByText(/La nube rechazó este pedido/);

  it("sale una notificación roja en la tarjeta del pedido, con el motivo", async () => {
    seed();
    server.rejectPut = "Falta el nombre del cliente.";
    render(<InventoryApp />);
    const text = await banner();
    const alert = text.closest("[role='alert']");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("Falta el nombre del cliente.");
    expect(alert.getAttribute("data-cloud-rejected")).not.toBeNull();
    expect(screen.queryByText("En nube")).toBeNull();
  });

  it("no sale en los pedidos que la nube aceptó", async () => {
    seed();
    render(<InventoryApp />);
    await screen.findByText("En nube");
    expect(screen.queryByText(/La nube rechazó este pedido/)).toBeNull();
  });

  it("al corregir el pedido y aceptarlo la nube, la notificación desaparece", async () => {
    seed({ prices: { P500: 120 } });
    server.rejectPut = "Falta el nombre del cliente.";
    render(<InventoryApp />);
    await banner();
    server.rejectPut = null;
    fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
    await screen.findByRole("button", { name: /Guardar cambios/ });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(screen.queryByText(/La nube rechazó este pedido/)).toBeNull());
    expect(await screen.findByText("En nube")).toBeTruthy();
  });
});
