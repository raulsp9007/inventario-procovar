// Código de enlace con la nube de facturación: "procovar1:" + base64url de
// { u: dirección del buzón, t: código secreto }. Se pega una vez en Configuración.

const PREFIX = "procovar1:";
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MIN_TOKEN_LENGTH = 20;

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function cleanUrl(url) {
  const clean = String(url || "").trim().replace(/\/+$/, "");
  if (!clean.startsWith("https://") && !LOCAL.test(clean)) throw new Error("La dirección del buzón debe ser https.");
  return clean;
}

export function makeLinkCode({ url, token }) {
  const cleanTokenValue = String(token || "").trim();
  if (cleanTokenValue.length < MIN_TOKEN_LENGTH) throw new Error("El código secreto es demasiado corto.");
  return PREFIX + toBase64Url(JSON.stringify({ u: cleanUrl(url), t: cleanTokenValue }));
}

export function parseLinkCode(text) {
  const code = String(text || "").trim();
  if (!code) throw new Error("Pega el código de enlace.");
  if (!code.startsWith(PREFIX)) throw new Error("Ese no es un código de enlace de Procovar.");
  let data;
  try {
    data = JSON.parse(fromBase64Url(code.slice(PREFIX.length)));
  } catch {
    throw new Error("El código de enlace está dañado.");
  }
  if (!data || typeof data.u !== "string" || typeof data.t !== "string") throw new Error("El código de enlace está incompleto.");
  return { url: cleanUrl(data.u), token: data.t };
}

// La facturadora puede escribir el código de enlace completo o solo su contraseña: en
// ese caso la dirección del buzón es la que trae la página (`defaultUrl`).
export function parseAccess(text, defaultUrl) {
  const value = String(text || "").trim();
  if (!value) throw new Error("Escribe la contraseña.");
  if (value.startsWith(PREFIX)) return parseLinkCode(value);
  return { url: cleanUrl(defaultUrl), token: value };
}
