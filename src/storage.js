// Capa de guardado sobre localStorage. El estado de la app (JSON) se guarda
// comprimido cuando es grande -- gzip + base64, con el prefijo "gz1:" -- para
// que decenas de miles de movimientos quepan en el límite de ~5 MB de
// localStorage (en datos reales comprime ~6x). Lo guardado como JSON plano
// (versiones anteriores, datos chicos) se sigue leyendo siempre; los
// respaldos que se exportan son JSON normal, esto es solo cómo se guarda
// dentro del dispositivo.

export const COMPRESSED_PREFIX = "gz1:";
// Debajo de esto no vale la pena comprimir (y los datos de una instalación
// nueva quedan legibles a simple vista).
export const COMPRESS_MIN_CHARS = 50000;

export function isCompressed(stored) {
  return typeof stored === "string" && stored.startsWith(COMPRESSED_PREFIX);
}

function supportsCompression() {
  return typeof CompressionStream === "function"
    && typeof DecompressionStream === "function"
    && typeof btoa === "function"
    && typeof atob === "function";
}

// Pasa unos bytes por un CompressionStream/DecompressionStream y junta la
// salida. Se escribe y se lee a la vez (esperar la escritura antes de leer
// puede trabarse por contrapresión con datos grandes).
async function pipeThrough(bytes, stream) {
  const writer = stream.writable.getWriter();
  const writing = writer.write(bytes).then(() => writer.close());
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await writing;
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
  return out;
}

// btoa sobre un string binario enorme revienta la pila si se arma de una vez.
function toBase64(bytes) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gunzipBase64(base64) {
  const bytes = await pipeThrough(fromBase64(base64), new DecompressionStream("gzip"));
  return new TextDecoder().decode(bytes);
}

// JSON plano -> lo que se escribe en localStorage. Nunca lanza: ante
// cualquier duda (sin soporte, error, o que lo comprimido no vuelva
// idéntico) devuelve el texto plano, que siempre es válido.
export async function encodeForStorage(plain) {
  if (plain.length < COMPRESS_MIN_CHARS || !supportsCompression()) return plain;
  try {
    const gzipped = await pipeThrough(new TextEncoder().encode(plain), new CompressionStream("gzip"));
    const base64 = toBase64(gzipped);
    // Prueba de ida y vuelta: perder datos por un bug del códec es mucho
    // peor que ocupar más espacio.
    if ((await gunzipBase64(base64)) !== plain) return plain;
    return COMPRESSED_PREFIX + base64;
  } catch {
    return plain;
  }
}

// Lo guardado (comprimido o plano) -> JSON plano. Lanza si no se puede leer.
export async function decodeFromStorage(stored) {
  if (!isCompressed(stored)) return stored;
  if (!supportsCompression()) throw new Error("Este navegador no puede leer datos comprimidos.");
  return gunzipBase64(stored.slice(COMPRESSED_PREFIX.length));
}

export async function getData(key) {
  const raw = localStorage.getItem(key);
  return raw === null ? null : { value: raw };
}

// Los guardados van en cola, de a uno y en orden: comprimir tarda un poco, y
// sin esto un guardado viejo podía terminar DESPUÉS de uno nuevo y pisarlo.
let writeChain = Promise.resolve();

export function setData(key, value) {
  const run = async () => {
    localStorage.setItem(key, await encodeForStorage(value));
    return true;
  };
  const result = writeChain.then(run);
  writeChain = result.catch(() => {});
  return result;
}
