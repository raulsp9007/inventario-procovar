import { describe, it, expect, beforeEach } from "vitest";
import { handleRequest } from "./api";

// Buzón de pedidos entre los vendedores y la facturadora (ver
// docs/superpowers/specs/2026-10-30-facturacion-nube-design.md).
// El vendedor manda el contenido del pedido; la facturadora manda el estado.

const NOW = "2026-10-30T15:00:00.000Z";
const ORIGIN = "https://raulsp9007.github.io";
const users = [
  { id: "carlos", name: "Carlos Pérez", role: "vendedor", token: "tok-carlos" },
  { id: "marta", name: "Marta Díaz", role: "vendedor", token: "tok-marta" },
  { id: "fact", name: "Facturadora", role: "facturadora", token: "tok-fact" },
];

export function apiSuite(label, makeStore) {
  describe(label, () => {
    let store;
    let clock;

    async function call(method, path, { token, body, origin } = {}) {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (origin) headers.Origin = origin;
      const response = await handleRequest(
        new Request(`https://buzon.test${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }),
        { store, users, now: () => clock },
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
