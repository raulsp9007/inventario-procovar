import { ChevronLeft, Check, AlertCircle, Send } from "lucide-react";
import { formatDate } from "./dateUtils";
import { formatCUP, formatUSD } from "./money";
import { riseStyle } from "./motion";

// Pantalla de repaso antes de cerrar el día. Solo muestra lo que calcula
// buildClosingSummary (closing.js): no cambia ningún dato ni "cierra" nada.
// Pedidos, stock para mañana y respaldo se pueden resolver (✓ o !); las
// metas y las ventas son informativas.

function StatusDot({ state }) {
  const ok = state === "ok";
  const warn = state === "warn";
  return (
    <span
      aria-hidden="true"
      style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: ok ? "var(--green)" : warn ? "var(--warn-tint)" : "transparent",
        border: ok ? "1.5px solid var(--green)" : `1.5px solid ${warn ? "var(--orange)" : "var(--border-strong)"}`,
        color: ok ? "var(--on-accent)" : warn ? "var(--orange)" : "var(--faint)",
      }}
    >
      {ok ? <Check size={14} strokeWidth={3} /> : warn ? <AlertCircle size={14} strokeWidth={2.4} /> : <span style={{ fontSize: 14, lineHeight: 1 }}>•</span>}
    </span>
  );
}

