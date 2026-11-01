// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseUsers } from "./users";

// Los usuarios del buzón vienen del secreto USERS del Worker: un JSON con una
// lista de { id, name, role, token }. Si algo está mal se avisa (no se ignora en
// silencio), porque un código flojo o repetido sería un hueco de seguridad.

const token = (n) => String(n).repeat(24);
const good = [
  { id: "carlos", name: "Carlos Pérez", role: "vendedor", token: token(1) },
  { id: "fact", name: "Facturadora", role: "facturadora", token: token(2) },
];

describe("parseUsers", () => {
  it("lee una lista válida", () => {
    const { users, errors } = parseUsers(JSON.stringify(good));
    expect(errors).toEqual([]);
    expect(users).toEqual(good);
  });

  it("acepta un administrador (rol admin), a lo sumo uno", () => {
    const admin = { id: "admin", name: "Administrador", role: "admin", token: token(3) };
    const ok = parseUsers(JSON.stringify([...good, admin]));
    expect(ok.errors).toEqual([]);
    expect(ok.users).toEqual([...good, admin]);
    const two = parseUsers(JSON.stringify([...good, admin, { ...admin, id: "admin2", token: token(4) }]));
    expect(two.errors).toContain("Solo puede haber un administrador.");
  });

  it("sin administrador sigue funcionando (es opcional)", () => {
    expect(parseUsers(JSON.stringify(good)).errors).toEqual([]);
  });

  it("sin secreto o con algo que no es una lista, avisa", () => {
    expect(parseUsers(undefined).errors[0]).toMatch(/USERS/);
    expect(parseUsers("no json").errors[0]).toMatch(/JSON/);
    expect(parseUsers(JSON.stringify({ a: 1 })).errors[0]).toMatch(/lista/);
    expect(parseUsers("[]").errors[0]).toMatch(/vac/);
  });

  it("rechaza roles desconocidos, códigos cortos y datos que faltan", () => {
    const bad = (user) => parseUsers(JSON.stringify([good[0], user])).errors;
    expect(bad({ ...good[1], role: "jefe" })[0]).toMatch(/rol/);
    expect(bad({ ...good[1], token: "corto" })[0]).toMatch(/código/);
    expect(bad({ ...good[1], name: "" })[0]).toMatch(/nombre/);
    expect(bad({ ...good[1], id: "con espacios" })[0]).toMatch(/id/);
  });

  it("rechaza ids o códigos repetidos", () => {
    expect(parseUsers(JSON.stringify([good[0], { ...good[1], id: "carlos" }])).errors[0]).toMatch(/repetido/);
    expect(parseUsers(JSON.stringify([good[0], { ...good[1], token: good[0].token }])).errors[0]).toMatch(/repetido/);
  });

  it("pide exactamente una facturadora y al menos un vendedor", () => {
    expect(parseUsers(JSON.stringify([good[0]])).errors[0]).toMatch(/facturadora/);
    expect(parseUsers(JSON.stringify([good[1]])).errors[0]).toMatch(/vendedor/);
    expect(parseUsers(JSON.stringify([good[0], good[1], { id: "otra", name: "Otra", role: "facturadora", token: token(3) }])).errors[0]).toMatch(/facturadora/);
  });
});
