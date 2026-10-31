import { describe, it, expect, beforeEach } from "vitest";
import { resolveAppRole, ROLE_KEY } from "./appRole";

// La misma app sirve para el vendedor y para la facturadora. El rol se elige con
// la dirección (?rol=facturadora) y queda guardado en ese teléfono.

beforeEach(() => localStorage.clear());

describe("resolveAppRole", () => {
  it("por defecto es vendedor", () => {
    expect(resolveAppRole("")).toBe("vendedor");
  });

  it("?rol=facturadora lo pone y lo recuerda aunque luego falte el parámetro", () => {
    expect(resolveAppRole("?rol=facturadora")).toBe("facturadora");
    expect(localStorage.getItem(ROLE_KEY)).toBe("facturadora");
    expect(resolveAppRole("")).toBe("facturadora");
  });

  it("?rol=vendedor lo devuelve a vendedor", () => {
    resolveAppRole("?rol=facturadora");
    expect(resolveAppRole("?rol=vendedor")).toBe("vendedor");
    expect(resolveAppRole("")).toBe("vendedor");
  });

  it("un rol desconocido se ignora", () => {
    resolveAppRole("?rol=facturadora");
    expect(resolveAppRole("?rol=jefe")).toBe("facturadora");
    localStorage.setItem(ROLE_KEY, "otra-cosa");
    expect(resolveAppRole("")).toBe("vendedor");
  });

  it("otros parámetros no molestan", () => {
    expect(resolveAppRole("?v=abc123&rol=facturadora&r=2")).toBe("facturadora");
  });

  it("sin localStorage disponible, al menos usa el parámetro", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { get() { throw new Error("bloqueado"); }, configurable: true });
    try {
      expect(resolveAppRole("?rol=facturadora")).toBe("facturadora");
      expect(resolveAppRole("")).toBe("vendedor");
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
