import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminApp from "./AdminApp";
import { makeLinkCode, parseLinkCode } from "./linkCode";

// Sitio de administración (admin.html): el administrador maneja los nombres y los
// enlaces de los vendedores. El buzón se simula con un fetch falso.

const URL_OK = "https://buzon.test";
const ADMIN_TOKEN = "a".repeat(24);
const ADMIN_CODE = makeLinkCode({ url: URL_OK, token: ADMIN_TOKEN });
const SELLER_CODE = makeLinkCode({ url: URL_OK, token: "s".repeat(24) });
const KEY = "procovar-admin-enlace";

let server;
let calls;
let copied;

const vendor = (id, name, over = {}) => ({ id, name, token: `${id}-token-0123456789abcdef`, active: true, source: "secret", ...over });

function installFetch() {
  calls = [];
  server = {
    role: "admin",
    vendors: [vendor("raul", "Raul"), vendor("eddy", "Eddy"), vendor("melisa", "Melisa", { active: false })],
    facturadora: { id: "fact", name: "Facturadora", token: "f".repeat(24) },
    accounts: { facturacion: null, supervision: null },
    schedule: { activo: false, abre: "09:00", cierra: "15:00", abierto: true, mensaje: "" },
    nextToken: 1,
  };
  const sorted = () => [...server.vendors].sort((a, b) => a.name.localeCompare(b.name, "es"));
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const path = url.replace(URL_OK, "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body });
    const reply = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (path === "/me") return reply({ id: "admin", name: "Administrador", role: server.role });
    if (path === "/admin/vendors" && init.method === "GET") return reply({ vendors: sorted(), facturadora: server.facturadora });
    if (path === "/admin/vendors" && init.method === "POST") {
      if (server.vendors.some((v) => v.name.toLowerCase() === body.name.trim().toLowerCase())) return reply({ error: "Ya hay un vendedor con ese nombre." }, 409);
      const v = vendor(body.name.trim().toLowerCase(), body.name.trim(), { source: "db", token: `nuevo-token-${String(server.nextToken++).padStart(4, "0")}-0123456789` });
      server.vendors.push(v);
      return reply(v);
    }
    if (path === "/admin/accounts" && init.method === "GET") return reply(server.accounts);
    if (path === "/admin/schedule" && init.method === "GET") return reply(server.schedule);
    if (path === "/admin/schedule" && init.method === "PUT") {
      const next = { ...server.schedule, activo: body.activo, abre: body.abre, cierra: body.cierra };
      server.schedule = { ...next, abierto: !next.activo, mensaje: next.activo ? "La facturación está cerrada. Abre hoy a las 9:00 a. m." : "" };
      return reply(server.schedule);
    }
    if (path.startsWith("/summary")) return reply(server.summary || { fecha: "2026-10-30", vendedores: [], productos: [], totales: { pedidos: 0, unidades: 0 } });
    const acc = path.match(/^\/admin\/accounts\/([^/]+)$/);
    if (acc && init.method === "PUT") {
      if (body.usuario === "repetido") return reply({ error: "Ya hay una cuenta con ese usuario." }, 409);
      const current = server.accounts[acc[1]];
      server.accounts[acc[1]] = { usuario: body.usuario !== undefined ? body.usuario : current.usuario, activo: body.activo !== undefined ? body.activo : (current ? current.activo : true) };
      return reply(server.accounts[acc[1]]);
    }
    const regen = path.match(/^\/admin\/vendors\/([^/]+)\/regenerate$/);
    if (regen && init.method === "POST") {
      const v = server.vendors.find((x) => x.id === regen[1]);
      v.token = `regenerado-token-${String(server.nextToken++).padStart(4, "0")}-0123456789`; v.source = "db";
      return reply(v);
    }
    const one = path.match(/^\/admin\/vendors\/([^/]+)$/);
    if (one && init.method === "PUT") {
      const v = server.vendors.find((x) => x.id === one[1]);
      if (body.name !== undefined && !body.name.trim()) return reply({ error: "Falta el nombre del vendedor." }, 400);
      Object.assign(v, body, { source: "db" });
      return reply(v);
    }
    return reply({}, 404);
  }));
}

