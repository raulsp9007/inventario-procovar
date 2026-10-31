// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateUsers, buildLinks, slugId } from "./provision";
import { parseUsers } from "./users";
import { parseLinkCode } from "../../src/linkCode";

// Genera los siete usuarios del buzón (6 vendedores y la facturadora) con un
// código secreto cada uno, y los códigos de enlace que se les entregan.

let counter = 0;
const fakeToken = () => String(++counter).padStart(2, "0").repeat(12); // 24 caracteres distintos

describe("slugId", () => {
  it("minúsculas, sin tildes ni símbolos", () => {
    expect(slugId("Carlos Pérez")).toBe("carlos-perez");
    expect(slugId("  María  José O'Neil ")).toBe("maria-jose-o-neil");
  });
});

describe("generateUsers", () => {
  const input = { vendedores: ["Carlos Pérez", "Marta Díaz", "Carlos Pérez"], facturadora: "Facturadora" };

  it("crea un usuario por vendedor y la facturadora, con ids únicos", () => {
    const users = generateUsers(input, fakeToken);
    expect(users.map((u) => [u.id, u.role])).toEqual([
      ["carlos-perez", "vendedor"], ["marta-diaz", "vendedor"], ["carlos-perez-2", "vendedor"], ["facturadora", "facturadora"],
    ]);
    expect(users[0].name).toBe("Carlos Pérez");
  });

  it("cada uno tiene su propio código, largo", () => {
    const users = generateUsers(input, fakeToken);
    expect(new Set(users.map((u) => u.token)).size).toBe(users.length);
    users.forEach((u) => expect(u.token.length).toBeGreaterThanOrEqual(20));
  });

  it("lo que genera lo acepta el buzón (validación de USERS)", () => {
    const users = generateUsers(input, fakeToken);
    expect(parseUsers(JSON.stringify(users)).errors).toEqual([]);
  });

  it("con códigos aleatorios reales también", () => {
    const users = generateUsers({ vendedores: ["A", "B"], facturadora: "F" });
    expect(parseUsers(JSON.stringify(users)).errors).toEqual([]);
    expect(users[0].token).not.toBe(users[1].token);
    expect(users[0].token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("pide al menos un vendedor y la facturadora", () => {
    expect(() => generateUsers({ vendedores: [], facturadora: "F" })).toThrow(/vendedor/);
    expect(() => generateUsers({ vendedores: ["A"], facturadora: " " })).toThrow(/facturadora/);
  });
});

describe("buildLinks: enlace del sitio de la facturadora", () => {
  const SITE = "https://raulsp9007.github.io/inventario-procovar/facturadora.html";

  it("la facturadora recibe además su enlace personal del sitio, con el código después del #", () => {
    const users = generateUsers({ vendedores: ["Carlos Pérez"], facturadora: "Facturadora" }, fakeToken);
    const [seller, fact] = buildLinks(users, "https://buzon.cuenta.workers.dev", SITE);
    expect(seller.siteLink).toBeUndefined();
    expect(fact.siteLink).toBe(`${SITE}#${fact.code}`);
  });

  it("sin dirección del sitio no agrega nada", () => {
    const users = generateUsers({ vendedores: ["Carlos Pérez"], facturadora: "Facturadora" }, fakeToken);
    expect(buildLinks(users, "https://buzon.cuenta.workers.dev").every((l) => l.siteLink === undefined)).toBe(true);
  });
});

describe("buildLinks", () => {
  it("arma el código de enlace de cada persona, que la app sabe leer", () => {
    const users = generateUsers({ vendedores: ["Carlos Pérez"], facturadora: "Facturadora" }, fakeToken);
    const links = buildLinks(users, "https://procovar-buzon.cuenta.workers.dev/");
    expect(links.map((l) => [l.name, l.role])).toEqual([["Carlos Pérez", "vendedor"], ["Facturadora", "facturadora"]]);
    links.forEach((l, i) => {
      expect(parseLinkCode(l.code)).toEqual({ url: "https://procovar-buzon.cuenta.workers.dev", token: users[i].token });
    });
  });
});
