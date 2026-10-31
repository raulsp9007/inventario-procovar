import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Clientes > "Clientes parecidos": posibles duplicados con su nivel de confianza
// y sus motivos. La persona elige cuál conservar y fusiona (los pedidos pasan al
// conservado), o marca que no son el mismo. Se puede deshacer.

const STORAGE_KEY = "procovar-inventario-v1";
const DISTINCT_KEY = "procovar-clientes-distintos";

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];

const cust = (id, name, extra = {}) => ({ id, name, businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", ...extra });
const customers = () => [
  cust("c1", "Beto Ruiz", { phone: "5355000001", businessName: "Cafetería Beto" }),
  cust("c2", "Beto R.", { phone: "5355000001", code: "BT1" }),
  cust("c3", "Ana López", { businessName: "Kiosco El Sol" }),
  cust("c4", "Ana María López", { businessName: "Kiosko Sol" }),
  cust("c5", "Luis Gil", { phone: "5355777777" }),
  cust("c6", "Marta Paz", { phone: "5355777777" }),
  cust("c7", "Rosa"),
  cust("c8", "Rosa Díaz"),
  cust("c9", "Pedro Mena"),
];

function order(id, name, extra = {}) {
  return {
    id: `m-${id}`, code: "P500", type: "venta", qty: 10, unitPrice: 1, unitHl: 0, date: "2026-09-20",
    timestamp: `2026-09-20T0${id.length}:00:00.000Z`, orderId: id, orderSeq: 1, customerName: name, businessName: "",
    customerPhone: "", isDelivery: false, note: "", bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true, ...extra,
  };
}
// Beto Ruiz: 2 pedidos; Beto R.: 1.
const movements = () => [order("o1", "Beto Ruiz"), order("o22", "Beto Ruiz"), order("o333", "Beto R.")];

function seed() {
  localStorage.setItem("procovar-active-tab", "clientes");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: movements(), customers: customers(), waitlist: [],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const openButton = () => screen.findByRole("button", { name: /Clientes parecidos/ });

async function openPanel() {
  render(<InventoryApp />);
  fireEvent.click(await openButton());
  return await screen.findByRole("group", { name: "Clientes parecidos" });
}
const pair = (panel, a, b) => within(panel).getByRole("group", { name: `Posible duplicado: ${a} y ${b}` });

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-31T09:00:00"));
  seed();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Clientes parecidos: aviso y lista", () => {
  it("el botón dice cuántos pares hay", async () => {
    render(<InventoryApp />);
    expect((await openButton()).textContent).toMatch(/4/);
  });

  it("sin parecidos no aparece el botón", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved(), customers: [cust("a", "Ana López"), cust("b", "Pedro Mena")] }));
    render(<InventoryApp />);
    await screen.findByRole("button", { name: /Importar clientes/ });
    expect(screen.queryByRole("button", { name: /Clientes parecidos/ })).toBeNull();
  });

  it("muestra primero lo más probable, con sus motivos y cuántos pedidos tiene cada uno", async () => {
    const panel = await openPanel();
    expect(within(panel).getByText("2 alta · 1 media · 1 baja")).toBeTruthy();
    const betos = pair(panel, "Beto Ruiz", "Beto R.");
    expect(within(betos).getByText("Alta")).toBeTruthy();
    expect(within(betos).getByText("mismo teléfono")).toBeTruthy();
    expect(within(betos).getByText("nombre parecido")).toBeTruthy();
    expect(within(betos).getByText("2 pedidos")).toBeTruthy();
    expect(within(betos).getByText("1 pedido")).toBeTruthy();
    const anas = pair(panel, "Ana López", "Ana María López");
    expect(within(anas).getByText("mismo negocio")).toBeTruthy();
    expect(within(pair(panel, "Luis Gil", "Marta Paz")).getByText("Media")).toBeTruthy();
  });

  it("los de confianza baja se muestran solo si se pide", async () => {
    const panel = await openPanel();
    expect(within(panel).queryByRole("group", { name: "Posible duplicado: Rosa y Rosa Díaz" })).toBeNull();
    fireEvent.click(within(panel).getByLabelText("Mostrar también las de confianza baja (1)"));
    expect(within(await screen.findByRole("group", { name: "Clientes parecidos" })).getByRole("group", { name: "Posible duplicado: Rosa y Rosa Díaz" })).toBeTruthy();
  });
});

