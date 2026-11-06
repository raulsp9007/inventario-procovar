// Cliente del buzón de facturación (worker/). Cada respuesta o fallo sale como
// datos o como CloudError con un tipo que la app sabe interpretar:
//   network   sin conexión o el buzón no responde
//   auth      el código ya no sirve (401)
//   forbidden esto no es para este usuario (403)
//   notfound  no existe (404)
//   invalid   el buzón rechazó los datos (400/409)
//   closed    fuera del horario de facturación (423): se pausa, se reintenta después
//   server    fallo del buzón (5xx u otra cosa)

export class CloudError extends Error {
  constructor(kind, status, message) {
    super(message);
    this.name = "CloudError";
    this.kind = kind;
    this.status = status;
  }
}

function kindForStatus(status) {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "notfound";
  if (status === 400 || status === 409) return "invalid";
  if (status === 423) return "closed";
  return "server";
}

const MESSAGES = {
  network: "No se pudo conectar con la nube.",
  auth: "El código de enlace ya no sirve.",
  server: "La nube tuvo un problema.",
};

// Cuánto se espera la respuesta del buzón: con mala señal una petición puede quedarse colgada
// minutos y trabar la cola de pedidos; pasado este tiempo se da por caída la conexión (y se reintenta).
const DEFAULT_TIMEOUT_MS = 15000;

export function createCloudApi({ url, token, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const base = String(url || "").replace(/\/+$/, "");
  const doFetch = fetchImpl || ((...args) => fetch(...args));

  async function request(method, path, body) {
    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (controller) controller.abort();
        reject(new CloudError("network", 0, MESSAGES.network));
      }, timeoutMs);
    });
    try {
      response = await Promise.race([
        doFetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, ...(controller ? { signal: controller.signal } : {}) }),
        timedOut,
      ]);
    } catch {
      throw new CloudError("network", 0, MESSAGES.network);
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const kind = kindForStatus(response.status);
      throw new CloudError(kind, response.status, (data && data.error) || MESSAGES[kind] || MESSAGES.server);
    }
    return data;
  }

  const enc = encodeURIComponent;
  return {
    me: () => request("GET", "/me"),
    // La hora del sitio (su zona y la corrección del administrador): la correcta para el día y las horas de cierre.
    time: () => request("GET", "/time"),
    // vendedor
    // `queuedAt`: cuándo hizo el vendedor el cambio (puede subirse más tarde, por la cola). Se manda junto con la
    // hora de la app al subirlo, para que el buzón cuente el cierre del día en el momento del envío.
    putOrder: (id, content, extra) => request("PUT", `/orders/${enc(id)}`, extra && extra.queuedAt ? { ...content, enviadoEn: extra.queuedAt, ahora: new Date().toISOString() } : content),
    // Varios pedidos de una vez: ops = [{ orderId, content, queuedAt }]. Cada pedido sale con su resultado.
    putOrders: (ops) => request("POST", "/orders/batch", {
      ahora: new Date().toISOString(),
      pedidos: ops.map((op) => ({ id: op.orderId, ...op.content, ...(op.queuedAt ? { enviadoEn: op.queuedAt } : {}) })),
    }),
    deleteOrder: (id) => request("DELETE", `/orders/${enc(id)}`),
    confirmOrder: (id) => request("POST", `/orders/${enc(id)}/confirm`),
    statusSince: (since) => request("GET", since ? `/orders/status?since=${enc(since)}` : "/orders/status"),
    // facturadora
    // `version`: la que ya tiene la página; si no cambió nada, el buzón contesta "sin cambios" (corto).
    listOrders: (desde, version) => {
      const query = [desde ? `desde=${enc(desde)}` : "", version ? `v=${enc(version)}` : ""].filter(Boolean).join("&");
      return request("GET", query ? `/orders?${query}` : "/orders");
    },
    confirmMany: (ids) => request("POST", "/orders/confirm", { ids }),
    unconfirmMany: (ids) => request("POST", "/orders/unconfirm", { ids }),
    // administrador (lista de vendedores)
    // Entrar con usuario y contraseña (facturación o supervisión): devuelve la sesión.
    login: (usuario, clave) => request("POST", "/login", { usuario, clave }),
    // Cuentas de facturación y supervisión (administrador).
    adminAccounts: () => request("GET", "/admin/accounts"),
    // Envíos del día (administrador): pedidos recibidos, los que tardaron y los envíos rechazados.
    adminEnvios: (fecha) => request("GET", fecha ? `/admin/envios?fecha=${enc(fecha)}` : "/admin/envios"),
    // Horario de facturación (administrador) y resumen de ventas de un día (administrador y supervisión).
    adminSchedule: () => request("GET", "/admin/schedule"),
    saveSchedule: (body) => request("PUT", "/admin/schedule", body),
    // Cierre de facturación del día (administrador): pasada la hora ya no se envían pedidos para hoy.
    // La hora del sitio (zona horaria del horario, del cierre y del resumen de ventas), del administrador.
    adminZona: () => request("GET", "/admin/zona"),
    saveZona: (body) => request("PUT", "/admin/zona", body),
    adminCierre: () => request("GET", "/admin/cierre"),
    saveCierre: (body) => request("PUT", "/admin/cierre", body),
    sales: (fecha) => request("GET", fecha ? `/summary?fecha=${enc(fecha)}` : "/summary"),
    // Usuarios con usuario y contraseña: crear uno ({ rol, usuario, clave }) o cambiar uno por su id.
    createAccount: (body) => request("POST", "/admin/accounts", body),
    updateAccount: (id, body) => request("PUT", `/admin/accounts/${enc(id)}`, body),
    adminVendors: () => request("GET", "/admin/vendors"),
    addVendor: (name) => request("POST", "/admin/vendors", { name }),
    updateVendor: (id, patch) => request("PUT", `/admin/vendors/${enc(id)}`, patch),
    regenerateVendor: (id) => request("POST", `/admin/vendors/${enc(id)}/regenerate`),
  };
}
