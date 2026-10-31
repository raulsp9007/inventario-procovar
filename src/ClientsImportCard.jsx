import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { parseClientsCsv, planClientsImport } from "./clientsImport";

// Pestaña Clientes: importar la lista de clientes de un CSV (la del portal) con
// vista previa. La lógica vive en clientsImport.js (funciones puras); acá solo
// están el botón, las opciones, la vista previa y la confirmación.

const MODES = [
  { key: "nuevos", label: "Solo agregar los nuevos" },
  { key: "completar", label: "Completar los que ya existen (rellena lo que falta)" },
  { key: "actualizar", label: "Actualizar con lo del archivo (cambia lo guardado)" },
];
const FIELD_LABELS = { businessName: "negocio", phone: "teléfono", code: "código", address: "dirección", clientType: "tipo", consumptionType: "consumo" };
const MAX_ROWS = 12;
const plural = (n, one, many) => (n === 1 ? one : many);

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const newId = () => `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const buttonStyle = {
  width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--surface)",
  color: "var(--text)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
};
const smallButton = {
  height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)",
  color: "var(--text)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};
const labelStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "5px 0", cursor: "pointer" };

export default function ClientsImportCard({ customers, onImport }) {
  const fileInput = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [mode, setMode] = useState("completar");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function onFileChosen(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    try {
      setParsed(parseClientsCsv(await readText(file)));
      setMode("completar");
      setError("");
    } catch (e) {
      setParsed(null);
      setError(e && e.message ? e.message : "No se pudo leer el archivo.");
    }
  }

  const plan = useMemo(
    () => (parsed ? planClientsImport({ customers, parsed, mode, newId, nowIso: new Date().toISOString() }) : null),
    [parsed, mode, customers],
  );

  function apply() {
    const { nuevos, actualizan } = plan.counts;
    onImport(plan.nextCustomers);
    const parts = [];
    if (nuevos > 0) parts.push(`${nuevos} ${plural(nuevos, "nuevo", "nuevos")}`);
    if (actualizan > 0) {
      const word = mode === "completar" ? plural(actualizan, "completado", "completados") : plural(actualizan, "actualizado", "actualizados");
      parts.push(`${actualizan} ${word}`);
    }
    setParsed(null);
    setMessage(`Importación aplicada: ${parts.join(", ")}`);
  }

  const changes = plan ? plan.counts.nuevos + plan.counts.actualizan : 0;
  const updateWord = mode === "completar" ? ["se completa", "se completan"] : ["se actualiza", "se actualizan"];

  return (
    <div style={{ marginBottom: 12 }}>
      <button type="button" style={buttonStyle} onClick={() => fileInput.current && fileInput.current.click()}>
        <FileSpreadsheet size={15} strokeWidth={1.8} />
        Importar clientes (CSV)
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        aria-label="Archivo de clientes (CSV)"
        onChange={onFileChosen}
        style={{ display: "none" }}
      />
      {error && <div role="alert" style={{ fontSize: 12.5, color: "var(--error-text)", marginTop: 8 }}>{error}</div>}
      {message && !parsed && <div role="status" style={{ fontSize: 12.5, color: "var(--green)", marginTop: 8, textAlign: "center" }}>{message}</div>}

      {parsed && plan && (
        <div role="group" aria-label="Importar clientes" style={{ marginTop: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{`${parsed.rows.length} ${plural(parsed.rows.length, "cliente", "clientes")} en el archivo`}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            Se guardan nombre, negocio, teléfono, código, dirección y tipos. El nombre de un cliente que ya existe no cambia.
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, margin: "6px 0 2px" }}>Clientes que ya existen</div>
          {MODES.map((m) => (
            <label key={m.key} style={labelStyle}>
              <input type="radio" name="clients-import-mode" checked={mode === m.key} onChange={() => setMode(m.key)} />
              {m.label}
            </label>
          ))}

          <div style={{ fontSize: 12.5, fontWeight: 600, margin: "10px 0 4px" }}>Vista previa</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>
            {`${plan.counts.nuevos} ${plural(plan.counts.nuevos, "nuevo", "nuevos")} · ${plan.counts.actualizan} ${plural(plan.counts.actualizan, updateWord[0], updateWord[1])} · ${plan.counts.iguales} sin cambios · ${plan.counts.existentes} ${plural(plan.counts.existentes, "ya existe", "ya existen")}`}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {plan.rows.filter((r) => r.status !== "igual" && r.status !== "existe").slice(0, MAX_ROWS).map((row) => (
              <div key={row.name} style={{ borderTop: "1px solid var(--divider)", padding: "5px 0 2px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {row.status === "nuevo" ? "nuevo" : row.changes.map((c) => FIELD_LABELS[c.field]).join(" · ")}
                </div>
              </div>
            ))}
            {plan.rows.filter((r) => r.status !== "igual" && r.status !== "existe").length > MAX_ROWS && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {`y ${plan.rows.filter((r) => r.status !== "igual" && r.status !== "existe").length - MAX_ROWS} más`}
              </div>
            )}
          </div>
          {parsed.warnings.map((w) => (
            <div key={w} style={{ fontSize: 12, color: "var(--orange)", marginTop: 6 }}>{w}</div>
          ))}

          {changes === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>No hay cambios que aplicar con estas opciones.</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {changes > 0 && <button type="button" style={{ ...smallButton, background: "var(--ink)", color: "var(--cream)", borderColor: "var(--ink)" }} onClick={apply}>Aplicar</button>}
            <button type="button" style={smallButton} onClick={() => setParsed(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
