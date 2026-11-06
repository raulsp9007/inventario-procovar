// @vitest-environment node
import { describe, it, expect } from "vitest";
import { DEFAULT_SCHEDULE, DEFAULT_CIERRE, DEFAULT_ZONE, ZONES, parseSchedule, scheduleStatus, validateSchedule, validateCierre, parseCierre, cierreStatus, parseZone, siteNow, cubaDate, adjustFromManual, parseAdjust, shiftIso, nextWorkingDay } from "./schedule";

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

// Cierre de facturación del día: pasada esa hora ya no se envían pedidos para hoy (sí para otro día).
// Es aparte del horario del sitio, que pausa todo. Hora de Cuba.
describe("cierreStatus", () => {
  const cierre = { enabled: true, time: "10:00" };

  it("sin activar nunca está cerrado", () => {
    expect(DEFAULT_CIERRE).toEqual({ enabled: false, time: "15:00" });
    expect(cierreStatus(DEFAULT_CIERRE, VIERNES_4_30PM)).toEqual({ activo: false, hora: "15:00", cerrado: false, mensaje: "" });
  });

  it("antes de la hora, abierto", () => {
    expect(cierreStatus(cierre, VIERNES_7AM)).toEqual({ activo: true, hora: "10:00", cerrado: false, mensaje: "" });
  });

  it("a la hora en punto y después, cerrado, con el motivo", () => {
    const msg = "La facturación de hoy cerró a las 10:00 a. m. Pasa el pedido para mañana.";
    expect(cierreStatus(cierre, VIERNES_11AM)).toEqual({ activo: true, hora: "10:00", cerrado: true, mensaje: msg });
    expect(cierreStatus(cierre, "2026-10-30T14:00:00.000Z").cerrado).toBe(true); // 10:00 en Cuba
    expect(cierreStatus(cierre, "2026-10-30T13:59:00.000Z").cerrado).toBe(false); // 9:59
  });

  it("las horas de la tarde se dicen en 12 horas", () => {
    expect(cierreStatus({ enabled: true, time: "15:30" }, VIERNES_4_30PM).mensaje).toContain("3:30 p. m.");
  });
});

describe("validateCierre y parseCierre", () => {
  it("acepta una hora HH:MM y activo verdadero o falso", () => {
    expect(validateCierre({ enabled: true, time: "14:30" })).toEqual({ value: { enabled: true, time: "14:30" } });
  });

  it("rechaza horas mal escritas o un activo que no es verdadero o falso", () => {
    expect(validateCierre({ enabled: true, time: "9:00" }).error).toBeTruthy();
    expect(validateCierre({ enabled: true, time: "25:00" }).error).toBeTruthy();
    expect(validateCierre({ enabled: "si", time: "10:00" }).error).toBeTruthy();
    expect(validateCierre(null).error).toBeTruthy();
  });

  it("parseCierre lee lo guardado, y con algo roto vuelve al valor por defecto", () => {
    expect(parseCierre(JSON.stringify({ enabled: true, time: "12:00" }))).toEqual({ enabled: true, time: "12:00" });
    expect(parseCierre(undefined)).toEqual(DEFAULT_CIERRE);
    expect(parseCierre("no es json")).toEqual(DEFAULT_CIERRE);
    expect(parseCierre(JSON.stringify({ enabled: true, time: "xx" }))).toEqual(DEFAULT_CIERRE);
  });
});

