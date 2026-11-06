import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Check, ChevronDown, ChevronUp, CircleHelp, Cloud, CloudOff, ExternalLink, Search, Undo2 } from "lucide-react";
import { formatCUP } from "./money";
import { formatDateShort } from "./dateUtils";
import { openPortalSearch, portalSearchText } from "./portalLink";
import { flattenOrders, filterOrders } from "./facturadoraData";
import { clock12, connectionText, newOrdersText, sentArrivalText, lastReceivedText } from "./facturadoraText";
import { playChime } from "./alertSound";
import SalesSummary from "./SalesSummary.jsx";

// Pantalla de la facturadora: una tarjeta grande por pedido, con dos botones claros ("Ver en el
// portal" y "Confirmar pedido"), pensada para quien tiene poca experiencia con computadoras:
// letra grande (con A− y A+), botones grandes, palabras de todos los días, sin atajos de teclado,
// casillas ni pestañas, un aviso al confirmar con "Deshacer", un aviso cuando llega un pedido
// nuevo y una ayuda "¿Cómo se usa?". La lógica vive en useFacturadora; acá solo está la pantalla.

const SCALE_KEY = "procovar-fact-letra";
const SOUND_KEY = "procovar-fact-sonido";
const SCALE_MIN = 0.9;
const SCALE_MAX = 1.4;
const TOAST_MS = 10000;
const NOTICE_MS = 8000;

// Tamaño en píxeles que sigue el tamaño de letra elegido (--fx-scale).
const px = (n) => `calc(${n}px * var(--fx-scale, 1))`;
const plural = (n, one, many) => (n === 1 ? one : many);

function readScale() {
  try {
    const value = parseFloat(window.localStorage.getItem(SCALE_KEY));
    if (Number.isFinite(value) && value >= SCALE_MIN && value <= SCALE_MAX) return Math.round(value * 10) / 10;
  } catch {
    // Sin almacenamiento: tamaño normal.
  }
  return 1;
}

function readSound() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

function remember(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // No se pudo recordar; sigue funcionando esta vez.
  }
}

const toolButton = {
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, minWidth: 40, padding: "0 12px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.35)", background: "transparent", color: "var(--cream)", fontFamily: "inherit",
  fontSize: px(15), fontWeight: 600, cursor: "pointer", justifyContent: "center",
};
const bigButton = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, flex: "1 1 180px", minHeight: px(52), padding: "0 20px",
  borderRadius: 10, fontFamily: "inherit", fontSize: px(17), fontWeight: 600, cursor: "pointer",
};
const secondaryButton = { ...bigButton, background: "var(--surface-subtle)", color: "var(--text)", border: "1px solid var(--border-strong)" };
const confirmButton = { ...bigButton, background: "var(--green)", color: "var(--on-green)", border: "none" };

