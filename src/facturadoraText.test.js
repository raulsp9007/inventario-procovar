import { describe, it, expect, vi, afterEach } from "vitest";
import { clock12, connectionText, newOrdersText, sentArrivalText, lastReceivedText } from "./facturadoraText";
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

// Hora de envío y de llegada: si el pedido tardó (2 minutos o más) en llegar, se dicen las dos.
describe("sentArrivalText", () => {
  const order = (sent, created) => ({ sentAt: sent && new Date(2026, 9, 30, ...sent).toISOString(), createdAt: new Date(2026, 9, 30, ...created).toISOString() });

  it("sin hora de envío (pedidos de antes) o a tiempo, solo la hora en que llegó", () => {
    expect(sentArrivalText({ createdAt: new Date(2026, 9, 30, 16, 3).toISOString() })).toBe("4:03 p. m.");
    expect(sentArrivalText(order([16, 2], [16, 3]))).toBe("4:03 p. m.");
  });

  it("si tardó 2 minutos o más, dice cuándo se envió y cuándo llegó", () => {
    expect(sentArrivalText(order([15, 58], [16, 3]))).toBe("enviado 3:58 p. m. · llegó 4:03 p. m.");
    expect(sentArrivalText(order([16, 1], [16, 3]))).toBe("enviado 4:01 p. m. · llegó 4:03 p. m.");
  });

  it("datos que no sirven no rompen: lo que haya", () => {
    expect(sentArrivalText({})).toBe("");
    expect(sentArrivalText({ sentAt: "x", createdAt: new Date(2026, 9, 30, 9, 5).toISOString() })).toBe("9:05 a. m.");
  });
});

describe("lastReceivedText", () => {
  const orders = (...times) => times.map((t, i) => ({ id: `o${i}`, createdAt: new Date(2026, 9, 30, ...t).toISOString() }));
  const now = new Date(2026, 9, 30, 11, 0, 0).getTime();

  it("sin pedidos, dice que todavía no ha llegado ninguno", () => {
    expect(lastReceivedText([], now)).toBe("Todavía no ha llegado ningún pedido");
  });

  it("dice hace cuánto llegó el último", () => {
    expect(lastReceivedText(orders([10, 30], [10, 57]), now)).toBe("Último pedido recibido hace 3 min");
    expect(lastReceivedText(orders([10, 59, 30]), now)).toBe("Último pedido recibido hace unos segundos");
    expect(lastReceivedText(orders([10, 0]), now)).toBe("Último pedido recibido hace 1 h");
    expect(lastReceivedText(orders([9, 45]), now)).toBe("Último pedido recibido hace 1 h 15 min");
    expect(lastReceivedText(orders([8, 0]), now)).toBe("Último pedido recibido hace 3 h");
  });

  it("si el reloj de esta computadora va atrasado y el pedido parece del futuro, dice unos segundos", () => {
    expect(lastReceivedText(orders([11, 5]), now)).toBe("Último pedido recibido hace unos segundos");
  });
});
