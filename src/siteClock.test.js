import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { siteNow, setSiteClock, clearSiteClock, hasSiteClock } from "./siteClock";
import { todayStr, tomorrowStr } from "./dateUtils";
import { isPastCierre } from "./orderHelpers";

// El reloj del sitio: la hora que dice el buzón (su zona y, si el administrador la puso a mano, el ajuste) es la
// correcta; la app del vendedor la usa para saber qué día es y si ya pasó una hora, en vez de fiarse del reloj
// del teléfono. Lo que da `siteNow()` se lee con los métodos locales de Date (getHours, getDate...) igual que
// antes: solo se le suma la diferencia entre el teléfono y el sitio.

const REAL = "2026-10-30T15:00:00.000Z"; // 11:00 en Cuba (UTC-4 ese día)

beforeEach(() => {
  localStorage.clear();
  clearSiteClock();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(REAL));
});

afterEach(() => {
  vi.useRealTimers();
  clearSiteClock();
});

describe("siteNow", () => {
  it("sin la hora del sitio es la hora del teléfono", () => {
    expect(hasSiteClock()).toBe(false);
    expect(siteNow().getTime()).toBe(new Date(REAL).getTime());
  });

  it("con la zona del sitio, marca la hora de pared de allí", () => {
    setSiteClock({ now: REAL, zona: "America/Havana", ajuste: 0 });
    const now = siteNow();
    expect([now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes()]).toEqual([2026, 10, 30, 11, 0]);
  });

  it("con la hora puesta a mano, suma el ajuste (la hora del sitio es la correcta)", () => {
    setSiteClock({ now: REAL, zona: "America/Havana", ajuste: 60 });
    const now = siteNow();
    expect([now.getHours(), now.getMinutes()]).toEqual([12, 0]);
  });

  it("el reloj sigue corriendo", () => {
    setSiteClock({ now: REAL, zona: "America/Havana", ajuste: 60 });
    vi.advanceTimersByTime(30 * 60000);
    expect([siteNow().getHours(), siteNow().getMinutes()]).toEqual([12, 30]);
  });

  it("cambia de día cuando el sitio cambia de día, aunque el teléfono todavía no", () => {
    vi.setSystemTime(new Date("2026-10-31T03:30:00.000Z")); // 23:30 del 30 en Cuba
    setSiteClock({ now: "2026-10-31T03:30:00.000Z", zona: "America/Havana", ajuste: 45 });
    const now = siteNow();
    expect([now.getDate(), now.getHours(), now.getMinutes()]).toEqual([31, 0, 15]);
  });

  it("otra zona (Madrid)", () => {
    setSiteClock({ now: REAL, zona: "Europe/Madrid", ajuste: 0 });
    expect([siteNow().getHours(), siteNow().getDate()]).toEqual([16, 30]);
  });

  it("una zona que el teléfono no conoce: solo se suma el ajuste", () => {
    setSiteClock({ now: REAL, zona: "Mars/Olympus", ajuste: 30 });
    expect(siteNow().getTime()).toBe(new Date(REAL).getTime() + 30 * 60000);
  });

  it("datos que no sirven no cambian nada", () => {
    setSiteClock({ now: "no-es-fecha", zona: "America/Havana", ajuste: 0 });
    setSiteClock(null);
    setSiteClock({});
    expect(hasSiteClock()).toBe(false);
  });

  it("se recuerda al volver a abrir la app", async () => {
    setSiteClock({ now: REAL, zona: "America/Havana", ajuste: 60 });
    vi.resetModules();
    const again = await import("./siteClock");
    expect(again.hasSiteClock()).toBe(true);
    expect([again.siteNow().getHours(), again.siteNow().getMinutes()]).toEqual([12, 0]);
  });

  it("clearSiteClock vuelve a la hora del teléfono", () => {
    setSiteClock({ now: REAL, zona: "America/Havana", ajuste: 60 });
    clearSiteClock();
    expect(hasSiteClock()).toBe(false);
    expect(siteNow().getTime()).toBe(new Date(REAL).getTime());
  });
});

describe("el día de hoy y las horas, con la hora del sitio", () => {
  it("todayStr y tomorrowStr son los del sitio", () => {
    vi.setSystemTime(new Date("2026-10-31T03:30:00.000Z"));
    setSiteClock({ now: "2026-10-31T03:30:00.000Z", zona: "America/Havana", ajuste: 45 }); // ya es el 31 en el sitio
    expect(todayStr()).toBe("2026-10-31");
    expect(tomorrowStr()).toBe("2026-11-01");
  });

  it("sin hora del sitio siguen siendo los del teléfono", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(todayStr()).toBe(expected);
  });

  it("el cierre de ventas de la app (isPastCierre) cuenta con la hora del sitio", () => {
    setSiteClock({ now: REAL, zona: "America/Havana", ajuste: 0 }); // 11:00
    expect(isPastCierre(12)).toBe(false);
    setSiteClock({ now: REAL, zona: "America/Havana", ajuste: 90 }); // 12:30
    expect(isPastCierre(12)).toBe(true);
  });
});
