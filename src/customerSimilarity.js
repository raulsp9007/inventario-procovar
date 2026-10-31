// Clientes "parecidos": posibles duplicados dentro del registro. Cada par trae su
// nivel de confianza (alta, media, baja) y los motivos, para que la persona
// decida; esto nunca fusiona nada solo. Funciones puras.
//
//   alta   mismo código; o mismo teléfono con nombre parecido; o el mismo nombre
//          (otro orden, sin tildes, una inicial por el apellido, un error de una
//          letra); o un nombre contenido en otro con el mismo negocio o dirección.
//   media  mismo teléfono con nombres distintos; o un nombre contenido en otro.
//   baja   un solo nombre que está en otro ("Ana" y "Ana López"); o el mismo
//          negocio con nombres distintos.

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NAME_STOP = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "da", "do", "dos"]);
// Palabras de tipo de negocio: no sirven para decir que dos negocios son el mismo.
const BUSINESS_GENERIC = new Set([
  "kiosco", "kiosko", "cafeteria", "bar", "tienda", "bodega", "bodegon", "mini", "market", "minimarket", "restaurante", "restobar",
  "panaderia", "reposteria", "eventos", "discoteca", "mayorista", "minorista", "cantina", "puesto", "punto", "venta", "negocio",
  "local", "casa",
]);

const tokensOf = (text, ignore) => normalizeText(text).split(" ").filter((t) => t && !ignore.has(t));

function levenshteinAtMostOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (i === a.length && i === b.length) return true;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

// Dos palabras valen por la misma: iguales, una inicial de la otra, o con un error
// de una letra si son largas (`minTypoLength`: 5 normalmente; 4 cuando el teléfono,
// el negocio o la dirección ya apuntan a que es el mismo cliente).
function sameWord(a, b, minTypoLength) {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return (a.length === 1 ? b : a).startsWith(a.length === 1 ? a : b);
  return Math.min(a.length, b.length) >= minTypoLength && a[0] === b[0] && levenshteinAtMostOne(a, b);
}

// Cuántas palabras de la lista más corta tienen pareja (una a una) en la otra.
// Una inicial ("R." por "Ruiz") cuenta, pero solo si al menos una palabra
// completa coincide: una letra sola no basta para decir que dos nombres se parecen.
function matchedWords(a, b, minTypoLength = 5) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set();
  let matched = 0;
  let whole = 0;
  short.forEach((word) => {
    const at = long.findIndex((other, i) => !used.has(i) && sameWord(word, other, minTypoLength));
    if (at >= 0) {
      used.add(at);
      matched += 1;
      if (word.length > 1 && long[at].length > 1) whole += 1;
    }
  });
  return whole > 0 ? matched : 0;
}

const phoneKey = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
};

export const pairKey = (a, b) => [a.id, b.id].sort().join("|");

function prepare(customer) {
  return {
    customer,
    name: tokensOf(customer.name, NAME_STOP),
    business: tokensOf(customer.businessName, new Set([...NAME_STOP, ...BUSINESS_GENERIC])),
    phone: phoneKey(customer.phone),
    code: String(customer.code || "").trim().toLowerCase(),
    address: normalizeText(customer.address),
  };
}

function compare(x, y) {
  const reasons = [];
  const sameCode = !!x.code && x.code === y.code;
  const samePhone = !!x.phone && x.phone === y.phone;

  const sameBusiness = x.business.length > 0 && y.business.length > 0 && matchedWords(x.business, y.business) === Math.min(x.business.length, y.business.length);
  const sameAddress = x.address.length >= 8 && x.address === y.address;

  // Con teléfono, negocio o dirección en común se tolera más: faltas de ortografía
  // en palabras de 4 letras y 2 de 3 palabras iguales ("Frank" / "Francisco").
  const supported = samePhone || sameBusiness || sameAddress;
  const minWords = Math.min(x.name.length, y.name.length);
  const matched = minWords > 0 ? matchedWords(x.name, y.name, supported ? 4 : 5) : 0;
  const exact = minWords > 0 ? matched / Math.max(x.name.length, y.name.length) : 0;
  const contain = minWords > 0 ? matched / minWords : 0;
  const multiWord = minWords >= 2;
  const nameLike = multiWord ? contain >= (supported ? 0.6 : 0.75) : matched === 1;

  let confidence = null;
  if (sameCode) confidence = "alta";
  else if (samePhone && nameLike && multiWord) confidence = "alta";
  else if (multiWord && exact >= 0.95) confidence = "alta";
  else if (multiWord && nameLike && (sameBusiness || sameAddress)) confidence = "alta";
  else if (samePhone) confidence = "media";
  else if (multiWord && nameLike) confidence = "media";
  else if (nameLike || sameBusiness) confidence = "baja";
  if (!confidence) return null;

  if (sameCode) reasons.push("codigo");
  if (samePhone) reasons.push("telefono");
  if (nameLike) reasons.push("nombre");
  if (sameBusiness) reasons.push("negocio");
  if (sameAddress) reasons.push("direccion");
  const score = (sameCode ? 3 : 0) + (samePhone ? 2 : 0) + exact + (sameBusiness ? 1 : 0) + (sameAddress ? 0.5 : 0);
  return { confidence, reasons, score };
}

// Cuánto se parecen dos clientes: { confidence, reasons, score } o null.
export function compareCustomers(a, b) {
  return compare(prepare(a), prepare(b));
}

const ORDER = { alta: 0, media: 1, baja: 2 };

// Pares de clientes que podrían ser el mismo. `distinct`: claves (pairKey) de
// pares que la persona ya marcó como "no son el mismo".
export function findSimilarCustomers(customers, { distinct = [] } = {}) {
  const skip = new Set(distinct);
  const prepared = customers.filter((c) => c && normalizeText(c.name)).map(prepare);
  const pairs = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const result = compare(prepared[i], prepared[j]);
      if (!result) continue;
      if (skip.has(pairKey(prepared[i].customer, prepared[j].customer))) continue;
      pairs.push({ a: prepared[i].customer, b: prepared[j].customer, ...result });
    }
  }
  return pairs.sort((p, q) => ORDER[p.confidence] - ORDER[q.confidence] || q.score - p.score);
}
