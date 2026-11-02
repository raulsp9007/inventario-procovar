import { describe, it, expect, vi, afterEach } from "vitest";
import { clock12, connectionText, newOrdersText } from "./facturadoraText";
import { playChime } from "./alertSound";

// Textos de la página de la facturadora, en palabras de todos los días y con la hora en
// formato de 12 horas (4:43 p. m.), y el aviso sonoro de pedido nuevo.

const at = (h, m) => new Date(2026, 9, 30, h, m).getTime();

describe("clock12", () => {
  it("12 horas con a. m. y p. m.", () => {
    expect(clock12(at(9, 5))).toBe("9:05 a. m.");
    expect(clock12(at(16, 43))).toBe("4:43 p. m.");
    expect(clock12(at(12, 0))).toBe("12:00 p. m.");
    expect(clock12(at(0, 7))).toBe("12:07 a. m.");
    expect(clock12(at(23, 59))).toBe("11:59 p. m.");
  });

  it("acepta fechas en texto y devuelve vacío si no es una fecha", () => {
    expect(clock12(new Date(2026, 9, 30, 10, 30).toISOString())).toBe("10:30 a. m.");
    expect(clock12("nada")).toBe("");
    expect(clock12(null)).toBe("");
  });
});

describe("connectionText: lo que se dice de la conexión", () => {
  const base = { phase: "ok", lastSyncAt: at(16, 43), pendingOps: 0 };

  it("todo bien", () => {
    expect(connectionText(base)).toBe("Todo en orden. Actualizado a las 4:43 p. m.");
  });

  it("sin internet, con y sin lo último que llegó", () => {
    expect(connectionText({ ...base, phase: "offline" })).toBe("No hay internet. Estás viendo lo último que llegó a las 4:43 p. m.");
    expect(connectionText({ ...base, phase: "offline", lastSyncAt: null })).toBe("No hay internet.");
  });

  it("un problema del servidor", () => {
    expect(connectionText({ ...base, phase: "error" })).toBe("Hubo un problema al conectar. Se volverá a intentar solo.");
  });

  it("mientras conecta", () => {
    expect(connectionText({ phase: "idle", lastSyncAt: null, pendingOps: 0 })).toBe("Conectando…");
  });

  it("avisa de las confirmaciones que esperan internet", () => {
    expect(connectionText({ ...base, phase: "offline", pendingOps: 1 })).toContain("1 confirmación sin enviar: se enviará cuando vuelva el internet.");
    expect(connectionText({ ...base, phase: "offline", pendingOps: 3 })).toContain("3 confirmaciones sin enviar: se enviarán cuando vuelva el internet.");
  });
});

describe("newOrdersText", () => {
  it("uno o varios", () => {
    expect(newOrdersText(1)).toBe("Llegó 1 pedido nuevo");
    expect(newOrdersText(3)).toBe("Llegaron 3 pedidos nuevos");
  });
});

describe("playChime", () => {
  const original = window.AudioContext;
  afterEach(() => { window.AudioContext = original; });

  it("toca dos notas cortas", () => {
    const starts = [];
    const osc = () => ({ type: "", frequency: { value: 0 }, connect() {}, start: (t) => starts.push(t), stop() {} });
    const gain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
    window.AudioContext = vi.fn(function () { return { state: "running", currentTime: 0, destination: {}, createOscillator: osc, createGain: gain, resume() {} }; });
    playChime();
    expect(starts).toHaveLength(2);
  });

  it("sin audio en el navegador no falla", () => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    expect(() => playChime()).not.toThrow();
  });

  it("si el audio falla, no rompe la página", () => {
    window.AudioContext = vi.fn(() => { throw new Error("bloqueado"); });
    expect(() => playChime()).not.toThrow();
  });
});
