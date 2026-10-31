import { describe, it, expect } from "vitest";
import { findSimilarCustomers, pairKey, normalizeText } from "./customerSimilarity";

// Clientes "parecidos": posibles duplicados dentro del registro (por ejemplo,
// los que entraron al importar la lista del portal con otro nombre). Cada par
// trae su nivel de confianza y los motivos, para que la persona decida.

let n = 0;
const c = (name, over = {}) => ({ id: `c${++n}`, name, businessName: "", phone: "", createdAt: "2026-01-01T00:00:00.000Z", ...over });
const find = (...customers) => findSimilarCustomers(customers);
const only = (pairs) => {
  expect(pairs).toHaveLength(1);
  return pairs[0];
};

describe("normalizeText", () => {
  it("minúsculas, sin tildes ni signos, espacios simples", () => {
    expect(normalizeText("  Ana   LÓPEZ. ")).toBe("ana lopez");
    expect(normalizeText("Beto R.")).toBe("beto r");
  });
});

describe("findSimilarCustomers: señales fuertes", () => {
  it("el mismo código es el mismo cliente (alta)", () => {
    const pair = only(find(c("Ana López", { code: "AB1" }), c("Otra Persona", { code: "AB1" })));
    expect(pair.confidence).toBe("alta");
    expect(pair.reasons).toContain("codigo");
  });

  it("el mismo teléfono con nombres parecidos es alta", () => {
    const pair = only(find(c("Beto Ruiz", { phone: "5355123456" }), c("Beto R.", { phone: "5355123456" })));
    expect(pair.confidence).toBe("alta");
    expect(pair.reasons).toEqual(expect.arrayContaining(["telefono", "nombre"]));
  });

  it("el mismo teléfono con nombres distintos es media (puede ser una familia o un negocio con dos contactos)", () => {
    const pair = only(find(c("Ana López", { phone: "5355123456" }), c("Pedro Gil", { phone: "5355123456" })));
    expect(pair.confidence).toBe("media");
    expect(pair.reasons).toEqual(["telefono"]);
  });

  it("compara los teléfonos por sus 8 dígitos, con o sin 53", () => {
    const pair = only(find(c("Ana López", { phone: "5355123456" }), c("Ana Lopez", { phone: "55123456" })));
    expect(pair.reasons).toContain("telefono");
  });

  it("teléfonos vacíos no cuentan como iguales", () => {
    expect(find(c("Ana López"), c("Pedro Gil"))).toEqual([]);
  });
});

describe("findSimilarCustomers: nombres", () => {
  it("el mismo nombre con otro orden o sin tildes es alta", () => {
    const pair = only(find(c("Ana López"), c("López, Ana")));
    expect(pair.confidence).toBe("alta");
    const pair2 = only(find(c("Ana López"), c("ana lopez")));
    expect(pair2.confidence).toBe("alta");
  });

  it("una inicial vale por el apellido: 'Beto R.' y 'Beto Ruiz' (dos palabras y las dos coinciden: alta)", () => {
    const pair = only(find(c("Beto Ruiz"), c("Beto R.")));
    expect(pair.confidence).toBe("alta");
    expect(pair.reasons).toEqual(["nombre"]);
  });

  it("dos de tres palabras no alcanzan: 'Ana María López' y 'Ana María García' no son un par", () => {
    expect(find(c("Ana María López"), c("Ana María García"))).toEqual([]);
  });

  it("un nombre contenido en otro más largo es media: 'Ana López' y 'Ana María López'", () => {
    const pair = only(find(c("Ana López"), c("Ana María López")));
    expect(pair.confidence).toBe("media");
  });

  it("con el mismo negocio, esa misma inclusión sube a alta", () => {
    const pair = only(find(c("Ana López", { businessName: "Kiosco El Sol" }), c("Ana María López", { businessName: "Kiosko Sol" })));
    expect(pair.confidence).toBe("alta");
    expect(pair.reasons).toEqual(expect.arrayContaining(["nombre", "negocio"]));
  });

  it("un error de una letra en una palabra larga se tolera: 'Carlos Pérez' y 'Carlos Peres'", () => {
    const pair = only(find(c("Carlos Pérez"), c("Carlos Peres")));
    expect(pair.confidence).toBe("alta");
  });

  it("una inicial sola no basta: 'Beto R.' no se parece a 'Rosa'", () => {
    expect(find(c("Beto R."), c("Rosa"))).toEqual([]);
    expect(find(c("R. Gil"), c("Rosa"))).toEqual([]);
  });

  it("no tolera errores en palabras cortas ('Ana' y 'Ani' son personas distintas)", () => {
    expect(find(c("Ana Gil"), c("Ani Gil"))).toEqual([]);
  });

  it("solo el nombre de pila coincide: no es un par", () => {
    expect(find(c("Ana García"), c("Ana López"))).toEqual([]);
  });

  it("un cliente con un solo nombre que está en otro es solo 'baja'", () => {
    const pair = only(find(c("Ana"), c("Ana López")));
    expect(pair.confidence).toBe("baja");
  });

  it("ignora 'de', 'del', 'la' y similares", () => {
    const pair = only(find(c("María de la Caridad Pérez"), c("Maria Caridad Perez")));
    expect(pair.confidence).toBe("alta");
  });
});

