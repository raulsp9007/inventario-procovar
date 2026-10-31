// Doble de D1 para las pruebas: una base SQLite en memoria (node:sqlite) con la
// misma forma de uso que D1 (prepare → bind → first/all/run) y el esquema real.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function createFakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));

  const plain = (row) => (row ? { ...row } : null);

  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() { return plain(statement.get(...args)); },
            async all() { return { results: statement.all(...args).map(plain) }; },
            async run() { statement.run(...args); return { success: true }; },
          };
        },
      };
    },
    // Solo para las pruebas: lo guardado, para comprobar qué quedó en la base.
    dump() {
      return sqlite.prepare("SELECT * FROM orders ORDER BY created_at").all().map((r) => ({ ...r, id: r.id }));
    },
  };
}
