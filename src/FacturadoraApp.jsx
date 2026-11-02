import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Check, Cloud, CloudOff } from "lucide-react";
import { useFacturadora } from "./useFacturadora";
import { formatCUP } from "./money";
import { formatDate, todayStr } from "./dateUtils";
import { openPortalSearch } from "./portalLink";
import { mergeKnownSellers } from "./facturadoraData";
import { KNOWN_SELLERS } from "./facturadoraSellers";
import FacturadoraDesktop from "./FacturadoraDesktop.jsx";

// App de la facturadora (mismo código que la del vendedor, modo ?rol=facturadora):
// vendedores → pedidos del vendedor → 👍. Ver
// docs/superpowers/specs/2026-10-30-facturacion-nube-design.md. La lógica vive en
// useFacturadora (nube, cola, datos sin conexión); acá solo está la pantalla.

const pad = (n) => String(n).padStart(2, "0");
const clock = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const plural = (n, one, many) => (n === 1 ? one : many);

// La página de la facturadora va siempre en modo claro: no sigue el tema del navegador ni el
// que se eligió en la app de ventas (que comparte el sitio).
function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.title = "Facturación Procovar";
  }, []);
}

const pageStyle = {
  minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 96,
};
// En el teléfono ocupa todo el ancho; en una computadora queda en una columna centrada.
const column = { maxWidth: 760, margin: "0 auto" };
const primaryButton = {
  width: "100%", height: 44, borderRadius: 10, border: "none", background: "var(--ink)", color: "var(--cream)",
  fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
};

function Header({ title, subtitle, onBack, backLabel, children }) {
  return (
    <div style={{ background: "var(--ink)", color: "var(--cream)", padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 16px" }}>
      <div style={column}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 2, background: "none", border: "none", color: "var(--on-ink-subtitle)", fontSize: 13, padding: 0, marginBottom: 8, fontFamily: "inherit", cursor: "pointer" }}
        >
          <ChevronLeft size={16} strokeWidth={2.4} />
          {backLabel}
        </button>
      )}
      <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--on-ink-label)", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · FACTURACIÓN</div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 12.5, color: "var(--on-ink-subtitle)", marginTop: 6 }}>{subtitle}</div>}
      {children}
      </div>
    </div>
  );
}

// Lo primero es la contraseña: no se muestra nada más hasta entrar.
function LinkScreen({ onLink, notice = "", onNoticeClear }) {
  const [usuario, setUsuario] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onLink({ usuario, clave: code });
    } catch (e) {
      setError(e && e.message ? e.message : "No se pudo enlazar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={pageStyle}>
      <Header title="Acceso" subtitle="Escribe tu usuario y contraseña para entrar." />
      <div style={{ ...column, padding: "14px 16px 16px" }}>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          type="text"
          aria-label="Usuario"
          placeholder="Usuario"
          name="username"
          autoComplete="username"
          value={usuario}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => { setUsuario(e.target.value); setError(""); if (onNoticeClear) onNoticeClear(); }}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 12px", fontSize: 14, background: "var(--surface)", color: "var(--text)", margin: "16px 0 10px" }}
        />
        <input
          type="password"
          aria-label="Contraseña"
          placeholder="Contraseña"
          name="password"
          autoComplete="current-password"
          value={code}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => { setCode(e.target.value); setError(""); if (onNoticeClear) onNoticeClear(); }}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 12px", fontSize: 14, background: "var(--surface)", color: "var(--text)", marginBottom: 10 }}
        />
        <button type="submit" disabled={busy} style={primaryButton}>Entrar</button>
        {(error || notice) && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 10 }}>{error || notice}</div>}
        </form>
      </div>
    </div>
  );
}

function connectionText(f) {
  const parts = [];
  if (f.phase === "ok") parts.push(`En línea · actualizado a las ${clock(f.lastSyncAt)}`);
  else if (f.phase === "offline") parts.push(f.lastSyncAt ? `Sin conexión · datos de las ${clock(f.lastSyncAt)}` : "Sin conexión");
  else if (f.phase === "auth" || f.phase === "error") parts.push(f.message);
  else parts.push("Conectando…");
  if (f.pendingOps > 0) parts.push(`${f.pendingOps} ${plural(f.pendingOps, "pendiente", "pendientes")} de enviar`);
  return parts.join(" · ");
}

function ReadOnlyBadge() {
  return (
    <div data-readonly style={{ display: "inline-block", marginTop: 8, fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>
      Solo lectura
    </div>
  );
}

function ConnectionLine({ f }) {
  const online = f.phase === "ok" || f.phase === "idle";
  const Icon = online ? Cloud : CloudOff;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--on-ink-subtitle)", marginTop: 6 }}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      <span>{connectionText(f)}</span>
    </div>
  );
}

