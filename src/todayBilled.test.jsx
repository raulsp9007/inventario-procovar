import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Today from "./Today";
import InventoryApp from "./InventoryApp";

// Resumen pendiente (pestaña "Para mañana"): un pedido de mañana que ya se
// marcó Facturado queda comprometido (el stock ya bajó) y por eso salía de la
// lista de pendientes -- pero tampoco entraba al resumen de hoy (su fecha es
// mañana), así que esas unidades no se veían en ningún lado. Ahora el resumen
// pendiente las muestra aparte, como "Facturado", junto al pendiente.

const products = [
  { code: "P1500", name: "P1500", short: "P-1500", color: "#0000ff" },
  { code: "M1500", name: "M1500", short: "M-1500", color: "#ff8c00" },
];

function sale(id, code, qty, { sent = false } = {}) {
  return {
    id, code, type: "venta", qty, unitPrice: 100, unitHl: 0, date: "2026-09-22", orderId: `o-${id}`,
    bucket: "manana", sent, confirmed: false, sentToCustomer: false, customerName: `Cliente ${id}`,
  };
}

function rowOf(short) {
  return screen.getByText(short).closest("div[style*='padding: 12px 16px']");
}

function renderPending(props) {
  return render(
    <Today
      products={products}
      stock={{ P1500: 350, M1500: 61 }}
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

describe("Today (resumen pendiente): pedidos de mañana ya facturados", () => {
  it("muestra por producto lo pendiente y lo ya facturado", () => {
    renderPending({
      movements: [sale(1, "P1500", 60), sale(2, "P1500", 32)],
      billedMovements: [sale(3, "P1500", 30, { sent: true }), sale(4, "P1500", 20, { sent: true })],
    });
    const row = rowOf("P-1500");
    expect(row.textContent).toContain("Pendiente: 92");
    expect(row.textContent).toContain("Facturado: 50");
  });

  it("un producto que solo tiene pedidos facturados también aparece", () => {
    renderPending({ movements: [], billedMovements: [sale(1, "M1500", 12, { sent: true })] });
    const row = rowOf("M-1500");
    expect(row.textContent).toContain("Pendiente: 0");
    expect(row.textContent).toContain("Facturado: 12");
  });

  it("sin pedidos facturados no aparece 'Facturado'", () => {
    renderPending({ movements: [sale(1, "P1500", 5)], billedMovements: [] });
    expect(screen.queryByText(/Facturado/)).toBeNull();
    expect(rowOf("P-1500").textContent).toContain("Pendiente: 5");
  });

  it("la tarjeta de unidades dice cuántas ya están facturadas y el total", () => {
    renderPending({
      movements: [sale(1, "P1500", 92)],
      billedMovements: [sale(2, "P1500", 50, { sent: true })],
    });
    const card = screen.getByText("UNIDADES PENDIENTES").parentElement;
    expect(within(card).getByText("92")).toBeTruthy();
    expect(within(card).getByText("50 facturadas · 142 en total")).toBeTruthy();
  });

  it("el resumen de HOY no cambia: no recibe ni muestra facturados", () => {
    render(
      <Today
        products={products}
        movements={[]}
        stock={{ P1500: 350, M1500: 61 }}
        allOrders={[]}
        showPrices
        exchangeRate={null}
        billedMovements={[sale(1, "P1500", 50, { sent: true })]}
      />
    );
    expect(screen.queryByText(/Facturado/)).toBeNull();
  });
});

describe("Pedidos > Para mañana: el resumen pendiente cuenta lo facturado", () => {
  const STORAGE_KEY = "procovar-inventario-v1";

  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = () => {};
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("de punta a punta: pendientes sin facturar y facturados suman el total de mañana", async () => {
    const mk = (id, qty, sent) => ({
      id: `m-${id}`, code: "P500", type: "venta", qty, unitPrice: 100, unitHl: 0, date: "2026-09-22",
      timestamp: `2026-09-21T0${id}:00:00.000Z`, orderId: `o${id}`, orderSeq: id, customerName: `Cliente ${id}`,
      businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
      bucket: "manana", sent, confirmed: false, sentToCustomer: false,
    });
    localStorage.setItem("procovar-active-tab", "pedidos");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      movements: [mk(1, 60, false), mk(2, 32, false), mk(3, 50, true)],
      customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
      stock: { P500: 350 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
    }));
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Para mañana/ }));

    // Solo dentro del resumen (la lista de pedidos también muestra "P-500").
    const summary = (await screen.findByText("RESUMEN PENDIENTE")).parentElement;
    const row = within(summary).getByText("P-500").closest("div[style*='padding: 12px 16px']");
    expect(row.textContent).toContain("Pendiente: 92");
    expect(row.textContent).toContain("Facturado: 50");
    expect(within(summary).getByText("50 facturadas · 142 en total")).toBeTruthy();
  });
});
