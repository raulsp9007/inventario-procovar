import { describe, it, expect, afterEach, vi } from "vitest";
import { getWeekStartStr, getPreviousWeekRangeStr, getMonthStartStr, formatHour12, todayStr, nextBusinessDayStr, isSundayStr, addDaysStr } from "./dateUtils";

afterEach(() => {
  vi.useRealTimers();
});

describe("fechas por defecto usan el día del calendario (sin corrimiento de las 4 pm)", () => {
  it("un domingo a las 5 pm sigue siendo la semana que empezó ese lunes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 17, 0)); // domingo 20 sep 2026, 17:00
    expect(todayStr()).toBe("2026-09-20");
    expect(getWeekStartStr()).toBe("2026-09-14");
    expect(getPreviousWeekRangeStr()).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });

  it("el último día del mes a las 5 pm sigue en ese mes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 17, 0)); // miércoles 30 sep 2026
    expect(getMonthStartStr()).toBe("2026-09-01");
  });
});

describe("formatHour12", () => {
  it("formatea horas de 0 a 23 en 12 horas", () => {
    expect(formatHour12(0)).toBe("12:00 AM");
    expect(formatHour12(9)).toBe("9:00 AM");
    expect(formatHour12(12)).toBe("12:00 PM");
    expect(formatHour12(16)).toBe("4:00 PM");
    expect(formatHour12(23)).toBe("11:00 PM");
  });
});

describe("nextBusinessDayStr / isSundayStr / addDaysStr", () => {
  it("un día común (lunes a viernes) da el día siguiente, como tomorrowStr", () => {
    expect(nextBusinessDayStr("2026-09-23")).toBe("2026-09-24"); // miércoles -> jueves
    expect(nextBusinessDayStr("2026-09-25")).toBe("2026-09-26"); // viernes -> sábado
  });

  it("un sábado salta el domingo y da el lunes", () => {
    expect(nextBusinessDayStr("2026-09-26")).toBe("2026-09-28"); // sábado -> lunes
  });

  it("un domingo da el lunes (no hace falta saltar nada más)", () => {
    expect(nextBusinessDayStr("2026-09-27")).toBe("2026-09-28"); // domingo -> lunes
  });

  it("sin fecha de referencia, usa hoy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26)); // sábado 26 sep 2026
    expect(nextBusinessDayStr()).toBe("2026-09-28");
    vi.useRealTimers();
  });

  it("isSundayStr distingue domingo de cualquier otro día", () => {
    expect(isSundayStr("2026-09-27")).toBe(true);
    expect(isSundayStr("2026-09-26")).toBe(false);
    expect(isSundayStr("2026-09-28")).toBe(false);
  });

  it("addDaysStr suma (o resta) días de calendario sin más lógica", () => {
    expect(addDaysStr("2026-09-26", 1)).toBe("2026-09-27");
    expect(addDaysStr("2026-09-26", 2)).toBe("2026-09-28");
    expect(addDaysStr("2026-09-01", -1)).toBe("2026-08-31");
  });
});