// Una tarjeta por vendedor; sin enlazar son solo lectura (sin pedidos que ver).
function SellerCard({ seller, onOpen }) {
  const all = seller.pending + seller.confirmed;
  const base = { display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 10, fontFamily: "inherit", color: "var(--text)" };
  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{seller.name}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{onOpen ? `${seller.confirmed} de ${all} confirmados` : "Sin enlazar"}</span>
      </span>
      {onOpen && (seller.pending > 0 ? (
        <span style={{ minWidth: 30, height: 26, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 9px", fontSize: 12.5, fontWeight: 700, background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>{seller.pending}</span>
      ) : (
        <span style={{ minWidth: 30, height: 26, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 9px", fontSize: 12.5, fontWeight: 700, border: "1px solid var(--green)", color: "var(--green)" }}>✓</span>
      ))}
    </>
  );
  return onOpen ? (
    <button type="button" data-seller-name={seller.name} onClick={onOpen} style={{ ...base, cursor: "pointer" }}>{body}</button>
  ) : (
    <div data-seller-name={seller.name} style={base}>{body}</div>
  );
}

function SellersScreen({ f, sellers, onOpen }) {
  const total = f.totalPending;
  return (
    <div style={pageStyle}>
      <Header title="Pedidos por confirmar">
        <div style={{ fontSize: 13, color: "var(--cream)", marginTop: 6, fontWeight: 600 }}>
          {total === 0 ? "Todo confirmado" : `${total} ${plural(total, "pedido", "pedidos")} por confirmar`}
        </div>
        <ConnectionLine f={f} />
        {f.readOnly && <ReadOnlyBadge />}
      </Header>
      <div style={{ ...column, padding: "14px 16px" }}>
        {sellers.map((seller) => <SellerCard key={seller.id} seller={seller} onOpen={() => onOpen(seller.id)} />)}
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button type="button" onClick={f.unlink} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12.5, textDecoration: "underline", fontFamily: "inherit", cursor: "pointer" }}>Salir de la sesión</button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, today, onConfirm, onUndo, readOnly = false }) {
  const done = order.status === "confirmado";
  return (
    <div data-order-id={order.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600 }}>
          <span>{order.customerName}</span>
          {order.modified && (
            <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px", marginLeft: 6, background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>MODIFICADO</span>
          )}
          {order.businessName && <div data-business style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{order.businessName}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontWeight: 500 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{order.customerCode ? "Código" : ""}</span>
            <span style={{ fontSize: order.customerCode ? 13.5 : 12, fontWeight: order.customerCode ? 700 : 500, color: order.customerCode ? "var(--text)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
              {order.customerCode || "Sin código"}
            </span>
            <button
              type="button"
              aria-label={order.customerCode ? `Comprobar código ${order.customerCode}` : `Comprobar a ${order.customerName}`}
              title="Buscar en el portal de pedidos"
              onClick={() => openPortalSearch(order.customerCode || order.customerName, { wide: true })}
              style={{ flexShrink: 0, height: 26, padding: "0 10px", borderRadius: 999, border: "1px solid var(--border-strong)", background: "var(--surface-subtle)", color: "var(--text)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
            >
              Comprobar
            </button>
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{formatCUP(order.total)}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0" }}>
        {order.lines.map((l) => (
          <span key={l.code} style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "3px 9px", border: "1px solid var(--border)", background: "var(--surface-subtle)" }}>{`${l.name} ×${l.qty}`}</span>
        ))}
        {order.date !== today && (
          <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 8px", background: "var(--banner-bg)", border: "1px solid var(--border-warn)", color: "var(--orange-text)" }}>{formatDate(order.date)}</span>
        )}
      </div>
      {done ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--green)" }}>
            {`✓ Confirmado${order.confirmedAt ? ` a las ${clock(order.confirmedAt)}` : ""}${order.confirmedBy === "vendedor" ? " (por el vendedor)" : ""}`}
          </span>
          {!readOnly && order.confirmedBy === "facturadora" && (
            <button type="button" onClick={() => onUndo(order.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12.5, textDecoration: "underline", fontFamily: "inherit", cursor: "pointer" }}>Quitar 👍</button>
          )}
        </div>
      ) : readOnly ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--orange-text)" }}>Pendiente de confirmar</div>
      ) : (
        <button type="button" onClick={() => onConfirm(order.id)} style={primaryButton}>👍 Confirmar</button>
      )}
    </div>
  );
}

