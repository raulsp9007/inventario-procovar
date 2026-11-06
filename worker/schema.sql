-- Base D1 del buzón de pedidos. Se aplica una vez (ver worker/README.md).
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  seller_id     TEXT NOT NULL,
  seller_name   TEXT NOT NULL,
  date          TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_code TEXT,
  business_name TEXT,
  lines        TEXT NOT NULL,
  total         REAL NOT NULL,
  status        TEXT NOT NULL,
  rev           INTEGER NOT NULL,
  modified      INTEGER NOT NULL DEFAULT 0,
  confirmed_at  TEXT,
  confirmed_by  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
-- Vendedores que maneja el administrador desde el sitio (se juntan con los del
-- secreto USERS; lo de esta tabla gana). Se puede volver a aplicar este archivo.
CREATE TABLE IF NOT EXISTS vendors (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Cuentas con usuario y contraseña de ANTES (una por rol). Las cuentas de ahora (varias por rol, y también
-- de administrador) viven en los ajustes (`settings`, clave "cuentas"); esta tabla solo se lee, una vez,
-- para pasarlas. Solo se guarda la huella de la contraseña.
CREATE TABLE IF NOT EXISTS accounts (
  role         TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  salt         TEXT NOT NULL,
  hash         TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
-- Sesiones abiertas con usuario y contraseña (se guarda la huella del código, no el código). La columna
-- `role` guarda el id de la cuenta (antes, el rol, que era el id de la única cuenta de ese rol).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  role       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
-- Ajustes del buzón que maneja el administrador (por ahora, el horario de facturación).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_seller_updated ON orders (seller_id, updated_at);
CREATE INDEX IF NOT EXISTS orders_date ON orders (date);
