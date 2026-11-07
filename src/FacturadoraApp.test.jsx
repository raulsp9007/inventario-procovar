import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import FacturadoraApp from "./FacturadoraApp";

// La dirección del buzón que trae la página (para entrar con contraseña).
vi.mock("./cloudConfig", () => ({ CLOUD_URL: "https://buzon.test" }));
import { makeLinkCode } from "./linkCode";
import { formatCUP } from "./money";
import { playChime } from "./alertSound";

// El aviso sonoro no suena de verdad en las pruebas.
vi.mock("./alertSound", () => ({ playChime: vi.fn() }));

// Página de la facturadora: una tarjeta grande por pedido, con "Ver en el portal" y
// "Confirmar pedido", pensada para quien tiene poca experiencia con computadoras. El buzón se
// simula con un fetch falso. Hoy fijo: viernes 2026-10-30.

const URL_OK = "https://buzon.test";
const TOKEN = "f".repeat(24);
const FACT_CODE = makeLinkCode({ url: URL_OK, token: TOKEN });
const SELLER_CODE = makeLinkCode({ url: URL_OK, token: "s".repeat(24) });

const line = (name, qty, unitPrice = 100) => ({ code: name, name, qty, unitPrice });
const order = (id, customerName, over = {}) => ({
  id, sellerId: "carlos", sellerName: "Carlos Pérez", date: "2026-10-30", customerName, total: 7200,
  lines: [line("Parranda 500ml", 40), line("Malta 330ml", 30)],
  status: "pendiente", rev: 1, modified: false, confirmedAt: null, confirmedBy: null, createdAt: `2026-10-30T0${id.length}:00:00.000Z`, updatedAt: "x", ...over,
});

let server;
let calls;

const recount = (seller) => ({
  ...seller,
  pending: seller.orders.filter((o) => o.status === "pendiente").length,
  confirmed: seller.orders.filter((o) => o.status === "confirmado").length,
});

function installFetch() {
  calls = [];
  server = {
    role: "facturadora",
    offline: false,
    sellers: [
      recount({ id: "carlos", name: "Carlos Pérez", orders: [
        order("a", "Ana López"),
        order("b", "Beto Ruiz", { modified: true, total: 8400 }),
        order("c", "Marta Gil", { status: "confirmado", confirmedBy: "facturadora", confirmedAt: new Date(2026, 9, 30, 10, 12).toISOString() }),
      ] }),
      recount({ id: "marta", name: "Marta Díaz", orders: [order("d", "Luis Pérez", { sellerId: "marta", sellerName: "Marta Díaz" })] }),
      recount({ id: "rosa", name: "Rosa Vega", orders: [] }),
    ],
  };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const path = url.replace(URL_OK, "");
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    if (server.offline) throw new TypeError("Failed to fetch");
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (path === "/login") {
      if (server.badLogin) return { ok: false, status: 401, json: async () => ({ error: "Usuario o contraseña incorrectos." }), text: async () => "x" };
      return ok({ token: TOKEN, role: server.loginRole || "facturadora", name: "maria", expiresAt: "2026-11-30T00:00:00.000Z" });
    }
    if (server.unauthorized) return { ok: false, status: 401, json: async () => ({ error: "x" }), text: async () => "x" };
    if (path === "/me") return ok({ id: "fact", name: "Facturadora", role: server.role });
    if (path.startsWith("/summary")) return ok(server.summary || { fecha: "2026-10-30", vendedores: [], productos: [], totales: { pedidos: 0, unidades: 0 } });
    if ((path.startsWith("/orders/confirm") || path.startsWith("/orders/unconfirm")) && server.closedMessage) {
      return { ok: false, status: 423, json: async () => ({ error: server.closedMessage }), text: async () => "x" };
    }
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
    if (path.startsWith("/orders")) return ok({ now: "2026-10-30T16:00:00.000Z", sellers: server.sellers, ...(server.horario ? { horario: server.horario } : {}), ...(server.dia ? { dia: server.dia, hoy: server.hoy } : {}) });
    return ok({});
  }));
}