// Hora del sitio: la zona horaria en la que trabajan el horario, el cierre del día y el contador de
// ventas. Por defecto la de Cuba; el administrador puede poner la de su ciudad.
describe("zona horaria del sitio", () => {
  it("la de Cuba es la de por defecto y la primera de la lista", () => {
    expect(DEFAULT_ZONE).toBe("America/Havana");
    expect(ZONES[0]).toEqual({ id: "America/Havana", label: "Cuba (La Habana)" });
  });

  it("parseZone acepta solo las de la lista; lo demás vuelve a la de por defecto", () => {
    expect(parseZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(parseZone("Mars/Olympus")).toBe(DEFAULT_ZONE);
    expect(parseZone(undefined)).toBe(DEFAULT_ZONE);
    expect(parseZone(null)).toBe(DEFAULT_ZONE);
  });

  it("siteNow dice la fecha y la hora en esa zona", () => {
    expect(siteNow(VIERNES_11AM)).toEqual({ fecha: "2026-10-30", hora: "11:00" });
    expect(siteNow(VIERNES_11AM, "Europe/Madrid")).toEqual({ fecha: "2026-10-30", hora: "16:00" });
    expect(siteNow("2026-10-30T23:30:00.000Z", "Europe/Madrid")).toEqual({ fecha: "2026-10-31", hora: "00:30" });
  });

  it("el día de hoy depende de la zona", () => {
    expect(cubaDate("2026-10-30T23:30:00.000Z")).toBe("2026-10-30");
    expect(cubaDate("2026-10-30T23:30:00.000Z", "Europe/Madrid")).toBe("2026-10-31");
  });

  it("el horario se cuenta en la zona elegida", () => {
    // 11:00 en Cuba (dentro de 9 a 15), pero 16:00 en Madrid (ya cerró)
    expect(scheduleStatus(on, VIERNES_11AM).abierto).toBe(true);
    expect(scheduleStatus(on, VIERNES_11AM, "Europe/Madrid").abierto).toBe(false);
  });

  it("el cierre del día se cuenta en la zona elegida", () => {
    const cierre = { enabled: true, time: "15:30" };
    expect(cierreStatus(cierre, VIERNES_11AM).cerrado).toBe(false);
    expect(cierreStatus(cierre, VIERNES_11AM, "Europe/Madrid").cerrado).toBe(true);
  });
});

// Hora puesta a mano: el administrador dice qué hora es ahora en el sitio y el buzón guarda la
// diferencia (en minutos) con la zona, para aplicarla al horario, al cierre y al día de hoy.
describe("hora del sitio puesta a mano", () => {
  it("adjustFromManual: cuánto se adelanta o atrasa respecto a la zona", () => {
    expect(adjustFromManual("12:00", VIERNES_11AM)).toBe(60); // en Cuba son las 11:00
    expect(adjustFromManual("10:30", VIERNES_11AM)).toBe(-30);
    expect(adjustFromManual("11:00", VIERNES_11AM)).toBe(0);
  });

  it("adjustFromManual: cruzando la medianoche toma el camino corto", () => {
    const casiMedianoche = "2026-10-31T03:50:00.000Z"; // 23:50 en Cuba
    expect(adjustFromManual("00:10", casiMedianoche)).toBe(20);
    expect(adjustFromManual("23:40", "2026-10-31T04:05:00.000Z")).toBe(-25); // en Cuba 00:05
  });

  it("adjustFromManual usa la zona que se le diga", () => {
    expect(adjustFromManual("16:00", VIERNES_11AM, "Europe/Madrid")).toBe(0);
  });

  it("parseAdjust lee lo guardado; con algo roto o fuera de rango, 0", () => {
    expect(parseAdjust("45")).toBe(45);
    expect(parseAdjust("-30")).toBe(-30);
    expect(parseAdjust("abc")).toBe(0);
    expect(parseAdjust("9999")).toBe(0);
    expect(parseAdjust(undefined)).toBe(0);
    expect(parseAdjust(null)).toBe(0);
  });

  it("shiftIso mueve la hora esos minutos", () => {
    expect(shiftIso("2026-10-30T15:00:00.000Z", 60)).toBe("2026-10-30T16:00:00.000Z");
    expect(shiftIso("2026-10-30T15:00:00.000Z", -90)).toBe("2026-10-30T13:30:00.000Z");
    expect(shiftIso("2026-10-30T15:00:00.000Z", 0)).toBe("2026-10-30T15:00:00.000Z");
  });
});

// El día de trabajo de la facturadora: pasada la hora de cierre del día, su tablero pasa al siguiente día
// de trabajo (el domingo no se trabaja).
describe("nextWorkingDay", () => {
  it("el día siguiente", () => {
    expect(nextWorkingDay("2026-10-30")).toBe("2026-10-31"); // viernes -> sábado
    expect(nextWorkingDay("2026-11-02")).toBe("2026-11-03");
  });

  it("del sábado salta el domingo: va al lunes", () => {
    expect(nextWorkingDay("2026-10-31")).toBe("2026-11-02");
  });

  it("si hoy es domingo, va al lunes", () => {
    expect(nextWorkingDay("2026-11-01")).toBe("2026-11-02");
  });

  it("cruza el fin de mes y de año", () => {
    expect(nextWorkingDay("2026-10-30")).toBe("2026-10-31");
    expect(nextWorkingDay("2026-12-31")).toBe("2027-01-01");
    expect(nextWorkingDay("2027-01-29")).toBe("2027-01-30"); // viernes
    expect(nextWorkingDay("2027-01-30")).toBe("2027-02-01"); // sábado: salta el domingo
  });
});
