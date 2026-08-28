import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// No usamos `globals: true` en vitest (los tests importan describe/it/expect
// a mano, mismo estilo que el resto del repo) -- por eso el auto-cleanup de
// Testing Library no se activa solo, hay que llamarlo a mano acá.
afterEach(() => {
  cleanup();
});