function linkStorage() {
  localStorage.setItem("procovar-fact-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Facturadora", role: "facturadora" }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-30T11:00:00"));
  installFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("facturadora: enlazar", () => {
  it("sin enlace pide el código", async () => {
    render(<FacturadoraApp />);
    expect(await screen.findByLabelText("Contraseña")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("un código dañado o de un vendedor dice por qué", async () => {
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Contraseña"), { target: { value: "procovar1:xxxx" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("El código de enlace está dañado.")).toBeTruthy();

    server.role = "vendedor";
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: SELLER_CODE } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Este código es de un vendedor. Úsalo en la app de ventas.")).toBeTruthy();
  });

  it("la contraseña se escribe oculta y se entra con Enter", async () => {
    render(<FacturadoraApp />);
    const field = await screen.findByLabelText("Contraseña");
    expect(field.getAttribute("type")).toBe("password");
    fireEvent.change(field, { target: { value: TOKEN } });
    fireEvent.submit(field.closest("form"));
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    expect(calls[0].path).toBe("/me");
    expect(JSON.parse(localStorage.getItem("procovar-fact-enlace"))).toMatchObject({ url: URL_OK, token: TOKEN, role: "facturadora" });
  });

  it("entra con usuario y contraseña (el usuario va antes)", async () => {
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Usuario"), { target: { value: "maria" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    const login = calls.find((c) => c.path === "/login");
    expect(login.body).toEqual({ usuario: "maria", clave: "clave-12345" });
    expect(JSON.parse(localStorage.getItem("procovar-fact-enlace"))).toMatchObject({ token: TOKEN, role: "facturadora" });
  });

  it("usuario o contraseña mal: lo dice y no entra", async () => {
    server.badLogin = true;
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Usuario"), { target: { value: "maria" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "mala-clave-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Usuario o contraseña incorrectos.")).toBeTruthy();
    expect(localStorage.getItem("procovar-fact-enlace")).toBeNull();
  });

  it("si la sesión deja de servir, vuelve a pedir usuario y contraseña", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    server.unauthorized = true;
    fireEvent(document, new Event("visibilitychange"));
    expect(await screen.findByText("La sesión terminó. Entra de nuevo.")).toBeTruthy();
    expect(screen.getByLabelText("Usuario")).toBeTruthy();
    expect(localStorage.getItem("procovar-fact-enlace")).toBeNull();
  });

  it("una contraseña equivocada avisa y deja intentar otra vez", async () => {
    server.unauthorized = true;
    render(<FacturadoraApp />);
    const field = await screen.findByLabelText("Contraseña");
    fireEvent.change(field, { target: { value: "x".repeat(24) } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("La contraseña no es correcta.")).toBeTruthy();
    expect(localStorage.getItem("procovar-fact-enlace")).toBeNull();
  });

  it("con el código bueno entra y ve a los vendedores", async () => {
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Contraseña"), { target: { value: FACT_CODE } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
  });
});

// Sitio web de la facturadora: el enlace personal lleva el código en la dirección
// (#procovar1:...). Se usa una vez, se guarda y se quita de la barra.
describe("facturadora: enlace personal en la dirección", () => {
  afterEach(() => { window.history.replaceState(null, "", "/"); });

  it("entra solo con el código de la dirección y lo quita de la barra", async () => {
    window.location.hash = `#${FACT_CODE}`;
    render(<FacturadoraApp />);
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    expect(window.location.hash).toBe("");
    expect(JSON.parse(localStorage.getItem("procovar-fact-enlace")).token).toBe(TOKEN);
  });

  it("si el código de la dirección es de un vendedor, lo dice y deja pegar otro", async () => {
    server.role = "vendedor";
    window.location.hash = `#${SELLER_CODE}`;
    render(<FacturadoraApp />);
    expect(await screen.findByText("Este código es de un vendedor. Úsalo en la app de ventas.")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
    expect(window.location.hash).toBe("");
  });

  it("una dirección con un código dañado avisa y muestra el formulario", async () => {
    window.location.hash = "#procovar1:xxxx";
    render(<FacturadoraApp />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
  });

  it("si ya estaba enlazada, no vuelve a enlazar con una dirección vieja", async () => {
    linkStorage();
    window.location.hash = `#${FACT_CODE}`;
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    expect(calls.some((c) => c.path === "/me")).toBe(false);
  });
});

describe("facturadora: título de la pestaña", () => {
  it("lleva el número de pedidos por confirmar", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await screen.findByText("3 pedidos esperan tu confirmación");
    await waitFor(() => expect(document.title).toBe("(3) Facturación Procovar"));
  });

  it("sin pendientes queda sin número", async () => {
    linkStorage();
    server.sellers = server.sellers.map((s) => recount({ ...s, orders: s.orders.map((o) => ({ ...o, status: "confirmado", confirmedBy: "facturadora" })) }));
    render(<FacturadoraApp />);
    await screen.findByText("Todo al día");
    await waitFor(() => expect(document.title).toBe("Facturación Procovar"));
  });
});

const chips = () => [...document.querySelectorAll("[data-seller-name]")].map((el) => el.getAttribute("data-seller-name"));
const cardOf = (name) => document.querySelector(`[data-order-name="${name}"]`);
const pendingNames = () => [...document.querySelectorAll('[data-list="pendientes"] [data-order-id]')].map((el) => el.getAttribute("data-order-name"));
const openBoard = async () => {
  linkStorage();
  render(<FacturadoraApp />);
  await screen.findByText("Ana López");
};
const confirmedButton = (n) => screen.findByRole("button", { name: `Ver confirmados de hoy (${n})` });

// Página de inicio: lo primero es la contraseña; ya adentro, los vendedores actuales,
// alfabéticamente.
describe("facturadora: inicio con los vendedores actuales", () => {
  const CURRENT = ["Eddy", "Leodanis", "Lorenzo", "Melisa", "Niurka", "Raul"];

  it("sin enlazar solo pide la contraseña: no se ve ningún vendedor ni otra información", async () => {
    render(<FacturadoraApp />);
    await screen.findByLabelText("Contraseña");
    expect(chips()).toEqual([]);
    CURRENT.forEach((name) => expect(screen.queryByText(name)).toBeNull());
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("al entrar con la contraseña correcta aparecen los vendedores", async () => {
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Contraseña"), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
  });

  // Con la lista del buzón en mano, esa manda: es la que arma el administrador
  // (nombres, altas y bajas).
  it("enlazada, manda la lista del buzón (por orden alfabético)", async () => {
    await openBoard();
    expect(chips()).toEqual(["Carlos Pérez", "Marta Díaz", "Rosa Vega"]);
  });

  it("si el administrador cambió un nombre o dio de baja a alguien, la página lo refleja", async () => {
    linkStorage();
    server.sellers = [
      recount({ id: "lorenzo", name: "Lorenzo Fuentes", orders: [] }),
      recount({ id: "raul", name: "Raul", orders: [] }),
    ];
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Lorenzo Fuentes/ });
    expect(chips()).toEqual(["Lorenzo Fuentes", "Raul"]);
  });

  it("los pedidos del buzón caen en el vendedor de la lista, sin repetirlo", async () => {
    linkStorage();
    server.sellers = [
      recount({ id: "raul", name: "Raul", orders: [order("z", "Gina Paz", { sellerId: "raul", sellerName: "Raul" })] }),
      recount({ id: "eddy", name: "Eddy", orders: [] }),
    ];
    render(<FacturadoraApp />);
    await screen.findByText("Gina Paz");
    expect(chips().filter((n) => n === "Raul")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Raul · 1 por confirmar" })).toBeTruthy();
  });
});

describe("facturadora: los vendedores", () => {
  it("cada uno dice cuántos pedidos tiene por confirmar, o que está al día", async () => {
    await openBoard();
    expect(screen.getByRole("button", { name: "Todos · 3 por confirmar" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Carlos Pérez · 2 por confirmar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marta Díaz · 1 por confirmar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rosa Vega · al día" })).toBeTruthy();
  });

  it("al elegir uno solo se ven sus pedidos; Todos los vuelve a mostrar", async () => {
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /^Marta Díaz/ }));
    expect(pendingNames()).toEqual(["Luis Pérez"]);
    fireEvent.click(screen.getByRole("button", { name: /^Todos/ }));
    expect(pendingNames()).toEqual(["Ana López", "Beto Ruiz", "Luis Pérez"]);
  });

  it("uno sin pedidos dice que no hay ninguno por confirmar", async () => {
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /^Rosa Vega/ }));
    expect(await screen.findByText("No hay pedidos por confirmar")).toBeTruthy();
    expect(screen.getByText("Cuando llegue uno nuevo, aparecerá aquí.")).toBeTruthy();
  });

  it("arriba dice cuántos esperan, en singular o plural", async () => {
    await openBoard();
    expect(screen.getByText("3 pedidos esperan tu confirmación")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Marta Díaz/ }));
    expect(screen.getByText("1 pedido espera tu confirmación")).toBeTruthy();
  });

  it("todo confirmado: mensaje amable y vendedores al día", async () => {
    linkStorage();
    server.sellers = server.sellers.map((s) => recount({ ...s, orders: s.orders.map((o) => ({ ...o, status: "confirmado", confirmedBy: "facturadora", confirmedAt: new Date(2026, 9, 30, 10, 0).toISOString() })) }));
    render(<FacturadoraApp />);
    expect(await screen.findByText("No hay pedidos por confirmar")).toBeTruthy();
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Carlos Pérez · al día" })).toBeTruthy();
  });
});

