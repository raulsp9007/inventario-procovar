// Cuentas con usuario y contraseña para la facturación y la supervisión (las maneja el
// administrador desde su sitio). La contraseña nunca se guarda: solo su huella
// (PBKDF2-SHA256 con sal). Entrar (POST /login) da una sesión: un código al azar,
// del que solo se guarda su huella, que la página usa como cualquier otro código.
// Funciones puras salvo por crypto.

import { nameKey } from "./roster.js";

// "facturacion" y "supervision" son los nombres en las direcciones; el rol es el del buzón.
export const ACCOUNT_ROLES = { facturacion: "facturadora", supervision: "supervisor" };

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 40;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
export const MAX_FAILS = 5;
export const LOCK_MS = 5 * 60 * 1000;
export const SESSION_MS = 24 * 60 * 60 * 1000;

// El plan gratis de Cloudflare da ~10 ms de CPU por petición: más vueltas harían fallar el login.
const ITERATIONS = 20000;
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;
const encoder = new TextEncoder();

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

async function derive(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

// { salt, hash } (base64url) para guardar.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toBase64Url(salt), hash: toBase64Url(await derive(password, salt)) };
}

export async function verifyPassword(password, { salt, hash }) {
  const expected = fromBase64Url(hash);
  const actual = await derive(password, fromBase64Url(salt));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

// Huella de un código de sesión (se guarda esta, no el código).
export async function hashToken(token) {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
}

export const usernameKey = (username) => nameKey(username);

// Lo que se ve de una cuenta (nunca la contraseña ni su huella).
export const accountView = (account) => (account ? { usuario: account.username, activo: !!account.active } : null);

// Valida lo que manda el administrador. `existing`: la cuenta actual (si ya hay una).
// Devuelve { usuario?, clave?, activo? } limpios, o { error }.
export function parseAccountInput(body, existing) {
  const input = body && typeof body === "object" ? body : {};
  const out = {};
  if (input.usuario !== undefined || !existing) {
    const usuario = typeof input.usuario === "string" ? input.usuario.trim() : "";
    if (usuario.length < USERNAME_MIN || usuario.length > USERNAME_MAX || !USERNAME_PATTERN.test(usuario)) {
      return { error: `El usuario debe tener de ${USERNAME_MIN} a ${USERNAME_MAX} caracteres, sin espacios (letras, números, punto, guion).` };
    }
    out.usuario = usuario;
  }
  if (input.clave !== undefined || !existing) {
    const clave = typeof input.clave === "string" ? input.clave : "";
    if (clave.length < PASSWORD_MIN || clave.length > PASSWORD_MAX) {
      return { error: `La contraseña debe tener de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.` };
    }
    out.clave = clave;
  }
  if (input.activo !== undefined) {
    if (typeof input.activo !== "boolean") return { error: "Activo debe ser verdadero o falso." };
    out.activo = input.activo;
  }
  if (Object.keys(out).length === 0) return { error: "No hay nada que cambiar." };
  return out;
}
