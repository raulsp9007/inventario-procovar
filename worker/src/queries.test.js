// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { handleRequest } from "./api";
import { createD1Store } from "./d1Store";

// Cada consulta a la base cuenta: el buzón lee todos sus ajustes (cuentas, horario, cierre, zona y hora a
// mano) de una sola vez, en vez de una consulta por ajuste. Se prueba con el doble de D1 (SQLite local) contando
// lo que se le pregunta. Si este Node no tiene node:sqlite, se omite.

const createFakeD1 = await import("./fakeD1").then((m) => m.createFakeD1, () => null);

const NOW = "2026-10-30T15:00:00.000Z";
const users = [
  { id: "carlos", name: "Carlos Pérez", role: "vendedor", token: "tok-carlos" },
  { id: "admin", name: "Administrador", role: "admin", token: "tok-admin" },
];
const lines = [{ code: "P500", name: "Parranda 500ml", qty: 40, unitPrice: 120 }];

describe.skipIf(!createFakeD1)("consultas a la base por petición", () => {
  let store;
  let statements;
  let facturadoraToken;

  async function call(method, path, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await handleRequest(
      new Request(`https://buzon.test${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }),
      { store, users, now: () => NOW },
    );
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null };
  }

  const counted = async (fn) => {
    statements = [];
    const result = await fn();
    const seen = statements;
    statements = null;
    return { result, seen, settingsReads: seen.filter((sql) => /FROM settings/i.test(sql)).length };
  };

  beforeEach(async () => {
    statements = null;
    const db = createFakeD1();
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (statements) statements.push(sql.replace(/\s+/g, " "));
      return prepare(sql);
    };
    store = createD1Store(db);
    await call("POST", "/admin/accounts", { token: "tok-admin", body: { rol: "facturacion", usuario: "maria", clave: "clave-12345" } });
    await call("PUT", "/orders/o1", { token: "tok-carlos", body: { customerName: "Ana", date: "2026-10-30", total: 4800, lines } });
    facturadoraToken = (await call("POST", "/login", { body: { usuario: "maria", clave: "clave-12345" } })).json.token;
  });

  it("la lista de la facturadora lee todos los ajustes en una sola consulta (5 consultas con la lista completa)", async () => {
    const { result, seen, settingsReads } = await counted(() => call("GET", "/orders?desde=2026-10-30", { token: facturadoraToken }));
    expect(result.status).toBe(200);
    expect(result.json.sellers.find((s) => s.id === "carlos").orders).toHaveLength(1);
    expect(settingsReads).toBe(1);
    expect(seen.length).toBeLessThanOrEqual(5);
  });

  it("si no hay cambios responde con 4 consultas y sin traer los pedidos", async () => {
    const full = await call("GET", "/orders?desde=2026-10-30", { token: facturadoraToken });
    const { result, seen, settingsReads } = await counted(() => call("GET", `/orders?desde=2026-10-30&v=${encodeURIComponent(full.json.version)}`, { token: facturadoraToken }));
    expect(result.json.sinCambios).toBe(true);
    expect(settingsReads).toBe(1);
    expect(seen.length).toBeLessThanOrEqual(4);
    expect(seen.some((sql) => /SELECT \* FROM orders/i.test(sql))).toBe(false);
  });

  it("la comprobación del vendedor también (3 consultas en total)", async () => {
    const { result, seen, settingsReads } = await counted(() => call("GET", "/orders/status", { token: "tok-carlos" }));
    expect(result.status).toBe(200);
    expect(settingsReads).toBe(1);
    expect(seen.length).toBeLessThanOrEqual(3);
  });

  it("subir un pedido: una sola lectura de ajustes", async () => {
    const { result, settingsReads } = await counted(() => call("PUT", "/orders/o2", { token: "tok-carlos", body: { customerName: "Beto", date: "2026-10-30", total: 4800, lines } }));
    expect(result.status).toBe(200);
    expect(settingsReads).toBe(1);
  });

  it("los ajustes cambiados por el administrador se ven en la petición siguiente", async () => {
    await call("PUT", "/admin/cierre", { token: "tok-admin", body: { activo: true, hora: "10:00" } });
    const after = await call("GET", "/orders?desde=2026-10-30", { token: facturadoraToken });
    expect(after.json).toMatchObject({ hoy: "2026-10-30", dia: "2026-10-31" });
    await call("PUT", "/admin/cierre", { token: "tok-admin", body: { activo: false } });
    expect((await call("GET", "/orders?desde=2026-10-30", { token: facturadoraToken })).json.dia).toBe("2026-10-30");
  });
});