describe("facturadora: la nota del pedido", () => {
  it("la tarjeta muestra la nota que escribió el vendedor", async () => {
    linkStorage();
    server.sellers[0].orders[0].note = "Dejar en la puerta de atrás";
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    const note = cardOf("Ana López").querySelector("[data-order-note]");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain("Dejar en la puerta de atrás");
  });

  it("sin nota no sale ese bloque", async () => {
    await openBoard();
    expect(cardOf("Ana López").querySelector("[data-order-note]")).toBeNull();
  });
});

describe("facturadora: cuándo se envió y cuándo llegó", () => {
  it("un pedido que llegó a tiempo muestra solo la hora (como siempre)", async () => {
    linkStorage();
    Object.assign(server.sellers[0].orders[0], { createdAt: new Date(2026, 9, 30, 9, 5).toISOString(), sentAt: new Date(2026, 9, 30, 9, 4).toISOString() });
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    expect(within(cardOf("Ana López")).getByText("Carlos Pérez · 9:05 a. m.")).toBeTruthy();
  });

  it("uno que tardó 2 minutos o más muestra cuándo se envió y cuándo llegó", async () => {
    linkStorage();
    Object.assign(server.sellers[0].orders[0], { createdAt: new Date(2026, 9, 30, 9, 5).toISOString(), sentAt: new Date(2026, 9, 30, 8, 58).toISOString() });
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    expect(within(cardOf("Ana López")).getByText("Carlos Pérez · enviado 8:58 a. m. · llegó 9:05 a. m.")).toBeTruthy();
  });
});

