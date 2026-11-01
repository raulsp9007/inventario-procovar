import { describe, it, expect, vi } from "vitest";
import { createCloudApi, CloudError } from "./cloudApi";

// Cliente del buzón de facturación (worker/). Convierte cada respuesta o fallo
// en datos o en un CloudError con un tipo que la app sabe interpretar.

const URL_OK = "https://buzon.test";
const TOKEN = "tok-secreto-de-prueba-123";

function fakeFetch(response) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
      text: async () => (response.body === undefined ? "" : JSON.stringify(response.body)),
    };
  });
}

const api = (response) => {
  const fetchImpl = fakeFetch(response);
  return { fetchImpl, api: createCloudApi({ url: URL_OK, token: TOKEN, fetchImpl }) };
};

describe("createCloudApi: administración de vendedores", () => {
  it("lista, agrega, cambia y regenera con las rutas de /admin", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push([init.method, url.replace(URL_OK, ""), init.body ? JSON.parse(init.body) : undefined]);
      return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
    });
    const cloud = createCloudApi({ url: URL_OK, token: TOKEN, fetchImpl });
    await cloud.adminVendors();
    await cloud.addVendor("Lorenzo");
    await cloud.updateVendor("lorenzo", { name: "Lorenzo F.", active: false });
    await cloud.regenerateVendor("lorenzo");
    await cloud.regenerateVendor("a b");
    expect(calls).toEqual([
      ["GET", "/admin/vendors", undefined],
      ["POST", "/admin/vendors", { name: "Lorenzo" }],
      ["PUT", "/admin/vendors/lorenzo", { name: "Lorenzo F.", active: false }],
      ["POST", "/admin/vendors/lorenzo/regenerate", undefined],
      ["POST", "/admin/vendors/a%20b/regenerate", undefined],
    ]);
  });

  it("un nombre repetido (409) llega como error con el mensaje del buzón", async () => {
    const { api: cloud } = api({ status: 409, body: { error: "Ya hay un vendedor con ese nombre." } });
    await expect(cloud.addVendor("Raul")).rejects.toMatchObject({ status: 409, message: "Ya hay un vendedor con ese nombre." });
  });
});

describe("createCloudApi: peticiones", () => {
  it("me: GET /me con el código", async () => {
    const { api: cloud, fetchImpl } = api({ status: 200, body: { id: "carlos", name: "Carlos", role: "vendedor" } });
    expect(await cloud.me()).toEqual({ id: "carlos", name: "Carlos", role: "vendedor" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${URL_OK}/me`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("putOrder: PUT /orders/:id con el contenido en JSON", async () => {
    const { api: cloud, fetchImpl } = api({ status: 200, body: { id: "o 1", status: "pendiente" } });
    const content = { customerName: "Ana", date: "2026-10-30", total: 10, lines: [{ code: "P", name: "P", qty: 1, unitPrice: 10 }] };
    await cloud.putOrder("o 1", content);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${URL_OK}/orders/o%201`);
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(content);
  });

  it("deleteOrder, confirmOrder, statusSince, listOrders, confirmMany, unconfirmMany", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push([init.method, url.replace(URL_OK, ""), init.body ? JSON.parse(init.body) : undefined]);
      return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
    });
    const cloud = createCloudApi({ url: URL_OK, token: TOKEN, fetchImpl });
    await cloud.deleteOrder("o1");
    await cloud.confirmOrder("o1");
    await cloud.statusSince("2026-10-30T15:00:00.000Z");
    await cloud.statusSince("");
    await cloud.listOrders("2026-10-23");
    await cloud.confirmMany(["a", "b"]);
    await cloud.unconfirmMany(["a"]);
    expect(calls).toEqual([
      ["DELETE", "/orders/o1", undefined],
      ["POST", "/orders/o1/confirm", undefined],
      ["GET", "/orders/status?since=2026-10-30T15%3A00%3A00.000Z", undefined],
      ["GET", "/orders/status", undefined],
      ["GET", "/orders?desde=2026-10-23", undefined],
      ["POST", "/orders/confirm", { ids: ["a", "b"] }],
      ["POST", "/orders/unconfirm", { ids: ["a"] }],
    ]);
  });

  it("quita la barra final de la dirección", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: {} });
    await createCloudApi({ url: `${URL_OK}/`, token: TOKEN, fetchImpl }).me();
    expect(fetchImpl.mock.calls[0][0]).toBe(`${URL_OK}/me`);
  });
});

describe("createCloudApi: errores", () => {
  const kindOf = async (response) => {
    const { api: cloud } = api(response);
    try {
      await cloud.me();
    } catch (e) {
      expect(e).toBeInstanceOf(CloudError);
      return { kind: e.kind, status: e.status, message: e.message };
    }
    throw new Error("debía fallar");
  };

  it("sin conexión: network", async () => {
    expect(await kindOf(new TypeError("Failed to fetch"))).toMatchObject({ kind: "network" });
  });

  it("401: auth (el código ya no sirve)", async () => {
    expect(await kindOf({ status: 401, body: { error: "Código no válido." } })).toMatchObject({ kind: "auth", status: 401 });
  });

  it("403, 404, 400/409 y 5xx tienen su tipo y el mensaje del buzón", async () => {
    expect(await kindOf({ status: 403, body: { error: "Esto no es para tu usuario." } })).toMatchObject({ kind: "forbidden", message: "Esto no es para tu usuario." });
    expect(await kindOf({ status: 404, body: { error: "No existe ese pedido." } })).toMatchObject({ kind: "notfound" });
    expect(await kindOf({ status: 400, body: { error: "Falta el nombre del cliente." } })).toMatchObject({ kind: "invalid", message: "Falta el nombre del cliente." });
    expect(await kindOf({ status: 409, body: { error: "El pedido está cancelado." } })).toMatchObject({ kind: "invalid" });
    expect(await kindOf({ status: 500, body: { error: "El buzón no está bien configurado." } })).toMatchObject({ kind: "server" });
  });

  it("una respuesta que no es JSON no rompe: sale como error del servidor", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error("no json"); }, text: async () => "<html>" }));
    const cloud = createCloudApi({ url: URL_OK, token: TOKEN, fetchImpl });
    await expect(cloud.me()).rejects.toMatchObject({ kind: "server", status: 502 });
  });
});
