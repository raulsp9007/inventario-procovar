import { useState, useRef } from "react";
import { Pencil, Check } from "lucide-react";
import { fillAnimationMs } from "./motion.js";
import useAnimatedNumber from "./useAnimatedNumber.js";

const SEGMENTS = 40;
const START_DEG = 135;
const SWEEP_DEG = 270;
const R_INNER = 40;
const R_OUTER = 54;

function segmentLine(index) {
  const angle = ((START_DEG + (SWEEP_DEG * index) / (SEGMENTS - 1)) * Math.PI) / 180;
  return {
    x1: 60 + R_INNER * Math.cos(angle),
    y1: 60 + R_INNER * Math.sin(angle),
    x2: 60 + R_OUTER * Math.cos(angle),
    y2: 60 + R_OUTER * Math.sin(angle),
  };
}

const LINES = Array.from({ length: SEGMENTS }, (_, i) => segmentLine(i));

// Indicador de meta: anillo de tablero con 40 segmentos que se van
// encendiendo según el avance, el número al centro y la meta (tocable, para
// cambiarla ahí mismo) debajo. `goal` null = sin meta: anillo apagado.
// `parseGoal(texto)` devuelve el número de la meta; vacío, 0 o negativo la quita.
export default function GoalRing({ label, lines, value, goal, decimals = 0, color, parseGoal, onGoalChange }) {
  const hasGoal = typeof goal === "number" && Number.isFinite(goal) && goal > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const settled = useRef(false);
  const ms = fillAnimationMs();
  const shown = useAnimatedNumber(value, ms);

  const litCount = hasGoal ? Math.round(Math.min(1, Math.max(0, shown / goal)) * SEGMENTS) : 0;
  const shownText = shown.toFixed(decimals);
  const pct = hasGoal ? Math.round((shown / goal) * 100) : null;
  const finalPct = hasGoal ? Math.round((value / goal) * 100) : null;
  const ariaLabel = hasGoal
    ? `${label}: ${value.toFixed(decimals)} de ${goal} (${finalPct}%)`
    : `${label}: ${value.toFixed(decimals)} sin meta`;

  function startEditing() {
    settled.current = false;
    setDraft(hasGoal ? String(goal) : "");
    setEditing(true);
  }

  // Guardar y salir -- idempotente: Enter, OK y salir del campo llegan casi
  // juntos y no deben avisar dos veces.
  function commit() {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    const parsed = parseGoal(draft);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    if (next !== (hasGoal ? goal : null)) onGoalChange(next);
  }

  function cancel() {
    settled.current = true;
    setEditing(false);
  }

  const numberSize = shownText.length > 5 ? 17 : shownText.length > 3 ? 20 : 24;

  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
      <svg viewBox="0 0 120 120" width="100%" role="img" aria-label={ariaLabel} style={{ display: "block" }}>
        {LINES.map((line, i) => (
          <line
            key={i}
            data-segment=""
            data-lit={i < litCount ? "true" : "false"}
            {...line}
            stroke={i < litCount ? color : "var(--border)"}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        ))}
        <text x="60" y="64" textAnchor="middle" fontSize={numberSize} fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: "tabular-nums" }}>{shownText}</text>
        <text x="60" y="79" textAnchor="middle" fontSize="11" fill="var(--text-muted)">{hasGoal ? `de ${goal}` : "sin meta"}</text>
        {hasGoal && (
          <text x="60" y="111" textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>{`${pct}%`}</text>
        )}
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.25, marginTop: -6 }}>
        {lines.map((line) => <div key={line}>{line}</div>)}
      </div>
      {editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 6, justifyContent: "center" }}>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            aria-label={label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") cancel();
            }}
            onBlur={commit}
            style={{
              width: 58, minWidth: 0, border: "1px solid var(--border-strong)", borderRadius: 7, padding: "5px 6px",
              fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "center", boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            aria-label={`Guardar meta de ${label}`}
            style={{
              width: 28, height: 28, flexShrink: 0, borderRadius: 7, border: "none", background: "var(--ink)", color: "var(--cream)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <Check size={14} strokeWidth={2.4} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          aria-label={hasGoal ? `Cambiar meta de ${label}` : `Fijar meta de ${label}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, height: 26, padding: "0 9px", borderRadius: 999,
            border: `1px solid ${hasGoal ? "var(--border-strong)" : "var(--orange)"}`, background: "var(--surface)",
            color: "var(--text)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {hasGoal ? `Meta ${goal}` : "Fijar meta"}
          <Pencil size={11} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