describe("facturadora: último pedido recibido", () => {
  const lastText = () => document.querySelector("[data-last-received]");

  it("dice hace cuánto llegó el último pedido", async () => {
    linkStorage();
    server.sellers.forEach((s) => s.orders.forEach((o) => { o.createdAt = new Date(2026, 9, 30, 8, 0).toISOString(); }));
    server.sellers[0].orders[0].createdAt = new Date(2026, 9, 30, 10, 57).toISOString();
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    expect(lastText().textContent).toBe("Último pedido recibido hace 3 min");
  });

  it("se actualiza solo con el paso del tiempo", async () => {
    linkStorage();
    server.sellers.forEach((s) => s.orders.forEach((o) => { o.createdAt = new Date(2026, 9, 30, 8, 0).toISOString(); }));
    server.sellers[0].orders[0].createdAt = new Date(2026, 9, 30, 10, 57).toISOString();
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    await act(async () => { vi.advanceTimersByTime(5 * 60000); });
    await waitFor(() => expect(lastText().textContent).toMatch(/hace [78] min/));
  });

  it("sin pedidos dice que todavía no ha llegado ninguno", async () => {
    linkStorage();
    server.sellers = [recount({ id: "carlos", name: "Carlos Pérez", orders: [] })];
    render(<FacturadoraApp />);
    await waitFor(() => expect(calls.some((c) => c.path.startsWith("/orders"))).toBe(true));
    await waitFor(() => expect(lastText()).toBeTruthy());
    expect(lastText().textContent).toBe("Todavía no ha llegado ningún pedido");
  });
});

describe("facturadora: la tarjeta del pedido", () => {
  it("lista los pendientes del más antiguo al más nuevo", async () => {
    await openBoard();
    expect(pendingNames()).toEqual(["Ana López", "Beto Ruiz", "Luis Pérez"]);
  });

  it("muestra vendedor y hora, cliente, negocio, código, productos y total", async () => {
    linkStorage();
    Object.assign(server.sellers[0].orders[0], { createdAt: new Date(2026, 9, 30, 9, 5).toISOString(), businessName: "Kiosco El Sol", customerCode: "AB1001" });
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    const card = cardOf("Ana López");
    expect(within(card).getByText("Carlos Pérez · 9:05 a. m.")).toBeTruthy();
    expect(within(card).getByText("Kiosco El Sol")).toBeTruthy();
    expect(within(card).getByText("Código del cliente: AB1001")).toBeTruthy();
    expect(within(card).getByText("Parranda 500ml × 40")).toBeTruthy();
    expect(within(card).getByText("Malta 330ml × 30")).toBeTruthy();
    expect(within(card).getByText(formatCUP(7200))).toBeTruthy();
    expect(within(card).getByText("Por confirmar")).toBeTruthy();
  });

  it("un pedido cambiado por el vendedor lleva la etiqueta MODIFICADO", async () => {
    await openBoard();
    expect(within(cardOf("Beto Ruiz")).getByText("MODIFICADO")).toBeTruthy();
    expect(within(cardOf("Ana López")).queryByText("MODIFICADO")).toBeNull();
  });

  it("sin código lo dice, y sin negocio no deja una línea vacía", async () => {
    await openBoard();
    expect(within(cardOf("Ana López")).getByText("Código del cliente: sin código")).toBeTruthy();
    expect(cardOf("Ana López").querySelectorAll("[data-business]")).toHaveLength(0);
  });

  it("'Ver en el portal' abre la ventana emergente buscando por el código del cliente", async () => {
    linkStorage();
    server.sellers[0].orders[0].customerCode = "AB1001";
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    const button = within(cardOf("Ana López")).getByRole("button", { name: "Ver en el portal el pedido de Ana López" });
    expect(button.textContent).toBe("Ver en el portal");
    fireEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]).toEqual(["https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=AB1001", "procovar-portal", "popup,width=1000,height=800"]);
  });

  it("sin código busca solo por el primer nombre del cliente", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await openBoard();
    fireEvent.click(within(cardOf("Ana López")).getByRole("button", { name: "Ver en el portal el pedido de Ana López" }));
    expect(open.mock.calls[0][0]).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana");
  });

  it("no hay casillas, pestañas ni atajos de teclado a la vista", async () => {
    await openBoard();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByText(/Espacio/)).toBeNull();
    expect(screen.queryByText("Confirmar todos")).toBeNull();
  });

  it("un pedido de otro día no se muestra: solo cuentan los de hoy", async () => {
    linkStorage();
    server.sellers[2] = recount({ id: "rosa", name: "Rosa Vega", orders: [order("v", "Luis Viejo", { sellerId: "rosa", sellerName: "Rosa Vega", date: "2026-10-29" })] });
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    expect(screen.queryByText("Luis Viejo")).toBeNull();
  });

  it("pide al buzón solo lo de hoy", async () => {
    await openBoard();
    expect(calls.some((c) => c.path === "/orders?desde=2026-10-30")).toBe(true);
  });
});

