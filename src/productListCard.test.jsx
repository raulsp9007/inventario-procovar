import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// El redimensionado usa canvas (no existe en jsdom): doble que devuelve una
// foto ya reducida.
vi.mock("./imageResize", () => ({
  fitWithin: (w, h) => ({ width: w, height: h }),
  resizeImageFile: vi.fn(async () => new Blob(["reducida"], { type: "image/jpeg" })),
}));

import InventoryApp from "./InventoryApp";
import { resizeImageFile } from "./imageResize";
import { putProductImage, listProductImageCodes, deleteProductImage } from "./productImageStore";

// Configuración > "Lista de productos": exportar e importar el catálogo
// eligiendo qué datos mover (nombre siempre; precio USD, cantidad, foto y
// formato opcionales). Al importar hay vista previa y no se toca nada hasta
// confirmar.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "Parranda 500ml", color: "#C77A2E", hl: 0.005, format: "sixpack" },
  { code: "M330", name: "Malta 330ml", short: "Malta 330ml", color: "#274E37", format: "paca12u" },
  { code: "OLD", name: "Viejo", short: "Viejo", color: "#000", archived: true },
];

function seed(extra = {}) {
  localStorage.setItem("procovar-active-tab", "config");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [], customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 100, M330: 40, OLD: 5 }, prices: { P500: 12, M330: 9, OLD: 1 }, pricesAreUsd: true, exchangeRate: 120,
    productFormats: [{ code: "sixpack", units: 6 }, { code: "paca12u", units: 12 }],
    hlPerFormatMigrated: true, goalProductsMigrated: true,
    ...extra,
  }));
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function openApp() {
  render(<InventoryApp />);
  return await screen.findByText("Lista de productos");
}

const listFile = (content) => new File([JSON.stringify(content)], "lista.json", { type: "application/json" });
const validList = (over = {}) => ({
  kind: "procovar-productos", version: 1, exportedAt: "2026-10-27T10:00:00.000Z",
  fields: ["precio", "cantidad", "formato"],
  formats: [{ code: "caja24u", units: 24 }],
  products: [
    { nombre: "PARRANDA 500ML", precio: 15, cantidad: 30, formato: "caja24u" },
    { nombre: "Cerveza Nueva", precio: 20, cantidad: 8 },
  ],
  ...over,
});

async function chooseFile(content) {
  const input = await screen.findByLabelText("Archivo de lista de productos");
  fireEvent.change(input, { target: { files: [content instanceof File ? content : listFile(content)] } });
}

let shareSpy;

beforeEach(async () => {
  resizeImageFile.mockReset();
  resizeImageFile.mockImplementation(async () => new Blob(["reducida"], { type: "image/jpeg" }));
  localStorage.clear();
  for (const code of await listProductImageCodes()) await deleteProductImage(code);
  URL.createObjectURL = vi.fn(() => "blob:foto");
  URL.revokeObjectURL = vi.fn();
  shareSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
  seed();
});

afterEach(() => {
  delete navigator.share;
  delete navigator.canShare;
  vi.restoreAllMocks();
});

