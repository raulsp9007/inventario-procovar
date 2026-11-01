import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import FacturadoraApp from "./FacturadoraApp";

// Sitio de la facturadora en computadora de escritorio: barra de vendedores a la
// izquierda y una tabla con los pedidos de todos, con selección múltiple,
// búsqueda y atajos de teclado. En el teléfono sigue la vista de tarjetas.

const URL_OK = "https://buzon.test";
const TOKEN = "f".repeat(24);

const line = (name, qty) => ({ code: name, name, qty, unitPrice: 100 });
const order = (id, sellerId, sellerName, customerName, hour, over = {}) => ({
  id, sellerId, sellerName, date: "2026-10-30", customerName, total: 7200, lines: [line("Parranda 500ml", 12)],
  status: "pendiente", rev: 1, modified: false, confirmedAt: null, confirmedBy: null,
  createdAt: new Date(2026, 9, 30, hour, 0).toISOString(), updatedAt: "x", ...over,
});
const recount = (s) => ({ ...s, pending: s.orders.filter((o) => o.status === "pendiente").length, confirmed: s.orders.filter((o) => o.status === "confirmado").length });

let server;
let calls;

function installFetch() {
  calls = [];
  server = {
    sellers: [
      recount({ id: "raul", name: "Raul", orders: [
        order("a", "raul", "Raul", "Ana López", 8, { customerCode: "LT05TCP0932", businessName: "Kiosco El Sol", modified: true }),
        order("b", "raul", "Raul", "Gina Paz", 9),
        order("c", "raul", "Raul", "Marta Gil", 10, { status: "confirmado", confirmedBy: "facturadora", confirmedAt: new Date(2026, 9, 30, 10, 30).toISOString() }),
      ] }),
      recount({ id: "melisa", name: "Melisa", orders: [order("d", "melisa", "Melisa", "Beto Ruiz", 11, { customerCode: "LT05TCP0483", businessName: "Bar La Esquina" })] }),
      recount({ id: "eddy", name: "Eddy", orders: [] }),
    ],
  };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const path = url.replace(URL_OK, "");
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (path === "/me") return ok({ id: "fact", name: "Facturadora", role: "facturadora" });
    if (path.startsWith("/orders/confirm") || path.startsWith("/orders/unconfirm")) {
      const confirming = path.startsWith("/orders/confirm");
      const ids = JSON.parse(init.body).ids;
      server.sellers = server.sellers.map((s) => recount({
        ...s,
        orders: s.orders.map((o) => (ids.includes(o.id)
          ? confirming
            ? { ...o, status: "confirmado", confirmedBy: "facturadora", confirmedAt: new Date(2026, 9, 30, 11, 5).toISOString(), modified: false }
            : { ...o, status: "pendiente", confirmedBy: null, confirmedAt: null }
          : o)),
      }));
      return ok(confirming ? { confirmed: ids, missing: [] } : { unconfirmed: ids, missing: [] });
    }
    if (path.startsWith("/orders")) return ok({ now: "2026-10-30T16:00:00.000Z", sellers: server.sellers });
    return ok({});
  }));
}

function setDesktop(on) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: on && query.includes("min-width"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Facturadora", role: "facturadora" }));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-30T11:00:00"));
  installFetch();
  setDesktop(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.matchMedia;
});

const table = async () => await screen.findByRole("table", { name: "Pedidos" });
const rowOf = (name) => screen.getAllByRole("row").find((r) => r.textContent.includes(name));
const sidebar = () => screen.getByRole("navigation", { name: "Vendedores" });
const names = () => within(screen.getByRole("table", { name: "Pedidos" })).getAllByRole("row").slice(1).map((r) => r.getAttribute("data-order-name"));

describe("escritorio: cuenta de supervisión (solo lectura)", () => {
  beforeEach(() => {
    localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "super", role: "supervisor" }));
  });

  it("ve la tabla y el aviso, sin casillas ni botones de confirmar", async () => {
    render(<FacturadoraApp />);
    await table();
    expect(screen.getByText("Solo lectura")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Todos/ }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Quitar/ })).toBeNull();
    expect(names()).toContain("Ana López");
    expect(within(rowOf("Marta Gil")).getByText(/✓/)).toBeTruthy();
  });

  it("Enter y Espacio no confirman ni marcan; moverse y buscar sí funcionan", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(calls.some((c) => c.path.startsWith("/orders/confirm"))).toBe(false);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toBeTruthy();
  });

  it("la facturadora sigue con casillas y botones", async () => {
    localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Facturadora", role: "facturadora" }));
    render(<FacturadoraApp />);
    await table();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
    expect(screen.queryByText("Solo lectura")).toBeNull();
  });
});

