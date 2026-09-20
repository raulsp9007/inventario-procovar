import { useState } from "react";
import { ChevronRight, ChevronDown, Pencil, X, AlertTriangle, Search } from "lucide-react";
import { formatDate, todayStr } from "./dateUtils";
import { formatCUP } from "./money";
import { getCustomerStats, getCustomerOrders, getCustomerProductHistory, getCustomerNames, findNearDuplicateCustomerName, getProductBuyers } from "./customerHelpers";

// Ícono de moto (domicilio) -- repetido a mano (no importado de Orders.jsx)
// por la misma razón que en OrderFormModal.jsx: es un ícono chico, no vale
// la pena una dependencia cruzada entre componentes de presentación.
function MotoIcon({ size = 13, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="17.5" r="2.8" />
      <circle cx="18" cy="17.5" r="2.8" />
      <path d="M8.8 17.5h6.4M6 14.7V9h5l3.2 4.4 3.8 1.2v2.9" />
      <path d="M11 9V6h2.6" />
    </svg>
  );
}

// Fecha relativa corta para la fila colapsada ("Hoy", "Ayer", "Hace N
// días/semanas") -- solo para ese contexto compacto; el detalle expandido
// (por pedido) sigue mostrando la fecha absoluta de formatDate, que ahí
// tiene más sentido junto al resto de datos del pedido.
function relativeDate(dateStr) {
  const today = todayStr();
  if (dateStr === today) return "Hoy";
  // Fecha futura (pedido "para mañana" todavía sin facturar) -- no es una
  // "última compra" pasada, así que no tiene sentido un relativo tipo "hace
  // N días". Se muestra la fecha absoluta tal cual.
  if (dateStr > today) return formatDate(dateStr);
  const [y, m, d] = dateStr.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  const weeks = Math.round(days / 7);
  return `Hace ${weeks} semana${weeks === 1 ? "" : "s"}`;
}

function sortStats(stats, sortBy, buyers) {
  const sorted = [...stats];
  if (sortBy === "qty" && buyers) {
    sorted.sort((a, b) => (buyers.get(b.customerName)?.qty || 0) - (buyers.get(a.customerName)?.qty || 0));
  } else if (sortBy === "name") {
    sorted.sort((a, b) => a.customerName.localeCompare(b.customerName, "es"));
  } else if (sortBy === "oldest") {
    sorted.sort((a, b) => a.lastPurchaseDate.localeCompare(b.lastPurchaseDate));
  } else {
    sorted.sort((a, b) => b.lastPurchaseDate.localeCompare(a.lastPurchaseDate));
  }
  return sorted;
}

const SORT_LABELS = { recent: "Reciente", oldest: "Antiguo", name: "Nombre A-Z", qty: "Más unidades" };

