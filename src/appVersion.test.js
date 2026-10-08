import { describe, it, expect } from "vitest";
import { APP_VERSION } from "./appVersion";

// La versión que se muestra en Configuración: el commit con el que se
// construyó la app (7 caracteres), o "dev" si no se puede saber.

describe("APP_VERSION", () => {
  it("es el commit corto o 'dev'", () => {
    expect(APP_VERSION).toMatch(/^([0-9a-f]{7}|dev)$/);
  });
});
