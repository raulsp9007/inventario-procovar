// Usuarios del buzón (secreto USERS del Worker): lista de { id, name, role, token }.
// Se valida estrictamente: un código corto o repetido sería un hueco de seguridad.

const ROLES = ["vendedor", "facturadora"];
const MIN_TOKEN_LENGTH = 20;
const ID_PATTERN = /^[a-z0-9_-]{1,40}$/i;

export function parseUsers(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { users: [], errors: ["Falta el secreto USERS del Worker."] };
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return { users: [], errors: ["USERS no es un JSON válido."] };
  }
  if (!Array.isArray(list)) return { users: [], errors: ["USERS debe ser una lista de usuarios."] };
  if (list.length === 0) return { users: [], errors: ["USERS está vacío."] };

  const errors = [];
  const ids = new Set();
  const tokens = new Set();
  list.forEach((u, i) => {
    const where = `Usuario ${i + 1}`;
    if (!u || typeof u.id !== "string" || !ID_PATTERN.test(u.id)) errors.push(`${where}: el id no es válido.`);
    if (!u || typeof u.name !== "string" || !u.name.trim()) errors.push(`${where}: falta el nombre.`);
    if (!u || !ROLES.includes(u.role)) errors.push(`${where}: el rol debe ser vendedor o facturadora.`);
    if (!u || typeof u.token !== "string" || u.token.length < MIN_TOKEN_LENGTH) errors.push(`${where}: el código es demasiado corto (mínimo ${MIN_TOKEN_LENGTH} caracteres).`);
    if (u && ids.has(u.id)) errors.push(`${where}: id repetido.`);
    if (u && tokens.has(u.token)) errors.push(`${where}: código repetido.`);
    if (u) { ids.add(u.id); tokens.add(u.token); }
  });
  if (errors.length > 0) return { users: [], errors };

  if (list.filter((u) => u.role === "facturadora").length !== 1) errors.push("Debe haber exactamente una facturadora.");
  if (!list.some((u) => u.role === "vendedor")) errors.push("Debe haber al menos un vendedor.");
  if (errors.length > 0) return { users: [], errors };

  return { users: list.map((u) => ({ id: u.id, name: u.name.trim(), role: u.role, token: u.token })), errors: [] };
}
