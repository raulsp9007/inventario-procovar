// Buzón local de desarrollo: la misma API del Worker (src/api.js) sobre un
// almacén en memoria, en http://localhost:8787. Sirve para probar las dos apps
// de punta a punta sin Cloudflare. Los usuarios y códigos son SOLO de demostración
// (se pierden al apagarlo); el buzón real usa el secreto USERS.
//
//   node scripts/dev-server.mjs
import http from "node:http";
import { handleRequest } from "../src/api.js";
import { createMemoryStore } from "../src/memoryStore.js";
import { buildLinks } from "../src/provision.js";

const PORT = Number(process.env.PORT) || 8787;
const URL_LOCAL = `http://localhost:${PORT}`;

export const demoUsers = [
  { id: "carlos", name: "Carlos Pérez", role: "vendedor", token: "demo-carlos-0123456789abcdef" },
  { id: "marta", name: "Marta Díaz", role: "vendedor", token: "demo-marta-0123456789abcdefg" },
  { id: "rosa", name: "Rosa Vega", role: "vendedor", token: "demo-rosa-0123456789abcdefgh" },
  { id: "facturadora", name: "Facturadora", role: "facturadora", token: "demo-factura-0123456789abcdef" },
  { id: "admin", name: "Administrador", role: "admin", token: "demo-admin-0123456789abcdefghi" },
];

const store = createMemoryStore();

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const hasBody = !["GET", "HEAD"].includes(req.method) && chunks.length > 0;
    const request = new Request(`${URL_LOCAL}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    const response = await handleRequest(request, { store, users: demoUsers, now: () => new Date().toISOString() });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e && e.message) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Buzón local en ${URL_LOCAL}`);
  buildLinks(demoUsers, URL_LOCAL).forEach((l) => console.log(`\n${l.name} (${l.role}):\n${l.code}`));
});
