import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { createCloudApi } from "./cloudApi";
import { makeLinkCode } from "./linkCode";
import { handleRequest } from "../worker/src/api.js";
import { createMemoryStore } from "../worker/src/memoryStore.js";

// Flujo completo, de punta a punta, con el CÓDIGO REAL del buzón (worker/src/api.js sobre
// un almacén en memoria) conectado a la app de vendedores:
//   crear el pedido → FACT. → sube a la nube → la facturadora lo ve y lo confirma →
//   el vendedor pulsa Comprobar → el pedido queda confirmado en la app.
// La facturadora se simula con el mismo cliente de la API que usa su página.
// Hoy fijo: lunes 2026-09-21.

const STORAGE_KEY = "procovar-inventario-v1";
const URL_OK = "https://buzon.test";
const SELLER_TOKEN = "k3J9xQ2mVb7LpR4tYw8NaZ5cHd1FgUe6";
const FACT_TOKEN = "f".repeat(24);
const TODAY = "2026-09-21";
const users = [
  { id: "carlos", name: "Carlos Pérez", role: "vendedor", token: SELLER_TOKEN },
  { id: "marta", name: "Marta Díaz", role: "vendedor", token: "m".repeat(24) },
  { id: "fact", name: "Facturadora", role: "facturadora", token: FACT_TOKEN },
];

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const customers = [{ id: "a", name: "Ana López", businessName: "Kiosco El Sol", phone: "", createdAt: "2026-01-01T00:00:00.000Z", code: "LT05TCP0932" }];

let store;
let requests;

// El "internet": todo lo que la app pide va al buzón real.
function installBackend() {
  store = createMemoryStore();
  requests = [];
  const route = async (url, init = {}) => {
    requests.push({ method: init.method || "GET", path: String(url).replace(URL_OK, "") });
    return handleRequest(new Request(url, init), { store, users, now: () => new Date().toISOString() });
  };
  vi.stubGlobal("fetch", vi.fn(route));
  return route;
}

// Lo que haría la página de la facturadora.
const facturadora = (route) => createCloudApi({ url: URL_OK, token: FACT_TOKEN, fetchImpl: route });

function seed() {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [], customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 120 }, pricesAreUsd: false, exchangeRate: 0, billToCloud: true,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
  localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: SELLER_TOKEN, name: "Carlos Pérez", role: "vendedor" }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