function SellerScreen({ f, seller, onBack }) {
  const [tab, setTab] = useState("pendientes");
  const [undo, setUndo] = useState(null);
  const today = todayStr();

  useEffect(() => {
    if (!undo) return undefined;
    const id = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(id);
  }, [undo]);

  const pending = seller.orders.filter((o) => o.status === "pendiente");
  const shown = tab === "pendientes" ? pending : seller.orders;

  function confirm(ids) {
    f.confirm(ids);
    setUndo({
      ids,
      text: ids.length === 1 ? `Confirmado · se refleja en la app de ${seller.name}` : `${ids.length} pedidos confirmados · se reflejan en la app de ${seller.name}`,
    });
  }

  return (
    <div style={pageStyle}>
      <Header title={seller.name} onBack={onBack} backLabel="Vendedores" subtitle={`${pending.length} sin confirmar · ${seller.confirmed} confirmados`}>
        <ConnectionLine f={f} />
        {f.readOnly && <ReadOnlyBadge />}
      </Header>
      <div style={{ ...column, padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["pendientes", "Sin confirmar"], ["todos", "Todos"]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                flex: 1, height: 36, borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                border: "1px solid var(--border-strong)", background: tab === key ? "var(--ink)" : "var(--surface)", color: tab === key ? "var(--cream)" : "var(--text)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.map((order) => <OrderCard key={order.id} order={order} today={today} onConfirm={(id) => confirm([id])} onUndo={(id) => f.unconfirm([id])} readOnly={f.readOnly} />)}
        {shown.length === 0 && (
          <div style={{ fontSize: 13.5, color: "var(--text-muted)", textAlign: "center", padding: "30px 0" }}>
            {seller.orders.length === 0 ? "Sin pedidos por ahora." : "Todo confirmado por hoy."}
          </div>
        )}
      </div>

      {undo && (
        <div role="status" style={{ ...column, position: "fixed", left: 16, right: 16, bottom: pending.length > 0 ? 84 : 20, zIndex: 95, display: "flex", alignItems: "center", gap: 10, background: "#111", color: "#eee", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          <span style={{ flex: 1 }}>{undo.text}</span>
          <button type="button" onClick={() => { f.unconfirm(undo.ids); setUndo(null); }} style={{ background: "none", border: "none", color: "#E3B463", fontWeight: 700, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>Deshacer</button>
        </div>
      )}

      {pending.length > 0 && !f.readOnly && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 90, background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "10px 14px calc(14px + env(safe-area-inset-bottom, 0px))" }}>
          <div style={column}>
            <button type="button" onClick={() => confirm(pending.map((o) => o.id))} style={{ ...primaryButton, height: 46, background: "var(--on-ink-accent)", color: "#111" }}>
              {`👍 Confirmar todos (${pending.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TITLE = "Facturación Procovar";

// Pantalla ancha (computadora de escritorio): se usa la tabla en vez de las tarjetas.
// Sin matchMedia (p. ej. en pruebas) se queda con la vista de teléfono.
const DESKTOP_QUERY = "(min-width: 900px)";
function useIsDesktop() {
  const read = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches;
  const [desktop, setDesktop] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(media.matches);
    onChange();
    if (media.addEventListener) media.addEventListener("change", onChange);
    else if (media.addListener) media.addListener(onChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", onChange);
      else if (media.removeListener) media.removeListener(onChange);
    };
  }, []);
  return desktop;
}

export default function FacturadoraApp() {
  useTheme();
  const f = useFacturadora();
  const [selectedId, setSelectedId] = useState(null);
  const [linkNotice, setLinkNotice] = useState("");
  const desktop = useIsDesktop();
  // Los vendedores, alfabéticamente. Con la lista del buzón en mano (la que arma el
  // administrador) manda esa; los de arranque solo valen mientras no se tiene.
  const sellers = useMemo(() => mergeKnownSellers(f.sellers, f.sellers.length > 0 ? [] : KNOWN_SELLERS), [f.sellers]);
  const selected = useMemo(() => sellers.find((s) => s.id === selectedId) || null, [sellers, selectedId]);

  // Enlace personal: la dirección trae el código (#procovar1:...). Se usa una vez,
  // se guarda y se quita de la barra (no queda en el historial ni se comparte sin querer).
  // Si esta computadora ya estaba enlazada, la dirección vieja no cambia nada.
  useEffect(() => {
    const code = window.location.hash.replace(/^#/, "");
    if (!code.startsWith("procovar1:")) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (f.link) return;
    f.linkWith(code).catch((e) => setLinkNotice(e && e.message ? e.message : "No se pudo enlazar."));
    // Solo al abrir la página.
  }, []);

  // Si la sesión ya no sirve (cambiaron la contraseña, se venció), se vuelve a pedir el acceso.
  useEffect(() => {
    if (f.link && f.phase === "auth") {
      f.unlink();
      setLinkNotice("La sesión terminó. Entra de nuevo.");
    }
  }, [f.link, f.phase]);

  // El número de pendientes en la pestaña avisa aunque esté en segundo plano.
  useEffect(() => {
    document.title = f.link && f.totalPending > 0 ? `(${f.totalPending}) ${TITLE}` : TITLE;
  }, [f.link, f.totalPending]);

  if (!f.link) return <LinkScreen onLink={f.signIn} notice={linkNotice} onNoticeClear={() => setLinkNotice("")} />;
  // Computadora de escritorio: barra de vendedores y tabla con todos los pedidos.
  if (desktop) return <FacturadoraDesktop f={f} sellers={sellers} connection={{ text: connectionText(f), online: f.phase === "ok" || f.phase === "idle" }} />;
  if (selected) return <SellerScreen f={f} seller={selected} onBack={() => setSelectedId(null)} />;
  return <SellersScreen f={f} sellers={sellers} onOpen={setSelectedId} />;
}
