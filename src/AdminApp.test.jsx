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