describe("facturadora: confirmar", () => {
  const confirmPost = () => calls.filter((c) => c.path === "/orders/confirm");

  it("'Confirmar pedido' manda el pedido y lo saca de la lista de por confirmar", async () => {
    await openBoard();
    fireEvent.click(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }));
    await waitFor(() => expect(confirmPost()).toHaveLength(1));
    expect(confirmPost()[0].body).toEqual({ ids: ["a"] });
    await waitFor(() => expect(pendingNames()).toEqual(["Beto Ruiz", "Luis Pérez"]));
  });

  it("sale un aviso grande con Deshacer, y Deshacer devuelve el pedido", async () => {
    await openBoard();
    fireEvent.click(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }));
    const toast = await screen.findByRole("status", { name: "Pedido confirmado" });
    expect(within(toast).getByText("Pedido de Ana López confirmado")).toBeTruthy();
    fireEvent.click(within(toast).getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/unconfirm")).toBe(true));
    await waitFor(() => expect(pendingNames()).toEqual(["Ana López", "Beto Ruiz", "Luis Pérez"]));
    expect(screen.queryByRole("status", { name: "Pedido confirmado" })).toBeNull();
  });

  it("el aviso se quita solo a los 10 segundos", async () => {
    await openBoard();
    fireEvent.click(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }));
    await screen.findByRole("status", { name: "Pedido confirmado" });
    await act(async () => { vi.advanceTimersByTime(10500); });
    expect(screen.queryByRole("status", { name: "Pedido confirmado" })).toBeNull();
  });

  it("los confirmados están aparte, escondidos, y se pueden ver", async () => {
    await openBoard();
    expect(cardOf("Marta Gil")).toBeNull();
    fireEvent.click(await confirmedButton(1));
    const card = await waitFor(() => { const c = cardOf("Marta Gil"); expect(c).toBeTruthy(); return c; });
    expect(within(card).getByText("Confirmado a las 10:12 a. m.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocultar confirmados de hoy" })).toBeTruthy();
  });

  it("al confirmar uno, la cuenta de confirmados sube", async () => {
    await openBoard();
    fireEvent.click(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }));
    expect(await confirmedButton(2)).toBeTruthy();
  });

  it("Deshacer en un confirmado lo devuelve a por confirmar", async () => {
    await openBoard();
    fireEvent.click(await confirmedButton(1));
    const card = await waitFor(() => { const c = cardOf("Marta Gil"); expect(c).toBeTruthy(); return c; });
    fireEvent.click(within(card).getByRole("button", { name: "Deshacer la confirmación de Marta Gil" }));
    await waitFor(() => expect(pendingNames()).toContain("Marta Gil"));
  });

  it("uno confirmado por el propio vendedor lo dice y no se puede deshacer", async () => {
    linkStorage();
    server.sellers[0].orders[2] = order("c", "Marta Gil", { status: "confirmado", confirmedBy: "vendedor", confirmedAt: new Date(2026, 9, 30, 10, 12).toISOString() });
    server.sellers[0] = recount(server.sellers[0]);
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    fireEvent.click(await confirmedButton(1));
    const card = await waitFor(() => { const c = cardOf("Marta Gil"); expect(c).toBeTruthy(); return c; });
    expect(within(card).getByText("Confirmado a las 10:12 a. m. (por el vendedor)")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /Deshacer/ })).toBeNull();
  });
});

describe("facturadora: buscar", () => {
  it("filtra por cliente, negocio, código o vendedor, sin importar tildes ni mayúsculas", async () => {
    linkStorage();
    server.sellers[1].orders[0] = order("d", "Luis Pérez", { sellerId: "marta", sellerName: "Marta Díaz", businessName: "Bar La Esquina", customerCode: "LT05TCP0483" });
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    const search = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.change(search, { target: { value: "esquina" } });
    expect(pendingNames()).toEqual(["Luis Pérez"]);
    fireEvent.change(search, { target: { value: "lt05tcp0483" } });
    expect(pendingNames()).toEqual(["Luis Pérez"]);
    fireEvent.change(search, { target: { value: "lopez" } });
    expect(pendingNames()).toEqual(["Ana López"]);
    fireEvent.change(search, { target: { value: "nadie" } });
    expect(await screen.findByText("Ningún pedido coincide con lo que escribiste.")).toBeTruthy();
  });
});

describe("facturadora: tamaño de letra", () => {
  const scale = () => document.querySelector("[data-board]").style.getPropertyValue("--fx-scale");

  it("empieza en tamaño normal", async () => {
    await openBoard();
    expect(scale()).toBe("1");
  });

  it("A+ y A− cambian el tamaño, con tope, y se recuerda", async () => {
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: "Letra más grande" }));
    expect(scale()).toBe("1.1");
    expect(localStorage.getItem("procovar-fact-letra")).toBe("1.1");
    for (let i = 0; i < 6; i += 1) fireEvent.click(screen.getByRole("button", { name: "Letra más grande" }));
    expect(scale()).toBe("1.4");
    for (let i = 0; i < 8; i += 1) fireEvent.click(screen.getByRole("button", { name: "Letra más pequeña" }));
    expect(scale()).toBe("0.9");
  });

  it("al volver a abrir la página usa el tamaño que dejó", async () => {
    localStorage.setItem("procovar-fact-letra", "1.3");
    await openBoard();
    expect(scale()).toBe("1.3");
  });

  it("un valor guardado raro se ignora", async () => {
    localStorage.setItem("procovar-fact-letra", "mucho");
    await openBoard();
    expect(scale()).toBe("1");
  });
});

