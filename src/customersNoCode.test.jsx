import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Clientes > "Sin código · N": igual que "Sin teléfono · N", para encontrar los
// clientes que todavía no tienen su código del portal. La cuenta sale del
// registro entero (no de lo que deja la búsqueda) y el filtro se puede combinar.

const STORAGE_KEY = "procovar-inventario-v1";
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];

const cust = (id, name, extra = {}) => ({ id, name, businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", ...extra });

function seed(customers) {
  localStorage.setItem("procovar-active-tab", "clientes");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [], customers, orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

// Ana: con código y teléfono · Beto: sin código, con teléfono · Carla: con código, sin teléfono
// Dora: sin código ni teléfono · Elio: sin código, con teléfono
const five = () => [
  cust("a", "Ana López", { code: "AB1", phone: "5355000001" }),
  cust("b", "Beto Ruiz", { phone: "5355000002" }),
  cust("c", "Carla Gil", { code: "CD2" }),
  cust("d", "Dora Mena"),
  cust("e", "Elio Soto", { phone: "5355000005" }),
];

const chip = () => screen.findByRole("button", { name: /Sin código/ });
const shown = () => ["Ana López", "Beto Ruiz", "Carla Gil", "Dora Mena", "Elio Soto"].filter((n) => screen.queryByText(new RegExp(n), { selector: "span" }));

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-31T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Sin código · N", () => {
  it("aparece con cuántos clientes no tienen código", async () => {
    seed(five());
    render(<InventoryApp />);
    expect((await chip()).textContent).toBe("Sin código · 3");
  });

  it("no aparece si todos tienen código", async () => {
    seed([cust("a", "Ana López", { code: "AB1" }), cust("c", "Carla Gil", { code: "CD2" })]);
    render(<InventoryApp />);
    await screen.findByText(/Ana López/, { selector: "span" });
    expect(screen.queryByRole("button", { name: /Sin código/ })).toBeNull();
  });

  it("junto al de 'Sin teléfono', cada uno con su cuenta", async () => {
    seed(five());
    render(<InventoryApp />);
    expect((await chip()).textContent).toBe("Sin código · 3");
    expect(screen.getByRole("button", { name: /Sin teléfono · / }).textContent).toBe("Sin teléfono · 2");
  });

  it("al tocarlo deja solo a los que no tienen código, y al volver a tocarlo, todos", async () => {
    seed(five());
    render(<InventoryApp />);
    const button = await chip();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    await waitFor(() => expect(shown()).toEqual(["Beto Ruiz", "Dora Mena", "Elio Soto"]));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    await waitFor(() => expect(shown()).toHaveLength(5));
  });

  it("la cuenta sale de todo el registro, no de la búsqueda", async () => {
    seed(five());
    render(<InventoryApp />);
    await chip();
    fireEvent.change(screen.getByPlaceholderText("Buscar cliente o negocio"), { target: { value: "ana" } });
    await waitFor(() => expect(shown()).toEqual(["Ana López"]));
    expect(screen.getByRole("button", { name: /Sin código/ }).textContent).toBe("Sin código · 3");
  });

  it("se puede combinar con 'Sin teléfono': solo los que no tienen ninguno de los dos", async () => {
    seed(five());
    render(<InventoryApp />);
    fireEvent.click(await chip());
    fireEvent.click(screen.getByRole("button", { name: /Sin teléfono · / }));
    await waitFor(() => expect(shown()).toEqual(["Dora Mena"]));
  });

  it("si el filtro no deja a nadie, 'Limpiar filtros' lo quita", async () => {
    seed([cust("a", "Ana López", { code: "AB1" }), cust("b", "Beto Ruiz")]);
    render(<InventoryApp />);
    fireEvent.click(await chip());
    fireEvent.change(screen.getByPlaceholderText("Buscar cliente o negocio"), { target: { value: "ana" } });
    fireEvent.click(await screen.findByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => expect(shown()).toEqual(["Ana López", "Beto Ruiz"].filter((n) => n)));
    expect(screen.getByRole("button", { name: /Sin código/ }).getAttribute("aria-pressed")).toBe("false");
  });
});