describe("Clientes parecidos: fusionar", () => {
  // El que ya tiene código viene de la lista del portal (CSV): su nombre y su
  // código son los buenos. Beto R. tiene código aunque Beto Ruiz tenga más pedidos.
  it("por defecto se conserva el que ya tiene código (nombre del CSV), aunque el otro tenga más pedidos", async () => {
    const panel = await openPanel();
    const betos = pair(panel, "Beto Ruiz", "Beto R.");
    expect(within(betos).getByRole("button", { name: "Conservar a Beto R." }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(betos).getByRole("button", { name: "Fusionar" }));
    await waitFor(() => expect(saved().customers.some((c) => c.name === "Beto Ruiz")).toBe(false));
    const beto = saved().customers.find((c) => c.name === "Beto R.");
    expect(beto).toMatchObject({ businessName: "Cafetería Beto", phone: "5355000001", code: "BT1" }); // completó el negocio
    // Los tres pedidos quedan con el nombre del CSV.
    expect(saved().movements.map((m) => m.customerName)).toEqual(["Beto R.", "Beto R.", "Beto R."]);
    expect(await screen.findByText("Fusionados: Beto Ruiz → Beto R.")).toBeTruthy();
  });

  it("sin código en ninguno, se conserva el que tiene más pedidos", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...saved(),
      customers: [cust("c1", "Beto Ruiz", { phone: "5355000001" }), cust("c2", "Beto R.", { phone: "5355000001" })],
    }));
    const panel = await openPanel();
    expect(within(pair(panel, "Beto Ruiz", "Beto R.")).getByRole("button", { name: "Conservar a Beto Ruiz" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("con código en los dos, se conserva el que tiene más pedidos", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...saved(),
      customers: [cust("c1", "Beto Ruiz", { phone: "5355000001", code: "BT9" }), cust("c2", "Beto R.", { phone: "5355000001", code: "BT1" })],
    }));
    const panel = await openPanel();
    expect(within(pair(panel, "Beto Ruiz", "Beto R.")).getByRole("button", { name: "Conservar a Beto Ruiz" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("se puede elegir conservar el otro", async () => {
    const panel = await openPanel();
    const betos = pair(panel, "Beto Ruiz", "Beto R.");
    fireEvent.click(within(betos).getByRole("button", { name: "Conservar a Beto Ruiz" }));
    fireEvent.click(within(betos).getByRole("button", { name: "Fusionar" }));
    await waitFor(() => expect(saved().customers.some((c) => c.name === "Beto R.")).toBe(false));
    expect(saved().movements.every((m) => m.customerName === "Beto Ruiz")).toBe(true);
  });

  it("Deshacer deja todo como estaba", async () => {
    const panel = await openPanel();
    fireEvent.click(within(pair(panel, "Beto Ruiz", "Beto R.")).getByRole("button", { name: "Fusionar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(saved().customers).toHaveLength(9));
    expect(saved().movements.map((m) => m.customerName)).toEqual(["Beto Ruiz", "Beto Ruiz", "Beto R."]);
  });

  it("al fusionar, el par desaparece de la lista", async () => {
    const panel = await openPanel();
    fireEvent.click(within(pair(panel, "Beto Ruiz", "Beto R.")).getByRole("button", { name: "Fusionar" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Posible duplicado: Beto Ruiz y Beto R." })).toBeNull());
  });
});

describe("Clientes parecidos: 'No son el mismo'", () => {
  it("quita el par y no vuelve a salir", async () => {
    const panel = await openPanel();
    fireEvent.click(within(pair(panel, "Luis Gil", "Marta Paz")).getByRole("button", { name: "No son el mismo" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Posible duplicado: Luis Gil y Marta Paz" })).toBeNull());
    expect(JSON.parse(localStorage.getItem(DISTINCT_KEY))).toEqual(["c5|c6"]);
    expect(saved().customers).toHaveLength(9); // no se toca nada
  });

  it("lo recuerda al volver a abrir la app", async () => {
    localStorage.setItem(DISTINCT_KEY, JSON.stringify(["c5|c6"]));
    const panel = await openPanel();
    expect(within(panel).queryByRole("group", { name: "Posible duplicado: Luis Gil y Marta Paz" })).toBeNull();
    expect(within(panel).getByText("2 alta · 0 media · 1 baja")).toBeTruthy();
  });
});
