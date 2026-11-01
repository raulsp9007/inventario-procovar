import { describe, it, expect } from "vitest";
import { buildVendorMessage, buildAccessMessage } from "./vendorMessage";

// Mensaje para mandarle a cada vendedor su código de enlace (WhatsApp: los asteriscos
// ponen negrita).

describe("buildVendorMessage", () => {
  const message = buildVendorMessage("Lorenzo", "procovar1:abc123");

  it("saluda por el nombre y lleva su código en una línea aparte", () => {
    expect(message.startsWith("Hola Lorenzo")).toBe(true);
    expect(message.split("\n")).toContain("procovar1:abc123");
  });

  it("dice qué hacer una sola vez: actualizar, enlazar y marcar Facturar a la nube", () => {
    expect(message).toMatch(/Configuración → Nube de facturación/);
    expect(message).toMatch(/Enlazar/);
    expect(message).toMatch(/Enlazado como \*?Lorenzo/);
    expect(message).toMatch(/Facturar a la nube/);
  });

  it("explica el uso diario: FACT., En nube y Comprobar", () => {
    expect(message).toMatch(/FACT\./);
    expect(message).toMatch(/En nube/);
    expect(message).toMatch(/Comprobar/);
  });

  it("avisa de lo importante: solo hoy, domicilios y que el código es personal", () => {
    expect(message).toMatch(/pedidos de \*hoy\*/);
    expect(message).toMatch(/domicilios/);
    expect(message).toMatch(/solo tuyo/);
  });

  it("el código aparece una sola vez", () => {
    expect(message.split("procovar1:abc123")).toHaveLength(2);
  });
});

describe("buildAccessMessage (datos de acceso de facturación o supervisión)", () => {
  const url = "https://raulsp9007.github.io/inventario-procovar/facturadora.html";

  it("lleva el sitio, el usuario y la contraseña", () => {
    const message = buildAccessMessage({ title: "Facturación", usuario: "maria", clave: "clave-12345", url });
    expect(message).toContain("Facturación");
    expect(message).toContain(url);
    expect(message).toContain("Usuario: maria");
    expect(message).toContain("Contraseña: clave-12345");
  });

  it("sin la contraseña a mano (ya guardada), avisa que se pasa aparte", () => {
    const message = buildAccessMessage({ title: "Supervisión", usuario: "super", url });
    expect(message).toContain("Usuario: super");
    expect(message).toContain("Contraseña: te la paso aparte");
    expect(message).not.toContain("undefined");
  });
});
