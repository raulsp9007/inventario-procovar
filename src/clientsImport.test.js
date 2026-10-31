import { describe, it, expect } from "vitest";
import { parseClientsCsv, planClientsImport } from "./clientsImport";

// Importar clientes desde un CSV (el de la lista de clientes del portal):
// "Nombre Contacto" es la persona (el cliente de la app), "Nombre Cliente" es su
// negocio, y se guardan también código, dirección y tipos.

const HEADER = "Nombre Cliente,Codigo,Dirección,Tipo Cliente,Tipo Consumo,Nombre Contacto,Telefono";
const csv = (...lines) => [HEADER, ...lines].join("\r\n");

describe("parseClientsCsv", () => {
  it("lee las filas y las pasa a los campos de la app", () => {
    const { rows, total } = parseClientsCsv(csv(
      "Kiosco El Sol,AB12CDE3456,Calle 1 # 2,Kiosko,Off-Premise,Ana López,53551234",
    ));
    expect(total).toBe(1);
    expect(rows).toEqual([{
      name: "Ana López", businessName: "Kiosco El Sol", phone: "53551234", code: "AB12CDE3456",
      address: "Calle 1 # 2", clientType: "Kiosko", consumptionType: "Off-Premise",
    }]);
  });

  it("la dirección con comas y varias líneas queda en una sola línea", () => {
    const { rows } = parseClientsCsv(csv('Kiosco,C1,"Calle 1, entre 2 y 3\nReparto Sur",Kiosko,Off-Premise,Ana,55123456'));
    expect(rows[0].address).toBe("Calle 1, entre 2 y 3, Reparto Sur");
  });

  it("limpia espacios repetidos y de los bordes", () => {
    const { rows } = parseClientsCsv(csv("  Kiosco   El  Sol ,C1,  Calle  1 ,Kiosko,Off-Premise,  Ana   López  ,55123456"));
    expect(rows[0]).toMatchObject({ name: "Ana López", businessName: "Kiosco El Sol", address: "Calle 1" });
  });

  it("teléfonos: acepta 8 dígitos, +53 y 53 delante; los incompletos se dejan vacíos y se avisa", () => {
    const { rows, warnings } = parseClientsCsv(csv(
      "A,C1,D,K,O,Uno,55123456",
      "B,C2,D,K,O,Dos,+53 5512 3457",
      "C,C3,D,K,O,Tres,5355123458",
      "D,C4,D,K,O,Cuatro,1234567",
      "E,C5,D,K,O,Cinco,",
    ));
    expect(rows.map((r) => r.phone)).toEqual(["55123456", "55123457", "55123458", "", ""]);
    expect(warnings.join(" ")).toMatch(/1 teléfono incompleto/);
  });

  it("encabezados con otra capitalización, sin tildes o en otro orden, y columnas de más", () => {
    const text = ["telefono;NOMBRE CONTACTO;direccion;Otra;codigo", "55123456;Ana;Calle 1;x;C1"].join("\n");
    const { rows } = parseClientsCsv(text);
    expect(rows[0]).toMatchObject({ name: "Ana", phone: "55123456", address: "Calle 1", code: "C1", businessName: "" });
  });

  it("sin 'Nombre Contacto' usa 'Nombre Cliente' como nombre", () => {
    const { rows } = parseClientsCsv(csv("Kiosco Sol,C1,D,K,O,,55123456"));
    expect(rows[0]).toMatchObject({ name: "Kiosco Sol", businessName: "" });
  });

  it("un negocio igual al nombre no se repite", () => {
    const { rows } = parseClientsCsv(csv("Ana López,C1,D,K,O,Ana López,55123456"));
    expect(rows[0]).toMatchObject({ name: "Ana López", businessName: "" });
  });

  it("las filas sin ningún nombre se omiten y se avisa", () => {
    const { rows, warnings } = parseClientsCsv(csv(",C1,D,K,O,,55123456", "Kiosco,C2,D,K,O,Ana,55123457"));
    expect(rows.map((r) => r.name)).toEqual(["Ana"]);
    expect(warnings.join(" ")).toMatch(/1 fila sin nombre/);
  });

  it("nombres repetidos en el archivo: vale el primero y se avisa", () => {
    const { rows, warnings, total } = parseClientsCsv(csv("A,C1,D,K,O,Ana López,55123456", "B,C2,D,K,O,ANA  lópez,55123457"));
    expect(total).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("C1");
    expect(warnings.join(" ")).toMatch(/1 nombre repetido/);
  });

  it("errores claros: vacío y sin las columnas esperadas", () => {
    expect(() => parseClientsCsv("")).toThrow("El archivo está vacío.");
    expect(() => parseClientsCsv("a,b\n1,2")).toThrow("El archivo no tiene las columnas esperadas (Nombre Contacto o Nombre Cliente).");
    expect(() => parseClientsCsv(HEADER)).toThrow("El archivo no trae clientes.");
  });
});

