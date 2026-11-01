import { describe, it, expect } from "vitest";
import { buildVendorMessage } from "./vendorMessage";

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
