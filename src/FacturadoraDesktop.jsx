import { useEffect, useMemo, useRef, useState } from "react";
import { Cloud, CloudOff, Search, ExternalLink, Check } from "lucide-react";
import { flattenOrders, filterOrders, tabCounts } from "./facturadoraData";
import { openPortalSearch } from "./portalLink";
import { formatCUP } from "./money";
import { formatDateShort, todayStr } from "./dateUtils";

// Sitio de la facturadora en una computadora de escritorio: barra de vendedores a
// la izquierda y una tabla con los pedidos de todos (o de uno), con selección
// múltiple, búsqueda y atajos de teclado. La lógica de datos vive en
// facturadoraData.js y useFacturadora; acá solo está la pantalla.

const pad = (n) => String(n).padStart(2, "0");
const clock = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const plural = (n, one, many) => (n === 1 ? one : many);

const TOP = 56;
const TABS = [["sin", "Sin confirmar"], ["todos", "Todos"], ["ok", "Confirmados"]];
const COLUMNS = ["", "Hora", "Cliente y negocio", "Código", "Productos", "Total", ""];

function isTyping(target) {
  if (!target || !target.tagName) return false;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName === "INPUT") return target.type !== "checkbox";
  return !!target.isContentEditable;
}

const pill = { display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" };
const chip = { display: "inline-block", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 7px", marginLeft: 6, background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" };
const smallButton = { height: 26, padding: "0 10px", borderRadius: 999, border: "1px solid var(--border-strong)", background: "var(--surface-subtle)", color: "var(--text)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 };

export default function FacturadoraDesktop({ f, sellers, connection }) {
  const [sellerId, setSellerId] = useState("todos");
  const [tab, setTab] = useState("sin");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [undo, setUndo] = useState(null);
  const searchRef = useRef(null);
  // La supervisión solo mira: sin casillas, sin confirmar, sin deshacer.
  const readOnly = !!f.readOnly;

  const all = useMemo(() => flattenOrders(sellers), [sellers]);
  const visible = useMemo(() => filterOrders(all, { sellerId, tab, query }), [all, sellerId, tab, query]);
  const counts = useMemo(() => tabCounts(all, sellerId), [all, sellerId]);
  const pending = all.filter((o) => o.status === "pendiente").length;
  const activeIndex = Math.max(0, visible.findIndex((o) => o.id === activeId));
  const active = visible[activeIndex] || null;
  const pendingVisible = visible.filter((o) => o.status === "pendiente");
  const selectedIds = visible.filter((o) => selected[o.id] && o.status === "pendiente").map((o) => o.id);
  const allSelected = pendingVisible.length > 0 && selectedIds.length === pendingVisible.length;

  useEffect(() => {
    if (!undo) return undefined;
    const id = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(id);
  }, [undo]);

  function confirm(ids) {
    if (ids.length === 0 || readOnly) return;
    f.confirm(ids);
    setSelected((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { delete next[id]; });
      return next;
    });
    setUndo({ ids, text: ids.length === 1 ? "Confirmado · se refleja en la app del vendedor" : `${ids.length} pedidos confirmados · se reflejan en la app de cada vendedor` });
  }

  function toggle(id) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll(checked) {
    setSelected((prev) => {
      const next = { ...prev };
      pendingVisible.forEach((o) => { next[o.id] = checked; });
      return next;
    });
  }

  // Atajos: / buscar · J/K moverse · Espacio marcar · Enter confirmar la fila activa.
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/" && !isTyping(e.target)) {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }
      if (isTyping(e.target) || visible.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveId(visible[Math.min(visible.length - 1, activeIndex + 1)].id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveId(visible[Math.max(0, activeIndex - 1)].id);
      } else if (e.key === " " && !(e.target && e.target.type === "checkbox")) {
        e.preventDefault();
        if (!readOnly && active && active.status === "pendiente") toggle(active.id);
      } else if (e.key === "Enter" && !readOnly && active && active.status === "pendiente" && !(e.target && e.target.tagName === "BUTTON")) {
        e.preventDefault();
        confirm([active.id]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const Icon = connection.online ? Cloud : CloudOff;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 30, height: TOP, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 14, padding: "0 20px", background: "var(--ink)", color: "var(--cream)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>Facturación Procovar</div>
        <span style={{ ...pill, background: "rgba(255,255,255,0.08)", color: "var(--on-ink-subtitle)" }}>{`Hoy · ${formatDateShort(todayStr())}`}</span>
        {readOnly && <span style={{ ...pill, background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>Solo lectura</span>}
        <label style={{ flex: 1, maxWidth: 520, display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 12px", borderRadius: 9, background: "rgba(255,255,255,0.1)" }}>
          <Search size={15} strokeWidth={2.2} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Buscar"
            placeholder="Buscar cliente, código o negocio   ( / )"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.target.blur(); } }}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--cream)", fontSize: 13, fontFamily: "inherit" }}
          />
        </label>
        <span style={{ flex: 1 }} />
        <span style={{ ...pill, background: pending > 0 ? "var(--warn-tint)" : "transparent", border: `1px solid ${pending > 0 ? "var(--border-warn)" : "var(--green)"}`, color: pending > 0 ? "var(--orange)" : "var(--green)" }}>
          {pending === 0 ? "Todo confirmado" : `${pending} ${plural(pending, "pendiente", "pendientes")}`}
        </span>
        <span style={{ ...pill, color: "var(--on-ink-subtitle)" }}>
          <Icon size={14} strokeWidth={2} aria-hidden="true" />
          {connection.text}
        </span>
      </header>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", alignItems: "start" }}>
        <aside style={{ position: "sticky", top: TOP, height: `calc(100vh - ${TOP}px)`, boxSizing: "border-box", overflowY: "auto", padding: 12, borderRight: "1px solid var(--border)", background: "var(--surface-subtle)", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", padding: "4px 8px 6px" }}>VENDEDORES</div>
          <nav aria-label="Vendedores" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[{ id: "todos", name: "Todos", pending }, ...sellers].map((s) => {
            const on = sellerId === s.id;
            const total = s.id === "todos" ? all.length : s.pending + s.confirmed;
            return (
              <button
                key={s.id}
                type="button"
                data-seller={s.id === "todos" ? "todos" : s.name}
                aria-current={on ? "true" : undefined}
                onClick={() => { setSellerId(s.id); setActiveId(null); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 9,
                  border: `1px solid ${on ? "var(--border-strong)" : "transparent"}`, background: on ? "var(--surface)" : "transparent",
                  color: "var(--text)", fontSize: 13.5, fontWeight: on ? 700 : 500, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <span>{s.name}</span>
                {s.pending > 0 ? (
                  <span style={{ minWidth: 22, height: 20, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 7px", fontSize: 11.5, fontWeight: 700, background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>{s.pending}</span>
                ) : total > 0 ? (
                  <Check size={14} strokeWidth={2.6} color="var(--green)" aria-label="todo confirmado" />
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>–</span>
                )}
              </button>
            );
          })}
          </nav>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={f.unlink} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, textDecoration: "underline", fontFamily: "inherit", cursor: "pointer", padding: 8, textAlign: "left" }}>Desenlazar</button>
        </aside>

        <main style={{ minWidth: 0, display: "flex", flexDirection: "column", minHeight: `calc(100vh - ${TOP}px)` }}>
          <div role="tablist" style={{ display: "flex", gap: 4, padding: "10px 20px 0", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => { setTab(key); setActiveId(null); }}
                style={{ padding: "9px 14px", background: "none", border: "none", borderBottom: `2px solid ${tab === key ? "var(--ink)" : "transparent"}`, color: tab === key ? "var(--text)" : "var(--text-muted)", fontSize: 13.5, fontWeight: tab === key ? 700 : 500, fontFamily: "inherit", cursor: "pointer" }}
              >
                {label}
                <span style={{ marginLeft: 7, fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)" }}>{counts[key]}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, background: "var(--surface)" }}>
            <table aria-label="Pedidos" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
              <colgroup>
                <col style={{ width: 44 }} /><col style={{ width: 66 }} /><col style={{ width: "26%" }} /><col style={{ width: "21%" }} /><col /><col style={{ width: 110 }} /><col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map((label, i) => (
                    <th key={i} style={{ position: "sticky", top: TOP, zIndex: 5, background: "var(--surface-subtle)", textAlign: i === 5 ? "right" : "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                      {i === 0 ? (readOnly ? null : (
                        <input type="checkbox" aria-label="Seleccionar todos" checked={allSelected} disabled={pendingVisible.length === 0} onChange={(e) => toggleAll(e.target.checked)} />
                      )) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const done = o.status === "confirmado";
                  const isActive = active && active.id === o.id;
                  return (
                    <tr key={o.id} data-order-id={o.id} data-order-name={o.customerName} data-active={isActive ? "true" : "false"} style={{ background: isActive ? "var(--surface-subtle)" : "transparent", opacity: done ? 0.62 : 1, boxShadow: isActive ? "inset 3px 0 0 var(--ink)" : "none" }}>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                        {!readOnly && <input type="checkbox" aria-label={`Seleccionar pedido de ${o.customerName}`} checked={!!selected[o.id] && !done} disabled={done} onChange={() => toggle(o.id)} />}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{clock(o.createdAt)}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top", overflowWrap: "anywhere" }}>
                        <div style={{ fontWeight: 600 }}>
                          {o.customerName}
                          {o.modified && <span style={chip}>modificado</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {o.businessName ? `${o.businessName} · ` : ""}{o.sellerName}
                        </div>
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                        <div style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12, fontWeight: 600, color: o.customerCode ? "var(--text)" : "var(--text-muted)", overflowWrap: "anywhere" }}>{o.customerCode || "Sin código"}</div>
                        <button
                          type="button"
                          aria-label={o.customerCode ? `Comprobar código ${o.customerCode}` : `Comprobar a ${o.customerName}`}
                          title="Buscar en el portal de pedidos"
                          onClick={() => openPortalSearch(o.customerCode || o.customerName, { popup: false })}
                          style={{ ...smallButton, marginTop: 4, height: 24 }}
                        >
                          <ExternalLink size={12} strokeWidth={2.2} aria-hidden="true" />
                          Comprobar
                        </button>
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top", fontSize: 12.5 }}>
                        {o.lines.map((l) => <div key={l.code}>{`${l.name} ×${l.qty}`}</div>)}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(o.total)}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                        {done ? (
                          <div>
                            <div style={{ color: "var(--green)", fontWeight: 600, fontSize: 12.5 }}>{`✓ ${clock(o.confirmedAt)}${o.confirmedBy === "vendedor" ? " (vendedor)" : ""}`}</div>
                            {!readOnly && o.confirmedBy === "facturadora" && (
                              <button type="button" aria-label={`Quitar 👍 de ${o.customerName}`} onClick={() => f.unconfirm([o.id])} style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)", fontSize: 12, textDecoration: "underline", fontFamily: "inherit", cursor: "pointer" }}>Quitar 👍</button>
                            )}
                          </div>
                        ) : readOnly ? (
                          <span style={{ color: "var(--text-muted)", fontSize: 12.5 }}>Pendiente de confirmar</span>
                          ) : (
                          <button type="button" aria-label={`Confirmar pedido de ${o.customerName}`} onClick={() => confirm([o.id])} style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--ink)", color: "var(--cream)", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>👍 Confirmar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, padding: "48px 0" }}>
                {query ? "Ningún pedido coincide con la búsqueda." : tab === "sin" ? "Nada por aquí. Todo confirmado por hoy." : "Nada por aquí."}
              </div>
            )}
          </div>

          {undo && (
            <div role="status" style={{ position: "fixed", left: 250, bottom: 74, zIndex: 40, display: "flex", alignItems: "center", gap: 14, background: "#111", color: "#eee", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
              <span>{undo.text}</span>
              <button type="button" onClick={() => { f.unconfirm(undo.ids); setUndo(null); }} style={{ background: "none", border: "none", color: "#E3B463", fontWeight: 700, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>Deshacer</button>
            </div>
          )}

          <div style={{ position: "sticky", bottom: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", background: "var(--surface-subtle)", borderTop: "1px solid var(--border)" }}>
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-muted)" }}>
              {selectedIds.length > 0 ? `${selectedIds.length} ${plural(selectedIds.length, "seleccionado", "seleccionados")}` : readOnly ? "Solo puedes ver y buscar los pedidos; no puedes confirmarlos." : "Marca varios pedidos para confirmarlos de una vez"}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {readOnly ? (
                <><kbd style={kbd}>J</kbd> <kbd style={kbd}>K</kbd> moverse · <kbd style={kbd}>/</kbd> buscar</>
              ) : (
                <><kbd style={kbd}>J</kbd> <kbd style={kbd}>K</kbd> moverse · <kbd style={kbd}>Espacio</kbd> marcar · <kbd style={kbd}>Enter</kbd> confirmar · <kbd style={kbd}>/</kbd> buscar</>
              )}
            </span>
            {selectedIds.length > 0 && (
              <button type="button" onClick={() => confirm(selectedIds)} style={{ height: 36, padding: "0 18px", borderRadius: 9, border: "none", background: "var(--on-ink-accent)", color: "#111", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                {`Confirmar seleccionados (${selectedIds.length})`}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const kbd = { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11, padding: "1px 6px", border: "1px solid var(--border-strong)", borderRadius: 4, background: "var(--surface)", color: "var(--text-muted)" };