describe("planClientsImport", () => {
  const NOW = "2026-10-31T10:00:00.000Z";
  let n = 0;
  const newId = () => `new-${++n}`;
  const existing = () => [
    { id: "c1", name: "Ana López", businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "c2", name: "Beto Ruiz", businessName: "Cafetería Beto", phone: "5355000001", createdAt: "2026-01-02T00:00:00.000Z", code: "BETO1" },
  ];
  const parsed = () => parseClientsCsv(csv(
    "Kiosco Sol,AB1,Calle 1,Kiosko,Off-Premise,ana lópez,55123456",
    "Café Nuevo,CD2,Calle 2,Cafeteria,On-Premise,Carla Gil,55999999",
    "Otro Nombre,BETO1,Calle 9,Bar,On-Premise,Beto R.,55111111",
  ));
  const run = (mode, over = {}) => planClientsImport({ customers: existing(), parsed: parsed(), mode, newId, nowIso: NOW, ...over });

  it("clientes nuevos: con id, fecha y todos sus datos (teléfono con 53)", () => {
    const plan = run("nuevos");
    const carla = plan.nextCustomers.find((c) => c.name === "Carla Gil");
    expect(carla).toEqual({
      id: expect.stringMatching(/^new-/), name: "Carla Gil", businessName: "Café Nuevo", phone: "5355999999",
      createdAt: NOW, code: "CD2", address: "Calle 2", clientType: "Cafeteria", consumptionType: "On-Premise",
    });
    expect(plan.counts.nuevos).toBe(1);
  });

  it("'solo nuevos' no toca a los que ya existen (por nombre o por código)", () => {
    const plan = run("nuevos");
    expect(plan.nextCustomers.filter((c) => c.id === "c1" || c.id === "c2")).toEqual(existing());
    expect(plan.counts).toEqual({ nuevos: 1, actualizan: 0, iguales: 0, existentes: 2 });
    expect(plan.rows.map((r) => r.status)).toEqual(["existe", "nuevo", "existe"]);
  });

  it("en la vista previa un cliente que ya existía aparece con su nombre guardado, no con el del archivo", () => {
    const plan = run("completar");
    expect(plan.rows.map((r) => r.name)).toEqual(["Ana López", "Carla Gil", "Beto Ruiz"]);
  });

  it("reconoce al cliente por nombre sin importar mayúsculas ni tildes, y por código", () => {
    const plan = run("completar");
    expect(plan.rows.map((r) => r.status)).toEqual(["completa", "nuevo", "completa"]);
    expect(plan.nextCustomers).toHaveLength(3); // nadie duplicado
  });

  it("'completar' solo rellena lo que faltaba y no cambia nombre ni lo ya guardado", () => {
    const plan = run("completar");
    const ana = plan.nextCustomers.find((c) => c.id === "c1");
    expect(ana).toEqual({
      id: "c1", name: "Ana López", businessName: "Kiosco Sol", phone: "5355123456", createdAt: "2026-01-01T00:00:00.000Z",
      code: "AB1", address: "Calle 1", clientType: "Kiosko", consumptionType: "Off-Premise",
    });
    const beto = plan.nextCustomers.find((c) => c.id === "c2");
    expect(beto).toMatchObject({ name: "Beto Ruiz", businessName: "Cafetería Beto", phone: "5355000001", code: "BETO1", address: "Calle 9", clientType: "Bar" });
  });

  it("'actualizar' pisa lo guardado con lo del archivo (pero nunca el nombre)", () => {
    const plan = run("actualizar");
    const beto = plan.nextCustomers.find((c) => c.id === "c2");
    expect(beto).toMatchObject({ name: "Beto Ruiz", businessName: "Otro Nombre", phone: "5355111111", address: "Calle 9" });
    expect(plan.rows[2]).toMatchObject({ status: "actualiza" });
    expect(plan.rows[2].changes.map((c) => c.field)).toEqual(expect.arrayContaining(["businessName", "phone", "address"]));
  });

  it("un dato vacío en el archivo nunca borra lo guardado", () => {
    const sparse = parseClientsCsv(csv("Kiosco Sol,,,,,Beto Ruiz,"));
    const plan = planClientsImport({ customers: existing(), parsed: sparse, mode: "actualizar", newId, nowIso: NOW });
    expect(plan.nextCustomers.find((c) => c.id === "c2")).toMatchObject({ phone: "5355000001", code: "BETO1" });
  });

  it("sin diferencias queda como 'igual'", () => {
    const same = parseClientsCsv(csv("Cafetería Beto,BETO1,,,,Beto Ruiz,55000001"));
    const plan = planClientsImport({ customers: existing(), parsed: same, mode: "completar", newId, nowIso: NOW });
    expect(plan.rows[0].status).toBe("igual");
    expect(plan.counts).toEqual({ nuevos: 0, actualizan: 0, iguales: 1, existentes: 0 });
    expect(plan.nextCustomers).toEqual(existing());
  });

  it("cada cambio dice de qué a qué", () => {
    const plan = run("completar");
    expect(plan.rows[0].changes).toContainEqual({ field: "phone", from: "", to: "5355123456" });
    expect(plan.rows[0].changes).toContainEqual({ field: "code", from: "", to: "AB1" });
  });

  it("no modifica la lista original", () => {
    const original = existing();
    const snapshot = JSON.stringify(original);
    planClientsImport({ customers: original, parsed: parsed(), mode: "actualizar", newId, nowIso: NOW });
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("un cliente nuevo sin datos opcionales no lleva campos vacíos de más", () => {
    const bare = parseClientsCsv(csv(",,,,,Solo Nombre,"));
    const plan = planClientsImport({ customers: [], parsed: bare, mode: "nuevos", newId, nowIso: NOW });
    expect(plan.nextCustomers[0]).toEqual({ id: expect.any(String), name: "Solo Nombre", businessName: "", phone: "", createdAt: NOW });
  });
});
