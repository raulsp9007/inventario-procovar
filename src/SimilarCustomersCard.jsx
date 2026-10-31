import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { findSimilarCustomers, pairKey } from "./customerSimilarity";
import { loadDistinct, saveDistinct } from "./customerDistinct";

// Pestaña Clientes: posibles duplicados con su nivel de confianza y sus motivos.
// La persona elige cuál conservar y fusiona (los pedidos pasan al conservado), o
// marca que no son el mismo. La lógica vive en customerSimilarity.js y
// customerRegistry.js (mergeCustomerData); acá solo está la pantalla.

const REASON_LABELS = {
  codigo: "mismo código", telefono: "mismo teléfono", nombre: "nombre parecido", negocio: "mismo negocio", direccion: "misma dirección",
};
const CONFIDENCE_LABELS = { alta: "Alta", media: "Media", baja: "Baja" };
const CONFIDENCE_COLORS = { alta: "var(--green)", media: "var(--orange)", baja: "var(--faint)" };
const MAX_PAIRS = 15;
const plural = (n, one, many) => (n === 1 ? one : many);

const filledCount = (c) => ["businessName", "phone", "code", "address", "clientType", "consumptionType"].filter((f) => c[f]).length;
const localPhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "").slice(-8);
  return digits.length === 8 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
};

const buttonStyle = {
  height: 38, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)",
  color: "var(--text)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

