import { describe, it, expect } from "vitest";
import { makeLinkCode, parseLinkCode } from "./linkCode";

// Código de enlace con la nube de facturación: lleva la dirección del buzón y el
// código secreto de la persona, para pegarlo una sola vez en Configuración.

const URL_OK = "https://procovar-buzon.cuenta.workers.dev";
const TOKEN = "k3J9xQ2mVb7LpR4tYw8NaZ5cHd1FgUe6";

describe("linkCode", () => {
  it("lo que se arma se puede leer", () => {
    const code = makeLinkCode({ url: URL_OK, token: TOKEN });
    expect(code.startsWith("procovar1:")).toBe(true);
    expect(parseLinkCode(code)).toEqual({ url: URL_OK, token: TOKEN });
  });

  it("quita la barra final de la dirección y los espacios alrededor del código", () => {
    const code = makeLinkCode({ url: `${URL_OK}/`, token: TOKEN });
    expect(parseLinkCode(`  ${code}\n`)).toEqual({ url: URL_OK, token: TOKEN });
  });

  it("no usa caracteres que se rompan al pegarlo en WhatsApp", () => {
    expect(makeLinkCode({ url: URL_OK, token: TOKEN })).toMatch(/^procovar1:[A-Za-z0-9_-]+$/);
  });

  it("acepta localhost para desarrollo", () => {
    const code = makeLinkCode({ url: "http://localhost:8787", token: TOKEN });
    expect(parseLinkCode(code).url).toBe("http://localhost:8787");
  });

  it("rechaza lo que no es un código de enlace, con el motivo", () => {
    expect(() => parseLinkCode("")).toThrow("Pega el código de enlace.");
    expect(() => parseLinkCode("hola")).toThrow("Ese no es un código de enlace de Procovar.");
    expect(() => parseLinkCode("procovar1:%%%")).toThrow("El código de enlace está dañado.");
    const wrongShape = `procovar1:${btoa(JSON.stringify({ x: 1 })).replace(/=+$/, "")}`;
    expect(() => parseLinkCode(wrongShape)).toThrow("El código de enlace está incompleto.");
  });

  it("solo admite direcciones https (o localhost)", () => {
    expect(() => makeLinkCode({ url: "http://buzon.example.com", token: TOKEN })).toThrow("La dirección del buzón debe ser https.");
    expect(() => makeLinkCode({ url: URL_OK, token: "corto" })).toThrow("El código secreto es demasiado corto.");
  });
});
