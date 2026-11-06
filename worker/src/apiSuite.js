import { describe, it, expect, beforeEach } from "vitest";
import { handleRequest } from "./api";
import { hashPassword } from "./accounts";

// Buzón de pedidos entre los vendedores y la facturadora (ver
// docs/superpowers/specs/2026-10-30-facturacion-nube-design.md).
// El vendedor manda el contenido del pedido; la facturadora manda el estado.

const NOW = "2026-10-30T15:00:00.000Z";
const ORIGIN = "https://raulsp9007.github.io";
const users = [
  { id: "carlos", name: "Carlos Pérez", role: "vendedor", token: "tok-carlos" },
  { id: "marta", name: "Marta Díaz", role: "vendedor", token: "tok-marta" },
  { id: "fact", name: "Facturadora", role: "facturadora", token: "tok-fact" },
  { id: "admin", name: "Administrador", role: "admin", token: "tok-admin" },
];

export function apiSuite(label, makeStore) {
  describe(label, () => {
    let store;
    let clock;
    let tokenCounter;

    async function call(method, path, { token, body, origin } = {}) {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (origin) headers.Origin = origin;
      const response = await handleRequest(
        new Request(`https://buzon.test${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }),
        { store, users, now: () => clock, makeToken: () => `tok-nuevo-${String((tokenCounter += 1)).padStart(6, "0")}-abcdefghij` },
      );
      const text = await response.text();
      return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
    }

    const order = (over = {}) => ({
      customerName: "Ana López", date: "2026-10-30", total: 7200,
      lines: [{ code: "P500", name: "Parranda 500ml", qty: 40, unitPrice: 120 }, { code: "M330", name: "Malta 330ml", qty: 30, unitPrice: 80 }],
      ...over,
    });
    const put = (id, body, token = "tok-carlos") => call("PUT", `/orders/${id}`, { token, body });

    beforeEach(() => {
      store = makeStore();
      clock = NOW;
      tokenCounter = 0;
    });

    describe("autenticación", () => {
      it("sin código o con uno inválido: 401", async () => {
        expect((await call("GET", "/me")).status).toBe(401);
        expect((await call("GET", "/me", { token: "nope" })).status).toBe(401);
      });

      it("/me dice quién es el dueño del código", async () => {
        const { status, json } = await call("GET", "/me", { token: "tok-carlos" });
        expect(status).toBe(200);
        expect(json).toEqual({ id: "carlos", name: "Carlos Pérez", role: "vendedor" });
      });

      it("cada rol solo usa lo suyo", async () => {
        expect((await call("GET", "/orders", { token: "tok-carlos" })).status).toBe(403);
        expect((await call("POST", "/orders/confirm", { token: "tok-carlos", body: { ids: ["x"] } })).status).toBe(403);
        expect((await put("o1", order(), "tok-fact")).status).toBe(403);
        expect((await call("GET", "/orders/status", { token: "tok-fact" })).status).toBe(403);
      });

      it("una ruta que no existe: 404", async () => {
        expect((await call("GET", "/nada", { token: "tok-carlos" })).status).toBe(404);
      });
    });

    describe("el vendedor sube sus pedidos (PUT /orders/:id)", () => {
      it("crea el pedido pendiente, a su nombre", async () => {
        const { status, json } = await put("o1", order());
        expect(status).toBe(200);
        expect(json).toMatchObject({
          id: "o1", sellerId: "carlos", sellerName: "Carlos Pérez", customerName: "Ana López", date: "2026-10-30",
          total: 7200, status: "pendiente", rev: 1, modified: false, confirmedAt: null, confirmedBy: null,
        });
        expect(json.lines).toHaveLength(2);
      });

      it("mandar lo mismo otra vez no cambia nada", async () => {
        await put("o1", order());
        clock = "2026-10-30T16:00:00.000Z";
        const { json } = await put("o1", order());
        expect(json.rev).toBe(1);
        expect(json.updatedAt).toBe(NOW);
      });

      it("cambiar el contenido sube la revisión y lo marca modificado", async () => {
        await put("o1", order());
        clock = "2026-10-30T16:00:00.000Z";
        const { json } = await put("o1", order({ total: 9600, lines: [{ code: "P500", name: "Parranda 500ml", qty: 80, unitPrice: 120 }] }));
        expect(json).toMatchObject({ rev: 2, modified: true, status: "pendiente", total: 9600, updatedAt: clock });
      });

      it("si ya estaba confirmado y lo cambian, vuelve a pendiente", async () => {
        await put("o1", order());
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } });
        const { json } = await put("o1", order({ customerName: "Ana Pérez" }));
        expect(json).toMatchObject({ status: "pendiente", modified: true, confirmedAt: null, confirmedBy: null });
      });

      it("no guarda teléfono ni notas del cliente", async () => {
        const { json } = await put("o1", order({ customerPhone: "5353551234", note: "dejar en la puerta" }));
        expect(json.customerPhone).toBeUndefined();
        expect(json.note).toBeUndefined();
        expect(JSON.stringify(store.dump())).not.toContain("5353551234");
      });

      it("guarda el código y el negocio del cliente si vienen (la facturadora los usa para buscarlo)", async () => {
        const { json } = await put("o1", order({ customerCode: "AB1001", businessName: "Kiosco El Sol" }));
        expect(json).toMatchObject({ customerCode: "AB1001", businessName: "Kiosco El Sol" });
        const listed = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(listed.json.sellers[0].orders[0]).toMatchObject({ customerCode: "AB1001", businessName: "Kiosco El Sol" });
      });

      it("sin ellos, el pedido no lleva esos campos", async () => {
        const { json } = await put("o1", order());
        expect(json.customerCode).toBeUndefined();
        expect(json.businessName).toBeUndefined();
      });

      it("ponerle el código a un pedido ya confirmado no lo reabre ni lo marca modificado", async () => {
        await put("o1", order());
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } });
        clock = "2026-10-30T16:00:00.000Z";
        const { json } = await put("o1", order({ customerCode: "AB1001" }));
        expect(json).toMatchObject({ status: "confirmado", rev: 1, modified: false, customerCode: "AB1001", confirmedBy: "facturadora" });
        const again = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(again.json.sellers[0].orders[0]).toMatchObject({ customerCode: "AB1001", status: "confirmado" });
      });

      it("recorta lo muy largo e ignora lo que no es texto", async () => {
        const { json } = await put("o1", order({ customerCode: "X".repeat(100), businessName: 42 }));
        expect(json.customerCode).toHaveLength(40);
        expect(json.businessName).toBeUndefined();
      });

      it("un pedido de otro vendedor no se toca (403)", async () => {
        await put("o1", order());
        expect((await put("o1", order({ total: 1 }), "tok-marta")).status).toBe(403);
      });

      it("valida lo que llega (400 con el motivo)", async () => {
        const bad = async (over, expected) => {
          const { status, json } = await put("o9", order(over));
          expect(status).toBe(400);
          expect(json.error).toMatch(expected);
        };
        await bad({ customerName: "  " }, /cliente/i);
        await bad({ date: "30/10/2026" }, /fecha/i);
        await bad({ lines: [] }, /productos/i);
        await bad({ lines: [{ code: "P500", name: "x", qty: 0, unitPrice: 1 }] }, /cantidad/i);
        await bad({ lines: [{ code: "P500", name: "x", qty: 1, unitPrice: -5 }] }, /precio/i);
        await bad({ total: "mucho" }, /total/i);
        expect((await put("id con espacios", order())).status).toBe(400);
      });

      it("un cuerpo que no es JSON: 400", async () => {
        const response = await handleRequest(
          new Request("https://buzon.test/orders/o1", { method: "PUT", headers: { Authorization: "Bearer tok-carlos" }, body: "no json" }),
          { store, users, now: () => clock },
        );
        expect(response.status).toBe(400);
      });
    });

    describe("eliminar y confirmar a mano (vendedor)", () => {
      it("DELETE lo marca cancelado; otro vendedor no puede; uno que no existe da 404", async () => {
        await put("o1", order());
        expect((await call("DELETE", "/orders/o1", { token: "tok-marta" })).status).toBe(403);
        const { status, json } = await call("DELETE", "/orders/o1", { token: "tok-carlos" });
        expect(status).toBe(200);
        expect(json).toMatchObject({ id: "o1", status: "cancelado" });
        expect((await call("DELETE", "/orders/nada", { token: "tok-carlos" })).status).toBe(404);
      });

      it("un pedido cancelado revive si el vendedor lo vuelve a subir", async () => {
        await put("o1", order());
        await call("DELETE", "/orders/o1", { token: "tok-carlos" });
        const { json } = await put("o1", order());
        expect(json).toMatchObject({ status: "pendiente", modified: false });
        expect(json.rev).toBe(3);
      });

      it("el vendedor puede confirmar a mano y sale de lo pendiente", async () => {
        await put("o1", order());
        const { status, json } = await call("POST", "/orders/o1/confirm", { token: "tok-carlos" });
        expect(status).toBe(200);
        expect(json).toMatchObject({ status: "confirmado", confirmedBy: "vendedor" });
      });

      it("confirmar a mano uno ya confirmado por la facturadora no cambia quién lo confirmó", async () => {
        await put("o1", order());
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } });
        const { json } = await call("POST", "/orders/o1/confirm", { token: "tok-carlos" });
        expect(json.confirmedBy).toBe("facturadora");
      });
    });

    describe("el vendedor mira qué cambió (GET /orders/status)", () => {
      it("solo sus pedidos y solo lo cambiado desde 'since'", async () => {
        await put("o1", order());
        await put("o2", order({ customerName: "Beto" }), "tok-marta");
        clock = "2026-10-30T16:00:00.000Z";
        await put("o3", order({ customerName: "Luis" }));
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } });

        const all = await call("GET", "/orders/status", { token: "tok-carlos" });
        expect(all.json.now).toBe(clock);
        expect(all.json.orders.map((o) => o.id).sort()).toEqual(["o1", "o3"]);

        const since = await call("GET", `/orders/status?since=${encodeURIComponent("2026-10-30T15:30:00.000Z")}`, { token: "tok-carlos" });
        expect(since.json.orders.map((o) => o.id).sort()).toEqual(["o1", "o3"]);
        const later = await call("GET", `/orders/status?since=${encodeURIComponent("2026-10-30T16:00:00.000Z")}`, { token: "tok-carlos" });
        expect(later.json.orders).toEqual([]);
      });

      it("cada fila trae lo mínimo: estado, revisión y quién confirmó", async () => {
        await put("o1", order());
        clock = "2026-10-30T15:30:00.000Z";
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } });
        const { json } = await call("GET", "/orders/status", { token: "tok-carlos" });
        expect(json.orders[0]).toEqual({
          id: "o1", status: "confirmado", rev: 1, modified: false, confirmedAt: clock, confirmedBy: "facturadora", updatedAt: clock,
        });
      });
    });

    describe("la facturadora ve los pedidos por vendedor (GET /orders)", () => {
      beforeEach(async () => {
        await put("o1", order());
        await put("o2", order({ customerName: "Beto Ruiz", date: "2026-10-29" }));
        await put("o3", order({ customerName: "Rosa" }), "tok-marta");
        await put("o4", order({ customerName: "Cancelado" }));
        await call("DELETE", "/orders/o4", { token: "tok-carlos" });
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o2"] } });
      });

      it("agrupa por vendedor con sus contadores, sin los cancelados", async () => {
        const { status, json } = await call("GET", "/orders?desde=2026-10-01", { token: "tok-fact" });
        expect(status).toBe(200);
        const carlos = json.sellers.find((s) => s.id === "carlos");
        expect(carlos).toMatchObject({ name: "Carlos Pérez", pending: 1, confirmed: 1 });
        expect(carlos.orders.map((o) => o.id)).toEqual(["o1", "o2"]); // más reciente primero
        expect(json.sellers.find((s) => s.id === "marta")).toMatchObject({ pending: 1, confirmed: 0 });
        expect(json.now).toBe(NOW);
      });

      it("un vendedor sin pedidos igual aparece", async () => {
        store = makeStore();
        const { json } = await call("GET", "/orders?desde=2026-10-01", { token: "tok-fact" });
        expect(json.sellers.map((s) => [s.id, s.pending])).toEqual([["carlos", 0], ["marta", 0]]);
      });

      it("'desde' deja fuera lo anterior", async () => {
        const { json } = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(json.sellers.find((s) => s.id === "carlos").orders.map((o) => o.id)).toEqual(["o1"]);
      });

      it("sin 'desde' muestra los últimos 7 días", async () => {
        await put("o5", order({ customerName: "Viejo", date: "2026-10-10" }));
        const { json } = await call("GET", "/orders", { token: "tok-fact" });
        expect(json.sellers.find((s) => s.id === "carlos").orders.map((o) => o.id)).toEqual(["o1", "o2"]);
      });

      it("cada pedido trae lo que ella necesita ver", async () => {
        const { json } = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(json.sellers[0].orders[0]).toMatchObject({
          id: "o1", customerName: "Ana López", total: 7200, status: "pendiente", modified: false, rev: 1,
        });
        expect(json.sellers[0].orders[0].lines[0]).toEqual({ code: "P500", name: "Parranda 500ml", qty: 40, unitPrice: 120 });
      });
    });

    describe("el 👍 de la facturadora", () => {
      beforeEach(async () => {
        await put("o1", order());
        await put("o2", order({ customerName: "Beto" }));
      });

      it("confirma varios a la vez y avisa de los que no existen", async () => {
        clock = "2026-10-30T15:45:00.000Z";
        const { status, json } = await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1", "o2", "nada"] } });
        expect(status).toBe(200);
        expect(json.confirmed.sort()).toEqual(["o1", "o2"]);
        expect(json.missing).toEqual(["nada"]);
        const o1 = (await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" })).json.sellers[0].orders.find((o) => o.id === "o1");
        expect(o1).toMatchObject({ status: "confirmado", confirmedBy: "facturadora", confirmedAt: clock, modified: false });
      });

      it("no confirma pedidos cancelados", async () => {
        await call("DELETE", "/orders/o1", { token: "tok-carlos" });
        const { json } = await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } });
        expect(json.confirmed).toEqual([]);
        expect(json.missing).toEqual(["o1"]);
      });

      it("deshacer vuelve a pendiente, solo lo que confirmó ella", async () => {
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } });
        await call("POST", "/orders/o2/confirm", { token: "tok-carlos" }); // a mano, no es de ella
        clock = "2026-10-30T15:50:00.000Z";
        const { json } = await call("POST", "/orders/unconfirm", { token: "tok-fact", body: { ids: ["o1", "o2"] } });
        expect(json.unconfirmed).toEqual(["o1"]);
        expect(json.missing).toEqual(["o2"]);
        const status = (await call("GET", "/orders/status", { token: "tok-carlos" })).json.orders.find((o) => o.id === "o1");
        expect(status).toMatchObject({ status: "pendiente", confirmedAt: null, confirmedBy: null, updatedAt: clock });
      });

      it("pide una lista de ids", async () => {
        expect((await call("POST", "/orders/confirm", { token: "tok-fact", body: {} })).status).toBe(400);
        expect((await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: "o1" } })).status).toBe(400);
      });
    });

    // El administrador (rol "admin", del secreto USERS) maneja la lista de vendedores:
    // nombres, activos/desactivados y sus códigos. Lo que crea o cambia vive en la base
    // y se junta con los vendedores del secreto (lo de la base gana).
    describe("administración de vendedores (rol admin)", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const listed = async () => (await admin("GET", "/vendors")).json;
      const vendorOf = async (id) => (await listed()).vendors.find((v) => v.id === id);

      it("solo el administrador entra: los demás roles reciben 403 y sin código 401", async () => {
        expect((await call("GET", "/admin/vendors")).status).toBe(401);
        for (const token of ["tok-carlos", "tok-fact"]) {
          expect((await call("GET", "/admin/vendors", { token })).status).toBe(403);
          expect((await call("POST", "/admin/vendors", { token, body: { name: "Nuevo" } })).status).toBe(403);
        }
        expect((await call("GET", "/orders", { token: "tok-admin" })).status).toBe(403);
        expect((await call("GET", "/me", { token: "tok-admin" })).json).toEqual({ id: "admin", name: "Administrador", role: "admin" });
      });

      it("lista a los vendedores con su código y de dónde vienen, y la facturadora con el suyo", async () => {
        const { status, json } = await admin("GET", "/vendors");
        expect(status).toBe(200);
        expect(json.vendors.map((v) => [v.id, v.name, v.active, v.source])).toEqual([
          ["carlos", "Carlos Pérez", true, "secret"],
          ["marta", "Marta Díaz", true, "secret"],
        ]);
        expect(json.vendors[0].token).toBe("tok-carlos");
        expect(json.facturadora).toEqual({ id: "fact", name: "Facturadora", token: "tok-fact" });
      });

      it("agrega un vendedor: nombre, código nuevo, activo; ya puede subir pedidos y la facturadora lo ve", async () => {
        const { status, json } = await admin("POST", "/vendors", { name: "  Lorenzo  " });
        expect(status).toBe(200);
        expect(json).toMatchObject({ id: "lorenzo", name: "Lorenzo", active: true, source: "db" });
        expect(json.token).toMatch(/^tok-nuevo-000001/);
        expect((await call("GET", "/me", { token: json.token })).json).toMatchObject({ id: "lorenzo", role: "vendedor" });
        expect((await put("o1", order(), json.token)).status).toBe(200);
        const seen = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(seen.json.sellers.map((s) => s.name)).toContain("Lorenzo");
        expect(seen.json.sellers.find((s) => s.id === "lorenzo").orders).toHaveLength(1);
      });

      it("un vendedor sin pedidos aparece igual en la lista de la facturadora", async () => {
        await admin("POST", "/vendors", { name: "Eddy" });
        const seen = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(seen.json.sellers.find((s) => s.id === "eddy")).toMatchObject({ pending: 0, confirmed: 0, orders: [] });
      });

      it("no deja nombres vacíos, larguísimos ni repetidos (sin importar tildes ni mayúsculas)", async () => {
        expect((await admin("POST", "/vendors", { name: "   " })).status).toBe(400);
        expect((await admin("POST", "/vendors", {})).status).toBe(400);
        expect((await admin("POST", "/vendors", { name: "x".repeat(41) })).status).toBe(400);
        expect((await admin("POST", "/vendors", { name: "carlos pérez" })).status).toBe(409);
        await admin("POST", "/vendors", { name: "José" });
        expect((await admin("POST", "/vendors", { name: "JOSE" })).status).toBe(409);
      });

      it("el id no choca con el de otros usuarios (por ejemplo 'Facturadora' o 'Admin')", async () => {
        const first = await admin("POST", "/vendors", { name: "Admin" });
        expect(first.json.id).toBe("admin-2");
        const second = await admin("POST", "/vendors", { name: "Fact" });
        expect(second.json.id).toBe("fact-2");
      });

      it("cambiar el nombre conserva el id, el código y los pedidos", async () => {
        await put("o1", order());
        const { status, json } = await admin("PUT", "/vendors/carlos", { name: "Carlos Pérez Díaz" });
        expect(status).toBe(200);
        expect(json).toMatchObject({ id: "carlos", name: "Carlos Pérez Díaz", token: "tok-carlos", active: true, source: "db" });
        expect((await call("GET", "/me", { token: "tok-carlos" })).json.name).toBe("Carlos Pérez Díaz");
        const seen = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(seen.json.sellers.find((s) => s.id === "carlos")).toMatchObject({ name: "Carlos Pérez Díaz", pending: 1 });
        expect((await listed()).vendors.filter((v) => v.id === "carlos")).toHaveLength(1);
      });

      it("no deja renombrar a uno con el nombre de otro, ni con un nombre vacío", async () => {
        expect((await admin("PUT", "/vendors/carlos", { name: "Marta Díaz" })).status).toBe(409);
        expect((await admin("PUT", "/vendors/carlos", { name: " " })).status).toBe(400);
        expect((await vendorOf("carlos")).name).toBe("Carlos Pérez");
      });

      it("renombrarse a sí mismo con otras mayúsculas sí se permite", async () => {
        expect((await admin("PUT", "/vendors/carlos", { name: "CARLOS PÉREZ" })).status).toBe(200);
      });

      it("desactivar: su código deja de servir y sale de la lista de la facturadora; reactivar lo devuelve", async () => {
        expect((await admin("PUT", "/vendors/marta", { active: false })).json).toMatchObject({ active: false });
        expect((await call("GET", "/me", { token: "tok-marta" })).status).toBe(401);
        expect((await put("o2", order(), "tok-marta")).status).toBe(401);
        let seen = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(seen.json.sellers.map((s) => s.id)).toEqual(["carlos"]);
        expect((await vendorOf("marta")).active).toBe(false);

        await admin("PUT", "/vendors/marta", { active: true });
        expect((await call("GET", "/me", { token: "tok-marta" })).status).toBe(200);
        seen = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(seen.json.sellers.map((s) => s.id)).toEqual(["carlos", "marta"]);
      });

      it("regenerar el enlace: el código viejo deja de servir y el nuevo sí (nombre y pedidos igual)", async () => {
        await put("o1", order());
        const { status, json } = await admin("POST", "/vendors/carlos/regenerate");
        expect(status).toBe(200);
        expect(json.token).toMatch(/^tok-nuevo-000001/);
        expect(json.token).not.toBe("tok-carlos");
        expect((await call("GET", "/me", { token: "tok-carlos" })).status).toBe(401);
        expect((await call("GET", "/me", { token: json.token })).json.name).toBe("Carlos Pérez");
        const seen = await call("GET", "/orders?desde=2026-10-30", { token: "tok-fact" });
        expect(seen.json.sellers.find((s) => s.id === "carlos").orders).toHaveLength(1);
      });

      it("el código regenerado se mantiene al leer la lista otra vez", async () => {
        const { json } = await admin("POST", "/vendors/marta/regenerate");
        expect((await vendorOf("marta")).token).toBe(json.token);
      });

      it("un id que no existe (o que no es de un vendedor) da 404", async () => {
        expect((await admin("PUT", "/vendors/nadie", { name: "X" })).status).toBe(404);
        expect((await admin("POST", "/vendors/nadie/regenerate")).status).toBe(404);
        expect((await admin("PUT", "/vendors/fact", { name: "X" })).status).toBe(404);
        expect((await admin("POST", "/vendors/admin/regenerate")).status).toBe(404);
      });

      it("un cuerpo que no es JSON: 400", async () => {
        const response = await handleRequest(
          new Request("https://buzon.test/admin/vendors", { method: "POST", headers: { Authorization: "Bearer tok-admin" }, body: "no json" }),
          { store, users, now: () => clock },
        );
        expect(response.status).toBe(400);
      });

      it("la lista queda por orden alfabético, con los de la base mezclados con los del secreto", async () => {
        await admin("POST", "/vendors", { name: "Álvaro" });
        await admin("POST", "/vendors", { name: "Zoila" });
        expect((await listed()).vendors.map((v) => v.name)).toEqual(["Álvaro", "Carlos Pérez", "Marta Díaz", "Zoila"]);
      });

      it("CORS: el sitio de administración recibe sus cabeceras", async () => {
        const { headers } = await call("GET", "/admin/vendors", { token: "tok-admin", origin: ORIGIN });
        expect(headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
      });
    });

    describe("cuentas de facturación y supervisión (usuario y contraseña)", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const ROLES = ["facturacion", "supervision", "administrador"];
      // Crea o cambia "la" cuenta de ese rol (la primera que haya).
      const setAccount = async (slug, body) => {
        if (!ROLES.includes(slug)) return admin("PUT", `/accounts/${slug}`, body);
        const existing = (await admin("GET", "/accounts")).json.cuentas.find((c) => c.rol === slug);
        return existing ? admin("PUT", `/accounts/${existing.id}`, body) : admin("POST", "/accounts", { rol: slug, ...body });
      };
      const login = (usuario, clave) => call("POST", "/login", { body: { usuario, clave } });
      const later = (ms) => new Date(new Date(NOW).getTime() + ms).toISOString();

      it("al principio no hay cuentas; solo el administrador las ve y las cambia", async () => {
        expect((await admin("GET", "/accounts")).json).toEqual({ cuentas: [] });
        expect((await call("GET", "/admin/accounts")).status).toBe(401);
        for (const token of ["tok-carlos", "tok-fact"]) {
          expect((await call("GET", "/admin/accounts", { token })).status).toBe(403);
          expect((await call("POST", "/admin/accounts", { token, body: { rol: "facturacion", usuario: "maria", clave: "clave-12345" } })).status).toBe(403);
          expect((await call("PUT", "/admin/accounts/cualquiera", { token, body: { activo: false } })).status).toBe(403);
        }
      });

      it("crea la cuenta de facturación y la de supervisión, sin devolver nunca la contraseña", async () => {
        const created = await setAccount("facturacion", { usuario: "Maria.Fact", clave: "clave-de-maria" });
        expect(created.status).toBe(200);
        expect(created.json).toEqual({ id: expect.any(String), rol: "facturacion", usuario: "Maria.Fact", activo: true });
        expect((await setAccount("supervision", { usuario: "supervisor1", clave: "otra-clave-9" })).json).toMatchObject({ rol: "supervision", usuario: "supervisor1", activo: true });
        expect((await admin("GET", "/accounts")).json.cuentas.map((c) => [c.rol, c.usuario, c.activo])).toEqual([
          ["facturacion", "Maria.Fact", true],
          ["supervision", "supervisor1", true],
        ]);
        expect(JSON.stringify((await admin("GET", "/accounts")).json)).not.toContain("clave");
      });

      it("la contraseña no queda guardada tal cual (solo su huella)", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-de-maria" });
        const [account] = JSON.parse(await store.getSetting("cuentas"));
        expect(JSON.stringify(account)).not.toContain("clave-de-maria");
        expect(account.hash).toBeTruthy();
        expect(account.salt).toBeTruthy();
      });

      it("valida usuario y contraseña (400 con el motivo)", async () => {
        const bad = async (body, text) => {
          const r = await setAccount("facturacion", body);
          expect(r.status).toBe(400);
          expect(r.json.error).toMatch(text);
        };
        await bad({ clave: "clave-12345" }, /usuario/i);
        await bad({ usuario: "ab", clave: "clave-12345" }, /usuario/i);
        await bad({ usuario: "con espacios", clave: "clave-12345" }, /usuario/i);
        await bad({ usuario: "a".repeat(41), clave: "clave-12345" }, /usuario/i);
        await bad({ usuario: "maria" }, /contraseña/i);
        await bad({ usuario: "maria", clave: "corta" }, /contraseña/i);
        await bad({ usuario: "maria", clave: "x".repeat(101) }, /contraseña/i);
      });

      it("el usuario no se puede repetir entre las dos cuentas (sin importar mayúsculas ni tildes)", async () => {
        await setAccount("facturacion", { usuario: "María", clave: "clave-12345" });
        const dup = await setAccount("supervision", { usuario: "maria", clave: "clave-67890" });
        expect(dup.status).toBe(409);
      });

      it("una cuenta que no existe: 404", async () => {
        expect((await setAccount("otra", { usuario: "maria", clave: "clave-12345" })).status).toBe(404);
      });

      it("al cambiar solo el usuario o solo la contraseña, lo demás se conserva", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        expect((await setAccount("facturacion", { usuario: "maria2" })).json).toMatchObject({ usuario: "maria2", activo: true });
        expect((await login("maria2", "clave-12345")).status).toBe(200);
        await setAccount("facturacion", { clave: "nueva-clave-1" });
        expect((await login("maria2", "clave-12345")).status).toBe(401);
        expect((await login("maria2", "nueva-clave-1")).status).toBe(200);
      });

      it("entrar con usuario y contraseña da una sesión con su rol (sin importar mayúsculas ni espacios en el usuario)", async () => {
        await setAccount("facturacion", { usuario: "Maria", clave: "clave-12345" });
        const { status, json } = await login("  maRIA ", "clave-12345");
        expect(status).toBe(200);
        expect(json.role).toBe("facturadora");
        expect(json.name).toBe("Maria");
        expect(json.token.length).toBeGreaterThan(10);
        expect((await call("GET", "/me", { token: json.token })).json).toMatchObject({ name: "Maria", role: "facturadora" });
      });

      it("usuario o contraseña mal: 401 con el mismo mensaje y sin sesión", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        const wrongPass = await login("maria", "clave-incorrecta");
        const wrongUser = await login("nadie", "clave-12345");
        expect(wrongPass.status).toBe(401);
        expect(wrongUser.status).toBe(401);
        expect(wrongPass.json).toEqual(wrongUser.json);
        expect(wrongPass.json.token).toBeUndefined();
        expect((await login("maria", "")).status).toBe(401);
        expect((await call("POST", "/login", { body: {} })).status).toBe(401);
      });

      it("la sesión de facturación hace todo lo de la facturadora", async () => {
        await put("o1", order());
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        const { token } = (await login("maria", "clave-12345")).json;
        expect((await call("GET", "/orders?desde=2026-10-01", { token })).status).toBe(200);
        expect((await call("POST", "/orders/confirm", { token, body: { ids: ["o1"] } })).json.confirmed).toEqual(["o1"]);
        expect((await call("POST", "/orders/unconfirm", { token, body: { ids: ["o1"] } })).json.unconfirmed).toEqual(["o1"]);
        expect((await call("GET", "/admin/accounts", { token })).status).toBe(403);
        expect((await put("o2", order(), token)).status).toBe(403);
      });

      it("la supervisión solo mira: ve los pedidos con sus estados y nada más", async () => {
        await put("o1", order());
        await put("o2", order({ customerName: "Beto" }));
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o2"] } });
        await setAccount("supervision", { usuario: "super", clave: "clave-12345" });
        const { token, role } = (await login("super", "clave-12345")).json;
        expect(role).toBe("supervisor");
        const list = await call("GET", "/orders?desde=2026-10-01", { token });
        expect(list.status).toBe(200);
        const carlos = list.json.sellers.find((s) => s.id === "carlos");
        expect([carlos.pending, carlos.confirmed]).toEqual([1, 1]);
        expect(carlos.orders.map((o) => [o.id, o.status]).sort()).toEqual([["o1", "pendiente"], ["o2", "confirmado"]]);

        expect((await call("POST", "/orders/confirm", { token, body: { ids: ["o1"] } })).status).toBe(403);
        expect((await call("POST", "/orders/unconfirm", { token, body: { ids: ["o2"] } })).status).toBe(403);
        expect((await put("o3", order(), token)).status).toBe(403);
        expect((await call("DELETE", "/orders/o1", { token })).status).toBe(403);
        expect((await call("GET", "/orders/status", { token })).status).toBe(403);
        expect((await call("GET", "/admin/accounts", { token })).status).toBe(403);
        expect((await call("GET", "/admin/vendors", { token })).status).toBe(403);
        const after = await call("GET", "/orders?desde=2026-10-01", { token: "tok-fact" });
        expect(after.json.sellers.find((s) => s.id === "carlos").confirmed).toBe(1);
      });

      it("tras 5 intentos fallidos se bloquea 5 minutos (429), aunque acierte; después vuelve a servir", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        for (let i = 0; i < 5; i += 1) expect((await login("maria", "mal-mal-mal")).status).toBe(401);
        expect((await login("maria", "clave-12345")).status).toBe(429);
        clock = later(4 * 60 * 1000);
        expect((await login("maria", "clave-12345")).status).toBe(429);
        clock = later(5 * 60 * 1000 + 1000);
        expect((await login("maria", "clave-12345")).status).toBe(200);
      });

      it("un acierto borra los fallos anteriores", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        for (let i = 0; i < 4; i += 1) await login("maria", "mal-mal-mal");
        expect((await login("maria", "clave-12345")).status).toBe(200);
        for (let i = 0; i < 4; i += 1) expect((await login("maria", "mal-mal-mal")).status).toBe(401);
        expect((await login("maria", "clave-12345")).status).toBe(200);
      });

      it("cambiar la contraseña cierra las sesiones abiertas y quita el bloqueo", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        const { token } = (await login("maria", "clave-12345")).json;
        expect((await call("GET", "/me", { token })).status).toBe(200);
        for (let i = 0; i < 5; i += 1) await login("maria", "mal-mal-mal");
        await setAccount("facturacion", { clave: "nueva-clave-1" });
        expect((await call("GET", "/me", { token })).status).toBe(401);
        expect((await login("maria", "nueva-clave-1")).status).toBe(200);
      });

      it("desactivar la cuenta cierra las sesiones y no deja entrar; reactivar la devuelve", async () => {
        await setAccount("supervision", { usuario: "super", clave: "clave-12345" });
        const { token } = (await login("super", "clave-12345")).json;
        expect((await setAccount("supervision", { activo: false })).json).toMatchObject({ usuario: "super", activo: false });
        expect((await call("GET", "/orders", { token })).status).toBe(401);
        expect((await login("super", "clave-12345")).status).toBe(401);
        await setAccount("supervision", { activo: true });
        expect((await login("super", "clave-12345")).status).toBe(200);
      });

      it("una sesión vence a las 24 horas", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        const { token } = (await login("maria", "clave-12345")).json;
        clock = later(23 * 60 * 60 * 1000);
        expect((await call("GET", "/me", { token })).status).toBe(200);
        clock = later(25 * 60 * 60 * 1000);
        expect((await call("GET", "/me", { token })).status).toBe(401);
      });

      it("con una cuenta de facturación creada, el código viejo de la facturadora deja de servir", async () => {
        expect((await call("GET", "/me", { token: "tok-fact" })).status).toBe(200);
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        expect((await call("GET", "/me", { token: "tok-fact" })).status).toBe(401);
        expect((await call("GET", "/me", { token: "tok-carlos" })).status).toBe(200);
      });

      it("la lista de vendedores del administrador ya no muestra a la facturadora vieja cuando hay cuenta nueva", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        expect((await admin("GET", "/vendors")).json.facturadora).toBeNull();
      });

      it("CORS: el sitio recibe sus cabeceras al entrar", async () => {
        await setAccount("facturacion", { usuario: "maria", clave: "clave-12345" });
        const r = await call("POST", "/login", { body: { usuario: "maria", clave: "clave-12345" }, origin: ORIGIN });
        expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
      });
    });

    // Varias cuentas por rol y contraseña para el administrador (el administrador crea los usuarios).
    describe("usuarios: varias cuentas y administrador con contraseña", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const create = (rol, usuario, clave = "clave-12345") => admin("POST", "/accounts", { rol, usuario, clave });
      const login = (usuario, clave = "clave-12345") => call("POST", "/login", { body: { usuario, clave } });

      it("se pueden crear varias cuentas del mismo rol, y cada una entra con lo suyo", async () => {
        const maria = await create("facturacion", "maria");
        const ana = await create("facturacion", "ana", "otra-clave-77");
        expect([maria.status, ana.status]).toEqual([200, 200]);
        expect(maria.json.id).not.toBe(ana.json.id);
        expect((await admin("GET", "/accounts")).json.cuentas.map((c) => c.usuario)).toEqual(["maria", "ana"]);
        const m = await login("maria");
        const a = await login("ana", "otra-clave-77");
        expect([m.json.role, a.json.role]).toEqual(["facturadora", "facturadora"]);
        expect((await call("GET", "/me", { token: m.json.token })).json.name).toBe("maria");
        expect((await call("GET", "/me", { token: a.json.token })).json.name).toBe("ana");
        expect((await login("maria", "otra-clave-77")).status).toBe(401);
      });

      it("desactivar o cambiar la contraseña de una cuenta no cierra la sesión de las otras del mismo rol", async () => {
        const maria = (await create("facturacion", "maria")).json;
        const ana = (await create("facturacion", "ana")).json;
        const m = (await login("maria")).json.token;
        const a = (await login("ana")).json.token;
        await admin("PUT", `/accounts/${maria.id}`, { activo: false });
        expect((await call("GET", "/me", { token: m })).status).toBe(401);
        expect((await call("GET", "/me", { token: a })).status).toBe(200);
        await admin("PUT", `/accounts/${ana.id}`, { clave: "nueva-clave-1" });
        expect((await call("GET", "/me", { token: a })).status).toBe(401);
        expect((await login("ana", "nueva-clave-1")).status).toBe(200);
      });

      it("también de supervisión, y cada rol hace lo suyo", async () => {
        await create("supervision", "super1");
        await create("supervision", "super2");
        const { token, role } = (await login("super2")).json;
        expect(role).toBe("supervisor");
        expect((await call("GET", "/orders?desde=2026-10-01", { token })).status).toBe(200);
        expect((await call("POST", "/orders/confirm", { token, body: { ids: [] } })).status).toBe(403);
      });

      it("el administrador se puede crear con usuario y contraseña, y entra a su sitio con ellos", async () => {
        const created = await create("administrador", "raul", "mi-clave-admin");
        expect(created.json).toMatchObject({ rol: "administrador", usuario: "raul", activo: true });
        const session = await login("raul", "mi-clave-admin");
        expect(session.status).toBe(200);
        expect(session.json.role).toBe("admin");
        const token = session.json.token;
        expect((await call("GET", "/admin/vendors", { token })).status).toBe(200);
        expect((await call("GET", "/admin/accounts", { token })).json.cuentas).toHaveLength(1);
        expect((await call("POST", "/admin/vendors", { token, body: { name: "Nuevo" } })).status).toBe(200);
        expect((await call("GET", "/orders/status", { token })).status).toBe(403);
      });

      it("el enlace del administrador sigue sirviendo aunque tenga contraseña", async () => {
        await create("administrador", "raul", "mi-clave-admin");
        expect((await call("GET", "/me", { token: "tok-admin" })).status).toBe(200);
        expect((await admin("GET", "/accounts")).status).toBe(200);
      });

      it("una cuenta de administrador desactivada no entra y su sesión se cierra", async () => {
        const raul = (await create("administrador", "raul")).json;
        const token = (await login("raul")).json.token;
        await admin("PUT", `/accounts/${raul.id}`, { activo: false });
        expect((await call("GET", "/admin/vendors", { token })).status).toBe(401);
        expect((await login("raul")).status).toBe(401);
      });

      it("rol que no existe: 400; usuario repetido (en cualquier rol): 409; falta usuario o contraseña: 400", async () => {
        expect((await create("jefe", "maria")).status).toBe(400);
        expect((await call("POST", "/admin/accounts", { token: "tok-admin", body: { usuario: "maria", clave: "clave-12345" } })).status).toBe(400);
        await create("facturacion", "María");
        expect((await create("supervision", "maria")).status).toBe(409);
        expect((await create("administrador", "MARIA")).status).toBe(409);
        expect((await create("facturacion", "ab")).status).toBe(400);
        expect((await create("facturacion", "otra", "corta")).status).toBe(400);
        expect((await call("POST", "/admin/accounts", { token: "tok-admin" })).status).toBe(400);
      });

      it("cambiar el usuario de una cuenta no puede chocar con el de otra", async () => {
        await create("facturacion", "maria");
        const ana = (await create("facturacion", "ana")).json;
        expect((await admin("PUT", `/accounts/${ana.id}`, { usuario: "Maria" })).status).toBe(409);
        expect((await admin("PUT", `/accounts/${ana.id}`, { usuario: "ana2" })).json.usuario).toBe("ana2");
      });

      it("una cuenta que no existe: 404", async () => {
        expect((await admin("PUT", "/accounts/no-existe", { activo: false })).status).toBe(404);
      });

      it("las cuentas de facturación y supervisión que ya existían (una por rol) se conservan y siguen entrando", async () => {
        const { salt, hash } = await hashPassword("clave-vieja-1");
        await store.putAccount({
          role: "facturadora", username: "Tania", usernameKey: "tania", salt, hash, active: true, failCount: 0, lockedUntil: null, createdAt: NOW, updatedAt: NOW,
        });
        const listed = (await admin("GET", "/accounts")).json.cuentas;
        expect(listed).toEqual([{ id: "facturadora", rol: "facturacion", usuario: "Tania", activo: true }]);
        expect((await login("tania", "clave-vieja-1")).json.role).toBe("facturadora");
        await create("facturacion", "maria");
        expect((await login("tania", "clave-vieja-1")).status).toBe(200);
        expect((await admin("GET", "/accounts")).json.cuentas.map((c) => c.usuario)).toEqual(["Tania", "maria"]);
      });
    });

    // Cierre de facturación del día: pasada esa hora el vendedor ya no envía pedidos de hoy (sí de otro
    // día, y puede borrarlos o pasarlos para mañana). Es aparte del horario del sitio, que lo pausa todo.
    // Hora del sitio: el administrador elige la zona horaria en la que trabajan el horario, el cierre del
    // día y el contador de ventas (por defecto, la de Cuba).
    describe("hora del sitio", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const setZona = (zona) => admin("PUT", "/zona", { zona });
      const VIERNES_11AM = "2026-10-30T15:00:00.000Z";

      it("al principio es la de Cuba; solo el administrador la ve y la cambia", async () => {
        clock = VIERNES_11AM;
        const r = await admin("GET", "/zona");
        expect(r.json).toMatchObject({ zona: "America/Havana", etiqueta: "Cuba (La Habana)", ahora: "11:00" });
        expect(r.json.zonas[0]).toEqual({ id: "America/Havana", label: "Cuba (La Habana)" });
        expect(r.json.zonas.length).toBeGreaterThan(5);
        expect((await call("GET", "/admin/zona")).status).toBe(401);
        for (const token of ["tok-carlos", "tok-fact"]) {
          expect((await call("GET", "/admin/zona", { token })).status).toBe(403);
          expect((await call("PUT", "/admin/zona", { token, body: { zona: "Europe/Madrid" } })).status).toBe(403);
        }
      });

      it("el administrador elige otra zona y queda guardada, con la hora de allí", async () => {
        clock = VIERNES_11AM;
        const saved = await setZona("Europe/Madrid");
        expect(saved.status).toBe(200);
        expect(saved.json).toMatchObject({ zona: "Europe/Madrid", etiqueta: "España (Madrid)", ahora: "16:00" });
        expect((await admin("GET", "/zona")).json.zona).toBe("Europe/Madrid");
      });

      it("rechaza una zona que no está en la lista (400)", async () => {
        for (const bad of ["Mars/Olympus", "", 5]) {
          const r = await setZona(bad);
          expect(r.status).toBe(400);
          expect(r.json.error).toBeTruthy();
        }
        expect((await call("PUT", "/admin/zona", { token: "tok-admin" })).status).toBe(400);
      });

      it("el horario y el cierre del día se cuentan en la zona elegida", async () => {
        clock = VIERNES_11AM;
        await admin("PUT", "/cierre", { activo: true, hora: "15:30" });
        await admin("PUT", "/schedule", { activo: true, abre: "09:00", cierra: "17:00" });
        expect((await put("o1", order())).status).toBe(200); // 11:00 en Cuba: abierto y antes del cierre
        await setZona("Europe/Madrid"); // 16:00 allí: ya pasó el cierre de las 15:30
        const r = await put("o2", order());
        expect(r.status).toBe(409);
        expect(r.json.error).toContain("3:30 p. m.");
        expect((await admin("GET", "/cierre")).json.cerrado).toBe(true);
        expect((await admin("GET", "/schedule")).json.abierto).toBe(true); // 16:00 sigue dentro de 9 a 17
      });

      it("el día de hoy del cierre y del resumen es el de la zona elegida", async () => {
        clock = "2026-10-30T23:30:00.000Z"; // 19:30 del 30 en Cuba; 00:30 del 31 en Madrid
        expect((await call("GET", "/summary", { token: "tok-admin" })).json.fecha).toBe("2026-10-30");
        await setZona("Europe/Madrid");
        expect((await call("GET", "/summary", { token: "tok-admin" })).json.fecha).toBe("2026-10-31");
      });

      it("la lista del vendedor trae la zona, para que la app cuente la hora igual", async () => {
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).json.zona).toBe("America/Havana");
        await setZona("Europe/Madrid");
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).json.zona).toBe("Europe/Madrid");
      });
    });

    describe("hora del sitio puesta a mano", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const setZona = (body) => admin("PUT", "/zona", body);
      const VIERNES_11AM = "2026-10-30T15:00:00.000Z"; // 11:00 en Cuba

      it("al principio no hay ajuste", async () => {
        clock = VIERNES_11AM;
        expect((await admin("GET", "/zona")).json).toMatchObject({ manual: false, ajuste: 0, ahora: "11:00" });
      });

      it("el administrador pone la hora de ahora a mano y el buzón guarda la diferencia", async () => {
        clock = VIERNES_11AM;
        const r = await setZona({ manual: "12:30" });
        expect(r.status).toBe(200);
        expect(r.json).toMatchObject({ zona: "America/Havana", manual: true, ajuste: 90, ahora: "12:30" });
        expect((await admin("GET", "/zona")).json).toMatchObject({ manual: true, ajuste: 90, ahora: "12:30" });
      });

      it("el ajuste sigue valiendo con el paso del tiempo", async () => {
        clock = VIERNES_11AM;
        await setZona({ manual: "12:30" });
        clock = "2026-10-30T16:00:00.000Z"; // una hora después
        expect((await admin("GET", "/zona")).json).toMatchObject({ ajuste: 90, ahora: "13:30" });
      });

      it("volver a la hora automática (manual: null) quita el ajuste", async () => {
        clock = VIERNES_11AM;
        await setZona({ manual: "12:30" });
        const r = await setZona({ manual: null });
        expect(r.json).toMatchObject({ manual: false, ajuste: 0, ahora: "11:00" });
      });

      it("valida la hora (400 con el motivo)", async () => {
        for (const bad of ["9:00", "25:00", "xx", 5]) {
          const r = await setZona({ manual: bad });
          expect(r.status).toBe(400);
          expect(r.json.error).toBeTruthy();
        }
      });

      it("cambiar de zona sin poner hora quita el ajuste; poner zona y hora a la vez lo calcula en esa zona", async () => {
        clock = VIERNES_11AM;
        await setZona({ manual: "12:30" });
        expect((await setZona({ zona: "Europe/Madrid" })).json).toMatchObject({ zona: "Europe/Madrid", manual: false, ajuste: 0, ahora: "16:00" });
        expect((await setZona({ zona: "Europe/Madrid", manual: "16:20" })).json).toMatchObject({ zona: "Europe/Madrid", ajuste: 20, ahora: "16:20" });
      });

      it("el cierre del día y el horario usan la hora puesta a mano", async () => {
        clock = VIERNES_11AM;
        await admin("PUT", "/cierre", { activo: true, hora: "11:30" });
        expect((await put("o1", order())).status).toBe(200); // 11:00: todavía abierto
        await setZona({ manual: "12:00" }); // ahora son las 12:00 en el sitio: ya pasó el cierre
        expect((await put("o2", order())).status).toBe(409);
        expect((await admin("GET", "/cierre")).json.cerrado).toBe(true);
        await admin("PUT", "/schedule", { activo: true, abre: "12:30", cierra: "15:00" });
        expect((await put("o3", order({ date: "2026-10-31" }))).status).toBe(423); // 12:00 todavía no abre
      });

      it("el día de hoy del resumen sigue la hora puesta a mano", async () => {
        clock = "2026-10-30T23:30:00.000Z"; // 19:30 en Cuba
        expect((await call("GET", "/summary", { token: "tok-admin" })).json.fecha).toBe("2026-10-30");
        await setZona({ manual: "00:30" }); // en el sitio ya es el día siguiente
        expect((await call("GET", "/summary", { token: "tok-admin" })).json.fecha).toBe("2026-10-31");
      });

      it("la lista del vendedor trae el ajuste, para que la app cuente la hora igual", async () => {
        clock = VIERNES_11AM;
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).json.ajuste).toBe(0);
        await setZona({ manual: "12:30" });
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).json.ajuste).toBe(90);
      });

      it("solo el administrador puede ponerla", async () => {
        for (const token of ["tok-carlos", "tok-fact"]) {
          expect((await call("PUT", "/admin/zona", { token, body: { manual: "12:00" } })).status).toBe(403);
        }
      });
    });

    // Un pedido que el vendedor envió ANTES del cierre debe llegar aunque la subida se demore (mala señal,
    // cola): la app dice cuándo hizo el cambio (enviadoEn) y su hora al subirlo (ahora); el buzón cuenta
    // el cierre en el momento en que se envió, sin fiarse del reloj del teléfono.
    describe("cierre de facturación: pedidos enviados antes del cierre que llegan tarde", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const VIERNES_9AM = "2026-10-30T13:00:00.000Z"; // 09:00 en Cuba
      const VIERNES_11AM = "2026-10-30T15:00:00.000Z"; // 11:00 en Cuba
      const lateOrder = (waitMs, over = {}) => {
        const now = new Date(clock).getTime();
        return order({ enviadoEn: new Date(now - waitMs).toISOString(), ahora: new Date(now).toISOString(), ...over });
      };

      beforeEach(async () => {
        clock = VIERNES_9AM;
        await admin("PUT", "/cierre", { activo: true, hora: "10:00" });
      });

      it("llega a las 11:00 un pedido que se envió a las 9:30: se acepta", async () => {
        clock = VIERNES_11AM;
        expect((await put("o1", lateOrder(90 * 60000))).status).toBe(200);
      });

      it("llega a las 11:00 un pedido que se envió a las 10:30: se rechaza (ya había cerrado)", async () => {
        clock = VIERNES_11AM;
        const r = await put("o1", lateOrder(30 * 60000));
        expect(r.status).toBe(409);
        expect(r.json.error).toContain("10:00 a. m.");
      });

      it("sin esos datos se cuenta la hora en que llega, como siempre", async () => {
        clock = VIERNES_11AM;
        expect((await put("o1", order())).status).toBe(409);
      });

      it("datos mal escritos se ignoran (se cuenta la hora en que llega)", async () => {
        clock = VIERNES_11AM;
        expect((await put("o1", order({ enviadoEn: "ayer", ahora: "hoy" }))).status).toBe(409);
        expect((await put("o2", order({ enviadoEn: 5, ahora: null }))).status).toBe(409);
      });

      it("una espera imposible (negativa o de más de 12 horas) no abre la puerta", async () => {
        clock = VIERNES_11AM;
        const now = new Date(clock).getTime();
        expect((await put("o1", order({ enviadoEn: new Date(now + 3600000).toISOString(), ahora: new Date(now).toISOString() }))).status).toBe(409);
        expect((await put("o2", lateOrder(13 * 3600000))).status).toBe(409);
      });

      it("un cambio hecho después del cierre se rechaza aunque el pedido ya estuviera en la nube", async () => {
        clock = VIERNES_9AM;
        await put("o1", order());
        clock = VIERNES_11AM;
        expect((await put("o1", lateOrder(60000, { total: 9999 }))).status).toBe(409);
      });

      it("también vale para pedidos de otro día y con el cierre apagado (no cambian)", async () => {
        clock = VIERNES_11AM;
        expect((await put("o1", lateOrder(30 * 60000, { date: "2026-10-31" }))).status).toBe(200);
        await admin("PUT", "/cierre", { activo: false });
        expect((await put("o2", lateOrder(30 * 60000))).status).toBe(200);
      });
    });

    // Después de la hora de cierre del día (la que pone el administrador), el tablero de la facturadora pasa
    // al siguiente día de trabajo: lo de hoy se limpia y van apareciendo los pedidos de mañana.
    describe("el día de trabajo de la facturadora", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const VIERNES_9AM = "2026-10-30T13:00:00.000Z"; // 09:00 en Cuba
      const VIERNES_11AM = "2026-10-30T15:00:00.000Z"; // 11:00 en Cuba
      const SABADO_11AM = "2026-10-31T15:00:00.000Z"; // 11:00 en Cuba
      const list = (token = "tok-fact") => call("GET", "/orders?desde=2026-10-01", { token });

      it("sin cierre el día de trabajo es hoy, a cualquier hora", async () => {
        clock = VIERNES_11AM;
        expect((await list()).json).toMatchObject({ hoy: "2026-10-30", dia: "2026-10-30" });
      });

      it("con el cierre puesto y antes de la hora, sigue siendo hoy", async () => {
        clock = VIERNES_9AM;
        await admin("PUT", "/cierre", { activo: true, hora: "10:00" });
        expect((await list()).json).toMatchObject({ hoy: "2026-10-30", dia: "2026-10-30" });
      });

      it("pasada la hora de cierre pasa a mañana (hoy sigue siendo hoy)", async () => {
        clock = VIERNES_9AM;
        await admin("PUT", "/cierre", { activo: true, hora: "10:00" });
        clock = VIERNES_11AM;
        expect((await list()).json).toMatchObject({ hoy: "2026-10-30", dia: "2026-10-31" });
      });

      it("el sábado, pasada la hora, salta el domingo y va al lunes", async () => {
        clock = SABADO_11AM;
        await admin("PUT", "/cierre", { activo: true, hora: "10:00" });
        expect((await list()).json).toMatchObject({ hoy: "2026-10-31", dia: "2026-11-02" });
      });

      it("con el cierre apagado vuelve a ser hoy", async () => {
        clock = VIERNES_11AM;
        await admin("PUT", "/cierre", { activo: true, hora: "10:00" });
        await admin("PUT", "/cierre", { activo: false });
        expect((await list()).json.dia).toBe("2026-10-30");
      });

      it("cuenta la hora del sitio (zona y hora puesta a mano)", async () => {
        clock = VIERNES_11AM;
        await admin("PUT", "/cierre", { activo: true, hora: "11:30" });
        expect((await list()).json.dia).toBe("2026-10-30");
        await admin("PUT", "/zona", { manual: "12:00" }); // ahora son las 12:00 en el sitio
        expect((await list()).json.dia).toBe("2026-10-31");
      });

      it("la supervisión ve el mismo día de trabajo", async () => {
        clock = VIERNES_9AM;
        await admin("PUT", "/cierre", { activo: true, hora: "10:00" });
        await admin("POST", "/accounts", { rol: "supervision", usuario: "super", clave: "clave-12345" });
        const { token } = (await call("POST", "/login", { body: { usuario: "super", clave: "clave-12345" } })).json;
        clock = VIERNES_11AM;
        expect((await list(token)).json).toMatchObject({ hoy: "2026-10-30", dia: "2026-10-31" });
      });
    });

    describe("cierre de facturación del día", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const setCierre = (body) => admin("PUT", "/cierre", body);
      const VIERNES_7AM = "2026-10-30T11:00:00.000Z";
      const VIERNES_11AM = "2026-10-30T15:00:00.000Z";
      const MENSAJE = "La facturación de hoy cerró a las 10:00 a. m. Pasa el pedido para mañana.";

      it("al principio no hay cierre; solo el administrador lo ve y lo cambia", async () => {
        expect((await admin("GET", "/cierre")).json).toEqual({ activo: false, hora: "15:00", cerrado: false, mensaje: "" });
        expect((await call("GET", "/admin/cierre")).status).toBe(401);
        for (const token of ["tok-carlos", "tok-fact"]) {
          expect((await call("GET", "/admin/cierre", { token })).status).toBe(403);
          expect((await call("PUT", "/admin/cierre", { token, body: { activo: true, hora: "10:00" } })).status).toBe(403);
        }
      });

      it("el administrador lo activa con una hora y queda guardado; se puede cambiar una sola cosa", async () => {
        clock = VIERNES_7AM;
        expect((await setCierre({ activo: true, hora: "10:00" })).json).toEqual({ activo: true, hora: "10:00", cerrado: false, mensaje: "" });
        expect((await setCierre({ hora: "11:30" })).json).toMatchObject({ activo: true, hora: "11:30" });
        expect((await setCierre({ activo: false })).json).toMatchObject({ activo: false, hora: "11:30" });
        expect((await admin("GET", "/cierre")).json).toMatchObject({ activo: false, hora: "11:30" });
      });

      it("valida la hora (400 con el motivo)", async () => {
        for (const bad of [{ hora: "9:00" }, { hora: "25:00" }, { activo: "si" }]) {
          const r = await setCierre({ activo: true, hora: "10:00", ...bad });
          expect(r.status).toBe(400);
          expect(r.json.error).toBeTruthy();
        }
        expect((await call("PUT", "/admin/cierre", { token: "tok-admin" })).status).toBe(400);
      });

      it("pasada la hora no se envían pedidos de hoy (409 con el motivo), pero antes sí", async () => {
        await setCierre({ activo: true, hora: "10:00" });
        clock = VIERNES_7AM;
        expect((await put("o1", order())).status).toBe(200);
        clock = VIERNES_11AM;
        const closed = await put("o2", order());
        expect(closed.status).toBe(409);
        expect(closed.json.error).toBe(MENSAJE);
      });

      it("pasada la hora tampoco se cambia un pedido de hoy que ya estaba en la nube", async () => {
        clock = VIERNES_7AM;
        await put("o1", order());
        await setCierre({ activo: true, hora: "10:00" });
        clock = VIERNES_11AM;
        expect((await put("o1", order({ total: 9999 }))).status).toBe(409);
      });

      it("pasada la hora sí se pueden enviar pedidos de otro día", async () => {
        await setCierre({ activo: true, hora: "10:00" });
        clock = VIERNES_11AM;
        expect((await put("o3", order({ date: "2026-10-31" }))).status).toBe(200);
      });

      it("pasada la hora el vendedor puede borrar y confirmar a mano, y la facturadora confirmar", async () => {
        clock = VIERNES_7AM;
        await put("o1", order());
        await put("o2", order({ customerName: "Beto Ruiz" }));
        await setCierre({ activo: true, hora: "10:00" });
        clock = VIERNES_11AM;
        expect((await call("POST", "/orders/o1/confirm", { token: "tok-carlos" })).status).toBe(200);
        expect((await call("DELETE", "/orders/o2", { token: "tok-carlos" })).status).toBe(200);
        expect((await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } })).status).toBe(200);
      });

      it("con el cierre apagado se envía a cualquier hora", async () => {
        await setCierre({ activo: false, hora: "10:00" });
        clock = VIERNES_11AM;
        expect((await put("o1", order())).status).toBe(200);
      });

      it("si el sitio está pausado por el horario, manda el 423 del horario", async () => {
        await setCierre({ activo: true, hora: "10:00" });
        await admin("PUT", "/schedule", { activo: true, abre: "12:00", cierra: "15:00" });
        clock = VIERNES_11AM;
        expect((await put("o1", order())).status).toBe(423);
      });

      it("la lista del vendedor trae el cierre, para avisarle antes de enviar", async () => {
        await setCierre({ activo: true, hora: "10:00" });
        clock = VIERNES_7AM;
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).json.cierre).toEqual({ activo: true, hora: "10:00", cerrado: false, mensaje: "" });
        clock = VIERNES_11AM;
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).json.cierre).toEqual({ activo: true, hora: "10:00", cerrado: true, mensaje: MENSAJE });
      });

      it("CORS: el sitio recibe sus cabeceras al ser rechazado por el cierre", async () => {
        await setCierre({ activo: true, hora: "10:00" });
        clock = VIERNES_11AM;
        const r = await call("PUT", "/orders/o1", { token: "tok-carlos", body: order(), origin: ORIGIN });
        expect(r.status).toBe(409);
        expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
      });
    });

    describe("horario de facturación", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const setSchedule = (body) => admin("PUT", "/schedule", body);
      const VIERNES_7AM = "2026-10-30T11:00:00.000Z";
      const VIERNES_11AM = "2026-10-30T15:00:00.000Z";
      const DOMINGO_10AM = "2026-11-01T15:00:00.000Z";

      it("al principio no hay horario: siempre abierto; solo el administrador lo ve y lo cambia", async () => {
        expect((await admin("GET", "/schedule")).json).toEqual({ activo: false, abre: "09:00", cierra: "15:00", abierto: true, mensaje: "" });
        expect((await call("GET", "/admin/schedule")).status).toBe(401);
        for (const token of ["tok-carlos", "tok-fact"]) {
          expect((await call("GET", "/admin/schedule", { token })).status).toBe(403);
          expect((await call("PUT", "/admin/schedule", { token, body: { activo: true, abre: "09:00", cierra: "15:00" } })).status).toBe(403);
        }
      });

      it("el administrador lo activa con apertura y cierre, y queda guardado", async () => {
        clock = VIERNES_11AM;
        const saved = await setSchedule({ activo: true, abre: "08:30", cierra: "16:00" });
        expect(saved.status).toBe(200);
        expect(saved.json).toEqual({ activo: true, abre: "08:30", cierra: "16:00", abierto: true, mensaje: "" });
        expect((await admin("GET", "/schedule")).json).toMatchObject({ activo: true, abre: "08:30", cierra: "16:00" });
      });

      it("se puede cambiar solo una cosa: lo demás se conserva", async () => {
        await setSchedule({ activo: true, abre: "08:30", cierra: "16:00" });
        expect((await setSchedule({ activo: false })).json).toMatchObject({ activo: false, abre: "08:30", cierra: "16:00" });
        expect((await setSchedule({ cierra: "17:00" })).json).toMatchObject({ activo: false, abre: "08:30", cierra: "17:00" });
      });

      it("valida las horas (400 con el motivo)", async () => {
        for (const bad of [{ abre: "9:00" }, { cierra: "25:00" }, { abre: "16:00", cierra: "15:00" }, { activo: "si" }]) {
          const r = await setSchedule({ activo: true, abre: "09:00", cierra: "15:00", ...bad });
          expect(r.status).toBe(400);
          expect(r.json.error).toBeTruthy();
        }
        expect((await call("PUT", "/admin/schedule", { token: "tok-admin" })).status).toBe(400);
      });

      it("fuera de horario el vendedor no puede enviar ni borrar ni confirmar a mano (423 con el motivo)", async () => {
        clock = VIERNES_11AM;
        await put("o1", order());
        await setSchedule({ activo: true, abre: "09:00", cierra: "15:00" });
        clock = VIERNES_7AM;
        const closed = await put("o2", order());
        expect(closed.status).toBe(423);
        expect(closed.json.error).toBe("La facturación está cerrada. Abre hoy a las 9:00 a. m.");
        expect((await call("DELETE", "/orders/o1", { token: "tok-carlos" })).status).toBe(423);
        expect((await call("POST", "/orders/o1/confirm", { token: "tok-carlos" })).status).toBe(423);
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).status).toBe(200);
      });

      it("fuera de horario la facturadora no puede confirmar ni deshacer, pero sí ver", async () => {
        clock = VIERNES_11AM;
        await put("o1", order());
        await setSchedule({ activo: true, abre: "09:00", cierra: "15:00" });
        clock = VIERNES_7AM;
        expect((await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } })).status).toBe(423);
        expect((await call("POST", "/orders/unconfirm", { token: "tok-fact", body: { ids: ["o1"] } })).status).toBe(423);
        const list = await call("GET", "/orders?desde=2026-10-01", { token: "tok-fact" });
        expect(list.status).toBe(200);
        expect(list.json.sellers.find((s) => s.id === "carlos").pending).toBe(1);
      });

      it("dentro del horario todo funciona", async () => {
        await setSchedule({ activo: true, abre: "09:00", cierra: "15:00" });
        clock = VIERNES_11AM;
        expect((await put("o1", order())).status).toBe(200);
        expect((await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o1"] } })).status).toBe(200);
      });

      it("el domingo está cerrado", async () => {
        await setSchedule({ activo: true, abre: "09:00", cierra: "15:00" });
        clock = DOMINGO_10AM;
        const r = await put("o1", order());
        expect(r.status).toBe(423);
        expect(r.json.error).toContain("domingo");
      });

      it("con el horario apagado, abre a cualquier hora (también el domingo)", async () => {
        await setSchedule({ activo: false, abre: "09:00", cierra: "15:00" });
        clock = DOMINGO_10AM;
        expect((await put("o1", order())).status).toBe(200);
      });

      it("el administrador sigue pudiendo trabajar con el sitio cerrado", async () => {
        await setSchedule({ activo: true, abre: "09:00", cierra: "15:00" });
        clock = DOMINGO_10AM;
        expect((await admin("GET", "/vendors")).status).toBe(200);
        expect((await admin("POST", "/vendors", { name: "Nuevo" })).status).toBe(200);
        expect((await setSchedule({ activo: false })).status).toBe(200);
      });

      it("las listas traen cómo está el horario, para avisar en las pantallas", async () => {
        await setSchedule({ activo: true, abre: "09:00", cierra: "15:00" });
        clock = VIERNES_7AM;
        const fact = await call("GET", "/orders?desde=2026-10-01", { token: "tok-fact" });
        expect(fact.json.horario).toEqual({ activo: true, abre: "09:00", cierra: "15:00", abierto: false, mensaje: "La facturación está cerrada. Abre hoy a las 9:00 a. m." });
        const vendor = await call("GET", "/orders/status", { token: "tok-carlos" });
        expect(vendor.json.horario.abierto).toBe(false);
        clock = VIERNES_11AM;
        expect((await call("GET", "/orders/status", { token: "tok-carlos" })).json.horario).toMatchObject({ abierto: true, mensaje: "" });
      });

      it("sin horario, las listas dicen que está abierto", async () => {
        const vendor = await call("GET", "/orders/status", { token: "tok-carlos" });
        expect(vendor.json.horario).toMatchObject({ activo: false, abierto: true });
      });

      it("CORS: el sitio recibe sus cabeceras al leer y al ser rechazado por horario", async () => {
        await setSchedule({ activo: true, abre: "09:00", cierra: "15:00" });
        clock = VIERNES_7AM;
        const r = await call("PUT", "/orders/o1", { token: "tok-carlos", body: order(), origin: ORIGIN });
        expect(r.status).toBe(423);
        expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
      });
    });

    describe("resumen de ventas por día (admin y supervisión)", () => {
      const admin = (method, path, body) => call(method, `/admin${path}`, { token: "tok-admin", body });
      const summary = (query, token = "tok-admin") => call("GET", `/summary${query}`, { token });
      const line = (code, name, qty) => ({ code, name, qty, unitPrice: 100 });
      const P500 = (qty) => line("P500", "Parranda 500ml", qty);
      const M330 = (qty) => line("M330", "Malta 330ml", qty);

      beforeEach(async () => {
        await put("o1", order({ lines: [P500(40), M330(30)] }));
        await put("o2", order({ customerName: "Beto", lines: [P500(10)] }));
        await put("o3", order({ customerName: "Rosa", lines: [P500(5)] }), "tok-marta");
        await put("o4", order({ customerName: "Ayer", date: "2026-10-29", lines: [P500(99)] }));
        await put("o5", order({ customerName: "Cancelado", lines: [P500(77)] }));
        await call("DELETE", "/orders/o5", { token: "tok-carlos" });
        await call("POST", "/orders/confirm", { token: "tok-fact", body: { ids: ["o2"] } });
      });

      it("cuenta por vendedor y por producto lo enviado ese día (confirmado o no), sin cancelados ni otros días", async () => {
        const { status, json } = await summary("?fecha=2026-10-30");
        expect(status).toBe(200);
        expect(json.fecha).toBe("2026-10-30");
        expect(json.vendedores.map((v) => [v.id, v.pedidos, v.unidades])).toEqual([["carlos", 2, 80], ["marta", 1, 5]]);
        expect(json.vendedores[0].productos).toEqual([{ code: "P500", name: "Parranda 500ml", qty: 50 }, { code: "M330", name: "Malta 330ml", qty: 30 }]);
        expect(json.productos).toEqual([{ code: "P500", name: "Parranda 500ml", qty: 55 }, { code: "M330", name: "Malta 330ml", qty: 30 }]);
        expect(json.totales).toEqual({ pedidos: 3, unidades: 85 });
      });

      it("otro día cuenta solo lo de ese día", async () => {
        const { json } = await summary("?fecha=2026-10-29");
        expect(json.totales).toEqual({ pedidos: 1, unidades: 99 });
        expect(json.vendedores.find((v) => v.id === "carlos").productos).toEqual([{ code: "P500", name: "Parranda 500ml", qty: 99 }]);
      });

      it("un vendedor sin pedidos ese día aparece igual, en cero", async () => {
        const { json } = await summary("?fecha=2026-10-01");
        expect(json.vendedores.map((v) => [v.id, v.pedidos, v.unidades, v.productos])).toEqual([["carlos", 0, 0, []], ["marta", 0, 0, []]]);
        expect(json.productos).toEqual([]);
        expect(json.totales).toEqual({ pedidos: 0, unidades: 0 });
      });

      it("sin fecha usa el día de hoy (hora de Cuba)", async () => {
        const { json } = await summary("");
        expect(json.fecha).toBe("2026-10-30");
        expect(json.totales.pedidos).toBe(3);
      });

      it("una fecha mal escrita da 400", async () => {
        expect((await summary("?fecha=ayer")).status).toBe(400);
        expect((await summary("?fecha=2026-13-45")).status).toBe(400);
      });

      it("lo ven el administrador y la supervisión; la facturadora y los vendedores no", async () => {
        expect((await call("GET", "/summary")).status).toBe(401);
        expect((await summary("?fecha=2026-10-30", "tok-fact")).status).toBe(403);
        expect((await summary("?fecha=2026-10-30", "tok-carlos")).status).toBe(403);
        await admin("POST", "/accounts", { rol: "supervision", usuario: "super", clave: "clave-12345" });
        const { token } = (await call("POST", "/login", { body: { usuario: "super", clave: "clave-12345" } })).json;
        expect((await summary("?fecha=2026-10-30", token)).status).toBe(200);
      });

      it("un vendedor desactivado no sale en el resumen", async () => {
        await admin("PUT", "/vendors/marta", { active: false });
        const { json } = await summary("?fecha=2026-10-30");
        expect(json.vendedores.map((v) => v.id)).toEqual(["carlos"]);
      });

      it("el horario de facturación no tapa el resumen", async () => {
        await admin("PUT", "/schedule", { activo: true, abre: "09:00", cierra: "10:00" });
        clock = "2026-11-01T15:00:00.000Z";
        expect((await summary("?fecha=2026-10-30")).status).toBe(200);
      });
    });

    describe("limpieza", () => {
      it("al subir un pedido se borran los de más de 60 días", async () => {
        clock = "2026-08-01T10:00:00.000Z";
        await put("viejo", order({ date: "2026-08-01" }));
        clock = "2026-10-30T15:00:00.000Z";
        await put("o1", order());
        expect(store.dump().map((o) => o.id)).toEqual(["o1"]);
      });
    });

    describe("CORS", () => {
      it("el origen de la app recibe sus cabeceras", async () => {
        const { headers } = await call("GET", "/me", { token: "tok-carlos", origin: ORIGIN });
        expect(headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
        expect(headers.get("Vary")).toMatch(/Origin/);
      });

      it("localhost también (desarrollo)", async () => {
        const { headers } = await call("GET", "/me", { token: "tok-carlos", origin: "http://localhost:5173" });
        expect(headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
      });

      it("otro origen no recibe permiso", async () => {
        const { headers } = await call("GET", "/me", { token: "tok-carlos", origin: "https://malo.example" });
        expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
      });

      it("la consulta previa (OPTIONS) responde 204 con métodos y cabeceras", async () => {
        const { status, headers } = await call("OPTIONS", "/orders/o1", { origin: ORIGIN });
        expect(status).toBe(204);
        expect(headers.get("Access-Control-Allow-Methods")).toMatch(/PUT/);
        expect(headers.get("Access-Control-Allow-Headers")).toMatch(/Authorization/i);
      });
    });

  });
}
