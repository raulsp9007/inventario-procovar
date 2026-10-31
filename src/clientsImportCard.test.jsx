import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InventoryApp from "./InventoryApp";

// Clientes > "Importar clientes (CSV)": carga la lista de clientes del portal
// (Nombre Cliente, Codigo, Dirección, Tipo Cliente, Tipo Consumo, Nombre
// Contacto, Telefono) con vista previa y sin tocar nada hasta confirmar.

const STORAGE_KEY = "procovar-inventario-v1";
const HEADER = "Nombre Cliente,Codigo,Dirección,Tipo Cliente,Tipo Consumo,Nombre Contacto,Telefono";
const CSV = [
  HEADER,
  'Kiosco Sol,AB1,"Calle 1, entre 2 y 3",Kiosko,Off-Premise,ana lópez,55123456',
  "Café Nuevo,CD2,Calle 2,Cafeteria,On-Premise,Carla Gil,55999999",
  "Otro Nombre,BETO1,Calle 9,Bar,On-Premise,Beto R.,55111111",
].join("\r\n");

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack" }];

function seed() {
  localStorage.setItem("procovar-active-tab", "clientes");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [],
    customers: [
      { id: "c1", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "c2", name: "Beto Ruiz", businessName: "Cafetería Beto", phone: "5355000001", createdAt: "2026-01-02T00:00:00.000Z", code: "BETO1" },
    ],
    orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100 }, prices: { P500: 1 }, pricesAreUsd: false, exchangeRate: 0,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const byId = (id) => saved().customers.find((c) => c.id === id);

async function openCard() {
  render(<InventoryApp />);
  return await screen.findByRole("button", { name: /Importar clientes \(CSV\)/ });
}

async function chooseFile(text) {
  const input = await screen.findByLabelText("Archivo de clientes (CSV)");
  fireEvent.change(input, { target: { files: [new File([text], "clientes.csv", { type: "text/csv" })] } });
}

async function previewPanel(text = CSV) {
  await openCard();
  await chooseFile(text);
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

describe("Importar clientes (CSV)", () => {
  it("el botón está en Clientes, aunque todavía no haya clientes", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved(), customers: [] }));
    expect(await openCard()).toBeTruthy();
  });

  it("un archivo que no sirve muestra el motivo y no abre la vista previa", async () => {
    await openCard();
    await chooseFile("a,b\n1,2");
    expect(await screen.findByText("El archivo no tiene las columnas esperadas (Nombre Contacto o Nombre Cliente).")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Importar clientes" })).toBeNull();
  });

  it("vista previa: cuántos hay, cuántos son nuevos y cuántos se completan (sin tocar nada todavía)", async () => {
    const panel = await previewPanel();
    expect(within(panel).getByText("3 clientes en el archivo")).toBeTruthy();
    expect(within(panel).getByText("1 nuevo · 2 se completan · 0 sin cambios · 0 ya existen")).toBeTruthy();
    expect(within(panel).getByText(/Carla Gil/)).toBeTruthy();
    expect(saved().customers).toHaveLength(2);
  });

  it("por defecto completa a los que ya existen y agrega los nuevos", async () => {
    const panel = await previewPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(saved().customers).toHaveLength(3));
    expect(byId("c1")).toMatchObject({
      name: "Ana López", businessName: "Kiosco Sol", phone: "5355123456", code: "AB1",
      address: "Calle 1, entre 2 y 3", clientType: "Kiosko", consumptionType: "Off-Premise",
    });
    // Beto ya tenía negocio y teléfono: no se pisan; lo que le faltaba, se completa.
    expect(byId("c2")).toMatchObject({ businessName: "Cafetería Beto", phone: "5355000001", address: "Calle 9", clientType: "Bar" });
    const carla = saved().customers.find((c) => c.name === "Carla Gil");
    expect(carla).toMatchObject({ businessName: "Café Nuevo", phone: "5355999999", code: "CD2" });
    expect(await screen.findByText("Importación aplicada: 1 nuevo, 2 completados")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Importar clientes" })).toBeNull();
  });

  it("'Solo agregar los nuevos' no toca a los que ya estaban", async () => {
    const panel = await previewPanel();
    fireEvent.click(within(panel).getByLabelText("Solo agregar los nuevos"));
    expect(within(panel).getByText("1 nuevo · 0 se actualizan · 0 sin cambios · 2 ya existen")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(saved().customers).toHaveLength(3));
    expect(byId("c1")).toEqual({ id: "c1", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(await screen.findByText("Importación aplicada: 1 nuevo")).toBeTruthy();
  });

  it("'Actualizar con lo del archivo' cambia lo guardado, pero nunca el nombre", async () => {
    const panel = await previewPanel();
    fireEvent.click(within(panel).getByLabelText(/Actualizar con lo del archivo/));
    expect(within(panel).getByText("1 nuevo · 2 se actualizan · 0 sin cambios · 0 ya existen")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(byId("c2").businessName).toBe("Otro Nombre"));
    expect(byId("c2")).toMatchObject({ name: "Beto Ruiz", phone: "5355111111" });
    expect(await screen.findByText("Importación aplicada: 1 nuevo, 2 actualizados")).toBeTruthy();
  });

  it("avisa de los repetidos y de los teléfonos incompletos", async () => {
    const text = [HEADER, "A,C1,D,K,O,Uno,55123456", "B,C2,D,K,O,uno,55123457", "C,C3,D,K,O,Dos,1234"].join("\n");
    const panel = await previewPanel(text);
    expect(within(panel).getByText(/1 nombre repetido/)).toBeTruthy();
    expect(within(panel).getByText(/1 teléfono incompleto/)).toBeTruthy();
  });

  it("Cancelar no cambia nada", async () => {
    const panel = await previewPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Importar clientes" })).toBeNull());
    expect(saved().customers).toHaveLength(2);
    expect(byId("c1").code).toBeUndefined();
  });

  it("si con las opciones elegidas no hay nada que cambiar, no hay botón Aplicar", async () => {
    const same = [HEADER, "Cafetería Beto,BETO1,,,,Beto Ruiz,55000001"].join("\n");
    const panel = await previewPanel(same);
    expect(within(panel).getByText("No hay cambios que aplicar con estas opciones.")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Aplicar" })).toBeNull();
  });
});

describe("Clientes importados: se ven y se buscan", () => {
  async function importDefault() {
    const panel = await previewPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await screen.findByText(/Importación aplicada/);
  }

  it("la ficha muestra la dirección, los tipos y el código", async () => {
    await importDefault();
    fireEvent.click(await screen.findByText(/Ana López/, { selector: "span" }));
    expect(await screen.findByText("Calle 1, entre 2 y 3")).toBeTruthy();
    expect(screen.getByText("Kiosko · Off-Premise")).toBeTruthy();
    expect(screen.getByText("AB1")).toBeTruthy();
  });

  it("se puede buscar por código o por dirección", async () => {
    await importDefault();
    const search = screen.getByPlaceholderText("Buscar cliente o negocio");
    fireEvent.change(search, { target: { value: "cd2" } });
    expect(await screen.findByText(/Carla Gil/, { selector: "span" })).toBeTruthy();
    expect(screen.queryByText(/Ana López/, { selector: "span" })).toBeNull();
    fireEvent.change(search, { target: { value: "calle 9" } });
    expect(await screen.findByText(/Beto Ruiz/, { selector: "span" })).toBeTruthy();
  });
});
