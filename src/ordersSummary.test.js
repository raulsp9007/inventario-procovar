import { describe, it, expect } from "vitest";
import { formatOrdersSummaryForSupervisor } from "./orderHelpers";

// Resumen de los pedidos del día para el supervisor (WhatsApp): por pedido,
// solo el cliente y los productos con su cantidad.

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500" },
  { code: "M330", name: "Malta 330ml", short: "M-330" },
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500" },
  { code: "ARROZ", name: "Arroz 1kg" },
];

function order(customerName, lines, extra = {}) {
  return {
    orderId: `o-${customerName}`, customerName, businessName: "", isDelivery: false,
    date: "2026-09-21", timestamp: "2026-09-21T09:00:00.000Z",
    lines: lines.map(([code, qty]) => ({ code, qty, unitPrice: 100 })),
    ...extra,
  };
}

describe("formatOrdersSummaryForSupervisor", () => {
  it("arma el resumen con cliente, negocio, productos y domicilios", () => {
    const text = formatOrdersSummaryForSupervisor(
      [
        order("Ana López", [["P500", 40], ["M330", 30]], { businessName: "Bodega La Esquina" }),
        order("Carlos Pérez", [["P1500", 60]]),
        order("Marta Díaz", [["P500", 25]], { isDelivery: true }),
      ],
      products,
      { date: "2026-09-21", senderName: "Raúl" },
    );
    expect(text).toBe([
      "*Pedidos del día · lun 21 sep*",
      "Gestor: Raúl · 3 pedidos",
      "",
      "1. *Ana López* (Bodega La Esquina)",
      "    P-500 ×40 · M-330 ×30",
      "",
      "2. *Carlos Pérez*",
      "    P-1500 ×60",
      "",
      "3. *Marta Díaz* 🛵",
      "    P-500 ×25",
      "",
      "🛵 = domicilio",
    ].join("\n"));
  });

  it("sin nombre de gestor solo dice cuántos pedidos son", () => {
    const text = formatOrdersSummaryForSupervisor([order("Ana", [["P500", 1]])], products, { date: "2026-09-21" });
    expect(text.split("\n")[1]).toBe("1 pedido");
    expect(text).not.toContain("Gestor:");
  });

  it("sin domicilios no lleva la leyenda", () => {
    const text = formatOrdersSummaryForSupervisor([order("Ana", [["P500", 1]])], products, { date: "2026-09-21" });
    expect(text).not.toContain("🛵");
  });

  it("un producto sin abreviatura usa su nombre, y uno desconocido su código", () => {
    const text = formatOrdersSummaryForSupervisor([order("Ana", [["ARROZ", 3], ["XYZ", 2]])], products, { date: "2026-09-21" });
    expect(text).toContain("Arroz 1kg ×3 · XYZ ×2");
  });

  it("no pone precios ni teléfonos", () => {
    const text = formatOrdersSummaryForSupervisor(
      [order("Ana", [["P500", 1]], { customerPhone: "5353551234" })], products, { date: "2026-09-21" },
    );
    expect(text).not.toMatch(/CUP|US\$|5353551234/);
  });

  it("ignora el nombre del negocio vacío o con solo espacios", () => {
    const text = formatOrdersSummaryForSupervisor([order("Ana", [["P500", 1]], { businessName: "  " })], products, { date: "2026-09-21" });
    expect(text).toContain("1. *Ana*\n");
  });
});
