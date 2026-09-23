import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// "virtual:pwa-register" (src/pwaStatus.js) solo lo resuelve el plugin de
// Vite en dev/build real -- bajo Vitest no existe, así que se sustituye acá
// (una vez, para todos los archivos de test) por un doble inofensivo. Los
// tests que sí quieren probar cómo se usan sus callbacks (pwaStatus.test.js)
// declaran su propio vi.mock más específico, que pisa este.
vi.mock("virtual:pwa-register", () => ({
  registerSW: () => () => {},
}));

// No usamos `globals: true` en vitest (los tests importan describe/it/expect
// a mano, mismo estilo que el resto del repo) -- por eso el auto-cleanup de
// Testing Library no se activa solo, hay que llamarlo a mano acá.
afterEach(() => {
  cleanup();
});
