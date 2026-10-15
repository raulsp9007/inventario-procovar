import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Recomendaciones de compra: en Pedidos > Hoy, la tarjeta "Para escribir hoy"
// (clientes a los que ya les toca comprar, con lo de siempre y botones para
// escribirles o armarles el pedido) y, al armar un pedido, la sugerencia
// "lo de siempre" del cliente. Hoy fijo: lunes 2026-09-21.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M330", name: "Malta 330ml", short: "M-330", color: "#274E37", hl: 0.003, format: "Sixpack" },
];

let n = 0;
function order(customerName, date, lines, extra = {}) {
  n += 1;
  return lines.map(([code, qty], i) => ({
    id: `m-${n}-${i}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0, date,
    timestamp: `${date}T10:00:00.000Z`, orderId: `o-${n}`, orderSeq: n, customerName,
    businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true, ...extra,
  }));
}

// Ana pide cada lunes: último pedido el 7 de septiembre, hoy es 21 (12 días hábiles).
const WEEKLY = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
const anaHistory = () => WEEKLY.flatMap((d) => order("Ana", d, [["P500", 40], ["M330", 30]]));

function seed({ movements = anaHistory(), customers, stock = { P500: 100, M330: 100 } } = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements,
    customers: customers ?? [{ id: "c1", name: "Ana", businessName: "Bodega Sol", phone: "5353551234", createdAt: "2026-01-01T00:00:00.000Z" }],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock, prices: { P500: 1, M330: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const cardButton = () => screen.findByRole("button", { name: /Para escribir hoy/ });

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

describe("Para escribir hoy (tarjeta en Pedidos > Hoy)", () => {
  it("aparece con cuántos clientes les toca y se abre al tocarla", async () => {
    seed();
    render(<InventoryApp />);
    const toggle = await cardButton();
    expect(toggle.textContent).toMatch(/1/);
    expect(screen.queryByText(/Bodega Sol/)).toBeNull(); // cerrada
    fireEvent.click(toggle);
    expect(await screen.findByText(/Bodega Sol/)).toBeTruthy();
    expect(screen.getByText("suele pedir cada 6 días · hace 12 días")).toBeTruthy();
    expect(screen.getByText("P-500 ×40")).toBeTruthy();
    expect(screen.getByText("M-330 ×30")).toBeTruthy();
  });

  it("no aparece si a nadie le toca todavía", async () => {
    seed();
    vi.setSystemTime(new Date("2026-09-09T09:00:00"));
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Cierre del día" });
    expect(screen.queryByRole("button", { name: /Para escribir hoy/ })).toBeNull();
  });

  it("no aparece en Para mañana", async () => {
    seed();
    render(<InventoryApp />);
    await cardButton();
    fireEvent.click(screen.getByRole("button", { name: /^Para mañana/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Para escribir hoy/ })).toBeNull());
  });

  it("Escribir abre WhatsApp con el cliente y el mensaje de lo de siempre", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await cardButton());
    fireEvent.click(await screen.findByRole("button", { name: "Escribir a Ana" }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0];
    expect(url.startsWith("https://wa.me/")).toBe(true);
    expect(url).toContain("1234");
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(
      "Hola Ana, ¿te preparo lo de siempre?\n40x Parranda 500ml\n30x Malta 330ml",
    );
  });

  it("sin teléfono no hay botón de escribir y lo dice", async () => {
    seed({ customers: [{ id: "c1", name: "Ana", businessName: "Bodega Sol", phone: "", createdAt: "2026-01-01T00:00:00.000Z" }] });
    render(<InventoryApp />);
    fireEvent.click(await cardButton());
    expect(await screen.findByText("Sin teléfono")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Escribir a Ana" })).toBeNull();
  });

  it("Pedido abre el pedido nuevo con el cliente y lo de siempre cargado", async () => {
    seed();
    render(<InventoryApp />);
    fireEvent.click(await cardButton());
    fireEvent.click(await screen.findByRole("button", { name: "Armar pedido de Ana" }));
    expect((await screen.findByPlaceholderText("Nombre del cliente")).value).toBe("Ana");
    expect(screen.getByText("EN EL PEDIDO")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
  });

  it("avisa de lo que dejó de pedir", async () => {
    const dates = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
    const movements = dates.flatMap((d, i) => order("Ana", d, i < 3 ? [["P500", 40], ["M330", 30]] : [["P500", 40]]));
    seed({ movements });
    render(<InventoryApp />);
    fireEvent.click(await cardButton());
    expect(await screen.findByText(/Ya no pide M-330 en sus últimos 3 pedidos/)).toBeTruthy();
  });
});

describe("Sugerencia al armar un pedido", () => {
  async function openForm() {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByLabelText("Nuevo pedido"));
    return await screen.findByPlaceholderText("Nombre del cliente");
  }

  it("al escribir un cliente con historial propone lo de siempre, con el porqué", async () => {
    seed();
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana" } });
    const box = await screen.findByLabelText("Sugerencia para Ana");
    expect(within(box).getByText("P-500 ×40")).toBeTruthy();
    expect(within(box).getByText("M-330 ×30")).toBeTruthy();
    expect(within(box).getByText(/Compra P-500 en 4 de sus últimos 4 pedidos/)).toBeTruthy();
  });

  it("Usar sugerencia carga las líneas y la sugerencia se va", async () => {
    seed();
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana" } });
    fireEvent.click(await screen.findByRole("button", { name: "Usar sugerencia" }));
    expect(await screen.findByText("EN EL PEDIDO")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.queryByLabelText("Sugerencia para Ana")).toBeNull();
  });

  it("un cliente nuevo o con poca historia no tiene sugerencia", async () => {
    seed({ movements: [...anaHistory(), ...order("Beto", "2026-09-01", [["P500", 10]])] });
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Beto" } });
    fireEvent.change(input, { target: { value: "Cliente Nuevo" } });
    expect(screen.queryByLabelText(/Sugerencia para/)).toBeNull();
  });

  it("no sugiere lo que no hay en stock", async () => {
    seed({ stock: { P500: 100, M330: 0 } });
    const input = await openForm();
    fireEvent.change(input, { target: { value: "Ana" } });
    const box = await screen.findByLabelText("Sugerencia para Ana");
    expect(within(box).getByText("P-500 ×40")).toBeTruthy();
    expect(within(box).queryByText("M-330 ×30")).toBeNull();
  });
});
