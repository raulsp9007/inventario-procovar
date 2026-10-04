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
import { putProductImage, getProductImage, listProductImageCodes, deleteProductImage } from "./productImageStore";

// Fotos de los productos (opción A): una foto por producto, guardada aparte
// del estado; en la lista cada producto muestra su foto y un botón
// "Compartir" que la manda por WhatsApp con nombre y precios de pie de foto.

const STORAGE_KEY = "procovar-inventario-v1";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", format: "caja24u" },
  { code: "M1500", name: "Malta Guajira 1500ml", short: "M-1500", color: "#274E37" },
];

function seed() {
  localStorage.setItem("procovar-active-tab", "stock");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements: [], customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 142, M1500: 38 }, prices: { P500: 4.5, M1500: 6 }, pricesAreUsd: true, exchangeRate: 800,
    productFormats: [{ code: "caja24u", units: 24 }],
  }));
}

const photo = () => new File(["grande"], "foto.jpg", { type: "image/jpeg" });
let shareSpy;
let urlCount;

beforeEach(async () => {
  // Sin restos de un "una sola vez" que un test anterior no llegó a gastar.
  resizeImageFile.mockReset();
  resizeImageFile.mockImplementation(async () => new Blob(["reducida"], { type: "image/jpeg" }));
  localStorage.clear();
  for (const code of await listProductImageCodes()) await deleteProductImage(code);
  urlCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:foto-${++urlCount}`);
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

describe("Productos: fotos en la lista", () => {
  it("un producto sin foto ofrece 'Agregar foto' y no 'Compartir'", async () => {
    render(<InventoryApp />);
    expect(await screen.findByRole("button", { name: "Agregar foto de Parranda 500ml" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Compartir/ })).toBeNull();
    expect(screen.queryByAltText("Foto de Parranda 500ml")).toBeNull();
  });

  it("un producto con foto la muestra y ofrece 'Compartir'", async () => {
    await putProductImage("P500", new Blob(["x"], { type: "image/jpeg" }));
    render(<InventoryApp />);
    const img = await screen.findByAltText("Foto de Parranda 500ml");
    expect(img.getAttribute("src")).toMatch(/^blob:/);
    expect(screen.getByRole("button", { name: "Compartir Parranda 500ml" })).toBeTruthy();
    // El otro producto sigue sin foto.
    expect(screen.getByRole("button", { name: "Agregar foto de Malta Guajira 1500ml" })).toBeTruthy();
  });

  it("agregar foto: elegir un archivo la guarda, la muestra y el botón pasa a 'Compartir'", async () => {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar foto de Parranda 500ml" }));
    fireEvent.change(screen.getByLabelText("Foto desde la galería"), { target: { files: [photo()] } });

    expect(await screen.findByAltText("Foto de Parranda 500ml")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compartir Parranda 500ml" })).toBeTruthy();
    expect((await getProductImage("P500")).size).toBe("reducida".length);
    // La foto de un producto no aparece en el otro.
    expect(screen.queryByAltText("Foto de Malta Guajira 1500ml")).toBeNull();
  });

  it("las fotos no se guardan dentro del estado de la app", async () => {
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar foto de Parranda 500ml" }));
    fireEvent.change(screen.getByLabelText("Foto desde la galería"), { target: { files: [photo()] } });
    await screen.findByAltText("Foto de Parranda 500ml");
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("reducida");
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("image/jpeg");
  });

  it("Compartir manda la foto con nombre y precios de pie de foto", async () => {
    await putProductImage("P500", new Blob(["x"], { type: "image/jpeg" }));
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Compartir Parranda 500ml" }));

    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.files[0].name).toBe("parranda-500ml.jpg");
    const lines = arg.text.split("\n");
    expect(lines[0]).toBe("*Parranda 500ml*");
    expect(lines[1]).toMatch(/^caja24u \(24 uds\): 3600 CUP · US\$4\.50$/);
    expect(lines[2]).toMatch(/^Por unidad: 150 CUP · US\$0\.19$/);
  });

  it("con foto: 'Cambiar foto' la reemplaza por la nueva", async () => {
    await putProductImage("P500", new Blob(["vieja"], { type: "image/jpeg" }));
    render(<InventoryApp />);
    const before = (await screen.findByAltText("Foto de Parranda 500ml")).getAttribute("src");

    resizeImageFile.mockResolvedValueOnce(new Blob(["nueva-foto"], { type: "image/jpeg" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar foto de Parranda 500ml" }));
    fireEvent.change(screen.getByLabelText("Foto desde la galería"), { target: { files: [photo()] } });

    await waitFor(() => expect(screen.getByAltText("Foto de Parranda 500ml").getAttribute("src")).not.toBe(before));
    expect((await getProductImage("P500")).size).toBe("nueva-foto".length);
    // Sigue habiendo una sola foto por producto.
    expect(await listProductImageCodes()).toEqual(["P500"]);
  });

  it("sin foto no hay 'Cambiar foto' (solo 'Agregar foto')", async () => {
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Agregar foto de Parranda 500ml" });
    expect(screen.queryByRole("button", { name: /Cambiar foto/ })).toBeNull();
  });

  it("si la foto nueva falla, la anterior se conserva", async () => {
    await putProductImage("P500", new Blob(["vieja"], { type: "image/jpeg" }));
    render(<InventoryApp />);
    await screen.findByAltText("Foto de Parranda 500ml");

    resizeImageFile.mockRejectedValueOnce(new Error("no es imagen"));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar foto de Parranda 500ml" }));
    fireEvent.change(screen.getByLabelText("Foto desde la galería"), { target: { files: [new File(["x"], "x.txt")] } });

    expect(await screen.findByText(/No se pudo guardar la foto/)).toBeTruthy();
    expect(screen.getByAltText("Foto de Parranda 500ml")).toBeTruthy();
    expect((await getProductImage("P500")).size).toBe("vieja".length);
  });

  it("un error al guardar la foto se avisa y no deja foto a medias", async () => {
    resizeImageFile.mockRejectedValueOnce(new Error("no es imagen"));
    render(<InventoryApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar foto de Parranda 500ml" }));
    fireEvent.change(screen.getByLabelText("Foto desde la galería"), { target: { files: [new File(["x"], "x.txt")] } });

    expect(await screen.findByText(/No se pudo guardar la foto/)).toBeTruthy();
    expect(screen.queryByAltText("Foto de Parranda 500ml")).toBeNull();
    expect(await getProductImage("P500")).toBeNull();
  });
});

describe("Productos: fotos en el modo Ajustar", () => {
  async function openEditCard(code) {
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar" }));
    await waitFor(() => expect(document.querySelector(`[data-product-code="${code}"]`)).toBeTruthy());
    fireEvent.click(document.querySelector(`[data-product-code="${code}"]`));
    return document.querySelector(`[data-product-code="${code}"]`);
  }

  it("sin foto: ofrece tomarla o elegirla de la galería, y no 'Quitar'", async () => {
    render(<InventoryApp />);
    const card = await openEditCard("P500");
    expect(within(card).getByRole("button", { name: "Tomar foto de Parranda 500ml" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Elegir foto de Parranda 500ml de la galería" })).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /Quitar foto/ })).toBeNull();
  });

  it("la cámara usa un campo de archivo con captura; la galería, uno sin captura", async () => {
    render(<InventoryApp />);
    await openEditCard("P500");
    expect(screen.getByLabelText("Foto desde la cámara").getAttribute("capture")).toBe("environment");
    expect(screen.getByLabelText("Foto desde la galería").hasAttribute("capture")).toBe(false);
  });

  it("elegir de la galería guarda la foto del producto abierto", async () => {
    render(<InventoryApp />);
    const card = await openEditCard("P500");
    fireEvent.click(within(card).getByRole("button", { name: "Elegir foto de Parranda 500ml de la galería" }));
    fireEvent.change(screen.getByLabelText("Foto desde la galería"), { target: { files: [photo()] } });

    await waitFor(async () => expect(await getProductImage("P500")).not.toBeNull());
    expect(await getProductImage("M1500")).toBeNull();
    expect(await within(card).findByAltText("Foto de Parranda 500ml")).toBeTruthy();
  });

  it("con foto: elegir otra de la galería la reemplaza", async () => {
    await putProductImage("P500", new Blob(["vieja"], { type: "image/jpeg" }));
    render(<InventoryApp />);
    const card = await openEditCard("P500");
    resizeImageFile.mockResolvedValueOnce(new Blob(["nueva-foto"], { type: "image/jpeg" }));
    fireEvent.click(await within(card).findByRole("button", { name: "Elegir foto de Parranda 500ml de la galería" }));
    fireEvent.change(screen.getByLabelText("Foto desde la galería"), { target: { files: [photo()] } });

    await waitFor(async () => expect((await getProductImage("P500")).size).toBe("nueva-foto".length));
  });

  it("con foto: 'Quitar foto' la borra", async () => {
    await putProductImage("P500", new Blob(["x"], { type: "image/jpeg" }));
    render(<InventoryApp />);
    const card = await openEditCard("P500");
    fireEvent.click(await within(card).findByRole("button", { name: "Quitar foto de Parranda 500ml" }));

    await waitFor(() => expect(within(card).queryByAltText("Foto de Parranda 500ml")).toBeNull());
    expect(await getProductImage("P500")).toBeNull();
  });
});
