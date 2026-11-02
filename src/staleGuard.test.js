import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guardián de caché de las páginas sueltas (facturadora.html, admin.html): sin
// service worker, el navegador puede guardar el HTML viejo hasta 10 minutos tras
// un cambio y pedir archivos que ya no existen (404 y página en blanco). Si falla
// la carga de un script o una hoja de estilos, el guardián recarga UNA vez
// saltándose la caché. Se prueba el script tal como está en cada HTML.

const PAGES = ["facturadora.html", "admin.html"];

// Las pruebas corren desde la carpeta del proyecto, donde están los HTML.
function htmlOf(page) {
  return readFileSync(resolve(process.cwd(), page), "utf8");
}

function guardOf(page) {
  const match = htmlOf(page).match(/<script data-guard>([\s\S]*?)<\/script>/);
  return match ? match[1] : null;
}

function run(page, { alreadyReloaded = false, fetchImpl } = {}) {
  const code = guardOf(page);
  const listeners = [];
  const store = new Map(alreadyReloaded ? [["procovar-recarga-cache", "1"]] : []);
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const location = { href: `https://sitio.test/${page}`, reload: vi.fn() };
  const fetchFn = fetchImpl || vi.fn(() => Promise.resolve({}));
  const win = { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) };
  new Function("window", "location", "fetch", "sessionStorage", code)(win, location, fetchFn, sessionStorage);
  const fire = (target) => listeners.filter((l) => l.type === "error").forEach((l) => l.fn({ target }));
  return { listeners, location, fetchFn, fire, store };
}

const settle = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };

describe.each(PAGES)("guardián de caché en %s", (page) => {
  it("está en la página, antes del script de la app", () => {
    const html = htmlOf(page);
    expect(guardOf(page)).toBeTruthy();
    expect(html.indexOf("data-guard")).toBeLessThan(html.indexOf('type="module"'));
  });

  it("escucha los errores de carga (en la fase de captura, porque no suben)", () => {
    const { listeners } = run(page);
    expect(listeners).toHaveLength(1);
    expect(listeners[0].capture).toBe(true);
  });

  it("si falla un script, vuelve a pedir la página saltándose la caché y la recarga", async () => {
    const { fire, fetchFn, location } = run(page);
    fire({ tagName: "SCRIPT" });
    expect(fetchFn).toHaveBeenCalledWith(`https://sitio.test/${page}`, { cache: "reload" });
    await settle();
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("lo mismo si falla una hoja de estilos", async () => {
    const { fire, location } = run(page);
    fire({ tagName: "LINK" });
    await settle();
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("solo recarga una vez: un segundo fallo no vuelve a recargar (evita bucles)", async () => {
    const { fire, location, fetchFn } = run(page);
    fire({ tagName: "SCRIPT" });
    fire({ tagName: "SCRIPT" });
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("si ya se recargó en esta sesión, no lo intenta otra vez", () => {
    const { fire, location, fetchFn } = run(page, { alreadyReloaded: true });
    fire({ tagName: "SCRIPT" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });

  it("los errores que no son de scripts ni estilos (imágenes, etc.) se ignoran", () => {
    const { fire, location, fetchFn } = run(page);
    fire({ tagName: "IMG" });
    fire(null);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });

  it("aunque la petición falle (sin internet), igual recarga", async () => {
    const { fire, location } = run(page, { fetchImpl: vi.fn(() => Promise.reject(new Error("offline"))) });
    fire({ tagName: "SCRIPT" });
    await settle();
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
});

// facturadora.html va siempre en modo claro: el navegador no pinta márgenes, barras ni
// campos en oscuro aunque el sistema esté en modo oscuro.
describe("facturadora.html: modo claro", () => {
  const html = () => htmlOf("facturadora.html");

  it("le dice al navegador que la página es clara", () => {
    expect(html()).toMatch(/<meta name="color-scheme" content="light"\s*\/?>/);
  });

  it("sin márgenes y con el fondo claro de la página", () => {
    expect(html()).toMatch(/<style>[\s\S]*body\s*\{[^}]*margin:\s*0[^}]*background:\s*#F7F4EC/i);
  });

  it("el modo oscuro de admin.html no cambia", () => {
    expect(htmlOf("admin.html")).not.toMatch(/name="color-scheme" content="light"/);
  });
});