describe("escritorio: barra de vendedores", () => {
  it("lista Todos y a los vendedores del buzón con sus pendientes, alfabéticamente", async () => {
    render(<FacturadoraApp />);
    await table();
    const nav = sidebar();
    await waitFor(() => expect(within(nav).getByRole("button", { name: /Raul/ }).textContent).toContain("2"));
    const labels = within(nav).getAllByRole("button").map((b) => b.getAttribute("data-seller"));
    expect(labels).toEqual(["todos", "Eddy", "Melisa", "Raul"]);
    expect(within(nav).getByRole("button", { name: /Todos/ }).textContent).toContain("3");
    expect(within(nav).getByRole("button", { name: /Raul/ }).textContent).toContain("2");
    expect(within(nav).getByRole("button", { name: /Melisa/ }).textContent).toContain("1");
  });

  it("al elegir un vendedor, la tabla solo muestra los suyos; Todos los vuelve a mostrar", async () => {
    render(<FacturadoraApp />);
    await table();
    expect(names()).toEqual(["Ana López", "Gina Paz", "Beto Ruiz"]);
    fireEvent.click(within(sidebar()).getByRole("button", { name: /Melisa/ }));
    expect(names()).toEqual(["Beto Ruiz"]);
    fireEvent.click(within(sidebar()).getByRole("button", { name: /Todos/ }));
    expect(names()).toEqual(["Ana López", "Gina Paz", "Beto Ruiz"]);
  });

  it("un vendedor sin pedidos muestra la tabla vacía con un aviso", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.click(within(sidebar()).getByRole("button", { name: /Eddy/ }));
    expect(screen.getByText(/Nada por aquí/)).toBeTruthy();
  });
});

describe("escritorio: la tabla", () => {
  it("muestra hora, cliente, negocio, vendedor, código, productos y total", async () => {
    render(<FacturadoraApp />);
    await table();
    const ana = rowOf("Ana López");
    expect(within(ana).getByText("08:00")).toBeTruthy();
    expect(within(ana).getByText(/Kiosco El Sol/)).toBeTruthy();
    expect(within(ana).getByText(/Raul/)).toBeTruthy();
    expect(within(ana).getByText("LT05TCP0932")).toBeTruthy();
    expect(within(ana).getByText(/Parranda 500ml ×12/)).toBeTruthy();
    expect(within(ana).getByText(/7200/)).toBeTruthy();
    expect(within(ana).getByText("modificado")).toBeTruthy();
  });

  it("junto al código, Comprobar abre el portal filtrando por ese código", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<FacturadoraApp />);
    await table();
    fireEvent.click(within(rowOf("Ana López")).getByRole("button", { name: "Comprobar código LT05TCP0932" }));
    expect(open.mock.calls[0]).toEqual(["https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=LT05TCP0932", "procovar-portal"]);
  });

  it("sin código lo dice y Comprobar busca por el nombre", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<FacturadoraApp />);
    await table();
    const gina = rowOf("Gina Paz");
    expect(within(gina).getByText("Sin código")).toBeTruthy();
    fireEvent.click(within(gina).getByRole("button", { name: "Comprobar a Gina Paz" }));
    expect(open.mock.calls[0][0]).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Gina%20Paz");
  });

  it("encima de la tabla: pendientes en total y la hora de la última actualización", async () => {
    render(<FacturadoraApp />);
    await table();
    expect(screen.getByText("3 pendientes")).toBeTruthy();
    expect(screen.getByText(/En línea/)).toBeTruthy();
  });
});

describe("escritorio: pestañas", () => {
  it("Sin confirmar, Todos y Confirmados, cada una con su cuenta", async () => {
    render(<FacturadoraApp />);
    await table();
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: /Sin confirmar/ }).textContent).toContain("3");
    expect(within(tabs).getByRole("tab", { name: /Todos/ }).textContent).toContain("4");
    expect(within(tabs).getByRole("tab", { name: /Confirmados/ }).textContent).toContain("1");
    fireEvent.click(within(tabs).getByRole("tab", { name: /Confirmados/ }));
    expect(names()).toEqual(["Marta Gil"]);
    expect(within(rowOf("Marta Gil")).getByText(/10:30/)).toBeTruthy();
    fireEvent.click(within(tabs).getByRole("tab", { name: /Todos/ }));
    expect(names()).toHaveLength(4);
  });
});

