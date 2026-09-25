import { describe, it, expect } from "vitest";
import { CUSTOMER_ICON, BUSINESS_ICON, customerLabel, businessLabel } from "./nameLabels";

describe("nameLabels", () => {
  it("antepone 👤 al cliente y 🏪 al negocio", () => {
    expect(CUSTOMER_ICON).toBe("👤");
    expect(BUSINESS_ICON).toBe("🏪");
    expect(customerLabel("Ana Lopez")).toBe("👤 Ana Lopez");
    expect(businessLabel("Cafetería El Punto")).toBe("🏪 Cafetería El Punto");
  });

  it("recorta espacios y no deja icono suelto si el nombre viene vacío", () => {
    expect(customerLabel("  Ana  ")).toBe("👤 Ana");
    expect(customerLabel("")).toBe("");
    expect(customerLabel(undefined)).toBe("");
    expect(businessLabel("   ")).toBe("");
    expect(businessLabel(null)).toBe("");
  });

  it("no duplica el icono si el nombre ya lo trae", () => {
    expect(customerLabel("👤 Ana")).toBe("👤 Ana");
    expect(businessLabel("🏪 Bar")).toBe("🏪 Bar");
  });
});