describe("Lista de productos: tarjeta", () => {
  it("está en Configuración con Exportar e Importar", async () => {
    await openApp();
    expect(screen.getByRole("button", { name: "Exportar lista" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar lista" })).toBeTruthy();
  });
});

describe("Lista de productos: exportar", () => {
  async function openExport() {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "Exportar lista" }));
    return await screen.findByRole("group", { name: "Datos a exportar" });
  }
  const sharedFile = () => shareSpy.mock.calls[0][0].files[0];

  it("el nombre va siempre y los demás datos se eligen (todos marcados al empezar)", async () => {
    const panel = await openExport();
    const name = within(panel).getByLabelText("Nombre (siempre)");
    expect(name.checked).toBe(true);
    expect(name.disabled).toBe(true);
    for (const label of ["Precio USD", "Cantidad", "Foto", "Formato"]) {
      expect(within(panel).getByLabelText(label).checked).toBe(true);
    }
  });

  it("comparte un archivo con los datos marcados (sin los productos archivados)", async () => {
    await putProductImage("P500", new Blob(["ABC"], { type: "image/jpeg" }));
    const panel = await openExport();
    fireEvent.click(within(panel).getByRole("button", { name: "Compartir lista" }));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const file = sharedFile();
    expect(file.name).toMatch(/^procovar-productos-\d{4}-\d{2}-\d{2}\.json$/);
    const out = JSON.parse(await readFile(file));
    expect(out.kind).toBe("procovar-productos");
    expect(out.fields).toEqual(["precio", "cantidad", "foto", "formato"]);
    expect(out.products).toHaveLength(2);
    expect(out.products[0]).toMatchObject({ nombre: "Parranda 500ml", precio: 12, cantidad: 100, formato: "sixpack" });
    expect(out.products[0].foto).toEqual({ type: "image/jpeg", data: "QUJD" });
    expect(out.products[1].foto).toBeUndefined();
    expect(out.formats).toEqual([{ code: "sixpack", units: 6 }, { code: "paca12u", units: 12 }]);
    expect(await within(panel).findByText("Lista exportada: 2 productos")).toBeTruthy();
  });

  it("desmarcar un dato lo deja fuera del archivo", async () => {
    const panel = await openExport();
    fireEvent.click(within(panel).getByLabelText("Cantidad"));
    fireEvent.click(within(panel).getByLabelText("Foto"));
    fireEvent.click(within(panel).getByRole("button", { name: "Compartir lista" }));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const out = JSON.parse(await readFile(sharedFile()));
    expect(out.fields).toEqual(["precio", "formato"]);
    expect(out.products[0].cantidad).toBeUndefined();
    expect(out.products[0].foto).toBeUndefined();
  });

  it("sin tasa de conversión el precio USD no se puede exportar", async () => {
    seed({ exchangeRate: null });
    const panel = await openExport();
    const price = within(panel).getByLabelText("Precio USD");
    expect(price.disabled).toBe(true);
    expect(price.checked).toBe(false);
    expect(within(panel).getByText(/tasa de conversión/i)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Compartir lista" }));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const out = JSON.parse(await readFile(sharedFile()));
    expect(out.fields).not.toContain("precio");
  });

  it("Cancelar cierra el panel", async () => {
    const panel = await openExport();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Datos a exportar" })).toBeNull());
  });
});

describe("Lista de productos: importar", () => {
  async function importPanel(content) {
    await openApp();
    await chooseFile(content);
    return await screen.findByRole("group", { name: "Importar lista de productos" });
  }

  it("un archivo que no sirve muestra el motivo y no abre la vista previa", async () => {
    await openApp();
    await chooseFile(new File(["esto no es json"], "x.json", { type: "application/json" }));
    expect(await screen.findByText("El archivo no es una lista de productos válida.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Importar lista de productos" })).toBeNull();
  });

  it("muestra la vista previa con cuántos son nuevos, cuáles se actualizan y avisos", async () => {
    const panel = await importPanel(validList());
    expect(within(panel).getByText("2 productos en el archivo")).toBeTruthy();
    // Por defecto solo agrega los nuevos.
    expect(within(panel).getByText("1 nuevo · 0 se actualizan · 0 sin cambios · 1 ya existe")).toBeTruthy();
    expect(within(panel).getByText(/Cerveza Nueva/)).toBeTruthy();
    expect(within(panel).getByText(/sin HL/i)).toBeTruthy();
    // Nada cambió todavía.
    expect(saved().products).toHaveLength(3);
  });

  it("solo ofrece los datos que trae el archivo", async () => {
    const panel = await importPanel(validList());
    expect(within(panel).getByLabelText("Precio USD")).toBeTruthy();
    expect(within(panel).getByLabelText("Cantidad")).toBeTruthy();
    expect(within(panel).getByLabelText("Formato")).toBeTruthy();
    expect(within(panel).queryByLabelText("Foto")).toBeNull();
  });

  it("aplicar con 'solo nuevos' agrega el producto y no toca los que ya existen", async () => {
    const panel = await importPanel(validList());
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(saved().products).toHaveLength(4));
    const next = saved();
    const created = next.products.find((p) => p.name === "Cerveza Nueva");
    expect(created.code).toBe("CERVEZANUEVA");
    expect(next.prices.CERVEZANUEVA).toBe(20);
    expect(next.stock.CERVEZANUEVA).toBe(8);
    expect(next.prices.P500).toBe(12);
    expect(next.stock.P500).toBe(100);
    expect(next.movements.some((m) => m.type === "ajuste" && m.code === "CERVEZANUEVA" && m.qty === 8)).toBe(true);
    expect(await screen.findByText("Importación aplicada: 1 nuevo")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Importar lista de productos" })).toBeNull();
  });

  it("'Actualizar también los que ya existen' con cantidad reemplazar", async () => {
    const panel = await importPanel(validList());
    fireEvent.click(within(panel).getByLabelText("Actualizar también los que ya existen"));
    expect(within(panel).getByText("1 nuevo · 1 se actualiza · 0 sin cambios · 0 ya existen")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(saved().prices.P500).toBe(15));
    const next = saved();
    expect(next.stock.P500).toBe(30);
    expect(next.products.find((p) => p.code === "P500").format).toBe("caja24u");
    expect(next.productFormats).toContainEqual({ code: "caja24u", units: 24 });
    expect(next.movements.some((m) => m.type === "ajuste" && m.code === "P500" && m.qty === -70)).toBe(true);
    expect(await screen.findByText("Importación aplicada: 1 nuevo, 1 actualizado")).toBeTruthy();
  });

  it("cantidad 'Sumar al stock actual'", async () => {
    const panel = await importPanel(validList());
    fireEvent.click(within(panel).getByLabelText("Actualizar también los que ya existen"));
    fireEvent.click(within(panel).getByLabelText("Sumar al stock actual"));
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(saved().stock.P500).toBe(130));
  });

  it("desmarcar un dato lo deja sin importar", async () => {
    const panel = await importPanel(validList());
    fireEvent.click(within(panel).getByLabelText("Actualizar también los que ya existen"));
    fireEvent.click(within(panel).getByLabelText("Cantidad"));
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(saved().prices.P500).toBe(15));
    expect(saved().stock.P500).toBe(100);
    expect(saved().stock.CERVEZANUEVA).toBe(0);
  });

  it("las fotos del archivo se guardan para el producto", async () => {
    const withPhoto = validList({
      fields: ["foto"],
      products: [{ nombre: "Cerveza Nueva", foto: { type: "image/jpeg", data: "QUJD" } }],
    });
    const panel = await importPanel(withPhoto);
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    await waitFor(async () => expect(await listProductImageCodes()).toContain("CERVEZANUEVA"));
  });

  it("Cancelar no cambia nada", async () => {
    const panel = await importPanel(validList());
    fireEvent.click(within(panel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Importar lista de productos" })).toBeNull());
    expect(saved().products).toHaveLength(3);
    expect(saved().prices.P500).toBe(12);
  });

  it("si con las opciones elegidas no hay nada que cambiar, no hay botón Aplicar", async () => {
    const same = validList({ fields: ["precio"], products: [{ nombre: "Parranda 500ml", precio: 12 }] });
    const panel = await importPanel(same);
    fireEvent.click(within(panel).getByLabelText("Actualizar también los que ya existen"));
    expect(within(panel).getByText("No hay cambios que aplicar con estas opciones.")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Aplicar" })).toBeNull();
  });
});