function Section({ index, state, title, subtitle, action, children }) {
  return (
    <div
      className="rise"
      style={{
        ...riseStyle(index), background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
        marginBottom: 10, overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <StatusDot state={state} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subtitle}</div>
        </div>
        {action}
      </div>
      {children && <div style={{ borderTop: "1px solid var(--divider)", padding: "6px 14px 10px" }}>{children}</div>}
    </div>
  );
}

function SmallButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0, height: 32, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border-strong)",
        background: "transparent", color: "var(--text)", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const pct = (value, goal) => Math.round((value / goal) * 100);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function CierreDelDia({ summary, today, onClose, onGo, onShareBackup, onSendSummary }) {
  const { pedidos, metas, ventas, stock, respaldo, pending, total } = summary;

  const goalRows = [
    metas.blisters != null ? { key: "blisters", label: "BLÍSTERES", value: String(metas.blisters), goal: metas.blisterGoal, reached: metas.blisterGoal ? metas.blisters >= metas.blisterGoal : null } : null,
    { key: "hl", label: metas.blisters != null ? "HL CERV. Y MALTA" : "HL VENDIDOS", value: metas.hl.toFixed(2), goal: metas.hlGoal, reached: metas.hlGoal ? metas.hl >= metas.hlGoal : null },
  ].filter(Boolean);
  const definedGoals = goalRows.filter((g) => g.goal);
  const allGoalsMet = definedGoals.length > 0 && definedGoals.every((g) => g.reached);
  const goalsSubtitle = definedGoals.length === 0
    ? "Sin metas definidas"
    : allGoalsMet ? "Cumpliste las metas del día" : "Hoy no se llegó a alguna meta";

  const backupSubtitle = respaldo.done
    ? "Respaldo compartido hoy"
    : respaldo.daysAgo == null
      ? "Todavía no has hecho ningún respaldo"
      : `Último respaldo: hace ${plural(respaldo.daysAgo, "día", "días")}`;

  const progressText = pending === 0
    ? "Todo listo para cerrar"
    : pending === 1 ? "Falta 1 cosa antes de cerrar" : `Faltan ${pending} cosas antes de cerrar`;

  return (
    <div
      role="dialog"
      aria-label="Cierre del día"
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "var(--bg)", overflowY: "auto", paddingBottom: 110, fontFamily: "'Inter', system-ui, sans-serif", color: "var(--text)" }}
    >
      <div style={{ background: "var(--ink)", color: "var(--cream)", padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 16px" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          style={{ display: "flex", alignItems: "center", gap: 2, background: "none", border: "none", color: "var(--on-ink-subtitle)", fontSize: 13, padding: 0, marginBottom: 10, fontFamily: "inherit", cursor: "pointer" }}
        >
          <ChevronLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--on-ink-label)", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · GESTOR DE VENTAS</div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>Cierre del día</h1>
        <div style={{ fontSize: 12.5, color: "var(--on-ink-subtitle)", marginTop: 6 }}>Hoy · {formatDate(today)}</div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--on-ink-subtitle)", marginBottom: 6 }}>
            <span>{progressText}</span>
            <b style={{ color: "var(--cream)", fontSize: 13 }}>{`${total - pending} de ${total}`}</b>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.14)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${((total - pending) / total) * 100}%`, background: "var(--on-ink-accent)", borderRadius: 4, transition: "width .5s" }} />
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {pending === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(60,110,74,.12)", border: "1px solid var(--green)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--green)", color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Check size={20} strokeWidth={3} />
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Todo en orden</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Pedidos al día, stock cubierto y respaldo hecho.</div>
            </div>
          </div>
        )}

        <Section
          index={0}
          state={pedidos.done ? "ok" : "warn"}
          title="Pedidos"
          subtitle={pedidos.total === 0 ? "Sin pedidos hoy" : `${pedidos.billed} de ${pedidos.total} facturados · ${pedidos.confirmed} de ${pedidos.total} confirmados`}
          action={!pedidos.done && <SmallButton onClick={() => onGo("pedidos")}>Ver</SmallButton>}
        >
          {!pedidos.done && (
            <>
              {pedidos.pendingBill.map((o) => (
                <button
                  key={o.orderId}
                  type="button"
                  onClick={() => onGo("pedidos")}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--divider)", padding: "8px 0", fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", color: "var(--text)" }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 12, color: "var(--faint)", marginRight: 5 }}>#{o.orderSeq}</span>
                    {o.customerName}{o.isDelivery ? " 🛵" : ""}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "var(--warn-tint)", border: "1px solid var(--border-warn)", color: "var(--orange)" }}>
                    {o.isDelivery ? "SIN SUP." : "SIN FACT."}
                  </span>
                </button>
              ))}
              {pedidos.unconfirmed > 0 && (
                <div style={{ borderTop: "1px solid var(--divider)", padding: "8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                  {plural(pedidos.unconfirmed, "pedido sin confirmar", "pedidos sin confirmar")}
                </div>
              )}
            </>
          )}
        </Section>

        <Section index={1} state={definedGoals.length === 0 ? "info" : allGoalsMet ? "ok" : "info"} title="Metas del día" subtitle={goalsSubtitle}>
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            {goalRows.map((g) => (
              <div key={g.key} style={{ flex: 1, minWidth: 0, background: "var(--bg)", borderRadius: 10, padding: "9px 10px" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.05em", color: "var(--text-muted)" }}>{g.label}</div>
                <div style={{ fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {g.value} {g.goal ? <small style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>de {g.goal}</small> : null}
                </div>
                {g.goal ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: g.reached ? "var(--green)" : "var(--orange)" }}>{pct(Number(g.value), g.goal)}%{g.reached ? " ✓" : ""}</div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--divider)", marginTop: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, pct(Number(g.value), g.goal))}%`, background: g.reached ? "var(--green)" : "var(--orange)" }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--faint)" }}>sin meta</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            {metas.monthGoal
              ? `Meta del mes: ${metas.monthHl.toFixed(1)} de ${metas.monthGoal} hL (${pct(metas.monthHl, metas.monthGoal)}%)`
              : `HL del mes: ${metas.monthHl.toFixed(1)}`}
          </div>
        </Section>

        <Section
          index={2}
          state="ok"
          title="Ventas del día"
          subtitle={`${plural(ventas.ordersBilled, "pedido facturado", "pedidos facturados")} · ${plural(ventas.units, "unidad", "unidades")}`}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 4 }}>
            <b style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{formatCUP(ventas.revenue)}</b>
            {ventas.revenueUsd != null && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{formatUSD(ventas.revenueUsd)}</span>}
          </div>
        </Section>

        <Section
          index={3}
          state={stock.done ? "ok" : "warn"}
          title="Stock para mañana"
          subtitle={stock.done ? "Alcanza para lo reservado de mañana" : `${plural(stock.shortages.length, "producto no alcanza", "productos no alcanzan")} para lo reservado`}
          action={!stock.done && <SmallButton onClick={() => onGo("stock")}>Ver</SmallButton>}
        >
          {!stock.done && stock.shortages.map((row) => (
            <button
              key={row.code}
              type="button"
              onClick={() => onGo("stock")}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--divider)", padding: "8px 0", fontFamily: "inherit", cursor: "pointer", color: "var(--text)" }}
            >
              <span>
                <b style={{ fontSize: 13.5 }}>{row.short}</b>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>Quedan {row.stock} · reservado mañana {row.reserved}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--red)", whiteSpace: "nowrap" }}>faltan {row.missing}</span>
            </button>
          ))}
        </Section>

        <Section
          index={4}
          state={respaldo.done ? "ok" : "warn"}
          title="Respaldo"
          subtitle={backupSubtitle}
          action={!respaldo.done && <SmallButton onClick={onShareBackup}>Compartir</SmallButton>}
        />
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 91, background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "10px 14px calc(14px + env(safe-area-inset-bottom, 0px))" }}>
        <button
          type="button"
          onClick={onSendSummary}
          aria-label="Enviar resumen al supervisor"
          style={{ width: "100%", height: 46, borderRadius: 10, border: "none", background: "var(--ink)", color: "var(--cream)", fontSize: 14.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Send size={16} strokeWidth={2.2} />
          Enviar resumen al supervisor
        </button>
      </div>
    </div>
  );
}