describe("facturadora: ayuda '¿Cómo se usa?'", () => {
  it("abre unos pasos sencillos y se cierra con Entendido", async () => {
    await openBoard();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "¿Cómo se usa?" }));
    const dialog = await screen.findByRole("dialog", { name: "Cómo se usa" });
    expect(within(dialog).getByText(/Ver en el portal/)).toBeTruthy();
    expect(within(dialog).getByText(/Confirmar pedido/)).toBeTruthy();
    expect(within(dialog).getByText(/Deshacer/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("facturadora: aviso de pedido nuevo", () => {
  const refresh = async () => { await act(async () => { document.dispatchEvent(new Event("visibilitychange")); }); };
  const addOrders = (...names) => {
    names.forEach((n, i) => server.sellers[0].orders.push(order(`n${i}x${n.length}`, n, { createdAt: new Date(2026, 9, 30, 12, i).toISOString() })));
    server.sellers[0] = recount(server.sellers[0]);
  };

  beforeEach(() => { playChime.mockClear(); });

  it("el sonido empieza activado y se puede apagar, y se recuerda", async () => {
    await openBoard();
    const button = screen.getByRole("button", { name: "Sonido de aviso: activado" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Sonido de aviso: desactivado" })).toBeTruthy();
    expect(localStorage.getItem("procovar-fact-sonido")).toBe("0");
  });

  it("lo que ya estaba al abrir la página no avisa", async () => {
    await openBoard();
    await refresh();
    expect(playChime).not.toHaveBeenCalled();
    expect(screen.queryByText(/pedido nuevo|pedidos nuevos/)).toBeNull();
  });

  it("un pedido nuevo suena y dice que llegó", async () => {
    await openBoard();
    addOrders("Gina Paz");
    await refresh();
    expect(await screen.findByText("Llegó 1 pedido nuevo")).toBeTruthy();
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Gina Paz")).toBeTruthy();
  });

  it("varios a la vez, un solo aviso", async () => {
    await openBoard();
    addOrders("Gina Paz", "Hugo Rey");
    await refresh();
    expect(await screen.findByText("Llegaron 2 pedidos nuevos")).toBeTruthy();
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it("con el sonido apagado igual dice que llegó, sin sonar", async () => {
    localStorage.setItem("procovar-fact-sonido", "0");
    await openBoard();
    addOrders("Gina Paz");
    await refresh();
    expect(await screen.findByText("Llegó 1 pedido nuevo")).toBeTruthy();
    expect(playChime).not.toHaveBeenCalled();
  });

  it("el aviso se quita solo", async () => {
    await openBoard();
    addOrders("Gina Paz");
    await refresh();
    await screen.findByText("Llegó 1 pedido nuevo");
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(screen.queryByText("Llegó 1 pedido nuevo")).toBeNull();
  });

  it("deshacer una confirmación no cuenta como pedido nuevo", async () => {
    await openBoard();
    fireEvent.click(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }));
    const toast = await screen.findByRole("status", { name: "Pedido confirmado" });
    fireEvent.click(within(toast).getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(pendingNames()).toContain("Ana López"));
    await refresh();
    expect(playChime).not.toHaveBeenCalled();
    expect(screen.queryByText(/pedido nuevo|pedidos nuevos/)).toBeNull();
  });
});

describe("facturadora: conexión, en palabras sencillas", () => {
  it("todo bien", async () => {
    await openBoard();
    expect(await screen.findByText(/Todo en orden\. Actualizado a las 11:0\d a\. m\./)).toBeTruthy();
  });

  it("sin internet muestra lo último que vio y lo dice", async () => {
    linkStorage();
    const first = render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    first.unmount();
    server.offline = true;
    render(<FacturadoraApp />);
    expect(await screen.findByText("Ana López")).toBeTruthy();
    expect(await screen.findByText(/No hay internet\. Estás viendo lo último que llegó a las 11:0\d a\. m\./)).toBeTruthy();
  });

  it("confirmar sin internet lo deja confirmado y avisa que se enviará al volver el internet", async () => {
    await openBoard();
    server.offline = true;
    fireEvent.click(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }));
    await waitFor(() => expect(pendingNames()).not.toContain("Ana López"));
    expect(await screen.findByText(/1 confirmación sin enviar: se enviará cuando vuelva el internet\./)).toBeTruthy();
  });
});

describe("facturadora: salir de la sesión", () => {
  it("está abajo, discreto, y cierra la sesión", async () => {
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: "Salir de la sesión" }));
    expect(await screen.findByLabelText("Usuario")).toBeTruthy();
    expect(localStorage.getItem("procovar-fact-enlace")).toBeNull();
  });
});

