// @vitest-environment node
import { describe, it, expect } from "vitest";
import { DEFAULT_SCHEDULE, parseSchedule, scheduleStatus, validateSchedule } from "./schedule";

// Horario de facturación: un solo horario (apertura y cierre) de lunes a sábado, en la hora de
// Cuba; el domingo está cerrado. Fuera de horario se pausa el sitio. Sin horario activado,
// siempre está abierto.

const on = { enabled: true, open: "09:00", close: "15:00" };
// Hora de Cuba: UTC-4 hasta el 1 de noviembre de 2026 (1 a. m.) y UTC-5 después.
const VIERNES_11AM = "2026-10-30T15:00:00.000Z";
const VIERNES_7AM = "2026-10-30T11:00:00.000Z";
const VIERNES_4_30PM = "2026-10-30T20:30:00.000Z";
const SABADO_10AM = "2026-10-31T14:00:00.000Z";
const SABADO_4PM = "2026-10-31T20:00:00.000Z";
const DOMINGO_10AM = "2026-11-01T15:00:00.000Z";

describe("scheduleStatus", () => {
  it("sin horario activado siempre está abierto", () => {
    for (const now of [VIERNES_7AM, DOMINGO_10AM, VIERNES_4_30PM]) {
      expect(scheduleStatus(DEFAULT_SCHEDULE, now)).toMatchObject({ activo: false, abierto: true, mensaje: "" });
    }
  });

  it("dentro del horario, abierto", () => {
    expect(scheduleStatus(on, VIERNES_11AM)).toMatchObject({ activo: true, abierto: true, mensaje: "", abre: "09:00", cierra: "15:00" });
    expect(scheduleStatus(on, SABADO_10AM).abierto).toBe(true);
  });

  it("la hora de apertura abre y la de cierre ya cierra", () => {
    expect(scheduleStatus(on, "2026-10-30T13:00:00.000Z").abierto).toBe(true);
    expect(scheduleStatus(on, "2026-10-30T18:59:00.000Z").abierto).toBe(true);
    expect(scheduleStatus(on, "2026-10-30T19:00:00.000Z").abierto).toBe(false);
  });

  it("antes de abrir: dice a qué hora abre hoy", () => {
    expect(scheduleStatus(on, VIERNES_7AM)).toMatchObject({ abierto: false, mensaje: "La facturación está cerrada. Abre hoy a las 9:00 a. m." });
  });

  it("después de cerrar: abre mañana", () => {
    expect(scheduleStatus(on, VIERNES_4_30PM)).toMatchObject({ abierto: false, mensaje: "La facturación está cerrada. Abre mañana sábado a las 9:00 a. m." });
  });

  it("el sábado después de cerrar, abre el lunes (el domingo no hay)", () => {
    expect(scheduleStatus(on, SABADO_4PM).mensaje).toBe("La facturación está cerrada. Abre el lunes a las 9:00 a. m.");
  });

  it("el domingo está cerrado todo el día", () => {
    expect(scheduleStatus(on, DOMINGO_10AM)).toMatchObject({ abierto: false, mensaje: "La facturación está cerrada hoy (domingo). Abre el lunes a las 9:00 a. m." });
  });

  it("el cambio de horario de verano de Cuba no descuadra la hora", () => {
    expect(scheduleStatus(on, "2026-11-02T13:59:00.000Z").abierto).toBe(false);
    expect(scheduleStatus(on, "2026-11-02T14:00:00.000Z").abierto).toBe(true);
  });

  it("las horas de la tarde se dicen en 12 horas", () => {
    expect(scheduleStatus({ enabled: true, open: "13:30", close: "17:45" }, VIERNES_7AM).mensaje).toBe("La facturación está cerrada. Abre hoy a las 1:30 p. m.");
  });
});

describe("validateSchedule y parseSchedule", () => {
  it("acepta horas HH:MM con apertura antes del cierre", () => {
    expect(validateSchedule({ enabled: true, open: "08:30", close: "16:00" })).toEqual({ value: { enabled: true, open: "08:30", close: "16:00" } });
  });

  it("rechaza horas mal escritas o apertura no anterior al cierre", () => {
    for (const bad of [{ open: "9:00" }, { open: "25:00" }, { close: "15:60" }, { open: "nada" }, { open: "15:00" }, { open: "16:00", close: "15:00" }]) {
      const out = validateSchedule({ enabled: true, open: "09:00", close: "15:00", ...bad });
      expect(out.error).toBeTruthy();
    }
  });

  it("enabled debe ser verdadero o falso", () => {
    expect(validateSchedule({ enabled: "si", open: "09:00", close: "15:00" }).error).toMatch(/activ/i);
  });

  it("parseSchedule lee lo guardado, y con algo roto vuelve al valor por defecto", () => {
    expect(parseSchedule(JSON.stringify(on))).toEqual(on);
    expect(parseSchedule("{no json")).toEqual(DEFAULT_SCHEDULE);
    expect(parseSchedule(null)).toEqual(DEFAULT_SCHEDULE);
    expect(parseSchedule(JSON.stringify({ enabled: true, open: "xx", close: "15:00" }))).toEqual(DEFAULT_SCHEDULE);
  });
});

describe("cubaDate", () => {
  it("la fecha de hoy en Cuba, no en UTC", async () => {
    const { cubaDate } = await import("./schedule");
    expect(cubaDate("2026-10-30T15:00:00.000Z")).toBe("2026-10-30");
    expect(cubaDate("2026-10-31T02:30:00.000Z")).toBe("2026-10-30");
    expect(cubaDate("2026-10-31T04:00:00.000Z")).toBe("2026-10-31");
  });
});
