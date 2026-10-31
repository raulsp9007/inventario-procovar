// @vitest-environment node
import { apiSuite } from "./apiSuite";
import { createMemoryStore } from "./memoryStore";
import { createD1Store } from "./d1Store";

// La misma batería de pruebas de la API contra los dos almacenes: el de memoria
// y el de D1 (SQLite local con el esquema real), para que el SQL también se pruebe.
// El doble de D1 usa node:sqlite (Node 22.5 o superior); si este Node no lo
// tiene, esa parte se omite y se prueba solo con el almacén en memoria.
apiSuite("API con almacén en memoria", () => createMemoryStore());

const createFakeD1 = await import("./fakeD1").then((m) => m.createFakeD1, () => null);

if (createFakeD1) {
  apiSuite("API con D1 (SQLite local)", () => {
    const db = createFakeD1();
    return { ...createD1Store(db), dump: db.dump };
  });
}