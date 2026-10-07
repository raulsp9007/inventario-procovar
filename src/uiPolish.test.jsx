import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";
import { ENTER_ANIMATION_MS, RISE_MAX_INDEX } from "./motion";

// Pulido visual: entrada escalonada de tarjetas (.rise), barras que crecen
// (.bargrow), pedido nuevo que entra (.orderenter) y filas tocables con
// efecto de presión (.pressable). Solo se comprueban las clases que anima
// theme.css; la animación en sí es CSS.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" },
  { code: "M330", name: "Malta 330ml", short: "M-330", color: "#274E37", hl: 0.003, format: "Sixpack" },
];

function sale(id, code, qty, orderId, seq, name, extra = {}) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0.03, date: "2026-09-21",
    timestamp: `2026-09-21T0${(seq % 9) + 1}:00:00.000Z`, orderId, orderSeq: seq, customerName: name,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: false, sentToCustomer: false, ...extra,
  };
}

function seed(view, movements) {
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100, M330: 100 }, prices: { P500: 1, M330: 1 }, pricesAreUsd: true, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

function stubReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

const delayIndex = (el) => el.style.getPropertyValue("--i");

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
  delete window.matchMedia;
});

describe("entrada escalonada (.rise)", () => {
  it("las tarjetas de pedidos entran una tras otra, con tope en el retraso", async () => {
    const many = Array.from({ length: 12 }, (_, i) => sale(i + 1, "P500", 1, `o${i + 1}`, i + 1, `Cliente ${i + 1}`, { sent: false }));
    seed("pedidos", many);
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");
    const rows = [...document.querySelectorAll(".rise")];
    expect(rows.length).toBeGreaterThanOrEqual(12);
    const indices = rows.map((r) => Number(delayIndex(r)));
    expect(Math.min(...indices)).toBe(0);
    expect(Math.max(...indices)).toBe(RISE_MAX_INDEX); // la lista larga no se demora de más
    expect(indices.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it("las filas de Resumen entran escalonadas", async () => {
    seed("resumen", [sale(1, "P500", 5, "o1", 1, "Ana"), sale(2, "M330", 3, "o2", 2, "Beto")]);
    render(<InventoryApp />);
    await screen.findByText("TOTAL GENERAL ACUMULADO");
    expect(document.querySelectorAll(".rise").length).toBeGreaterThanOrEqual(4); // 2 productos + 2 clientes
  });

  it("las tarjetas de productos entran escalonadas", async () => {
    seed("stock", []);
    render(<InventoryApp />);
    await screen.findByText("PRODUCTOS");
    expect(document.querySelectorAll("[data-product-code].rise")).toHaveLength(2);
  });
});

describe("barras de Resumen que crecen (.bargrow)", () => {
  it("cada producto tiene sus dos barras con la animación", async () => {
    seed("resumen", [sale(1, "P500", 5, "o1", 1, "Ana")]);
    render(<InventoryApp />);
    await screen.findByText("TOTAL GENERAL ACUMULADO");
    expect(document.querySelectorAll(".bargrow")).toHaveLength(2); // esta semana + la anterior
  });
});

describe("pedido nuevo que entra (.orderenter)", () => {
  async function createOrder(name) {
    fireEvent.click(screen.getByLabelText("Nuevo pedido"));
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
  }

  it("el pedido recién creado se resalta un rato; los que ya estaban no", async () => {
    stubReducedMotion(false);
    seed("pedidos", [sale(1, "P500", 1, "o1", 1, "Ana", { sent: false })]);
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");
    expect(document.querySelectorAll(".orderenter")).toHaveLength(0);

    await createOrder("Beto");
    await waitFor(() => expect(document.querySelectorAll(".orderenter")).toHaveLength(1));
    expect(document.querySelector(".orderenter").textContent).toMatch(/Beto/);

    await act(async () => { await vi.advanceTimersByTimeAsync(ENTER_ANIMATION_MS + 100); });
    expect(document.querySelectorAll(".orderenter")).toHaveLength(0);
  });

  it("con 'reducir movimiento' no se resalta", async () => {
    stubReducedMotion(true);
    seed("pedidos", [sale(1, "P500", 1, "o1", 1, "Ana", { sent: false })]);
    render(<InventoryApp />);
    await screen.findAllByLabelText("Eliminar pedido");
    await createOrder("Beto");
    await waitFor(() => expect(screen.getAllByLabelText("Eliminar pedido")).toHaveLength(2));
    expect(document.querySelectorAll(".orderenter")).toHaveLength(0);
  });
});

describe("filas tocables con efecto de presión (.pressable)", () => {
  it("las tarjetas compactas de productos en modo Ajustar llevan .pressable", async () => {
    seed("stock", []);
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(document.querySelectorAll("[data-product-code]").length).toBe(2));
    document.querySelectorAll("[data-product-code]").forEach((el) => expect(el.className).toContain("pressable"));
  });
});

describe("cifras que cuentan hacia arriba en Resumen", () => {
  it("con movimiento normal el total de la semana arranca en 0 y llega al valor", async () => {
    stubReducedMotion(false);
    seed("resumen", [sale(1, "P500", 5, "o1", 1, "Ana")]);
    render(<InventoryApp />);
    const label = await screen.findByText("Total semana actual");
    const value = label.parentElement.lastElementChild;
    expect(value.textContent).toBe("0 CUP");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(value.textContent).toBe("500 CUP");
  });
});
