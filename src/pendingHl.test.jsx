import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Today from "./Today";
import { totalHlSold } from "./money";

// "HL pendientes" (resumen pendiente de Para mañana): totalHlSold solo suma
// ventas comprometidas, y las reservas de mañana sin facturar no lo están --
// así que marcaba 0.00 aunque hubiera pedidos pendientes. El resumen pendiente
// tiene que sumar el HL de lo pendiente; el cálculo de lo VENDIDO (hoy,
// acumulado) sigue contando solo lo comprometido.

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.01 },
  { code: "M1500", name: "Malta 1500ml", short: "M-1500", color: "#274E37", hl: 0.015 },
];

function sale(id, code, qty, extra = {}) {
  return {
    id, code, type: "venta", qty, unitPrice: 100, date: "2026-09-22", orderId: `o-${id}`,
    bucket: "manana", sent: false, confirmed: false, sentToCustomer: false, customerName: `Cliente ${id}`,
    ...extra,
  };
}

function hlCard() {
  return screen.getByText("HL PENDIENTES").parentElement;
}

function renderPending(movements, props = {}) {
  return render(
    <Today
      products={products}
      movements={movements}
      stock={{ P500: 350, M1500: 61 }}
      allOrders={[]}
      showPrices
      exchangeRate={null}
      title="RESUMEN PENDIENTE"
      ordersLabel="PEDIDOS PENDIENTES"
      soldLabel="Pendiente"
      pendingMode
      {...props}
    />
  );
}

describe("totalHlSold", () => {
  const reservation = sale(1, "P500", 100, { unitHl: 0.01 });

  it("por defecto no cuenta una reserva de mañana sin facturar (no está comprometida)", () => {
    expect(totalHlSold([reservation], products)).toBe(0);
  });

  it("con includeUncommitted cuenta también lo que todavía no se compromete", () => {
    expect(totalHlSold([reservation], products, { includeUncommitted: true })).toBeCloseTo(1, 5);
  });

  it("con includeUncommitted sigue ignorando lo que no es venta", () => {
    const adjustment = { id: "a", code: "P500", type: "ajuste", qty: 50 };
    expect(totalHlSold([reservation, adjustment], products, { includeUncommitted: true })).toBeCloseTo(1, 5);
  });

  it("usa el HL guardado en la venta y, si no hay, el del producto", () => {
    const withOwn = sale(2, "P500", 10, { unitHl: 0.5 });
    const withoutOwn = sale(3, "M1500", 10); // sin unitHl -> hl del producto (0.015)
    expect(totalHlSold([withOwn, withoutOwn], products, { includeUncommitted: true })).toBeCloseTo(5 + 0.15, 5);
  });
});

describe("Today (resumen pendiente): HL pendientes", () => {
  it("suma el HL de las reservas de mañana sin facturar", () => {
    renderPending([sale(1, "P500", 60, { unitHl: 0.015 }), sale(2, "P500", 32, { unitHl: 0.015 })]);
    expect(hlCard().textContent).toContain("1.38");
  });

  it("usa el HL del producto cuando la venta no lo guardó", () => {
    renderPending([sale(1, "M1500", 100)]);
    expect(hlCard().textContent).toContain("1.50");
  });

  it("no suma lo ya facturado (eso no es pendiente)", () => {
    renderPending([sale(1, "P500", 10, { unitHl: 0.01 })], {
      billedMovements: [sale(2, "P500", 500, { unitHl: 0.01, sent: true })],
    });
    expect(hlCard().textContent).toContain("0.10");
  });

  it("sin pedidos pendientes sigue en 0.00", () => {
    renderPending([]);
    expect(hlCard().textContent).toContain("0.00");
  });

  it("el resumen de HOY no cambia: sigue contando solo lo comprometido", () => {
    render(
      <Today
        products={products}
        movements={[
          sale(1, "P500", 100, { bucket: "hoy", sent: true, unitHl: 0.01 }),
          sale(2, "P500", 100, { bucket: "manana", sent: false, unitHl: 0.01 }),
        ]}
        stock={{ P500: 350 }}
        allOrders={[]}
        showPrices
        exchangeRate={null}
      />
    );
    // Solo la del bucket Hoy enviada cuenta: 1.00, no 2.00.
    expect(screen.getByText("HL VENDIDOS").parentElement.textContent).toContain("1.00");
  });
});