function Side({ customer, orders, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Conservar a ${customer.name}`}
      style={{
        flex: 1, minWidth: 0, textAlign: "left", fontFamily: "inherit", cursor: "pointer", color: "var(--text)", padding: "9px 10px", borderRadius: 10,
        background: selected ? "var(--surface-subtle)" : "transparent", border: `1.5px solid ${selected ? "var(--green)" : "var(--border)"}`,
      }}
    >
      <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{customer.name}</span>
      {customer.businessName && <span style={{ display: "block", fontSize: 12, color: "var(--muted)", overflowWrap: "anywhere" }}>{customer.businessName}</span>}
      {customer.phone && <span style={{ display: "block", fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{localPhone(customer.phone)}</span>}
      {customer.code && <span style={{ display: "block", fontSize: 11, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{`Cód. ${customer.code}`}</span>}
      <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{orders === 0 ? "Sin pedidos" : `${orders} ${plural(orders, "pedido", "pedidos")}`}</span>
      {selected && <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--green)", marginTop: 3 }}>✓ Se conserva</span>}
    </button>
  );
}

export default function SimilarCustomersCard({ customers, movements, waitlist, onMerge, onRestore }) {
  const [open, setOpen] = useState(false);
  const [showLow, setShowLow] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [distinct, setDistinct] = useState(() => loadDistinct());
  const [choice, setChoice] = useState({});
  const [undo, setUndo] = useState(null);

  // Con dos códigos distintos (del portal) son clientes distintos: no se ofrecen para fusionar.
  const pairs = useMemo(
    () => findSimilarCustomers(customers, { distinct }).filter((p) => !(p.a.code && p.b.code && p.a.code !== p.b.code)),
    [customers, distinct],
  );
  const ordersByName = useMemo(() => {
    const map = new Map();
    movements.forEach((m) => {
      if (!m.orderId) return;
      if (!map.has(m.customerName)) map.set(m.customerName, new Set());
      map.get(m.customerName).add(m.orderId);
    });
    return map;
  }, [movements]);
  const ordersOf = (customer) => (ordersByName.get(customer.name) || new Set()).size;

  if (pairs.length === 0 && !undo) return null;

  const counts = { alta: 0, media: 0, baja: 0 };
  pairs.forEach((p) => { counts[p.confidence] += 1; });
  const visible = pairs.filter((p) => showLow || p.confidence !== "baja");
  const shown = showAll ? visible : visible.slice(0, MAX_PAIRS);

  // Se conserva, por defecto, el que ya tiene código (viene de la lista del
  // portal: su nombre y su código son los buenos). Si los dos o ninguno lo tienen,
  // el que tiene más pedidos; si empatan, el que tiene más datos y es más antiguo.
  function defaultKeep(pair) {
    const [x, y] = [pair.a, pair.b];
    const diff = (x.code ? 1 : 0) - (y.code ? 1 : 0) || ordersOf(x) - ordersOf(y) || filledCount(x) - filledCount(y);
    if (diff !== 0) return diff > 0 ? x : y;
    return (x.createdAt || "") <= (y.createdAt || "") ? x : y;
  }

  function merge(pair) {
    const keepId = choice[pairKey(pair.a, pair.b)];
    const keep = keepId === pair.b.id ? pair.b : keepId === pair.a.id ? pair.a : defaultKeep(pair);
    const drop = keep === pair.a ? pair.b : pair.a;
    const snapshot = { movements, customers, waitlist };
    onMerge(keep.name, drop.name);
    setUndo({ snapshot, text: `Fusionados: ${drop.name} → ${keep.name}` });
  }

  function notTheSame(pair) {
    const next = [...distinct, pairKey(pair.a, pair.b)];
    setDistinct(next);
    saveDistinct(next);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {pairs.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ ...buttonStyle, width: "100%", height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 13 }}
        >
          <Users size={15} strokeWidth={1.8} />
          {`Clientes parecidos · ${pairs.length}`}
        </button>
      )}

      {open && pairs.length > 0 && (
        <div role="group" aria-label="Clientes parecidos" style={{ marginTop: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4 }}>
            Posibles duplicados. Tú decides: nada se junta solo. Al fusionar, los pedidos pasan al cliente que se conserva y se completan sus datos con los del otro.
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{`${counts.alta} alta · ${counts.media} media · ${counts.baja} baja`}</div>
          {counts.baja > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} />
              {`Mostrar también las de confianza baja (${counts.baja})`}
            </label>
          )}

          {shown.map((pair) => {
            const key = pairKey(pair.a, pair.b);
            const keep = choice[key] ? (choice[key] === pair.b.id ? pair.b : pair.a) : defaultKeep(pair);
            return (
              <div key={key} role="group" aria-label={`Posible duplicado: ${pair.a.name} y ${pair.b.name}`} style={{ borderTop: "1px solid var(--divider)", padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: CONFIDENCE_COLORS[pair.confidence] }}>{CONFIDENCE_LABELS[pair.confidence]}</span>
                  {pair.reasons.map((r) => (
                    <span key={r} style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "2px 8px", border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "var(--muted)" }}>{REASON_LABELS[r]}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Side customer={pair.a} orders={ordersOf(pair.a)} selected={keep === pair.a} onSelect={() => setChoice((c) => ({ ...c, [key]: pair.a.id }))} />
                  <Side customer={pair.b} orders={ordersOf(pair.b)} selected={keep === pair.b} onSelect={() => setChoice((c) => ({ ...c, [key]: pair.b.id }))} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" style={{ ...buttonStyle, background: "var(--ink)", color: "var(--cream)", borderColor: "var(--ink)" }} onClick={() => merge(pair)}>Fusionar</button>
                  <button type="button" style={buttonStyle} onClick={() => notTheSame(pair)}>No son el mismo</button>
                </div>
              </div>
            );
          })}

          {visible.length > shown.length && (
            <button type="button" style={{ ...buttonStyle, width: "100%", marginTop: 6 }} onClick={() => setShowAll(true)}>{`Ver ${visible.length - shown.length} más`}</button>
          )}
          {visible.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No hay más pares con esta confianza.</div>}
        </div>
      )}

      {undo && (
        <div role="status" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, background: "#111", color: "#eee", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          <span style={{ flex: 1, overflowWrap: "anywhere" }}>{undo.text}</span>
          <button type="button" onClick={() => { onRestore(undo.snapshot); setUndo(null); }} style={{ background: "none", border: "none", color: "#E3B463", fontWeight: 700, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>Deshacer</button>
        </div>
      )}
    </div>
  );
}