beforeEach(() => {
  localStorage.clear();
  copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async (t) => { copied.push(t); }) } });
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const link = () => localStorage.setItem(KEY, JSON.stringify({ url: URL_OK, token: ADMIN_TOKEN, name: "Administrador", role: "admin" }));
const names = () => [...document.querySelectorAll("[data-vendor-id]")].map((el) => el.querySelector("input[data-name]").value);
const rowOf = (name) => [...document.querySelectorAll("[data-vendor-id]")].find((el) => el.querySelector("input[data-name]").value === name);
const opened = async () => { await screen.findByText("Vendedores"); await waitFor(() => expect(names().length).toBeGreaterThan(0)); };

describe("administración: enlazar", () => {
  it("sin enlace pide el código y no habla con el buzón", async () => {
    render(<AdminApp />);
    expect(await screen.findByLabelText("Código de enlace")).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("con el código del administrador entra y lo recuerda aparte del de la facturadora", async () => {
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText("Código de enlace"), { target: { value: ADMIN_CODE } });
    fireEvent.click(screen.getByRole("button", { name: "Enlazar" }));
    await opened();
    expect(JSON.parse(localStorage.getItem(KEY)).token).toBe(ADMIN_TOKEN);
    expect(localStorage.getItem("procovar-nube-enlace")).toBeNull();
  });

  it("el código de un vendedor o de la facturadora no sirve acá", async () => {
    server.role = "vendedor";
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText("Código de enlace"), { target: { value: SELLER_CODE } });
    fireEvent.click(screen.getByRole("button", { name: "Enlazar" }));
    expect(await screen.findByText("Este código no es de administrador.")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("entra con el enlace personal (#código) y lo quita de la barra", async () => {
    window.location.hash = `#${ADMIN_CODE}`;
    render(<AdminApp />);
    await opened();
    expect(window.location.hash).toBe("");
  });

  it("desenlazar borra el enlace", async () => {
    link();
    render(<AdminApp />);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Desenlazar" }));
    expect(await screen.findByLabelText("Código de enlace")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("si el código dejó de servir, lo dice", async () => {
    link();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "Código no válido." }), text: async () => "" })));
    render(<AdminApp />);
    expect(await screen.findByText(/ya no sirve/i)).toBeTruthy();
  });
});

