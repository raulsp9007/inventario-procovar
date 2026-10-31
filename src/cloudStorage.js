// Lo de la nube de facturación se guarda aparte del estado de la app (y fuera de
// los respaldos): el código de enlace es un secreto y la cola es provisional.

export const CLOUD_KEYS = {
  link: "procovar-nube-enlace",
  enabled: "procovar-nube-activo",
  map: "procovar-nube-mapa",
  queue: "procovar-nube-cola",
  since: "procovar-nube-desde",
  // Última lista que vio la facturadora ({ sellers, at }), para verla sin internet.
  data: "procovar-nube-datos",
};

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

export function loadCloud() {
  const link = readJson(CLOUD_KEYS.link);
  const map = readJson(CLOUD_KEYS.map);
  const queue = readJson(CLOUD_KEYS.queue);
  const since = read(CLOUD_KEYS.since);
  const data = readJson(CLOUD_KEYS.data);
  return {
    link: isObject(link) && typeof link.url === "string" && typeof link.token === "string" ? link : null,
    enabled: read(CLOUD_KEYS.enabled) !== "0",
    map: isObject(map) ? map : {},
    queue: Array.isArray(queue) ? queue : [],
    since: typeof since === "string" ? since : "",
    data: isObject(data) && Array.isArray(data.sellers) ? data : null,
  };
}

// Guarda solo los datos que se pasan; el resto queda como estaba.
export function saveCloud(patch) {
  if ("link" in patch) write(CLOUD_KEYS.link, patch.link ? JSON.stringify(patch.link) : null);
  if ("enabled" in patch) write(CLOUD_KEYS.enabled, patch.enabled ? "1" : "0");
  if ("map" in patch) write(CLOUD_KEYS.map, JSON.stringify(patch.map));
  if ("queue" in patch) write(CLOUD_KEYS.queue, JSON.stringify(patch.queue));
  if ("since" in patch) write(CLOUD_KEYS.since, patch.since || null);
  if ("data" in patch) write(CLOUD_KEYS.data, patch.data ? JSON.stringify(patch.data) : null);
}

export function clearCloud() {
  Object.values(CLOUD_KEYS).forEach((key) => write(key, null));
}