describe("escritorio: confirmar", () => {
  it("el botón de una fila confirma ese pedido y lo pasa a Confirmados", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.click(within(rowOf("Gina Paz")).getByRole("button", { name: "Confirmar pedido de Gina Paz" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/confirm" && c.body.ids.join() === "b")).toBe(true));
    await waitFor(() => expect(names()).toEqual(["Ana López", "Beto Ruiz"]));
    expect(screen.getByText("2 pendientes")).toBeTruthy();
  });

  it("varios marcados se confirman con una sola petición", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.click(within(rowOf("Ana López")).getByRole("checkbox"));
    fireEvent.click(within(rowOf("Beto Ruiz")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar seleccionados (2)" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/orders/confirm")).toHaveLength(1));
    expect(calls.find((c) => c.path === "/orders/confirm").body.ids.sort()).toEqual(["a", "d"]);
    await waitFor(() => expect(names()).toEqual(["Gina Paz"]));
  });

  it("'Seleccionar todos' marca solo los pendientes que se ven", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.click(within(sidebar()).getByRole("button", { name: /Raul/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Todos/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    expect(screen.getByRole("button", { name: "Confirmar seleccionados (2)" })).toBeTruthy();
    expect(within(rowOf("Marta Gil")).getByRole("checkbox").disabled).toBe(true);
  });

  it("sin nada marcado no hay botón de confirmar varios", async () => {
    render(<FacturadoraApp />);
    await table();
    expect(screen.queryByRole("button", { name: /Confirmar seleccionados/ })).toBeNull();
  });

  it("Quitar 👍 en un confirmado lo devuelve a pendiente", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.click(screen.getByRole("tab", { name: /Confirmados/ }));
    fireEvent.click(within(rowOf("Marta Gil")).getByRole("button", { name: "Quitar 👍 de Marta Gil" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/unconfirm" && c.body.ids.join() === "c")).toBe(true));
  });

  it("tras confirmar sale un aviso con Deshacer", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.click(within(rowOf("Gina Paz")).getByRole("button", { name: "Confirmar pedido de Gina Paz" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/unconfirm")).toBe(true));
  });
});

describe("escritorio: búsqueda y teclado", () => {
  it("el buscador filtra por cliente, negocio o código", async () => {
    render(<FacturadoraApp />);
    await table();
    const search = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.change(search, { target: { value: "lopez" } });
    expect(names()).toEqual(["Ana López"]);
    fireEvent.change(search, { target: { value: "lt05tcp0483" } });
    expect(names()).toEqual(["Beto Ruiz"]);
    fireEvent.change(search, { target: { value: "esquina" } });
    expect(names()).toEqual(["Beto Ruiz"]);
  });

  it("la tecla / lleva el cursor al buscador", async () => {
    render(<FacturadoraApp />);
    await table();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Buscar" }));
  });

  it("J y K mueven la fila activa; Espacio la marca; Enter la confirma", async () => {
    render(<FacturadoraApp />);
    await table();
    await waitFor(() => expect(names()).toHaveLength(3));
    const active = () => document.querySelector('[data-active="true"]').getAttribute("data-order-name");
    expect(active()).toBe("Ana López");
    fireEvent.keyDown(document.body, { key: "j" });
    expect(active()).toBe("Gina Paz");
    fireEvent.keyDown(document.body, { key: "k" });
    expect(active()).toBe("Ana López");
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: " " });
    expect(within(rowOf("Gina Paz")).getByRole("checkbox").checked).toBe(true);
    fireEvent.keyDown(document.body, { key: "Enter" });
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/confirm" && c.body.ids.join() === "b")).toBe(true));
  });

  it("escribiendo en el buscador, las letras no activan atajos", async () => {
    render(<FacturadoraApp />);
    await table();
    const search = screen.getByRole("searchbox", { name: "Buscar" });
    search.focus();
    fireEvent.keyDown(search, { key: "j" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(calls.some((c) => c.path === "/orders/confirm")).toBe(false);
  });
});

describe("escritorio: sigue habiendo vista de teléfono", () => {
  it("con pantalla angosta se ven las tarjetas de siempre, sin tabla", async () => {
    setDesktop(false);
    render(<FacturadoraApp />);
    expect(await screen.findByRole("button", { name: /Raul/ })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Pedidos" })).toBeNull();
  });

  it("sin enlazar, en escritorio también se ve la pantalla para enlazar", async () => {
    localStorage.clear();
    render(<FacturadoraApp />);
    expect(await screen.findByLabelText("Contraseña")).toBeTruthy();
  });
});
