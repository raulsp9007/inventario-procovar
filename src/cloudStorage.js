// Lo de la nube de facturación se guarda aparte del estado de la app (y fuera de
// los respaldos): el código de enlace es un secreto y la cola es provisional.
//
// La app del vendedor y la página de la facturadora viven en el mismo sitio, así que
// comparten navegador: cada una guarda lo suyo en su propio "lugar" (scope) para que
// entrar a la página de la facturadora no pise el enlace del vendedor (ni al revés).

export const CLOUD_KEYS = {
  link: "procovar-nube-enlace",
  enabled: "procovar-nube-activo",
  map: "procovar-nube-mapa",
  queue: "procovar-nube-cola",
  since: "procovar-nube-desde",
  // Última lista que vio la facturadora ({ sellers, at }), para verla sin internet.
  data: "procovar-nube-datos",
};

// Los mismos datos, con otros nombres, para la página de la facturadora y la supervisión.
export const FACTURADORA_KEYS = {
  link: "procovar-fact-enlace",
  enabled: "procovar-fact-activo",
  map: "procovar-fact-mapa",
  queue: "procovar-fact-cola",
  since: "procovar-fact-desde",
  data: "procovar-fact-datos",
};

const keysFor = (scope) => (scope === "facturadora" ? FACTURADORA_KEYS : CLOUD_KEYS);

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la nube funciona esta sesión pero no recuerda nada.
  }
}

function readJson(key) {
  const raw = read(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const validLink = (link) => isObject(link) && typeof link.url === "string" && typeof link.token === "string";

// Antes la facturadora guardaba su sesión en el mismo lugar que el vendedor: si hay una
// de facturación o supervisión ahí, se la queda (y se mueve) en vez de pedir entrar otra vez.
function adoptLegacyFacturadoraLink() {
  const legacy = readJson(CLOUD_KEYS.link);
  if (!validLink(legacy) || (legacy.role !== "facturadora" && legacy.role !== "supervisor")) return undefined;
  write(FACTURADORA_KEYS.link, JSON.stringify(legacy));
  write(CLOUD_KEYS.link, null);
  return legacy;
}

// scope: "vendedor" (la app) o "facturadora" (la página de la facturadora y la supervisión).
export function loadCloud(scope = "vendedor") {
  const keys = keysFor(scope);
  let link = readJson(keys.link);
  if (scope === "facturadora" && !validLink(link)) link = adoptLegacyFacturadoraLink();
  // La app del vendedor solo acepta accesos de vendedor (sin rol = de una versión vieja).
  if (scope !== "facturadora" && isObject(link) && link.role && link.role !== "vendedor") link = undefined;
  const map = readJson(keys.map);
  const queue = readJson(keys.queue);
  const since = read(keys.since);
  const data = readJson(keys.data);
  return {
    link: validLink(link) ? link : null,
    enabled: read(keys.enabled) !== "0",
    map: isObject(map) ? map : {},
    queue: Array.isArray(queue) ? queue : [],
    since: typeof since === "string" ? since : "",
    data: isObject(data) && Array.isArray(data.sellers) ? data : null,
  };
}

// Guarda solo los datos que se pasan; el resto queda como estaba.
export function saveCloud(patch, scope = "vendedor") {
  const keys = keysFor(scope);
  if ("link" in patch) write(keys.link, patch.link ? JSON.stringify(patch.link) : null);
  if ("enabled" in patch) write(keys.enabled, patch.enabled ? "1" : "0");
  if ("map" in patch) write(keys.map, JSON.stringify(patch.map));
  if ("queue" in patch) write(keys.queue, JSON.stringify(patch.queue));
  if ("since" in patch) write(keys.since, patch.since || null);
  if ("data" in patch) write(keys.data, patch.data ? JSON.stringify(patch.data) : null);
}

export function clearCloud(scope = "vendedor") {
  Object.values(keysFor(scope)).forEach((key) => write(key, null));
}