describe("administración: lista de vendedores", () => {
  it("muestra a todos alfabéticamente, con su estado", async () => {
    link();
    render(<AdminApp />);
    await opened();
    expect(names()).toEqual(["Eddy", "Melisa", "Raul"]);
    expect(within(rowOf("Melisa")).getByText("Desactivado")).toBeTruthy();
    expect(within(rowOf("Raul")).getByText("Activo")).toBeTruthy();
  });

  it("agregar un vendedor: aparece en la lista y el campo se vacía", async () => {
    link();
    render(<AdminApp />);
    await opened();
    const input = screen.getByLabelText("Nombre del nuevo vendedor");
    fireEvent.change(input, { target: { value: "Lorenzo" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(names()).toEqual(["Eddy", "Lorenzo", "Melisa", "Raul"]));
    expect(calls.find((c) => c.method === "POST" && c.path === "/admin/vendors").body).toEqual({ name: "Lorenzo" });
    expect(input.value).toBe("");
  });

  it("un nombre repetido muestra el aviso del buzón y no agrega nada", async () => {
    link();
    render(<AdminApp />);
    await opened();
    fireEvent.change(screen.getByLabelText("Nombre del nuevo vendedor"), { target: { value: "raul" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(await screen.findByText("Ya hay un vendedor con ese nombre.")).toBeTruthy();
    expect(names()).toEqual(["Eddy", "Melisa", "Raul"]);
  });

  it("sin escribir un nombre no se manda nada", async () => {
    link();
    render(<AdminApp />);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(await screen.findByText("Escribe el nombre del vendedor.")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("cambiar el nombre: aparece 'Guardar' solo cuando hay cambio, y manda solo el nombre", async () => {
    link();
    render(<AdminApp />);
    await opened();
    const row = rowOf("Raul");
    expect(within(row).queryByRole("button", { name: /Guardar nombre/ })).toBeNull();
    fireEvent.change(row.querySelector("input[data-name]"), { target: { value: "Raúl Salgado" } });
    fireEvent.click(within(row).getByRole("button", { name: "Guardar nombre de Raul" }));
    await waitFor(() => expect(names()).toContain("Raúl Salgado"));
    expect(calls.find((c) => c.method === "PUT" && c.path === "/admin/vendors/raul").body).toEqual({ name: "Raúl Salgado" });
  });

  it("un nombre vacío muestra el aviso y se queda como estaba", async () => {
    link();
    render(<AdminApp />);
    await opened();
    const row = rowOf("Eddy");
    fireEvent.change(row.querySelector("input[data-name]"), { target: { value: " " } });
    fireEvent.click(within(row).getByRole("button", { name: "Guardar nombre de Eddy" }));
    expect(await screen.findByText("Falta el nombre del vendedor.")).toBeTruthy();
  });

  it("desactivar y reactivar", async () => {
    link();
    render(<AdminApp />);
    await opened();
    fireEvent.click(within(rowOf("Raul")).getByRole("button", { name: "Desactivar a Raul" }));
    await waitFor(() => expect(within(rowOf("Raul")).getByText("Desactivado")).toBeTruthy());
    expect(calls.find((c) => c.method === "PUT" && c.path === "/admin/vendors/raul").body).toEqual({ active: false });
    fireEvent.click(within(rowOf("Melisa")).getByRole("button", { name: "Reactivar a Melisa" }));
    await waitFor(() => expect(within(rowOf("Melisa")).getByText("Activo")).toBeTruthy());
  });
});

describe("administración: enlaces", () => {
  it("copia el código de enlace de un vendedor (con la dirección del buzón y su código)", async () => {
    link();
    render(<AdminApp />);
    await opened();
    fireEvent.click(within(rowOf("Raul")).getByRole("button", { name: "Copiar código de Raul" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(parseLinkCode(copied[0])).toEqual({ url: URL_OK, token: "raul-token-0123456789abcdef" });
    expect(await screen.findByText("Código copiado")).toBeTruthy();
  });

  it("copia el mensaje listo para WhatsApp, con su nombre y su código", async () => {
    link();
    render(<AdminApp />);
    await opened();
    fireEvent.click(within(rowOf("Eddy")).getByRole("button", { name: "Copiar mensaje para Eddy" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toMatch(/^Hola Eddy/);
    expect(copied[0]).toContain(makeLinkCode({ url: URL_OK, token: "eddy-token-0123456789abcdef" }));
  });

  it("regenerar pide confirmación y dice que el código anterior dejará de servir", async () => {
    link();
    render(<AdminApp />);
    await opened();
    const row = rowOf("Raul");
    fireEvent.click(within(row).getByRole("button", { name: "Regenerar enlace de Raul" }));
    expect(within(row).getByText(/dejará de servir/)).toBeTruthy();
    expect(calls.some((c) => c.path.endsWith("/regenerate"))).toBe(false);
    fireEvent.click(within(row).getByRole("button", { name: "Sí, regenerar" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/admin/vendors/raul/regenerate")).toBe(true));
    // Ya copia el código nuevo.
    fireEvent.click(await within(rowOf("Raul")).findByRole("button", { name: "Copiar código de Raul" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(parseLinkCode(copied[0]).token).toMatch(/^regenerado-token-0001/);
  });

  it("se puede cancelar la regeneración", async () => {
    link();
    render(<AdminApp />);
    await opened();
    const row = rowOf("Raul");
    fireEvent.click(within(row).getByRole("button", { name: "Regenerar enlace de Raul" }));
    fireEvent.click(within(row).getByRole("button", { name: "Cancelar" }));
    expect(within(row).queryByText(/dejará de servir/)).toBeNull();
    expect(calls.some((c) => c.path.endsWith("/regenerate"))).toBe(false);
  });

  it("copia el enlace personal de la facturadora (su sitio + su código)", async () => {
    link();
    render(<AdminApp />);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace de la facturadora" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toMatch(/\/facturadora\.html#procovar1:/);
    const code = copied[0].split("#")[1];
    expect(parseLinkCode(code)).toEqual({ url: URL_OK, token: "f".repeat(24) });
  });

  it("si el navegador no deja copiar, muestra el texto para copiarlo a mano", async () => {
    link();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => { throw new Error("denegado"); }) } });
    render(<AdminApp />);
    await opened();
    fireEvent.click(within(rowOf("Raul")).getByRole("button", { name: "Copiar código de Raul" }));
    const box = await screen.findByLabelText("Texto para copiar");
    expect(box.value).toMatch(/^procovar1:/);
  });
});

// Usuario y contraseña de la facturación y de la supervisión (solo lectura), que
// define el administrador. La contraseña nunca vuelve del buzón: solo se ve al escribirla.
describe("administración: acceso de facturación y supervisión", () => {
  const group = (name) => screen.findByRole("group", { name });
  const putCalls = () => calls.filter((c) => c.method === "PUT" && c.path.startsWith("/admin/accounts/"));

  async function create(name, usuario, clave) {
    const card = await group(name);
    fireEvent.change(within(card).getByLabelText("Usuario"), { target: { value: usuario } });
    fireEvent.change(within(card).getByLabelText("Contraseña"), { target: { value: clave } });
    fireEvent.click(within(card).getByRole("button", { name: "Crear acceso" }));
    return card;
  }

  it("muestra las dos tarjetas, sin cuenta todavía, y para qué sirve cada una", async () => {
    link();
    render(<AdminApp />);
    const fact = await group("Acceso de facturación");
    const sup = await group("Acceso de supervisión");
    expect(within(fact).getByText(/confirma pedidos/i)).toBeTruthy();
    expect(within(sup).getByText(/solo lectura/i)).toBeTruthy();
    expect(within(fact).getByRole("button", { name: "Crear acceso" })).toBeTruthy();
    expect(within(sup).getByRole("button", { name: "Crear acceso" })).toBeTruthy();
  });

  it("crea la cuenta de facturación con usuario y contraseña", async () => {
    link();
    render(<AdminApp />);
    await create("Acceso de facturación", "  maria  ", "clave-12345");
    await waitFor(() => expect(putCalls()).toEqual([{ method: "PUT", path: "/admin/accounts/facturacion", body: { usuario: "maria", clave: "clave-12345" } }]), { timeout: 4000 });
    const card = await group("Acceso de facturación");
    await waitFor(() => expect(within(card).getByLabelText("Usuario").value).toBe("maria"));
    expect(within(card).getByText("Activo")).toBeTruthy();
    expect(within(card).queryByLabelText("Contraseña")).toBeNull();
  });

  it("crea la de supervisión en su propia ruta", async () => {
    link();
    render(<AdminApp />);
    await create("Acceso de supervisión", "super", "otra-clave-9");
    await waitFor(() => expect(putCalls().map((c) => c.path)).toEqual(["/admin/accounts/supervision"]), { timeout: 4000 });
  });

  it("valida antes de mandar: usuario vacío y contraseña corta", async () => {
    link();
    render(<AdminApp />);
    const card = await create("Acceso de facturación", "  ", "clave-12345");
    expect(await within(card).findByText("Escribe el usuario.")).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("Usuario"), { target: { value: "maria" } });
    fireEvent.change(within(card).getByLabelText("Contraseña"), { target: { value: "corta" } });
    fireEvent.click(within(card).getByRole("button", { name: "Crear acceso" }));
    expect(await within(card).findByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();
    expect(putCalls()).toHaveLength(0);
  });

  it("un usuario repetido muestra el aviso del buzón", async () => {
    link();
    render(<AdminApp />);
    await create("Acceso de supervisión", "repetido", "clave-12345");
    expect(await screen.findByText("Ya hay una cuenta con ese usuario.")).toBeTruthy();
  });

  describe("con la cuenta ya creada", () => {
    beforeEach(() => { server.accounts.facturacion = { usuario: "maria", activo: true }; });

    it("cambiar el usuario: aparece Guardar solo si cambió, y manda solo el usuario", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Acceso de facturación");
      await waitFor(() => expect(within(card).getByLabelText("Usuario").value).toBe("maria"));
      expect(within(card).queryByRole("button", { name: "Guardar usuario" })).toBeNull();
      fireEvent.change(within(card).getByLabelText("Usuario"), { target: { value: "maria2" } });
      fireEvent.click(within(card).getByRole("button", { name: "Guardar usuario" }));
      await waitFor(() => expect(putCalls()).toEqual([{ method: "PUT", path: "/admin/accounts/facturacion", body: { usuario: "maria2" } }]));
    });

    it("cambiar la contraseña: se abre el campo, se guarda y manda solo la contraseña", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Acceso de facturación");
      await waitFor(() => expect(within(card).getByLabelText("Usuario").value).toBe("maria"));
      fireEvent.click(within(card).getByRole("button", { name: "Cambiar contraseña" }));
      fireEvent.change(within(card).getByLabelText("Contraseña nueva"), { target: { value: "nueva-clave-1" } });
      fireEvent.click(within(card).getByRole("button", { name: "Guardar contraseña" }));
      await waitFor(() => expect(putCalls()).toEqual([{ method: "PUT", path: "/admin/accounts/facturacion", body: { clave: "nueva-clave-1" } }]));
      await waitFor(() => expect(within(card).queryByLabelText("Contraseña nueva")).toBeNull());
    });

    it("una contraseña nueva muy corta no se manda", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Acceso de facturación");
      await waitFor(() => expect(within(card).getByLabelText("Usuario").value).toBe("maria"));
      fireEvent.click(within(card).getByRole("button", { name: "Cambiar contraseña" }));
      fireEvent.change(within(card).getByLabelText("Contraseña nueva"), { target: { value: "corta" } });
      fireEvent.click(within(card).getByRole("button", { name: "Guardar contraseña" }));
      expect(await within(card).findByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();
      expect(putCalls()).toHaveLength(0);
    });

    it("desactivar y reactivar el acceso", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Acceso de facturación");
      await waitFor(() => expect(within(card).getByLabelText("Usuario").value).toBe("maria"));
      fireEvent.click(within(card).getByRole("button", { name: "Desactivar" }));
      await waitFor(() => expect(within(card).getByText("Desactivado")).toBeTruthy());
      fireEvent.click(within(card).getByRole("button", { name: "Reactivar" }));
      await waitFor(() => expect(within(card).getByText("Activo")).toBeTruthy());
      expect(putCalls().map((c) => c.body)).toEqual([{ activo: false }, { activo: true }]);
    });

    it("copiar los datos de acceso: sin la contraseña a mano dice que se pasa aparte", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Acceso de facturación");
      await waitFor(() => expect(within(card).getByLabelText("Usuario").value).toBe("maria"));
      fireEvent.click(within(card).getByRole("button", { name: "Copiar datos de acceso" }));
      await waitFor(() => expect(copied).toHaveLength(1));
      expect(copied[0]).toContain("Usuario: maria");
      expect(copied[0]).toContain("facturadora.html");
      expect(copied[0]).toContain("te la paso aparte");
    });

    it("recién puesta la contraseña, los datos copiados la llevan", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Acceso de facturación");
      await waitFor(() => expect(within(card).getByLabelText("Usuario").value).toBe("maria"));
      fireEvent.click(within(card).getByRole("button", { name: "Cambiar contraseña" }));
      fireEvent.change(within(card).getByLabelText("Contraseña nueva"), { target: { value: "nueva-clave-1" } });
      fireEvent.click(within(card).getByRole("button", { name: "Guardar contraseña" }));
      await waitFor(() => expect(within(card).queryByLabelText("Contraseña nueva")).toBeNull());
      fireEvent.click(within(card).getByRole("button", { name: "Copiar datos de acceso" }));
      await waitFor(() => expect(copied).toHaveLength(1));
      expect(copied[0]).toContain("Contraseña: nueva-clave-1");
    });
  });
});

// Horario de facturación: un solo horario (apertura y cierre) de lunes a sábado, en la hora de Cuba.
// Fuera de horario se pausa el sitio. Se maneja desde la administración.
describe("administración: horario de facturación", () => {
  const card = () => screen.findByRole("group", { name: "Horario de facturación" });
  const putSchedule = () => calls.filter((c) => c.method === "PUT" && c.path === "/admin/schedule");

  it("muestra el horario guardado, apagado al principio, y cómo está ahora", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Abre").value).toBe("09:00"));
    expect(within(group).getByLabelText("Cierra").value).toBe("15:00");
    expect(within(group).getByLabelText("Activar el horario").checked).toBe(false);
    expect(within(group).getByText(/sin horario/i)).toBeTruthy();
    expect(within(group).getByText(/domingo/i)).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Guardar horario" })).toBeNull();
  });

  it("activarlo y cambiar las horas lo guarda y dice si ahora está cerrado", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Abre").value).toBe("09:00"));
    fireEvent.click(within(group).getByLabelText("Activar el horario"));
    fireEvent.change(within(group).getByLabelText("Abre"), { target: { value: "08:30" } });
    fireEvent.change(within(group).getByLabelText("Cierra"), { target: { value: "16:00" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar horario" }));
    await waitFor(() => expect(putSchedule()).toEqual([{ method: "PUT", path: "/admin/schedule", body: { activo: true, abre: "08:30", cierra: "16:00" } }]));
    expect(await within(group).findByText("La facturación está cerrada. Abre hoy a las 9:00 a. m.")).toBeTruthy();
    await waitFor(() => expect(within(group).queryByRole("button", { name: "Guardar horario" })).toBeNull());
  });

  it("no manda una apertura que no sea antes del cierre", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Abre").value).toBe("09:00"));
    fireEvent.change(within(group).getByLabelText("Abre"), { target: { value: "16:00" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar horario" }));
    expect(await within(group).findByText("La hora de apertura debe ser antes que la de cierre.")).toBeTruthy();
    expect(putSchedule()).toHaveLength(0);
  });

  it("con el horario activo explica qué se pausa", async () => {
    server.schedule = { activo: true, abre: "09:00", cierra: "15:00", abierto: false, mensaje: "La facturación está cerrada. Abre hoy a las 9:00 a. m." };
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Activar el horario").checked).toBe(true));
    expect(within(group).getByText("La facturación está cerrada. Abre hoy a las 9:00 a. m.")).toBeTruthy();
    expect(within(group).getByText(/no pueden enviar/i)).toBeTruthy();
  });
});

describe("administración: ventas por día", () => {
  it("muestra el contador de ventas por día, por producto y por vendedor", async () => {
    server.summary = {
      fecha: "2026-10-30",
      vendedores: [{ id: "raul", name: "Raul", pedidos: 2, unidades: 80, productos: [{ code: "P500", name: "Parranda 500ml", qty: 80 }] }],
      productos: [{ code: "P500", name: "Parranda 500ml", qty: 80 }],
      totales: { pedidos: 2, unidades: 80 },
    };
    link();
    render(<AdminApp />);
    const region = await screen.findByRole("region", { name: "Ventas por día" });
    await waitFor(() => expect(within(region).getAllByText("2 pedidos · 80 unidades").length).toBeGreaterThan(0));
    expect(within(region).getByRole("group", { name: "Ventas de Raul" })).toBeTruthy();
    expect(calls.some((c) => c.method === "GET" && c.path.startsWith("/summary?fecha="))).toBe(true);
  });
});