describe("findSimilarCustomers: faltas de ortografía con respaldo de teléfono o negocio", () => {
  it("con el mismo teléfono y negocio, una letra distinta en una palabra corta ('Ruis' y 'Ruiz') sigue siendo alta", () => {
    const pair = only(find(
      c("Wander Soto Ruis", { phone: "5355343343", businessName: "Cafetería Santa Fe" }),
      c("Wander Soto Ruiz", { phone: "5355343343", businessName: "Cafetería Santa Fe" }),
    ));
    expect(pair.confidence).toBe("alta");
  });

  it("con el mismo negocio, 'Olmos' y 'Olmo' (una letra de diferencia) es alta", () => {
    const pair = only(find(
      c("Gabriel Olmos Castañeda", { businessName: "Doña Bárbara" }),
      c("Gabriel Olmo Castañeda", { businessName: "Doña Bárbara" }),
    ));
    expect(pair.confidence).toBe("alta");
  });

  it("con el mismo negocio, dos de tres palabras iguales ('Frank' y 'Francisco' Suárez Pérez) es alta", () => {
    const pair = only(find(
      c("Frank Suárez Pérez", { businessName: "Oasis Tropy" }),
      c("Francisco Suárez Pérez", { businessName: "Oasis Tropy" }),
    ));
    expect(pair.confidence).toBe("alta");
    expect(pair.reasons).toEqual(expect.arrayContaining(["nombre", "negocio"]));
  });

  it("con el mismo teléfono, dos de tres palabras iguales es alta", () => {
    const pair = only(find(
      c("Carlos Michel González", { phone: "5355523523" }),
      c("Michel González Vila", { phone: "5355523523" }),
    ));
    expect(pair.confidence).toBe("alta");
  });

  it("sin teléfono ni negocio en común, esa tolerancia extra no se aplica", () => {
    expect(find(c("Wander Soto Ruis"), c("Wander Soto Ruiz"))).toEqual([]);
  });

  it("sin respaldo, dos de tres palabras siguen sin bastar", () => {
    expect(find(c("Ana María López"), c("Ana María García"))).toEqual([]);
  });
});

describe("findSimilarCustomers: negocio y dirección", () => {
  it("el mismo negocio con otros nombres es baja (puede ser el mismo kiosco con dos contactos)", () => {
    const pair = only(find(c("Ana López", { businessName: "Kiosco El Sol" }), c("Pedro Gil", { businessName: "Kiosko Sol" })));
    expect(pair.confidence).toBe("baja");
    expect(pair.reasons).toEqual(["negocio"]);
  });

  it("las palabras genéricas ('kiosco', 'cafetería'...) no bastan para decir que es el mismo negocio", () => {
    expect(find(c("Ana López", { businessName: "Kiosco El Sol" }), c("Pedro Gil", { businessName: "Kiosco La Luna" }))).toEqual([]);
  });

  it("la misma dirección refuerza un nombre parecido", () => {
    const pair = only(find(
      c("Ana López", { address: "Calle 1 # 2, Reparto Sur" }),
      c("Ana María López", { address: "calle 1 # 2 reparto sur" }),
    ));
    expect(pair.confidence).toBe("alta");
    expect(pair.reasons).toEqual(expect.arrayContaining(["nombre", "direccion"]));
  });

  it("la misma dirección sola no es un par", () => {
    expect(find(c("Ana López", { address: "Calle 1 # 2, Reparto Sur" }), c("Pedro Gil", { address: "Calle 1 # 2, Reparto Sur" }))).toEqual([]);
  });
});

describe("findSimilarCustomers: lista", () => {
  it("ordena primero alta, luego media y baja", () => {
    const pairs = find(
      c("Ana"), c("Ana López"),
      c("Beto Ruiz", { phone: "5355000001" }), c("Beto R.", { phone: "5355000001" }),
      c("Luis Gil", { phone: "5355000002" }), c("Marta Paz", { phone: "5355000002" }),
    );
    expect(pairs.map((p) => p.confidence)).toEqual(["alta", "media", "baja"]);
  });

  it("cada par aparece una sola vez, con sus dos clientes", () => {
    const a = c("Ana López");
    const b = c("López Ana");
    const pairs = findSimilarCustomers([a, b]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0].a.id, pairs[0].b.id].sort()).toEqual([a.id, b.id].sort());
  });

  it("quita los pares que la persona marcó como 'no son el mismo'", () => {
    const a = c("Ana López");
    const b = c("López Ana");
    expect(findSimilarCustomers([a, b], { distinct: [pairKey(a, b)] })).toEqual([]);
    expect(pairKey(a, b)).toBe(pairKey(b, a));
  });

  it("ignora clientes sin nombre y no modifica la lista", () => {
    const list = [c(""), c("Ana López"), c("López Ana")];
    const snapshot = JSON.stringify(list);
    expect(findSimilarCustomers(list)).toHaveLength(1);
    expect(JSON.stringify(list)).toBe(snapshot);
  });

  it("con muchos clientes es rápido", () => {
    const first = ["Ana", "Beto", "Carla", "Dora", "Elio", "Fina", "Gael", "Hugo", "Iris", "Julia"];
    const last = ["López", "Ruiz", "Gil", "Pérez", "Soto", "Mena", "Díaz", "Vega", "Cruz", "Roca", "Neri", "Paz", "Luna", "Mora", "Sosa"];
    const list = [];
    for (let i = 0; i < 1500; i += 1) list.push(c(`${first[i % 10]} ${last[Math.floor(i / 10) % 15]} ${first[(i * 7) % 10]}${i}`, { phone: `53550${String(i).padStart(5, "0")}` }));
    const start = Date.now();
    findSimilarCustomers(list);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
