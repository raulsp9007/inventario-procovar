import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import FacturadoraApp from "./FacturadoraApp";

// La dirección del buzón que trae la página (para entrar con contraseña).
vi.mock("./cloudConfig", () => ({ CLOUD_URL: "https://buzon.test" }));
import { makeLinkCode } from "./linkCode";

// App de la facturadora (mismo código, modo ?rol=facturadora): vendedores →
// pedidos del vendedor → 👍. El buzón se simula con un fetch falso. Hoy fijo:
// viernes 2026-10-30.

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
    if (server.unauthorized) return { ok: false, status: 401, json: async () => ({ error: "x" }), text: async () => "x" };
    if (path === "/me") return ok({ id: "fact", name: "Facturadora", role: server.role });
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

function linkStorage() {
  localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Facturadora", role: "facturadora" }));
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

const openSeller = async (name) => {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
};

describe("facturadora: enlazar", () => {
  it("sin enlace pide el código", async () => {
    render(<FacturadoraApp />);
    expect(await screen.findByLabelText("Contraseña o código de enlace")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("un código dañado o de un vendedor dice por qué", async () => {
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Contraseña o código de enlace"), { target: { value: "procovar1:xxxx" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("El código de enlace está dañado.")).toBeTruthy();

    server.role = "vendedor";
    fireEvent.change(screen.getByLabelText("Contraseña o código de enlace"), { target: { value: SELLER_CODE } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Este código es de un vendedor. Úsalo en la app de ventas.")).toBeTruthy();
  });

  it("la contraseña se escribe oculta y se entra con Enter", async () => {
    render(<FacturadoraApp />);
    const field = await screen.findByLabelText("Contraseña o código de enlace");
    expect(field.getAttribute("type")).toBe("password");
    fireEvent.change(field, { target: { value: TOKEN } });
    fireEvent.submit(field.closest("form"));
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    expect(calls[0].path).toBe("/me");
    expect(JSON.parse(localStorage.getItem("procovar-nube-enlace"))).toMatchObject({ url: URL_OK, token: TOKEN, role: "facturadora" });
  });

  it("una contraseña equivocada avisa y deja intentar otra vez", async () => {
    server.unauthorized = true;
    render(<FacturadoraApp />);
    const field = await screen.findByLabelText("Contraseña o código de enlace");
    fireEvent.change(field, { target: { value: "x".repeat(24) } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("La contraseña no es correcta.")).toBeTruthy();
    expect(localStorage.getItem("procovar-nube-enlace")).toBeNull();
  });

  it("con el código bueno entra y ve a los vendedores", async () => {
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Contraseña o código de enlace"), { target: { value: FACT_CODE } });
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
    expect(JSON.parse(localStorage.getItem("procovar-nube-enlace")).token).toBe(TOKEN);
  });

  it("si el código de la dirección es de un vendedor, lo dice y deja pegar otro", async () => {
    server.role = "vendedor";
    window.location.hash = `#${SELLER_CODE}`;
    render(<FacturadoraApp />);
    expect(await screen.findByText("Este código es de un vendedor. Úsalo en la app de ventas.")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña o código de enlace")).toBeTruthy();
    expect(window.location.hash).toBe("");
  });

  it("una dirección con un código dañado avisa y muestra el formulario", async () => {
    window.location.hash = "#procovar1:xxxx";
    render(<FacturadoraApp />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña o código de enlace")).toBeTruthy();
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
    await screen.findByText("3 pedidos por confirmar");
    await waitFor(() => expect(document.title).toBe("(3) Facturación Procovar"));
  });

  it("sin pendientes queda sin número", async () => {
    linkStorage();
    server.sellers = server.sellers.map((s) => recount({ ...s, orders: s.orders.map((o) => ({ ...o, status: "confirmado", confirmedBy: "facturadora" })) }));
    render(<FacturadoraApp />);
    await screen.findByText("Todo confirmado");
    await waitFor(() => expect(document.title).toBe("Facturación Procovar"));
  });
});

// Página de inicio: lo primero es la contraseña; ya adentro, los vendedores actuales,
// alfabéticamente.
describe("facturadora: inicio con los vendedores actuales", () => {
  const CURRENT = ["Eddy", "Leodanis", "Lorenzo", "Melisa", "Niurka", "Raul"];
  const shownNames = () => [...document.querySelectorAll("[data-seller-name]")].map((el) => el.getAttribute("data-seller-name"));

  it("sin enlazar solo pide la contraseña: no se ve ningún vendedor ni otra información", async () => {
    render(<FacturadoraApp />);
    await screen.findByLabelText("Contraseña o código de enlace");
    expect(shownNames()).toEqual([]);
    expect(screen.queryByText("Sin enlazar")).toBeNull();
    CURRENT.forEach((name) => expect(screen.queryByText(name)).toBeNull());
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("al entrar con la contraseña correcta aparecen los vendedores", async () => {
    render(<FacturadoraApp />);
    fireEvent.change(await screen.findByLabelText("Contraseña o código de enlace"), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    expect(screen.queryByLabelText("Contraseña o código de enlace")).toBeNull();
  });

  // Con la lista del buzón en mano, esa manda: es la que arma el administrador
  // (nombres, altas y bajas). Los seis de arriba solo valen antes de tenerla.
  it("enlazada, manda la lista del buzón (por orden alfabético), no la de arranque", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    expect(shownNames()).toEqual(["Carlos Pérez", "Marta Díaz", "Rosa Vega"]);
  });

  it("si el administrador cambió un nombre o dio de baja a alguien, la página lo refleja", async () => {
    linkStorage();
    server.sellers = [
      recount({ id: "lorenzo", name: "Lorenzo Fuentes", orders: [] }),
      recount({ id: "raul", name: "Raul", orders: [] }),
    ];
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Lorenzo Fuentes/ });
    expect(shownNames()).toEqual(["Lorenzo Fuentes", "Raul"]);
  });

  it("un vendedor sin pedidos se puede abrir y dice que no hay", async () => {
    linkStorage();
    server.sellers[2] = recount({ id: "rosa", name: "Rosa Vega", orders: [] });
    render(<FacturadoraApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Rosa Vega/ }));
    expect(await screen.findByText("Sin pedidos por ahora.")).toBeTruthy();
  });

  it("los pedidos del buzón caen en el vendedor de la lista, sin repetirlo", async () => {
    linkStorage();
    server.sellers = [
      recount({ id: "raul", name: "Raul", orders: [order("z", "Gina Paz", { sellerId: "raul", sellerName: "Raul" })] }),
      recount({ id: "eddy", name: "Eddy", orders: [] }),
    ];
    render(<FacturadoraApp />);
    await waitFor(() => expect(within(screen.getByRole("button", { name: /Raul/ })).getByText("0 de 1 confirmados")).toBeTruthy());
    expect(shownNames().filter((n) => n === "Raul")).toHaveLength(1);
  });
});

describe("facturadora: vendedores", () => {
  it("lista a los vendedores con cuántos pedidos tiene cada uno sin confirmar", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    const carlos = await screen.findByRole("button", { name: /Carlos Pérez/ });
    expect(within(carlos).getByText("1 de 3 confirmados")).toBeTruthy();
    expect(within(carlos).getByText("2")).toBeTruthy();
    const marta = screen.getByRole("button", { name: /Marta Díaz/ });
    expect(within(marta).getByText("0 de 1 confirmados")).toBeTruthy();
    const rosa = screen.getByRole("button", { name: /Rosa Vega/ });
    expect(within(rosa).getByText("✓")).toBeTruthy();
  });

  it("dice cuántos hay en total por confirmar", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    expect(await screen.findByText("3 pedidos por confirmar")).toBeTruthy();
  });

  it("se puede desenlazar", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    fireEvent.click(screen.getByRole("button", { name: "Desenlazar" }));
    expect(await screen.findByLabelText("Contraseña o código de enlace")).toBeTruthy();
    expect(localStorage.getItem("procovar-nube-enlace")).toBeNull();
  });
});

describe("facturadora: pedidos de un vendedor", () => {
  it("muestra los sin confirmar con productos, total y la etiqueta MODIFICADO", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await openSeller("Carlos Pérez");
    expect(await screen.findByText("Ana López")).toBeTruthy();
    expect(screen.getByText("Beto Ruiz")).toBeTruthy();
    expect(screen.getByText("MODIFICADO")).toBeTruthy();
    expect(screen.getAllByText("Parranda 500ml ×40").length).toBe(2);
    expect(screen.getByText("7200 CUP")).toBeTruthy();
    expect(screen.queryByText("Marta Gil")).toBeNull(); // ya confirmado: solo en "Todos"
  });

  // Cada pedido: cliente, negocio, código con su botón Comprobar (abre el portal
  // filtrando por ese código) y el botón de confirmar.
  describe("la tarjeta del pedido", () => {
    const withCode = () => {
      server.sellers[0].orders[0] = order("a", "Ana López", { customerCode: "AB1001", businessName: "Kiosco El Sol" });
    };
    const card = () => document.querySelector('[data-order-id="a"]');

    it("muestra cliente, negocio y código", async () => {
      linkStorage();
      withCode();
      render(<FacturadoraApp />);
      await openSeller("Carlos Pérez");
      await screen.findByText("Ana López");
      expect(within(card()).getByText("Kiosco El Sol")).toBeTruthy();
      expect(within(card()).getByText("Código")).toBeTruthy();
      expect(within(card()).getByText("AB1001")).toBeTruthy();
    });

    it("junto al código hay un botón Comprobar que abre el portal filtrando por ese código", async () => {
      linkStorage();
      withCode();
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      render(<FacturadoraApp />);
      await openSeller("Carlos Pérez");
      await screen.findByText("Ana López");
      const button = within(card()).getByRole("button", { name: "Comprobar código AB1001" });
      expect(button.textContent).toBe("Comprobar");
      fireEvent.click(button);
      expect(open).toHaveBeenCalledTimes(1);
      expect(open.mock.calls[0]).toEqual(["https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=AB1001", "procovar-portal"]);
    });

    it("el botón de confirmar está en la misma tarjeta", async () => {
      linkStorage();
      withCode();
      render(<FacturadoraApp />);
      await openSeller("Carlos Pérez");
      await screen.findByText("Ana López");
      expect(within(card()).getByRole("button", { name: /Confirmar/ })).toBeTruthy();
    });

    it("un pedido sin código lo dice y Comprobar busca por el nombre del cliente", async () => {
      linkStorage();
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      render(<FacturadoraApp />);
      await openSeller("Carlos Pérez");
      await screen.findByText("Ana López");
      expect(within(card()).getByText("Sin código")).toBeTruthy();
      fireEvent.click(within(card()).getByRole("button", { name: "Comprobar a Ana López" }));
      expect(open.mock.calls[0][0]).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana%20L%C3%B3pez");
    });

    it("sin negocio no se deja una línea vacía", async () => {
      linkStorage();
      render(<FacturadoraApp />);
      await openSeller("Carlos Pérez");
      await screen.findByText("Ana López");
      expect(card().querySelectorAll("[data-business]")).toHaveLength(0);
    });
  });

  it("la pestaña Todos incluye los confirmados, con la hora", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await openSeller("Carlos Pérez");
    fireEvent.click(await screen.findByRole("button", { name: "Todos" }));
    expect(await screen.findByText("Marta Gil")).toBeTruthy();
    expect(screen.getByText("✓ Confirmado a las 10:12")).toBeTruthy();
  });

  it("un pedido de otro día no se muestra: solo cuentan los de hoy", async () => {
    linkStorage();
    server.sellers[2] = recount({ id: "rosa", name: "Rosa Vega", orders: [order("v", "Luis Viejo", { sellerId: "rosa", sellerName: "Rosa Vega", date: "2026-10-29" })] });
    render(<FacturadoraApp />);
    await openSeller("Rosa Vega");
    expect(await screen.findByText("Sin pedidos por ahora.")).toBeTruthy();
    expect(screen.queryByText("Luis Viejo")).toBeNull();
  });

  it("pide al buzón solo lo de hoy", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    expect(calls.some((c) => c.path === "/orders?desde=2026-10-30")).toBe(true);
  });

  it("👍 Confirmar manda el pedido y lo pasa a confirmado", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await openSeller("Carlos Pérez");
    const card = (await screen.findByText("Ana López")).closest("[data-order-id]");
    fireEvent.click(within(card).getByRole("button", { name: "👍 Confirmar" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/confirm" && c.body.ids.join() === "a")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Ana López")).toBeNull());
    expect(await screen.findByText("Confirmado · se refleja en la app de Carlos Pérez")).toBeTruthy();
  });

  it("Confirmar todos manda todos los pendientes de ese vendedor", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await openSeller("Carlos Pérez");
    fireEvent.click(await screen.findByRole("button", { name: /Confirmar todos \(2\)/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/confirm" && c.body.ids.join() === "a,b")).toBe(true));
    expect(await screen.findByText("Todo confirmado por hoy.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirmar todos/ })).toBeNull();
  });

  it("Deshacer vuelve el pedido a sin confirmar", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await openSeller("Carlos Pérez");
    const card = (await screen.findByText("Ana López")).closest("[data-order-id]");
    fireEvent.click(within(card).getByRole("button", { name: "👍 Confirmar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/orders/unconfirm" && c.body.ids.join() === "a")).toBe(true));
    expect(await screen.findByText("Ana López")).toBeTruthy();
  });

  it("‹ Vendedores vuelve a la lista", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await openSeller("Carlos Pérez");
    fireEvent.click(await screen.findByRole("button", { name: /Vendedores/ }));
    expect(await screen.findByRole("button", { name: /Rosa Vega/ })).toBeTruthy();
  });
});

describe("facturadora: sin internet", () => {
  it("muestra lo último que vio y lo dice", async () => {
    linkStorage();
    const first = render(<FacturadoraApp />);
    await screen.findByRole("button", { name: /Carlos Pérez/ });
    first.unmount();
    server.offline = true;
    render(<FacturadoraApp />);
    expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeTruthy();
    expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
  });

  it("confirmar sin internet lo deja confirmado y avisa que está pendiente de enviar", async () => {
    linkStorage();
    render(<FacturadoraApp />);
    await openSeller("Carlos Pérez");
    const card = (await screen.findByText("Ana López")).closest("[data-order-id]");
    server.offline = true;
    fireEvent.click(within(card).getByRole("button", { name: "👍 Confirmar" }));
    await waitFor(() => expect(screen.queryByText("Ana López")).toBeNull());
    expect(await screen.findByText(/1 pendiente de enviar/)).toBeTruthy();
  });
});
