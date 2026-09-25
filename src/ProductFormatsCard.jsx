import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

// Formatos de venta (cómo viene empacado un producto: sixpack, paca12u...),
// editables acá en vez de una lista fija en el código -- ver productFormats.js.
// Sin confirmación de 2 toques al eliminar: el propio store ya bloquea
// borrar uno que algún producto tenga puesto (ver removeProductFormat en
// productFormats.js), así que el peor caso de un toque de más es borrar uno
// que no se estaba usando -- se vuelve a agregar con el mismo nombre y listo.
export default function ProductFormatsCard({ formats, products, onSaveProductFormat, onDeleteProductFormat }) {
  const [newCode, setNewCode] = useState("");
  const [newUnits, setNewUnits] = useState("");
  const [editingCode, setEditingCode] = useState(null);
  const [editUnitsInput, setEditUnitsInput] = useState("");

  function isInUse(code) {
    return products.some((p) => p.format === code);
  }

  function submitNew() {
    if (!newCode.trim() || !newUnits) return;
    onSaveProductFormat({ code: newCode, units: newUnits });
    setNewCode("");
    setNewUnits("");
  }

  function startEdit(format) {
    setEditingCode(format.code);
    setEditUnitsInput(String(format.units));
  }

  function confirmEdit(code) {
    onSaveProductFormat({ code, units: editUnitsInput });
    setEditingCode(null);
  }

  const inputStyle = {
    border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", height: 36,
    fontSize: 13.5, fontFamily: "inherit", color: "var(--text)", background: "var(--surface-subtle)", boxSizing: "border-box",
  };
  const iconButtonStyle = {
    width: 36, height: 36, flexShrink: 0, borderRadius: 7, border: "1px solid var(--border-strong)",
    background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Formatos de venta</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        Cómo vienen empacados los productos (sixpack, paca12u...). El precio del producto se divide entre las unidades para mostrar el precio unitario.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {formats.map((f) => (
          <div
            key={f.code}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, background: "var(--surface-subtle)", border: "1px solid var(--border)" }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.code}
              </div>
              {isInUse(f.code) && (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>En uso</div>
              )}
            </div>
            {editingCode === f.code ? (
              <>
                <input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  value={editUnitsInput}
                  onChange={(e) => setEditUnitsInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(f.code); }}
                  style={{ ...inputStyle, width: 72, textAlign: "right" }}
                />
                <button onClick={() => confirmEdit(f.code)} aria-label={`Guardar unidades de ${f.code}`} style={{ ...iconButtonStyle, color: "var(--accent-green-text)" }}>
                  <Check size={16} />
                </button>
                <button onClick={() => setEditingCode(null)} aria-label="Cancelar" style={{ ...iconButtonStyle, color: "var(--text-muted)" }}>
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{f.units} uds</span>
                <button onClick={() => startEdit(f)} aria-label={`Editar unidades de ${f.code}`} style={{ ...iconButtonStyle, color: "var(--text-muted)" }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => onDeleteProductFormat(f.code)} aria-label={`Eliminar formato ${f.code}`} style={{ ...iconButtonStyle, color: "var(--danger)" }}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
        {formats.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Todavía no hay formatos.</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Nombre (ej: docena)"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
          style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0 }}
        />
        <input
          type="number"
          inputMode="numeric"
          placeholder="Uds"
          value={newUnits}
          onChange={(e) => setNewUnits(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
          style={{ ...inputStyle, width: 64, textAlign: "right" }}
        />
        <button
          onClick={submitNew}
          aria-label="Agregar formato"
          style={{ ...iconButtonStyle, width: 44, background: "var(--ink)", border: "none", color: "var(--cream)" }}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
