import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatProductForShare, shareProductPhoto } from "./productShare";
import { formatCUP, formatUSD } from "./money";

// Texto que acompaña a la foto de un producto al compartirla por WhatsApp:
// nombre en negrita, precio del formato completo y precio por unidad. El
// precio guardado es USD cuando hay tasa (CUP directo si no), igual que en
// el resto de la app.

const formats = [{ code: "caja24u", units: 24 }];
const product = { code: "MALTA", name: "Malta Guajira 330ml", format: "caja24u" };

describe("formatProductForShare", () => {
  it("con formato y tasa: nombre, precio del formato y precio por unidad, en CUP y USD", () => {
    const text = formatProductForShare({ product, price: 4.5, formats, exchangeRate: 800 });
    expect(text.split("\n")).toEqual([
      "*Malta Guajira 330ml*",
      `caja24u (24 uds): ${formatCUP(3600)} · ${formatUSD(4.5)}`,
      `Por unidad: ${formatCUP(150)} · ${formatUSD(4.5 / 24)}`,
    ]);
  });

  it("sin tasa: el precio es CUP directo y no hay USD", () => {
    const text = formatProductForShare({ product, price: 3600, formats, exchangeRate: null });
    expect(text.split("\n")).toEqual([
      "*Malta Guajira 330ml*",
      `caja24u (24 uds): ${formatCUP(3600)}`,
      `Por unidad: ${formatCUP(150)}`,
    ]);
  });

  it("sin formato: una sola línea de precio, sin precio por unidad", () => {
    const text = formatProductForShare({ product: { ...product, format: "" }, price: 4.5, formats, exchangeRate: 800 });
    expect(text.split("\n")).toEqual([
      "*Malta Guajira 330ml*",
      `Precio: ${formatCUP(3600)} · ${formatUSD(4.5)}`,
    ]);
  });

  it("sin precio: solo el nombre", () => {
    expect(formatProductForShare({ product, price: 0, formats, exchangeRate: 800 })).toBe("*Malta Guajira 330ml*");
    expect(formatProductForShare({ product, price: undefined, formats, exchangeRate: 800 })).toBe("*Malta Guajira 330ml*");
  });

  it("un formato que ya no existe cae a una sola línea de precio", () => {
    const text = formatProductForShare({ product: { ...product, format: "borrado" }, price: 4.5, formats, exchangeRate: 800 });
    expect(text.split("\n")[1]).toBe(`Precio: ${formatCUP(3600)} · ${formatUSD(4.5)}`);
  });
});

describe("shareProductPhoto", () => {
  const blob = new Blob(["jpg"], { type: "image/jpeg" });
  const caption = "*Malta Guajira 330ml*\nPrecio: 3600 CUP";
  let openSpy;

  function setShare({ share, canShare }) {
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
  }

  beforeEach(() => {
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    URL.createObjectURL = vi.fn(() => "blob:foto");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    delete navigator.share;
    delete navigator.canShare;
    vi.restoreAllMocks();
  });

  it("comparte la foto como archivo con el texto de pie", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare({ share, canShare: () => true });

    const result = await shareProductPhoto({ blob, caption, name: "Malta Guajira 330ml" });

    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(arg.text).toBe(caption);
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].type).toBe("image/jpeg");
    expect(arg.files[0].name).toBe("malta-guajira-330ml.jpg");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("si la persona cierra el menú de compartir no se considera error ni se abre otra cosa", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("cancelado"), { name: "AbortError" }));
    setShare({ share, canShare: () => true });

    const result = await shareProductPhoto({ blob, caption, name: "Malta" });

    expect(result).toBe("cancelled");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("sin soporte para compartir archivos: descarga la foto y abre WhatsApp con el texto", async () => {
    setShare({ share: undefined, canShare: undefined });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await shareProductPhoto({ blob, caption, name: "Malta Guajira 330ml" });

    expect(result).toBe("fallback");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.mock.calls[0][0];
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Malta Guajira 330ml");
  });

  it("canShare dice que no se pueden compartir archivos: usa el respaldo", async () => {
    const share = vi.fn();
    setShare({ share, canShare: () => false });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await shareProductPhoto({ blob, caption, name: "Malta" });

    expect(result).toBe("fallback");
    expect(share).not.toHaveBeenCalled();
  });
});
