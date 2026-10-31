// Genera (o reutiliza) los usuarios del buzón y muestra lo que hay que pegar:
//   1) el secreto USERS (para `wrangler secret put USERS`)
//   2) con --url, el código de enlace de cada persona
//
// Uso (desde la carpeta worker/):
//   node scripts/provision.mjs --vendedores "Carlos Pérez,Marta Díaz" --facturadora "Facturadora"
//   node scripts/provision.mjs --url https://procovar-buzon.TU-CUENTA.workers.dev
//
// Los códigos se guardan en worker/.usuarios.secret.json (no se sube a git) para
// que la segunda ejecución reutilice los mismos y no cambie nada.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateUsers, buildLinks } from "../src/provision.js";
import { parseUsers } from "../src/users.js";

const FILE = fileURLToPath(new URL("../.usuarios.secret.json", import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let users;
if (existsSync(FILE)) {
  users = JSON.parse(readFileSync(FILE, "utf8"));
  const { errors } = parseUsers(JSON.stringify(users));
  if (errors.length > 0) {
    console.error(`El archivo ${FILE} no es válido:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`(Usando los códigos ya generados en ${FILE})\n`);
} else {
  const vendedores = (arg("vendedores") || "").split(",").map((n) => n.trim()).filter(Boolean);
  try {
    users = generateUsers({ vendedores, facturadora: arg("facturadora") || "Facturadora" });
  } catch (e) {
    console.error(`${e.message}\nEjemplo: node scripts/provision.mjs --vendedores "Carlos Pérez,Marta Díaz" --facturadora "Facturadora"`);
    process.exit(1);
  }
  writeFileSync(FILE, JSON.stringify(users, null, 2));
  console.log(`Códigos nuevos guardados en ${FILE} (no lo compartas ni lo subas a git).\n`);
}

console.log("== Secreto USERS (cópialo entero cuando `wrangler secret put USERS` te lo pida) ==");
console.log(JSON.stringify(users));

const url = arg("url");
if (url) {
  const site = arg("sitio") || "https://raulsp9007.github.io/inventario-procovar/facturadora.html";
  console.log("\n== Códigos de enlace (uno por persona; los vendedores lo pegan en Configuración) ==");
  buildLinks(users, url, site).forEach((l) => {
    console.log(`\n${l.name} (${l.role}):\n${l.code}`);
    if (l.siteLink) console.log(`\nEnlace personal del sitio (se lo mandas a ${l.name}; lo abre y queda entrada):\n${l.siteLink}`);
  });
} else {
  console.log("\nCuando despliegues el Worker, vuelve a correr con --url https://TU-WORKER.workers.dev para ver los códigos de enlace.");
}