async function createOrder(name, qty) {
  fireEvent.click(await screen.findByLabelText("Nuevo pedido"));
  fireEvent.change(await screen.findByPlaceholderText("Nombre del cliente"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: String(qty) } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
}

const cloudOrders = async (route) => (await facturadora(route).listOrders(TODAY)).sellers.flatMap((s) => s.orders);
const check = () => screen.findByRole("button", { name: "Comprobar" });

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("flujo completo: vendedor → nube → facturadora → vendedor", () => {
  it("un pedido solo creado todavía no está en la nube", async () => {
    const route = installBackend();
    seed();
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    await screen.findByRole("button", { name: "Facturar a la nube" });
    await new Promise((r) => setTimeout(r, 200));
    expect(await cloudOrders(route)).toEqual([]);
  });

  it("al facturarlo sube con cliente, código, negocio, productos y total, y queda 'En nube'", async () => {
    const route = installBackend();
    seed();
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(async () => expect(await cloudOrders(route)).toHaveLength(1));
    const [order] = await cloudOrders(route);
    expect(order).toMatchObject({
      sellerId: "carlos", sellerName: "Carlos Pérez", customerName: "Ana López", customerCode: "LT05TCP0932", businessName: "Kiosco El Sol",
      date: TODAY, status: "pendiente", modified: false, total: 480,
      lines: [{ code: "P500", name: "Parranda 500ml", qty: 4, unitPrice: 120 }],
    });
    expect(await screen.findByText("En nube")).toBeTruthy();
    expect(JSON.stringify(order)).not.toMatch(/phone|teléfono/i);
  });

  it("la facturadora lo ve entre sus pendientes, por vendedor", async () => {
    const route = installBackend();
    seed();
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(async () => expect(await cloudOrders(route)).toHaveLength(1));
    const { sellers } = await facturadora(route).listOrders(TODAY);
    const carlos = sellers.find((s) => s.id === "carlos");
    expect([carlos.pending, carlos.confirmed]).toEqual([1, 0]);
    expect(sellers.find((s) => s.id === "marta")).toMatchObject({ pending: 0, confirmed: 0 });
  });

  it("ella lo confirma, el vendedor pulsa Comprobar y el pedido queda confirmado en su app", async () => {
    const route = installBackend();
    seed();
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(async () => expect(await cloudOrders(route)).toHaveLength(1));
    const [{ id }] = await cloudOrders(route);

    // Mientras no se confirma, Comprobar no cambia nada.
    fireEvent.click(await check());
    expect(await screen.findByText(/sin novedades/)).toBeTruthy();
    expect(saved().movements.every((m) => !m.confirmed)).toBe(true);

    expect((await facturadora(route).confirmMany([id])).confirmed).toEqual([id]);
    // La app no se entera sola: hasta que el vendedor comprueba, sigue sin confirmar.
    expect(saved().movements.every((m) => !m.confirmed)).toBe(true);

    fireEvent.click(await check());
    expect(await screen.findByText(/1 pedido confirmado/)).toBeTruthy();
    await waitFor(() => expect(saved().movements.every((m) => m.confirmed === true)).toBe(true));
    expect(await screen.findByText(/Confirmado por facturación/)).toBeTruthy();
  });

  it("si lo corrige después de confirmado, la nube lo marca MODIFICADO, ella lo confirma otra vez y vuelve a la app", async () => {
    const route = installBackend();
    seed();
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(async () => expect(await cloudOrders(route)).toHaveLength(1));
    const [{ id }] = await cloudOrders(route);
    await facturadora(route).confirmMany([id]);
    fireEvent.click(await check());
    await waitFor(() => expect(saved().movements.every((m) => m.confirmed === true)).toBe(true));

    // El cliente cambia el pedido: se edita en la app, y el mismo pedido de la nube se actualiza.
    fireEvent.click(await screen.findByRole("button", { name: "Editar pedido" }));
    await screen.findByRole("button", { name: /Guardar cambios/ });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(async () => expect((await cloudOrders(route))[0].lines[0].qty).toBe(5));
    const [updated] = await cloudOrders(route);
    expect(updated).toMatchObject({ id, status: "pendiente", modified: true, total: 600, rev: 2 });
    expect(await cloudOrders(route)).toHaveLength(1);
    expect(saved().movements.some((m) => m.confirmed === true)).toBe(false);

    await new Promise((r) => setTimeout(r, 20));
    expect((await facturadora(route).confirmMany([id])).confirmed).toEqual([id]);
    fireEvent.click(await check());
    await waitFor(() => expect(saved().movements.every((m) => m.confirmed === true)).toBe(true));
    expect(await screen.findByText(/Confirmado por facturación/)).toBeTruthy();
  });

  it("ella deshace su confirmación y, al comprobar, el pedido vuelve a pendiente en la app", async () => {
    const route = installBackend();
    seed();
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(async () => expect(await cloudOrders(route)).toHaveLength(1));
    const [{ id }] = await cloudOrders(route);
    await facturadora(route).confirmMany([id]);
    fireEvent.click(await check());
    await waitFor(() => expect(saved().movements.every((m) => m.confirmed === true)).toBe(true));

    await new Promise((r) => setTimeout(r, 20));
    await facturadora(route).unconfirmMany([id]);
    fireEvent.click(await check());
    await waitFor(() => expect(saved().movements.every((m) => !m.confirmed)).toBe(true));
    expect(await screen.findByText(/vuelto a pendiente|vueltos a pendiente/)).toBeTruthy();
  });

  it("los pedidos de dos vendedores no se mezclan: cada uno solo recibe lo suyo", async () => {
    const route = installBackend();
    seed();
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    await waitFor(async () => expect(await cloudOrders(route)).toHaveLength(1));
    // Otra vendedora sube el suyo directamente al buzón.
    const marta = createCloudApi({ url: URL_OK, token: "m".repeat(24), fetchImpl: route });
    await marta.putOrder("order-de-marta", { customerName: "Rosa", date: TODAY, total: 100, lines: [{ code: "P500", name: "Parranda 500ml", qty: 1, unitPrice: 100 }] });
    const all = await cloudOrders(route);
    expect(all).toHaveLength(2);
    await facturadora(route).confirmMany(["order-de-marta"]);

    fireEvent.click(await check());
    expect(await screen.findByText(/sin novedades/)).toBeTruthy();
    expect(saved().movements.every((m) => !m.confirmed)).toBe(true);
    expect((await createCloudApi({ url: URL_OK, token: SELLER_TOKEN, fetchImpl: route }).statusSince("")).orders.map((o) => o.id)).not.toContain("order-de-marta");
  });

  it("sin internet al facturar: queda en cola y, al volver la conexión, sube solo", async () => {
    const route = installBackend();
    seed();
    let offline = true;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (offline) throw new TypeError("Failed to fetch");
      return route(url, init);
    }));
    render(<InventoryApp />);
    await createOrder("Ana López", 4);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar a la nube" }));
    expect(await screen.findByText("En cola")).toBeTruthy();
    expect(await cloudOrders(route)).toEqual([]);

    offline = false;
    window.dispatchEvent(new Event("online"));
    await waitFor(async () => expect(await cloudOrders(route)).toHaveLength(1));
    expect(await screen.findByText("En nube")).toBeTruthy();
  });

  it("un pedido a domicilio no se sube (va al supervisor)", async () => {
    const route = installBackend();
    seed();
    const data = saved();
    data.movements = [{
      id: "m1", code: "P500", type: "venta", qty: 2, unitPrice: 120, unitHl: 0.01, date: TODAY, timestamp: `${TODAY}T08:00:00.000Z`,
      orderId: "dom1", orderSeq: 1, customerName: "Beto Ruiz", isDelivery: true, note: "", bucket: "hoy", sent: true,
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<InventoryApp />);
    await check();
    await new Promise((r) => setTimeout(r, 250));
    expect(await cloudOrders(route)).toEqual([]);
    expect(requests.some((r) => r.method === "PUT")).toBe(false);
  });
});
