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
CREATE INDEX IF NOT EXISTS orders_seller_updated ON orders (seller_id, updated_at);
CREATE INDEX IF NOT EXISTS orders_date ON orders (date);
