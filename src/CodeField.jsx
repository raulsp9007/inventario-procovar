import { useState } from "react";
import { Pencil, Check } from "lucide-react";

// Código del cliente (el del portal): es el dato más importante, así que nunca
// está abierto de entrada. Se ve como texto y un lápiz lo habilita a demanda;
// el visto lo vuelve a cerrar (el valor queda como se escribió).
export default function CodeField({ value, onChange, onEnter, background = "var(--surface-subtle)" }) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      role="group"
      aria-label="Código del cliente"
      style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, borderRadius: 9, border: "1px solid var(--border)", background, padding: "0 4px 0 12px" }}
    >
      <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Código</span>
      {editing ? (
        <input
          type="text"
          autoFocus
          aria-label="Código"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(false); if (onEnter) onEnter(); } }}
          style={{ flex: 1, minWidth: 0, height: 32, border: "1px solid var(--border-strong)", borderRadius: 7, background: "var(--surface)", padding: "0 8px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: value ? 600 : 500, color: value ? "var(--text)" : "var(--faint)", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
          {value || "Sin código"}
        </span>
      )}
      <button
        type="button"
        aria-label={editing ? "Listo con el código" : "Editar código"}
        title={editing ? "Listo" : "Editar código"}
        onClick={() => setEditing((v) => !v)}
        style={{ flexShrink: 0, width: 36, height: 36, border: "none", background: "none", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}
      >
        {editing ? <Check size={16} strokeWidth={2.4} /> : <Pencil size={14} strokeWidth={2.2} />}
      </button>
    </div>
  );
}