export default function Customers({ products, movements, showPrices, onUpdateCustomer, onRestoreMovements }) {
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [modes, setModes] = useState({}); // { [customerName]: "pedido" | "producto" }
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [businessNameInput, setBusinessNameInput] = useState("");
  const [pendingUndo, setPendingUndo] = useState(null); // { message, snapshot, timeoutId } | null

  function startRename(customerName, businessName) {
    setEditingCustomer(customerName);
    setNameInput(customerName);
    setBusinessNameInput(businessName || "");
  }

  function saveRename(oldName) {
    const snapshot = movements;
    onUpdateCustomer(oldName, nameInput, businessNameInput);
    setEditingCustomer(null);
    setPendingUndo((prev) => {
      if (prev) clearTimeout(prev.timeoutId);
      const timeoutId = setTimeout(() => {
        setPendingUndo((cur) => (cur && cur.timeoutId === timeoutId ? null : cur));
      }, 5000);
      return { message: `Cambios guardados en ${nameInput.trim() || oldName}`, snapshot, timeoutId };
    });
  }

  function undoRename() {
    if (!pendingUndo) return;
    clearTimeout(pendingUndo.timeoutId);
    onRestoreMovements(pendingUndo.snapshot);
    setPendingUndo(null);
  }

  function setModeFor(customerName, mode) {
    setModes((m) => ({ ...m, [customerName]: mode }));
  }

  const allStats = getCustomerStats(movements, products);

  // Aviso de "cliente parecido" al renombrar -- igual que ya existe al crear
  // pedidos (Orders.jsx). Acá importa más: renombrar fusiona TODO el
  // historial del cliente bajo el nombre nuevo, así que un typo aquí (a
  // diferencia de un pedido nuevo) mezclaría en silencio dos clientes ya
  // existentes. Se excluye el propio nombre viejo de la lista para no
  // compararlo contra sí mismo.
  const otherCustomerNames = editingCustomer
    ? getCustomerNames(movements).filter((n) => n !== editingCustomer)
    : [];
  const nearDuplicateName = editingCustomer
    ? findNearDuplicateCustomerName(otherCustomerNames, nameInput)
    : null;
  // Filtro por producto: solo clientes que lo pidieron alguna vez (todo el
  // historial, sin límite de días), con sus unidades y última fecha de ESE
  // producto -- lo que el chip de producto favorito no dice.
  const buyers = productFilter ? getProductBuyers(movements, productFilter) : null;
  const filterProduct = productFilter ? products.find((p) => p.code === productFilter) : null;
  const searched = search.trim()
    ? allStats.filter((c) => {
        const q = search.trim().toLowerCase();
        return c.customerName.toLowerCase().includes(q) || (c.businessName || "").toLowerCase().includes(q);
      })
    : allStats;
  const filtered = buyers ? searched.filter((c) => buyers.has(c.customerName)) : searched;
  const stats = sortStats(filtered, sortBy, buyers);
  const filteredUnits = buyers ? stats.reduce((sum, c) => sum + buyers.get(c.customerName).qty, 0) : 0;

  function changeProductFilter(code) {
    setProductFilter(code);
    setSortBy(code ? "qty" : (sortBy === "qty" ? "recent" : sortBy));
  }

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.07em", color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>
        CLIENTES ({allStats.length})
      </div>

      {allStats.length > 0 && (
        <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", alignItems: "stretch", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
            <Search size={15} color="var(--faint)" style={{ flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Buscar cliente o negocio"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
                height: 44, fontSize: 14, color: "var(--text)", fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ width: 1, background: "var(--border)", margin: "8px 0" }} />
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setSortMenuOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none",
                color: "var(--faint)", fontSize: 13, fontWeight: 600, padding: "0 12px", height: 44, cursor: "pointer",
              }}
            >
              {SORT_LABELS[sortBy]}
              <ChevronDown size={12} />
            </button>
            {sortMenuOpen && (
              <>
                <div onClick={() => setSortMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                <div style={{
                  position: "absolute", top: 48, right: 0, background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 10, boxShadow: "0 8px 20px rgba(0,0,0,0.15)", overflow: "hidden", zIndex: 30, minWidth: 140,
                }}>
                  {[...(productFilter ? ["qty"] : []), "recent", "oldest", "name"].map((key, i) => (
                    <button
                      key={key}
                      onClick={() => { setSortBy(key); setSortMenuOpen(false); }}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px", border: "none",
                        borderTop: i === 0 ? "none" : "1px solid var(--hairline)", background: "none",
                        fontSize: 13, color: "var(--text)", fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      {SORT_LABELS[key]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {allStats.length > 0 && (
        <div style={{ marginBottom: 16, marginTop: -6 }}>
          <div style={{ position: "relative" }}>
            <select
              value={productFilter}
              onChange={(e) => changeProductFilter(e.target.value)}
              aria-label="Filtrar clientes por producto"
              style={{
                width: "100%", boxSizing: "border-box", height: 40, border: "1px solid var(--border)", borderRadius: 10,
                padding: "0 34px 0 12px", fontSize: 13.5, fontWeight: 500, fontFamily: "inherit",
                background: "var(--surface-subtle)", color: productFilter ? "var(--text)" : "var(--muted)",
                appearance: "none", WebkitAppearance: "none",
              }}
            >
              <option value="">Todos los productos</option>
              {products.map((p) => (
                <option key={p.code} value={p.code}>{p.name}{p.archived ? " (archivado)" : ""}</option>
              ))}
            </select>
            <ChevronDown size={14} color="var(--faint)" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          </div>
          {buyers && stats.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              {`${stats.length} cliente${stats.length === 1 ? "" : "s"} · ${filteredUnits} uds de ${filterProduct ? filterProduct.name : "este producto"}`}
            </div>
          )}
        </div>
      )}

      {allStats.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>Aún no hay clientes registrados</div>
          <div style={{ fontSize: 13, color: "var(--faint)" }}>Aparecerán aquí en cuanto crees el primer pedido.</div>
        </div>
      ) : stats.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
            {search.trim() ? `Ningún cliente coincide con "${search}"` : "Ningún cliente coincide con el filtro"}
          </div>
          <button
            onClick={() => { setSearch(""); changeProductFilter(""); }}
            style={{ fontSize: 13, color: "var(--text)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {stats.map((c, i) => {
            const buyer = buyers ? buyers.get(c.customerName) : null;
            const product = products.find((p) => p.code === (buyer ? productFilter : c.favoriteProductCode));
            const isExpanded = expandedCustomer === c.customerName;
            const mode = modes[c.customerName] || "pedido";
            const orders = isExpanded && mode === "pedido" ? getCustomerOrders(movements, c.customerName) : [];
            const productHistory = isExpanded && mode === "producto" ? getCustomerProductHistory(movements, c.customerName) : [];
            return (
              <div key={c.customerName} style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
                {editingCustomer === c.customerName ? (
                  <div style={{ padding: 14 }}>
                    <div style={{ marginBottom: 8 }}>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Nombre y apellidos"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(c.customerName); }}
                        style={{
                          width: "100%", boxSizing: "border-box", height: 40, border: "1px solid var(--border)", borderRadius: 8,
                          padding: "0 10px", fontSize: 13, fontFamily: "inherit", color: "var(--text)", background: "var(--surface-subtle)",
                        }}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Negocio (opcional)"
                      value={businessNameInput}
                      onChange={(e) => setBusinessNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(c.customerName); }}
                      style={{
                        width: "100%", boxSizing: "border-box", height: 40, border: "1px solid var(--border)", borderRadius: 8,
                        padding: "0 10px", fontSize: 13, fontFamily: "inherit", color: "var(--text)", background: "var(--surface-subtle)",
                        marginBottom: 10,
                      }}
                    />

                    {nearDuplicateName && (
                      <div style={{
                        display: "flex", gap: 8, background: "var(--banner-bg)", border: "1px solid var(--border-warn)",
                        borderRadius: 10, padding: "10px 12px", marginBottom: 12, alignItems: "flex-start",
                      }}>
                        <AlertTriangle size={15} strokeWidth={2} color="var(--orange)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, fontSize: 12.5, color: "var(--text)", lineHeight: 1.4 }}>
                          ¿Es el mismo cliente que <strong>{nearDuplicateName}</strong>? Si guardás así, se fusiona todo su historial.
                          <div>
                            <button
                              onClick={() => setNameInput(nearDuplicateName)}
                              style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "var(--ink)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                            >
                              Usar ese
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setEditingCustomer(null)}
                        style={{ flex: 1, height: 40, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => saveRename(c.customerName)}
                        style={{ flex: 1, height: 40, borderRadius: 9, border: "none", background: "var(--ink)", color: "var(--cream)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedCustomer(isExpanded ? null : c.customerName)}
                    style={{
                      width: "100%", textAlign: "left", background: "none", border: "none", padding: 12,
                      display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.customerName}
                        </span>
                        <span
                          onClick={(e) => { e.stopPropagation(); startRename(c.customerName, c.businessName); }}
                          title="Editar cliente"
                          role="button"
                          aria-label="Editar cliente"
                          style={{
                            flexShrink: 0, color: "var(--faint)", width: 30, height: 30, margin: "-8px -4px -8px -2px",
                            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Pencil size={13} strokeWidth={2.2} />
                        </span>
                      </div>
                      {c.businessName && (
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.businessName}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
                        {buyer
                          ? `${relativeDate(buyer.lastDate)} · ${buyer.times} pedido${buyer.times === 1 ? "" : "s"}`
                          : relativeDate(c.lastPurchaseDate)}
                      </div>
                    </div>
                    {product && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 3, background: "var(--panel-alt)", borderRadius: 999,
                        padding: "5px 8px 5px 6px", flexShrink: 0, maxWidth: 96,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: product.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>
                          {buyer ? `${product.short} x${buyer.qty}` : product.short}
                        </span>
                      </div>
                    )}
                    <div style={{ flexShrink: 0, display: "flex", transition: "transform .2s", transform: `rotate(${isExpanded ? 90 : 0}deg)` }}>
                      <ChevronRight size={15} color="var(--faint)" />
                    </div>
                  </button>
                )}

                {isExpanded && (
                  <div style={{ background: "var(--surface-subtle)", borderTop: "1px solid var(--hairline)", padding: "12px 14px 14px" }}>
                    <div style={{ background: "var(--segment-track)", borderRadius: 9, padding: 3, display: "flex", gap: 2, marginBottom: 12, width: "fit-content" }}>
                      <button
                        onClick={() => setModeFor(c.customerName, "pedido")}
                        style={{
                          padding: "6px 12px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: mode === "pedido" ? "var(--ink)" : "transparent",
                          color: mode === "pedido" ? "var(--cream)" : "var(--muted)",
                        }}
                      >
                        Por pedido
                      </button>
                      <button
                        onClick={() => setModeFor(c.customerName, "producto")}
                        style={{
                          padding: "6px 12px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: mode === "producto" ? "var(--ink)" : "transparent",
                          color: mode === "producto" ? "var(--cream)" : "var(--muted)",
                        }}
                      >
                        Por producto
                      </button>
                    </div>

                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      {mode === "pedido" && orders.map((order) => {
                        const total = order.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
                        return (
                          <div key={order.orderId} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{formatDate(order.date)}</span>
                                {order.isDelivery && <MotoIcon size={13} color="var(--faint)" />}
                              </div>
                              {showPrices && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{formatCUP(total)}</span>}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {order.lines.map((line) => {
                                const lp = products.find((p) => p.code === line.code);
                                return (
                                  <div key={line.code} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--panel-alt)", borderRadius: 999, padding: "3px 8px 3px 5px" }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: lp?.color || "var(--faintest)" }} />
                                    <span style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}>{lp ? lp.short : line.code}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {mode === "producto" && productHistory.map((entry, pi) => {
                        const p = products.find((pr) => pr.code === entry.code);
                        return (
                          <div key={entry.code} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderTop: pi === 0 ? "none" : "1px solid var(--hairline)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p?.color || "var(--faintest)", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{p ? p.short : entry.code}</div>
                              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                                {entry.times} {entry.times === 1 ? "vez" : "veces"} · {entry.qty} en total
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--faint)", flexShrink: 0 }}>{formatDate(entry.lastDate)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingUndo && (
        <div style={{
          position: "fixed", left: 16, right: 16, bottom: 92, zIndex: 40,
          background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
          animation: "toastIn 0.2s ease-out",
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{pendingUndo.message}</span>
          <button
            onClick={undoRename}
            style={{ flexShrink: 0, background: "none", border: "none", color: "var(--ink)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}
          >
            Deshacer
          </button>
          <button
            onClick={() => { clearTimeout(pendingUndo.timeoutId); setPendingUndo(null); }}
            title="Cerrar"
            aria-label="Cerrar"
            style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: "none", background: "none", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
