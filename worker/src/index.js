// Entrada del Cloudflare Worker: arma el almacén (D1) y los usuarios (secreto
// USERS) y deja el resto a api.js.
import { handleRequest } from "./api";
import { createD1Store } from "./d1Store";
import { parseUsers } from "./users";

export default {
  async fetch(request, env) {
    const { users, errors } = parseUsers(env.USERS);
    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: "El buzón no está bien configurado.", detalles: errors }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return handleRequest(request, { store: createD1Store(env.DB), users, now: () => new Date().toISOString() });
  },
};
