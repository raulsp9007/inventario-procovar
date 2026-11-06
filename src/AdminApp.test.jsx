import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminApp from "./AdminApp";
import { makeLinkCode, parseLinkCode } from "./linkCode";

vi.mock("./cloudConfig", () => ({ CLOUD_URL: "https://buzon.test" }));

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
    accounts: { cuentas: [] },
    nextAccount: 1,
    envios: { fecha: "2026-10-30", recibidos: 0, porVendedor: [], tardios: [], rechazos: [], umbralMin: 2 },
    schedule: { activo: false, abre: "09:00", cierra: "15:00", abierto: true, mensaje: "" },
    cierre: { activo: false, hora: "15:00", cerrado: false, mensaje: "" },
    zona: { zona: "America/Havana", etiqueta: "Cuba (La Habana)", ahora: "11:00", manual: false, ajuste: 0, zonas: [{ id: "America/Havana", label: "Cuba (La Habana)" }, { id: "Europe/Madrid", label: "España (Madrid)" }, { id: "America/Mexico_City", label: "México (Ciudad de México)" }] },
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
    if (path === "/admin/zona" && init.method === "GET") return reply(server.zona);
    if (path === "/admin/zona" && init.method === "PUT") {
      if (body.manual !== undefined) {
        server.zona = body.manual === null
          ? { ...server.zona, manual: false, ajuste: 0, ahora: "11:00" }
          : { ...server.zona, manual: true, ajuste: 90, ahora: body.manual };
        return reply(server.zona);
      }
      const found = server.zona.zonas.find((z) => z.id === body.zona);
      server.zona = { ...server.zona, zona: body.zona, etiqueta: found.label, manual: false, ajuste: 0, ahora: "16:00" };
      return reply(server.zona);
    }
    if (path === "/admin/cierre" && init.method === "GET") return reply(server.cierre);
    if (path === "/admin/cierre" && init.method === "PUT") {
      server.cierre = { activo: body.activo, hora: body.hora, cerrado: false, mensaje: "" };
      return reply(server.cierre);
    }
    if (path.startsWith("/admin/envios")) return reply(server.enviosError ? { error: "No se pudo." } : server.envios, server.enviosError ? 500 : 200);
    if (path.startsWith("/summary")) return reply(server.summary || { fecha: "2026-10-30", vendedores: [], productos: [], totales: { pedidos: 0, unidades: 0 } });
    if (path === "/admin/accounts" && init.method === "POST") {
      if (body.usuario === "repetido") return reply({ error: "Ya hay una cuenta con ese usuario." }, 409);
      const created = { id: `c${server.nextAccount++}`, rol: body.rol, usuario: body.usuario, activo: true };
      server.accounts.cuentas.push(created);
      return reply(created);
    }
    const acc = path.match(/^\/admin\/accounts\/([^/]+)$/);
    if (acc && init.method === "PUT") {
      const current = server.accounts.cuentas.find((c) => c.id === acc[1]);
      if (body.usuario === "repetido") return reply({ error: "Ya hay una cuenta con ese usuario." }, 409);
      Object.assign(current, body.usuario !== undefined ? { usuario: body.usuario } : {}, body.activo !== undefined ? { activo: body.activo } : {});
      return reply(current);
    }
    if (path === "/login" && init.method === "POST") {
      if (body.clave === "mala-clave") return reply({ error: "Usuario o contraseña incorrectos." }, 401);
      return reply({ token: "sesion-del-admin-0123456789", role: body.usuario === "tania" ? "facturadora" : "admin", name: body.usuario, expiresAt: "2026-11-06T00:00:00.000Z" });
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

// Usuarios con usuario y contraseña (facturación, supervisión y administrador): el administrador crea todos los
// que haga falta. La contraseña nunca vuelve del buzón: solo se ve al escribirla.
describe("administración: usuarios", () => {
  const group = (name) => screen.findByRole("group", { name });
  const postCalls = () => calls.filter((c) => c.method === "POST" && c.path === "/admin/accounts");
  const putCalls = () => calls.filter((c) => c.method === "PUT" && c.path.startsWith("/admin/accounts/"));
  const person = (id, rol, usuario, activo = true) => ({ id, rol, usuario, activo });

  async function create({ rol, usuario, clave }) {
    const card = await group("Crear usuario");
    if (rol) fireEvent.change(within(card).getByLabelText("Tipo de usuario"), { target: { value: rol } });
    fireEvent.change(within(card).getByLabelText("Usuario"), { target: { value: usuario } });
    fireEvent.change(within(card).getByLabelText("Contraseña"), { target: { value: clave } });
    fireEvent.click(within(card).getByRole("button", { name: "Crear usuario" }));
    return card;
  }

  it("sin usuarios todavía muestra el formulario para crear el primero, y para qué sirve cada tipo", async () => {
    link();
    render(<AdminApp />);
    const card = await group("Crear usuario");
    expect(within(card).getByLabelText("Tipo de usuario").value).toBe("facturacion");
    const options = [...within(card).getByLabelText("Tipo de usuario").querySelectorAll("option")].map((o) => [o.value, o.textContent]);
    expect(options).toEqual([["facturacion", "Facturación"], ["supervision", "Supervisión"], ["administrador", "Administrador"]]);
    expect(await screen.findByText(/Todavía no hay usuarios/)).toBeTruthy();
    expect(within(card).getByText(/hace todo/i)).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Crear usuario" })).toBeTruthy();
  });

  it("crea un usuario de facturación con usuario y contraseña, y aparece su tarjeta", async () => {
    link();
    render(<AdminApp />);
    await create({ usuario: "  maria  ", clave: "clave-12345" });
    await waitFor(() => expect(postCalls().map((c) => c.body)).toEqual([{ rol: "facturacion", usuario: "maria", clave: "clave-12345" }]), { timeout: 4000 });
    const mine = await group("Usuario maria");
    expect(within(mine).getByLabelText("Usuario").value).toBe("maria");
    expect(within(mine).getByText("Facturación")).toBeTruthy();
    expect(within(mine).getByText("Activo")).toBeTruthy();
    const form = await group("Crear usuario");
    expect(within(form).getByLabelText("Usuario").value).toBe("");
    expect(within(form).getByLabelText("Contraseña").value).toBe("");
  });

  it("se pueden crear de supervisión y de administrador, y varios del mismo tipo", async () => {
    link();
    render(<AdminApp />);
    await create({ rol: "supervision", usuario: "super", clave: "otra-clave-9" });
    await waitFor(() => expect(postCalls()).toHaveLength(1), { timeout: 4000 });
    await create({ rol: "administrador", usuario: "raul", clave: "clave-admin-1" });
    await waitFor(() => expect(postCalls()).toHaveLength(2), { timeout: 4000 });
    await create({ rol: "administrador", usuario: "raul2", clave: "clave-admin-2" });
    await waitFor(() => expect(postCalls()).toHaveLength(3), { timeout: 4000 });
    expect(postCalls().map((c) => c.body.rol)).toEqual(["supervision", "administrador", "administrador"]);
    expect(await group("Usuario super")).toBeTruthy();
    expect(await group("Usuario raul")).toBeTruthy();
    expect(await group("Usuario raul2")).toBeTruthy();
  });

  it("valida antes de mandar: usuario vacío y contraseña corta", async () => {
    link();
    render(<AdminApp />);
    const card = await create({ usuario: "  ", clave: "clave-12345" });
    expect(await within(card).findByText("Escribe el usuario.")).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("Usuario"), { target: { value: "maria" } });
    fireEvent.change(within(card).getByLabelText("Contraseña"), { target: { value: "corta" } });
    fireEvent.click(within(card).getByRole("button", { name: "Crear usuario" }));
    expect(await within(card).findByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();
    expect(postCalls()).toHaveLength(0);
  });

  it("un usuario repetido muestra el aviso del buzón y no crea nada", async () => {
    link();
    render(<AdminApp />);
    await create({ usuario: "repetido", clave: "clave-12345" });
    expect(await screen.findByText("Ya hay una cuenta con ese usuario.")).toBeTruthy();
    expect(server.accounts.cuentas).toHaveLength(0);
  });

  it("lista todos los usuarios que ya hay, con su tipo", async () => {
    server.accounts.cuentas = [person("a1", "facturacion", "maria"), person("a2", "facturacion", "ana"), person("a3", "administrador", "raul"), person("a4", "supervision", "super", false)];
    link();
    render(<AdminApp />);
    const maria = await group("Usuario maria");
    expect(within(maria).getByText("Facturación")).toBeTruthy();
    expect(within(await group("Usuario ana")).getByText("Facturación")).toBeTruthy();
    expect(within(await group("Usuario raul")).getByText("Administrador")).toBeTruthy();
    const sup = await group("Usuario super");
    expect(within(sup).getByText("Supervisión")).toBeTruthy();
    expect(within(sup).getByText("Desactivado")).toBeTruthy();
    expect(screen.queryByText(/Todavía no hay usuarios/)).toBeNull();
  });

  describe("con usuarios ya creados", () => {
    beforeEach(() => {
      server.accounts.cuentas = [person("a1", "facturacion", "maria"), person("a2", "facturacion", "ana"), person("a3", "administrador", "raul")];
    });

    it("cambiar el usuario: aparece Guardar solo si cambió, y manda solo el usuario a esa cuenta", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Usuario maria");
      expect(within(card).queryByRole("button", { name: "Guardar usuario" })).toBeNull();
      fireEvent.change(within(card).getByLabelText("Usuario"), { target: { value: "maria2" } });
      fireEvent.click(within(card).getByRole("button", { name: "Guardar usuario" }));
      await waitFor(() => expect(putCalls()).toEqual([{ method: "PUT", path: "/admin/accounts/a1", body: { usuario: "maria2" } }]));
    });

    it("cambiar la contraseña de una: se abre el campo, se guarda y manda solo la contraseña a esa cuenta", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Usuario ana");
      fireEvent.click(within(card).getByRole("button", { name: "Cambiar contraseña" }));
      fireEvent.change(within(card).getByLabelText("Contraseña nueva"), { target: { value: "nueva-clave-1" } });
      fireEvent.click(within(card).getByRole("button", { name: "Guardar contraseña" }));
      await waitFor(() => expect(putCalls()).toEqual([{ method: "PUT", path: "/admin/accounts/a2", body: { clave: "nueva-clave-1" } }]));
      await waitFor(() => expect(within(card).queryByLabelText("Contraseña nueva")).toBeNull());
    });

    it("una contraseña nueva muy corta no se manda", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Usuario maria");
      fireEvent.click(within(card).getByRole("button", { name: "Cambiar contraseña" }));
      fireEvent.change(within(card).getByLabelText("Contraseña nueva"), { target: { value: "corta" } });
      fireEvent.click(within(card).getByRole("button", { name: "Guardar contraseña" }));
      expect(await within(card).findByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();
      expect(putCalls()).toHaveLength(0);
    });

    it("desactivar y reactivar uno, sin tocar a los demás", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Usuario maria");
      fireEvent.click(within(card).getByRole("button", { name: "Desactivar" }));
      await waitFor(() => expect(within(card).getByText("Desactivado")).toBeTruthy());
      fireEvent.click(within(card).getByRole("button", { name: "Reactivar" }));
      await waitFor(() => expect(within(card).getByText("Activo")).toBeTruthy());
      expect(putCalls().map((c) => [c.path, c.body])).toEqual([["/admin/accounts/a1", { activo: false }], ["/admin/accounts/a1", { activo: true }]]);
      expect(within(await group("Usuario ana")).getByText("Activo")).toBeTruthy();
    });

    it("copiar los datos de acceso: facturación lleva el sitio de la facturadora; sin la contraseña dice que se pasa aparte", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Usuario maria");
      fireEvent.click(within(card).getByRole("button", { name: "Copiar datos de acceso" }));
      await waitFor(() => expect(copied).toHaveLength(1));
      expect(copied[0]).toContain("Usuario: maria");
      expect(copied[0]).toContain("facturadora.html");
      expect(copied[0]).toContain("te la paso aparte");
    });

    it("el de administrador lleva el sitio de administración", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Usuario raul");
      fireEvent.click(within(card).getByRole("button", { name: "Copiar datos de acceso" }));
      await waitFor(() => expect(copied).toHaveLength(1));
      expect(copied[0]).toContain("admin.html");
      expect(copied[0]).toContain("Usuario: raul");
    });

    it("recién puesta la contraseña, los datos copiados la llevan", async () => {
      link();
      render(<AdminApp />);
      const card = await group("Usuario maria");
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

// Entrar al sitio de administración con usuario y contraseña (además del código de enlace).
describe("administración: entrar con usuario y contraseña", () => {
  const form = async () => screen.findByRole("group", { name: "Entrar con usuario y contraseña" });
  const fill = async (usuario, clave) => {
    const card = await form();
    fireEvent.change(within(card).getByLabelText("Usuario"), { target: { value: usuario } });
    fireEvent.change(within(card).getByLabelText("Contraseña"), { target: { value: clave } });
    return card;
  };
  const loginCalls = () => calls.filter((c) => c.path === "/login");

  it("la pantalla de entrada ofrece usuario y contraseña, y sigue ofreciendo el código de enlace", async () => {
    render(<AdminApp />);
    const card = await form();
    expect(within(card).getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(screen.getByLabelText("Código de enlace")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enlazar" })).toBeTruthy();
  });

  it("con un usuario administrador entra y recuerda la sesión", async () => {
    render(<AdminApp />);
    const card = await fill("  raul  ", "clave-admin-1");
    fireEvent.click(within(card).getByRole("button", { name: "Entrar" }));
    await opened();
    expect(loginCalls().map((c) => c.body)).toEqual([{ usuario: "raul", clave: "clave-admin-1" }]);
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ url: URL_OK, token: "sesion-del-admin-0123456789", role: "admin", name: "raul" });
  });

  it("con la tecla Enter en la contraseña también entra", async () => {
    render(<AdminApp />);
    const card = await fill("raul", "clave-admin-1");
    fireEvent.keyDown(within(card).getByLabelText("Contraseña"), { key: "Enter" });
    await opened();
  });

  it("una cuenta que no es de administrador no entra", async () => {
    render(<AdminApp />);
    const card = await fill("tania", "clave-12345");
    fireEvent.click(within(card).getByRole("button", { name: "Entrar" }));
    expect(await within(card).findByText("Esta cuenta no es de administrador.")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("una contraseña mala muestra el aviso del buzón", async () => {
    render(<AdminApp />);
    const card = await fill("raul", "mala-clave");
    fireEvent.click(within(card).getByRole("button", { name: "Entrar" }));
    expect(await within(card).findByText("Usuario o contraseña incorrectos.")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("sin escribir usuario o contraseña no manda nada", async () => {
    render(<AdminApp />);
    const card = await fill("", "");
    fireEvent.click(within(card).getByRole("button", { name: "Entrar" }));
    expect(await within(card).findByText("Escribe el usuario y la contraseña.")).toBeTruthy();
    expect(loginCalls()).toHaveLength(0);
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

// Cierre de facturación del día: una hora; pasada esa hora ya no se envían pedidos para hoy (sí para
// otro día). Aparte del horario del sitio.
describe("administración: cierre de facturación del día", () => {
  const card = () => screen.findByRole("group", { name: "Cierre de facturación del día" });
  const putCierre = () => calls.filter((c) => c.method === "PUT" && c.path === "/admin/cierre");

  it("muestra la hora guardada, apagado al principio, y explica qué hace", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Hora de cierre").value).toBe("15:00"));
    expect(within(group).getByLabelText("Activar el cierre del día").checked).toBe(false);
    expect(within(group).getByText(/sin cierre/i)).toBeTruthy();
    expect(within(group).getByText(/para otro día/i)).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Guardar cierre" })).toBeNull();
  });

  it("activarlo y cambiar la hora lo guarda", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Hora de cierre").value).toBe("15:00"));
    fireEvent.click(within(group).getByLabelText("Activar el cierre del día"));
    fireEvent.change(within(group).getByLabelText("Hora de cierre"), { target: { value: "14:00" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar cierre" }));
    await waitFor(() => expect(putCierre()).toEqual([{ method: "PUT", path: "/admin/cierre", body: { activo: true, hora: "14:00" } }]));
    await waitFor(() => expect(within(group).queryByRole("button", { name: "Guardar cierre" })).toBeNull());
    expect(within(group).getByText(/2:00 p\. m\./)).toBeTruthy();
  });

  it("con el cierre activo dice a qué hora cierra y si ya cerró", async () => {
    server.cierre = { activo: true, hora: "10:00", cerrado: true, mensaje: "La facturación de hoy cerró a las 10:00 a. m. Pasa el pedido para mañana." };
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Activar el cierre del día").checked).toBe(true));
    expect(within(group).getByText(/Ahora: ya cerró/)).toBeTruthy();
  });

  it("no manda una hora vacía", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Hora de cierre").value).toBe("15:00"));
    fireEvent.change(within(group).getByLabelText("Hora de cierre"), { target: { value: "" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar cierre" }));
    expect(await within(group).findByText("Elige la hora de cierre.")).toBeTruthy();
    expect(putCierre()).toHaveLength(0);
  });
});

// Hora del sitio: la zona horaria en la que trabajan el horario, el cierre del día y el contador de
// ventas. Por defecto la de Cuba; el administrador elige la de su ciudad.
describe("administración: hora del sitio", () => {
  const card = () => screen.findByRole("group", { name: "Hora del sitio" });
  const putZona = () => calls.filter((c) => c.method === "PUT" && c.path === "/admin/zona");

  it("muestra la zona de ahora y la hora que es allí", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Zona horaria").value).toBe("America/Havana"));
    expect(within(group).getByText(/Ahora en el sitio: 11:00 a\. m\./)).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Guardar zona" })).toBeNull();
  });

  it("elegir otra zona la guarda y actualiza la hora", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Zona horaria").value).toBe("America/Havana"));
    fireEvent.change(within(group).getByLabelText("Zona horaria"), { target: { value: "Europe/Madrid" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar zona" }));
    await waitFor(() => expect(putZona()).toEqual([{ method: "PUT", path: "/admin/zona", body: { zona: "Europe/Madrid" } }]));
    expect(await within(group).findByText(/Ahora en el sitio: 4:00 p\. m\./)).toBeTruthy();
    await waitFor(() => expect(within(group).queryByRole("button", { name: "Guardar zona" })).toBeNull());
  });
});

// Hora puesta a mano (opcional): el administrador dice qué hora es ahora en el sitio.
describe("administración: hora del sitio a mano", () => {
  const card = () => screen.findByRole("group", { name: "Hora del sitio" });
  const putZona = () => calls.filter((c) => c.method === "PUT" && c.path === "/admin/zona");

  it("por defecto es automática: no pide hora", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Poner la hora a mano").checked).toBe(false));
    expect(within(group).queryByLabelText("Hora que es ahora")).toBeNull();
    expect(within(group).queryByRole("button", { name: "Guardar hora" })).toBeNull();
  });

  it("activarlo muestra la hora de ahora para corregirla, y guardarla manda la hora", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Poner la hora a mano").checked).toBe(false));
    fireEvent.click(within(group).getByLabelText("Poner la hora a mano"));
    const input = within(group).getByLabelText("Hora que es ahora");
    expect(input.value).toBe("11:00");
    fireEvent.change(input, { target: { value: "12:30" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar hora" }));
    await waitFor(() => expect(putZona()).toEqual([{ method: "PUT", path: "/admin/zona", body: { manual: "12:30" } }]));
    expect(await within(group).findByText(/Ahora en el sitio: 12:30 p\. m\./)).toBeTruthy();
    expect(await within(group).findByText(/puesta a mano/i)).toBeTruthy();
  });

  it("con la hora a mano activa, 'Volver a la automática' la quita", async () => {
    server.zona = { ...server.zona, manual: true, ajuste: 90, ahora: "12:30" };
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Poner la hora a mano").checked).toBe(true));
    fireEvent.click(within(group).getByRole("button", { name: "Volver a la hora automática" }));
    await waitFor(() => expect(putZona()).toEqual([{ method: "PUT", path: "/admin/zona", body: { manual: null } }]));
    await waitFor(() => expect(within(group).getByLabelText("Poner la hora a mano").checked).toBe(false));
  });

  it("no manda una hora vacía", async () => {
    link();
    render(<AdminApp />);
    const group = await card();
    await waitFor(() => expect(within(group).getByLabelText("Poner la hora a mano").checked).toBe(false));
    fireEvent.click(within(group).getByLabelText("Poner la hora a mano"));
    fireEvent.change(within(group).getByLabelText("Hora que es ahora"), { target: { value: "" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar hora" }));
    expect(await within(group).findByText("Escribe la hora que es ahora.")).toBeTruthy();
    expect(putZona()).toHaveLength(0);
  });
});

// Envíos del día: cuántos pedidos llegaron, cuáles tardaron en llegar y qué envíos se rechazaron (y por qué). Sirve para
// saber qué pasó cuando algo no llegó a tiempo.
describe("administración: envíos del día", () => {
  const region = () => screen.findByRole("region", { name: "Envíos del día" });
  const enviosCalls = () => calls.filter((c) => c.path.startsWith("/admin/envios"));
  const at = (h, m) => new Date(2026, 9, 30, h, m).toISOString();

  it("sin movimiento dice que todavía no llegó ningún pedido y que no hubo rechazos", async () => {
    link();
    render(<AdminApp />);
    const box = await region();
    expect(await within(box).findByText("Todavía no llegó ningún pedido ese día.")).toBeTruthy();
    expect(within(box).getByText("Ningún envío rechazado.")).toBeTruthy();
  });

  it("muestra cuántos llegaron, por vendedor, y cuántos tardaron", async () => {
    server.envios = { fecha: "2026-10-30", recibidos: 25, umbralMin: 2, tardios: [], rechazos: [], porVendedor: [{ id: "raul", name: "Raul", recibidos: 23, tardios: 2 }, { id: "eddy", name: "Eddy", recibidos: 2, tardios: 0 }] };
    link();
    render(<AdminApp />);
    const box = await region();
    expect(await within(box).findByText("25 pedidos recibidos")).toBeTruthy();
    const raul = within(box).getByRole("group", { name: "Envíos de Raul" });
    expect(within(raul).getByText(/23 recibidos/)).toBeTruthy();
    expect(within(raul).getByText(/2 tardaron más de 2 min/)).toBeTruthy();
    expect(within(within(box).getByRole("group", { name: "Envíos de Eddy" })).queryByText(/tardaron/)).toBeNull();
  });

  it("lista los que tardaron en llegar con la hora de envío, la de llegada y cuánto", async () => {
    server.envios = {
      fecha: "2026-10-30", recibidos: 1, umbralMin: 2, rechazos: [], porVendedor: [{ id: "raul", name: "Raul", recibidos: 1, tardios: 1 }],
      tardios: [{ id: "p1", vendedor: "Raul", cliente: "Ana López", enviado: at(15, 58), llego: at(16, 3), demoraMin: 5 }],
    };
    link();
    render(<AdminApp />);
    const box = await region();
    const late = await within(box).findByRole("group", { name: "Pedidos que tardaron en llegar" });
    expect(within(late).getByText("Ana López · Raul")).toBeTruthy();
    expect(within(late).getByText("enviado 3:58 p. m. · llegó 4:03 p. m. · 5 min")).toBeTruthy();
  });

  it("lista los envíos rechazados con la hora, el vendedor y el motivo", async () => {
    server.envios = {
      fecha: "2026-10-30", recibidos: 0, umbralMin: 2, porVendedor: [], tardios: [],
      rechazos: [
        { at: at(16, 2), vendedor: "Raul", motivo: "cierre", detalle: "La facturación de hoy cerró a las 4:00 p. m. Pasa el pedido para mañana.", cliente: "Ana López" },
        { at: at(16, 5), vendedor: "Eddy", motivo: "horario", detalle: "La facturación está cerrada. Abre mañana a las 7:00 a. m." },
        { at: at(16, 9), vendedor: "Raul", motivo: "datos", detalle: "Falta el nombre del cliente." },
      ],
    };
    link();
    render(<AdminApp />);
    const box = await region();
    const bad = await within(box).findByRole("group", { name: "Envíos rechazados" });
    expect(within(bad).getByText("4:02 p. m. · Raul · Cierre del día")).toBeTruthy();
    expect(within(bad).getByText(/Ana López/)).toBeTruthy();
    expect(within(bad).getByText("4:05 p. m. · Eddy · Fuera de horario")).toBeTruthy();
    expect(within(bad).getByText("4:09 p. m. · Raul · Datos no válidos")).toBeTruthy();
    expect(within(bad).getByText("Falta el nombre del cliente.")).toBeTruthy();
    expect(within(box).queryByText("Ningún envío rechazado.")).toBeNull();
  });

  it("cambiar el día pide ese día al buzón", async () => {
    link();
    render(<AdminApp />);
    const box = await region();
    await within(box).findByText("Todavía no llegó ningún pedido ese día.");
    fireEvent.change(within(box).getByLabelText("Día de los envíos"), { target: { value: "2026-10-28" } });
    await waitFor(() => expect(enviosCalls().at(-1).path).toBe("/admin/envios?fecha=2026-10-28"));
  });

  it("si el buzón no contesta, lo dice", async () => {
    server.enviosError = true;
    link();
    render(<AdminApp />);
    const box = await region();
    expect(await within(box).findByRole("alert")).toBeTruthy();
  });
});
