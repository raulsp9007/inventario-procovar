import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Importar clientes (CSV) fusiona solo a los que ya estaban sin código y se
// parecen mucho a uno del archivo (que sí trae código): queda el nombre y el
// código del archivo, con los datos y los pedidos del otro. Al terminar, la lista
// queda filtrada en "Sin código" para ver lo que falta.

const STORAGE_KEY = "procovar-inventario-v1";
const HEADER = "Nombre Cliente,Codigo,Dirección,Tipo Cliente,Tipo Consumo,Nombre Contacto,Telefono";
const CSV = [
  HEADER,
  "Cafetería Beto,BT1,Calle 9,Bar,On-Premise,Beto R.,55000001",
  "Café Nuevo,CD2,Calle 2,Cafeteria,On-Premise,Carla Gil,55999999",
].join("\r\n");

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];
const cust = (id, name, extra = {}) => ({ id, name, businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", ...extra });

function order(id, name) {
  return {
    id: `m-${id}`, code: "P500", type: "venta", qty: 10, unitPrice: 1, unitHl: 0, date: "2026-09-20",
    timestamp: `2026-09-20T0${id.length}:00:00.000Z`, orderId: id, orderSeq: 1, customerName: name, businessName: "",
    customerPhone: "", isDelivery: false, note: "", bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true,
  };
}

function seed() {
  localStorage.setItem("procovar-active-tab", "clientes");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products,
    movements: [order("o1", "Beto Ruiz"), order("o22", "Beto Ruiz")],
    customers: [
      cust("c1", "Beto Ruiz", { phone: "5355000001", businessName: "Bar de Beto" }),
      cust("c2", "Dora Mena"),
      cust("c3", "Elio Soto", { code: "EL3" }),
    ],
    waitlist: [],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

async function previewPanel() {
  render(<InventoryApp />);
  const input = await screen.findByLabelText("Archivo de clientes (CSV)");
  fireEvent.change(input, { target: { files: [new File([CSV], "clientes.csv", { type: "text/csv" })] } });
  return await screen.findByRole("group", { name: "Importar clientes" });
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-31T09:00:00"));
  seed();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Importar clientes: fusión con los parecidos sin código", () => {
  it("la vista previa avisa a quién se fusiona cada uno", async () => {
    const panel = await previewPanel();
    expect(within(panel).getByText("1 se fusiona con uno parecido que no tiene código")).toBeTruthy();
    expect(within(panel).getByText("nuevo · se fusiona con Beto Ruiz")).toBeTruthy();
    expect(saved().customers).toHaveLength(3); // todavía no se tocó nada
  });

  it("al aplicar queda uno solo con el nombre y el código del archivo, y con sus pedidos y datos", async () => {
    const panel = await previewPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(saved().customers.some((c) => c.name === "Beto Ruiz")).toBe(false));
    const beto = saved().customers.find((c) => c.name === "Beto R.");
    expect(beto).toMatchObject({ code: "BT1", businessName: "Cafetería Beto", phone: "5355000001", address: "Calle 9" });
    expect(saved().customers.map((c) => c.name).sort()).toEqual(["Beto R.", "Carla Gil", "Dora Mena", "Elio Soto"]);
    expect(saved().movements.map((m) => m.customerName)).toEqual(["Beto R.", "Beto R."]);
    expect(await screen.findByText("Importación aplicada: 1 nuevo, 1 fusionado")).toBeTruthy();
  });

  it("al terminar solo se muestran los clientes que no tienen código", async () => {
    const panel = await previewPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    const chip = await screen.findByRole("button", { name: /Sin código · 1/ });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText(/Dora Mena/, { selector: "span" })).toBeTruthy();
    expect(screen.queryByText(/Carla Gil/, { selector: "span" })).toBeNull();
    expect(screen.queryByText(/Elio Soto/, { selector: "span" })).toBeNull();
    expect(screen.queryByText(/Beto R\./, { selector: "span" })).toBeNull();
  });
});