// La supervisión solo mira: ve los pedidos con su estado, sin ningún botón para confirmar ni
// deshacer.
describe("facturadora: cuenta de supervisión (solo lectura)", () => {
  const supervisorStorage = () => localStorage.setItem("procovar-fact-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "super", role: "supervisor" }));
  const openSupervisor = async () => { supervisorStorage(); render(<FacturadoraApp />); await screen.findByText("Ana López"); };

  it("ve a los vendedores, los pedidos y el aviso de solo lectura", async () => {
    await openSupervisor();
    expect(screen.getByText("Solo lectura")).toBeTruthy();
    expect(pendingNames()).toEqual(["Ana López", "Beto Ruiz", "Luis Pérez"]);
  });

  it("no hay Confirmar ni Deshacer, pero sí el estado y Ver en el portal", async () => {
    await openSupervisor();
    expect(screen.queryByRole("button", { name: /Confirmar pedido/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(within(cardOf("Ana López")).getByText("Pendiente de confirmar")).toBeTruthy();
    expect(within(cardOf("Ana López")).getByRole("button", { name: "Ver en el portal el pedido de Ana López" })).toBeTruthy();
    fireEvent.click(await confirmedButton(1));
    const card = await waitFor(() => { const c = cardOf("Marta Gil"); expect(c).toBeTruthy(); return c; });
    expect(within(card).getByText("Confirmado a las 10:12 a. m.")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(calls.some((c) => c.path.startsWith("/orders/confirm") || c.path.startsWith("/orders/unconfirm"))).toBe(false);
  });

  it("la facturadora sí tiene sus botones y no el aviso", async () => {
    await openBoard();
    expect(screen.getAllByRole("button", { name: /^Confirmar pedido de/ })).toHaveLength(3);
    expect(screen.queryByText("Solo lectura")).toBeNull();
  });
});

// La página de la facturadora y la app del vendedor comparten navegador: entrar a una
// no debe borrar ni cambiar el enlace de la otra.
describe("facturadora: no pisa el enlace del vendedor", () => {
  const vendorLink = { url: URL_OK, token: "v".repeat(24), name: "Carlos Pérez", role: "vendedor" };

  it("entrar con usuario y contraseña deja intacto el enlace de la app del vendedor", async () => {
    localStorage.setItem("procovar-nube-enlace", JSON.stringify(vendorLink));
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Usuario"), { target: { value: "maria" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    expect(JSON.parse(localStorage.getItem("procovar-nube-enlace"))).toEqual(vendorLink);
    expect(JSON.parse(localStorage.getItem("procovar-fact-enlace"))).toMatchObject({ role: "facturadora" });
  });

  it("salir de la sesión no desenlaza al vendedor", async () => {
    localStorage.setItem("procovar-nube-enlace", JSON.stringify(vendorLink));
    linkStorage();
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    fireEvent.click(screen.getByRole("button", { name: "Salir de la sesión" }));
    await screen.findByLabelText("Usuario");
    expect(JSON.parse(localStorage.getItem("procovar-nube-enlace"))).toEqual(vendorLink);
    expect(localStorage.getItem("procovar-fact-enlace")).toBeNull();
  });

  it("la sesión que la facturadora ya tenía en el lugar de antes sigue valiendo", async () => {
    localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Facturadora", role: "facturadora" }));
    render(<FacturadoraApp />);
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    expect(localStorage.getItem("procovar-nube-enlace")).toBeNull();
  });
});

// La página de la facturadora siempre va en modo claro, sin importar el tema del navegador
// ni el que se haya elegido en la app de ventas (que comparte el sitio).
describe("facturadora: modo claro", () => {
  afterEach(() => { document.documentElement.removeAttribute("data-theme"); });

  it("usa el tema claro", async () => {
    render(<FacturadoraApp />);
    await screen.findByLabelText("Usuario");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("aunque la app de ventas tenga guardado el tema oscuro", async () => {
    localStorage.setItem("procovar-theme", "dark");
    render(<FacturadoraApp />);
    await screen.findByLabelText("Usuario");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("aunque el sistema o el navegador estén en modo oscuro", async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("prefers-color-scheme: dark"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }));
    render(<FacturadoraApp />);
    await screen.findByLabelText("Usuario");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    delete window.matchMedia;
  });

  it("también con la sesión iniciada", async () => {
    localStorage.setItem("procovar-theme", "dark");
    linkStorage();
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

// Fuera del horario de facturación el sitio está pausado: se ve todo, pero no se puede confirmar.
describe("facturadora: fuera del horario de facturación", () => {
  const MSG = "La facturación está cerrada. Abre hoy a las 9:00 a. m.";
  const closed = () => { server.horario = { activo: true, abierto: false, mensaje: MSG, abre: "09:00", cierra: "15:00" }; };

  it("avisa que está cerrada y no deja confirmar", async () => {
    linkStorage();
    closed();
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    expect(await screen.findByText(MSG)).toBeTruthy();
    const confirm = within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(calls.some((c) => c.path.startsWith("/orders/confirm"))).toBe(false);
  });

  it("sigue pudiendo ver el pedido en el portal", async () => {
    linkStorage();
    closed();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    await screen.findByText(MSG);
    const button = within(cardOf("Ana López")).getByRole("button", { name: "Ver en el portal el pedido de Ana López" });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("los confirmados no se pueden deshacer mientras está cerrada", async () => {
    linkStorage();
    closed();
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    await screen.findByText(MSG);
    fireEvent.click(await confirmedButton(1));
    const card = await waitFor(() => { const c = cardOf("Marta Gil"); expect(c).toBeTruthy(); return c; });
    expect(within(card).getByRole("button", { name: "Deshacer la confirmación de Marta Gil" }).disabled).toBe(true);
  });

  it("abierta no hay aviso y se puede confirmar", async () => {
    await openBoard();
    expect(screen.queryByText(/La facturación está cerrada/)).toBeNull();
    expect(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }).disabled).toBe(false);
  });

  it("al abrir, el aviso se quita y se puede confirmar", async () => {
    linkStorage();
    closed();
    render(<FacturadoraApp />);
    await screen.findByText(MSG);
    server.horario = { activo: true, abierto: true, mensaje: "", abre: "09:00", cierra: "15:00" };
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(screen.queryByText(MSG)).toBeNull());
    expect(within(cardOf("Ana López")).getByRole("button", { name: "Confirmar pedido de Ana López" }).disabled).toBe(false);
  });
});

// La supervisión ve además el contador de ventas por día, producto por producto y por vendedor.
describe("facturadora: ventas por día (supervisión)", () => {
  const supervisor = () => localStorage.setItem("procovar-fact-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "super", role: "supervisor" }));
  const SUMMARY = {
    fecha: "2026-10-30",
    vendedores: [{ id: "carlos", name: "Carlos Pérez", pedidos: 2, unidades: 80, productos: [{ code: "P500", name: "Parranda 500ml", qty: 80 }] }],
    productos: [{ code: "P500", name: "Parranda 500ml", qty: 80 }],
    totales: { pedidos: 2, unidades: 80 },
  };

  it("la supervisión abre 'Ventas del día' y ve el contador de hoy", async () => {
    supervisor();
    server.summary = SUMMARY;
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    expect(screen.queryByRole("region", { name: "Ventas por día" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ventas del día" }));
    const region = await screen.findByRole("region", { name: "Ventas por día" });
    await waitFor(() => expect(within(region).getAllByText("2 pedidos · 80 unidades").length).toBeGreaterThan(0));
    expect(calls.some((c) => c.path === "/summary?fecha=2026-10-30")).toBe(true);
    expect(within(region).getByRole("group", { name: "Ventas de Carlos Pérez" })).toBeTruthy();
  });

  it("se puede volver a esconder", async () => {
    supervisor();
    server.summary = SUMMARY;
    render(<FacturadoraApp />);
    await screen.findByText("Ana López");
    fireEvent.click(screen.getByRole("button", { name: "Ventas del día" }));
    await screen.findByRole("region", { name: "Ventas por día" });
    fireEvent.click(screen.getByRole("button", { name: "Ocultar ventas del día" }));
    expect(screen.queryByRole("region", { name: "Ventas por día" })).toBeNull();
  });

  it("la facturadora no lo tiene", async () => {
    await openBoard();
    expect(screen.queryByRole("button", { name: "Ventas del día" })).toBeNull();
  });
});

// Pasada la hora de cierre del día (la pone el administrador), el tablero se limpia: deja de mostrar lo de
// hoy y pasa a mostrar los pedidos de mañana, que van llegando.
describe("tablero: el día de trabajo", () => {
  // Abre el tablero y espera a la primera lista (no siempre hay un pedido de Ana López que esperar).
  const openAny = async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await waitFor(() => expect(calls.some((c) => c.path.startsWith("/orders"))).toBe(true));
  };
  it("antes del cierre dice 'Hoy' con la fecha de hoy y muestra los pedidos de hoy", async () => {
    server.dia = "2026-10-30";
    server.hoy = "2026-10-30";
    await openBoard();
    expect(screen.getByText(/^Hoy · /)).toBeTruthy();
    expect(screen.getByText("Ana López")).toBeTruthy();
  });

  it("pasado el cierre dice 'Para mañana', ya no muestra lo de hoy y sí lo de mañana", async () => {
    server.dia = "2026-10-31";
    server.hoy = "2026-10-30";
    server.sellers = [
      recount({ id: "carlos", name: "Carlos Pérez", orders: [
        order("a", "Ana López"),
        order("z", "Zoila Nueva", { date: "2026-10-31" }),
      ] }),
    ];
    await openAny();
    expect(await screen.findByText("Zoila Nueva")).toBeTruthy();
    expect(screen.queryByText("Ana López")).toBeNull();
    const label = screen.getByText(/^Para mañana · /);
    expect(label.textContent).toContain("31");
    expect(screen.queryByText(/^Hoy · /)).toBeNull();
  });

  it("si el siguiente día de trabajo no es mañana (sábado, el lunes), dice 'Próximo día'", async () => {
    server.dia = "2026-11-02";
    server.hoy = "2026-10-31";
    server.sellers = [recount({ id: "carlos", name: "Carlos Pérez", orders: [order("l", "Lola Lunes", { date: "2026-11-02" })] })];
    await openAny();
    expect(await screen.findByText("Lola Lunes")).toBeTruthy();
    expect(screen.getByText(/^Próximo día · /)).toBeTruthy();
  });

  it("sin pedidos del siguiente día dice que está todo al día, no muestra lo de hoy", async () => {
    server.dia = "2026-10-31";
    server.hoy = "2026-10-30";
    await openAny();
    await waitFor(() => expect(screen.queryByText("Ana López")).toBeNull());
    expect(screen.getByText(/^Para mañana · /)).toBeTruthy();
  });
});
