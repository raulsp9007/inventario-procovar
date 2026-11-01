// Cliente del buzón de facturación (worker/). Cada respuesta o fallo sale como
// datos o como CloudError con un tipo que la app sabe interpretar:
//   network   sin conexión o el buzón no responde
//   auth      el código ya no sirve (401)
//   forbidden esto no es para este usuario (403)
//   notfound  no existe (404)
//   invalid   el buzón rechazó los datos (400/409)
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
  return "server";
}

const MESSAGES = {
  network: "No se pudo conectar con la nube.",
  auth: "El código de enlace ya no sirve.",
  server: "La nube tuvo un problema.",
};

export function createCloudApi({ url, token, fetchImpl }) {
  const base = String(url || "").replace(/\/+$/, "");
  const doFetch = fetchImpl || ((...args) => fetch(...args));

  async function request(method, path, body) {
    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await doFetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new CloudError("network", 0, MESSAGES.network);
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
    // vendedor
    putOrder: (id, content) => request("PUT", `/orders/${enc(id)}`, content),
    deleteOrder: (id) => request("DELETE", `/orders/${enc(id)}`),
    confirmOrder: (id) => request("POST", `/orders/${enc(id)}/confirm`),
    statusSince: (since) => request("GET", since ? `/orders/status?since=${enc(since)}` : "/orders/status"),
    // facturadora
    listOrders: (desde) => request("GET", desde ? `/orders?desde=${enc(desde)}` : "/orders"),
    confirmMany: (ids) => request("POST", "/orders/confirm", { ids }),
    unconfirmMany: (ids) => request("POST", "/orders/unconfirm", { ids }),
    // administrador (lista de vendedores)
    // Entrar con usuario y contraseña (facturación o supervisión): devuelve la sesión.
    login: (usuario, clave) => request("POST", "/login", { usuario, clave }),
    // Cuentas de facturación y supervisión (administrador).
    adminAccounts: () => request("GET", "/admin/accounts"),
    saveAccount: (slug, body) => request("PUT", `/admin/accounts/${enc(slug)}`, body),
    adminVendors: () => request("GET", "/admin/vendors"),
    addVendor: (name) => request("POST", "/admin/vendors", { name }),
    updateVendor: (id, patch) => request("PUT", `/admin/vendors/${enc(id)}`, patch),
    regenerateVendor: (id) => request("POST", `/admin/vendors/${enc(id)}/regenerate`),
  };
}