function OrderCard({ order, readOnly, paused, onConfirm, onUndo }) {
  const done = order.status === "confirmado";
  const byFacturadora = order.confirmedBy === "facturadora";
  const when = sentArrivalText(order);
  const confirmedText = `Confirmado a las ${clock12(order.confirmedAt)}${order.confirmedBy === "vendedor" ? " (por el vendedor)" : ""}`;
  return (
    <article
      data-order-id={order.id}
      data-order-name={order.customerName}
      style={{ background: "var(--surface)", border: `${done ? 2 : 1}px solid ${done ? "var(--green)" : "var(--border-strong)"}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: px(15), color: "var(--text-muted)" }}>{when ? `${order.sellerName} · ${when}` : order.sellerName}</span>
        {done ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: px(14), fontWeight: 600, padding: "4px 12px", borderRadius: 999, background: "var(--green)", color: "var(--on-green)" }}>
            <Check size={16} strokeWidth={2.6} aria-hidden="true" />
            <span>{confirmedText}</span>
          </span>
        ) : (
          <span style={{ fontSize: px(14), fontWeight: 600, padding: "4px 12px", borderRadius: 999, background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange-text)" }}>Por confirmar</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: px(24), fontWeight: 700, lineHeight: 1.25, overflowWrap: "anywhere" }}>{order.customerName}</span>
        {order.modified && !done && (
          <span style={{ fontSize: px(12), fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>MODIFICADO</span>
        )}
      </div>
      {order.businessName && <div data-business style={{ fontSize: px(17), color: "var(--text-muted)", marginTop: 2, overflowWrap: "anywhere" }}>{order.businessName}</div>}
      <div style={{ fontSize: px(16), color: "var(--text-muted)", margin: "8px 0 12px", overflowWrap: "anywhere" }}>{`Código del cliente: ${order.customerCode || "sin código"}`}</div>

      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "12px 0", marginBottom: 14 }}>
        {order.lines.map((l) => (
          <div key={l.code} style={{ fontSize: px(18), padding: "2px 0" }}>{`${l.name} × ${l.qty}`}</div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: px(21), fontWeight: 700 }}>
          <span>Total</span>
          <span>{formatCUP(order.total)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          aria-label={`Ver en el portal el pedido de ${order.customerName}`}
          onClick={() => openPortalSearch(portalSearchText({ code: order.customerCode, name: order.customerName }), { wide: true })}
          style={secondaryButton}
        >
          <ExternalLink size={20} strokeWidth={2.2} aria-hidden="true" />
          Ver en el portal
        </button>
        {!done && !readOnly && (
          <button
            type="button"
            aria-label={`Confirmar pedido de ${order.customerName}`}
            disabled={paused}
            title={paused ? "La facturación está cerrada" : undefined}
            onClick={() => onConfirm(order)}
            style={{ ...confirmButton, ...(paused ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
          >
            <Check size={22} strokeWidth={2.6} aria-hidden="true" />
            Confirmar pedido
          </button>
        )}
        {!done && readOnly && <span style={{ fontSize: px(16), fontWeight: 600, color: "var(--orange-text)" }}>Pendiente de confirmar</span>}
        {done && byFacturadora && !readOnly && (
          <button
            type="button"
            aria-label={`Deshacer la confirmación de ${order.customerName}`}
            disabled={paused}
            title={paused ? "La facturación está cerrada" : undefined}
            onClick={() => onUndo([order.id])}
            style={{ ...secondaryButton, ...(paused ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
          >
            <Undo2 size={20} strokeWidth={2.2} aria-hidden="true" />
            Deshacer
          </button>
        )}
      </div>
    </article>
  );
}

function HelpDialog({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const steps = [
    "Cada tarjeta es un pedido que un vendedor mandó a facturar. Los más antiguos están arriba.",
    "Pulsa «Ver en el portal» para revisar el pedido en el portal de Procovar.",
    "Si todo está bien, pulsa «Confirmar pedido». El vendedor lo verá confirmado en su teléfono.",
    "¿Te equivocaste? Pulsa «Deshacer» y el pedido vuelve a la lista.",
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,17,12,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label="Cómo se usa" style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", background: "var(--surface)", color: "var(--text)", borderRadius: 16, padding: "24px 26px" }}>
        <h2 style={{ margin: "0 0 14px", fontSize: px(24) }}>Cómo se usa</h2>
        <ol style={{ margin: 0, paddingLeft: 24, fontSize: px(18), lineHeight: 1.5 }}>
          {steps.map((s) => <li key={s} style={{ marginBottom: 10 }}>{s}</li>)}
        </ol>
        <p style={{ fontSize: px(16), color: "var(--text-muted)", margin: "6px 0 18px" }}>La página se actualiza sola. Cuando llega un pedido nuevo, suena un aviso.</p>
        <button type="button" onClick={onClose} style={{ ...confirmButton, width: "100%", flex: "none" }}>Entendido</button>
      </div>
    </div>
  );
}

export default function FacturadoraBoard({ f, sellers }) {
  const [scale, setScale] = useState(readScale);
  const [soundOn, setSoundOn] = useState(readSound);
  const [sellerId, setSellerId] = useState("todos");
  const [query, setQuery] = useState("");
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [toast, setToast] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [showSales, setShowSales] = useState(false);
  const seenRef = useRef(null);
  const readOnly = !!f.readOnly;
  // Fuera del horario de facturación se ve todo pero no se confirma ni se deshace.
  const paused = !!f.closedMessage;

  const all = useMemo(() => flattenOrders(sellers), [sellers]);
  // "Último pedido recibido hace N min": se actualiza solo cada medio minuto.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const inSeller = useMemo(() => (sellerId === "todos" ? all : all.filter((o) => o.sellerId === sellerId)), [all, sellerId]);
  const filtered = useMemo(() => filterOrders(all, { sellerId, tab: "todos", query }), [all, sellerId, query]);
  const pending = filtered.filter((o) => o.status === "pendiente");
  const confirmed = filtered.filter((o) => o.status === "confirmado").sort((a, b) => String(b.confirmedAt || "").localeCompare(String(a.confirmedAt || "")));
  const waiting = inSeller.filter((o) => o.status === "pendiente").length;
  const totalWaiting = all.filter((o) => o.status === "pendiente").length;

  const markSeen = (ids) => { if (seenRef.current) ids.forEach((id) => seenRef.current.add(id)); };

  function changeScale(delta) {
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((scale + delta) * 10) / 10));
    setScale(next);
    remember(SCALE_KEY, String(next));
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    remember(SOUND_KEY, next ? "1" : "0");
  }

  function confirm(order) {
    f.confirm([order.id]);
    markSeen([order.id]);
    setToast({ ids: [order.id], name: order.customerName });
  }

  function undo(ids) {
    f.unconfirm(ids);
    markSeen(ids);
    setToast(null);
  }

  // Aviso de pedido nuevo: lo que ya estaba al abrir la página no avisa; lo que llega después, sí.
  const pendingKey = all.filter((o) => o.status === "pendiente").map((o) => o.id).sort().join("|");
  const hasData = f.lastSyncAt !== null && f.lastSyncAt !== undefined;
  useEffect(() => {
    if (!hasData) return;
    const ids = pendingKey ? pendingKey.split("|") : [];
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seenRef.current.has(id));
    ids.forEach((id) => seenRef.current.add(id));
    if (fresh.length === 0) return;
    setNotice(newOrdersText(fresh.length));
    if (soundOn) playChime();
    // Solo cuando cambian los pedidos por confirmar.
  }, [pendingKey, hasData]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(""), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const online = f.phase === "ok" || f.phase === "idle";
  const Wifi = online ? Cloud : CloudOff;
  const chip = (active) => ({
    fontSize: px(16), minHeight: 44, padding: "8px 18px", borderRadius: 999, fontFamily: "inherit", cursor: "pointer", fontWeight: 600,
    border: `1px solid ${active ? "var(--ink)" : "var(--border-strong)"}`, background: active ? "var(--ink)" : "var(--surface)", color: active ? "var(--cream)" : "var(--text)",
  });
  const countText = (n) => (n > 0 ? `${n} por confirmar` : "al día");

  return (
    <div data-board style={{ "--fx-scale": scale, minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 110 }}>
      <header style={{ background: "var(--ink)", color: "var(--cream)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: px(18), fontWeight: 700 }}>Facturación Procovar</div>
        <span style={{ fontSize: px(14), padding: "4px 12px", borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>{`${f.nextDay ? (f.nextDayIsTomorrow ? "Para mañana" : "Próximo día") : "Hoy"} · ${formatDateShort(f.day)}`}</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" aria-label="Letra más pequeña" onClick={() => changeScale(-0.1)} style={{ ...toolButton, fontSize: 15 }}>A−</button>
          <button type="button" aria-label="Letra más grande" onClick={() => changeScale(0.1)} style={{ ...toolButton, fontSize: 21 }}>A+</button>
          <button type="button" aria-label={`Sonido de aviso: ${soundOn ? "activado" : "desactivado"}`} onClick={toggleSound} style={toolButton}>
            {soundOn ? <Bell size={20} aria-hidden="true" /> : <BellOff size={20} aria-hidden="true" />}
          </button>
          <button type="button" aria-label="¿Cómo se usa?" onClick={() => setHelpOpen(true)} style={toolButton}>
            <CircleHelp size={20} aria-hidden="true" />
            ¿Cómo se usa?
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "22px 16px 0" }}>
        <h1 style={{ margin: 0, fontSize: px(28), fontWeight: 700 }}>Pedidos por confirmar</h1>
        <div style={{ fontSize: px(18), color: "var(--text-muted)", margin: "4px 0 6px" }}>
          {waiting === 0 ? "Todo al día" : `${waiting} ${plural(waiting, "pedido espera", "pedidos esperan")} tu confirmación`}
        </div>
        {readOnly && (
          <div data-readonly style={{ display: "inline-block", fontSize: px(14), fontWeight: 700, borderRadius: 999, padding: "4px 12px", margin: "2px 0 6px", background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>Solo lectura</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: px(15), color: "var(--text-muted)", margin: "0 0 16px" }}>
          <Wifi size={18} aria-hidden="true" />
          <span>{connectionText(f)}</span>
        </div>
        <div data-last-received style={{ fontSize: px(15), color: "var(--text-muted)", margin: "-8px 0 16px" }}>{lastReceivedText(all, tick)}</div>

        {paused && (
          <div role="status" data-closed style={{ background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange-text)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, fontSize: px(18), fontWeight: 700 }}>
            {f.closedMessage}
          </div>
        )}

        {readOnly && (
          <div style={{ marginBottom: 16 }}>
            <button type="button" aria-expanded={showSales} onClick={() => setShowSales((v) => !v)} style={{ ...secondaryButton, flex: "none", width: "100%" }}>
              {showSales ? "Ocultar ventas del día" : "Ventas del día"}
            </button>
            {showSales && <div style={{ marginTop: 12 }}><SalesSummary load={f.loadSales} /></div>}
          </div>
        )}

        {notice && (
          <div role="status" style={{ background: "var(--green)", color: "var(--on-green)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, fontSize: px(19), fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={22} aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: px(50), padding: "0 14px", borderRadius: 12, border: "1px solid var(--border-strong)", background: "var(--surface)", marginBottom: 14 }}>
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar"
            placeholder="Buscar cliente, código o negocio"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontFamily: "inherit", fontSize: px(18) }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          <button type="button" aria-pressed={sellerId === "todos"} onClick={() => setSellerId("todos")} style={chip(sellerId === "todos")}>{`Todos · ${countText(totalWaiting)}`}</button>
          {sellers.map((s) => (
            <button key={s.id} type="button" data-seller-name={s.name} aria-pressed={sellerId === s.id} onClick={() => setSellerId(s.id)} style={chip(sellerId === s.id)}>
              {`${s.name} · ${countText(s.pending)}`}
            </button>
          ))}
        </div>

        <section data-list="pendientes" aria-label="Pedidos por confirmar">
          {pending.map((o) => <OrderCard key={o.id} order={o} readOnly={readOnly} paused={paused} onConfirm={confirm} onUndo={undo} />)}
          {pending.length === 0 && (query.trim() ? (
            <div style={{ textAlign: "center", padding: "30px 0", fontSize: px(18), color: "var(--text-muted)" }}>Ningún pedido coincide con lo que escribiste.</div>
          ) : (
            <div style={{ textAlign: "center", padding: "34px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, marginBottom: 16 }}>
              <div style={{ fontSize: px(24), fontWeight: 700 }}>No hay pedidos por confirmar</div>
              <div style={{ fontSize: px(18), color: "var(--text-muted)", marginTop: 6 }}>Cuando llegue uno nuevo, aparecerá aquí.</div>
            </div>
          ))}
        </section>

        {confirmed.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              aria-expanded={showConfirmed}
              onClick={() => setShowConfirmed((v) => !v)}
              style={{ ...secondaryButton, flex: "none", width: "100%", marginBottom: 16 }}
            >
              {showConfirmed ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
              {showConfirmed ? "Ocultar confirmados de hoy" : `Ver confirmados de hoy (${confirmed.length})`}
            </button>
            {showConfirmed && (
              <section data-list="confirmados" aria-label="Pedidos confirmados">
                {confirmed.map((o) => <OrderCard key={o.id} order={o} readOnly={readOnly} paused={paused} onConfirm={confirm} onUndo={undo} />)}
              </section>
            )}
          </div>
        )}

        <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 28, fontSize: px(14), color: "var(--text-muted)" }}>
          <span>Se actualiza sola cada 30 segundos.</span>
          <button type="button" onClick={f.unlink} style={{ background: "none", border: "none", color: "var(--text-muted)", textDecoration: "underline", fontFamily: "inherit", fontSize: px(14), minHeight: 40, padding: "0 6px", cursor: "pointer" }}>Salir de la sesión</button>
        </footer>
      </main>

      {toast && (
        <div role="status" aria-label="Pedido confirmado" style={{ position: "fixed", left: 16, right: 16, bottom: 20, maxWidth: 788, margin: "0 auto", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, background: "#1d1d1b", color: "#f2efe6", borderRadius: 14, padding: "14px 18px", fontSize: px(18) }}>
          <span>{`Pedido de ${toast.name} confirmado`}</span>
          <button type="button" disabled={paused} onClick={() => undo(toast.ids)} style={{ opacity: paused ? 0.45 : 1, minHeight: px(48), padding: "0 18px", borderRadius: 10, border: "1px solid #f2efe6", background: "transparent", color: "#f2efe6", fontFamily: "inherit", fontSize: px(17), fontWeight: 700, cursor: "pointer" }}>Deshacer</button>
        </div>
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
