import { useMemo, useRef, useState } from "react";
import { Upload, Download } from "lucide-react";
import { shareProductListFile } from "./backup";
import { buildProductListExport, parseProductList, planProductImport } from "./productList";

// Tarjeta de Configuración para exportar e importar la lista de productos,
// eligiendo qué datos mover. La lógica vive en productList.js (funciones puras);
// acá solo están las casillas, la vista previa y los botones.

const FIELD_LABELS = { precio: "Precio USD", cantidad: "Cantidad", foto: "Foto", formato: "Formato" };
const FIELD_ORDER = ["precio", "cantidad", "foto", "formato"];

const cardStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop: 14 };
const buttonStyle = {
  display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text)",
  borderRadius: 7, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const primaryStyle = { ...buttonStyle, background: "var(--ink)", color: "var(--cream)", border: "1px solid var(--ink)" };
const labelStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "5px 0", cursor: "pointer" };
const panelStyle = { margin: "12px 0 0", padding: "12px 0 0", borderTop: "1px solid var(--border)" };

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToFile(data, type, name) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type });
}

const plural = (n, one, many) => (n === 1 ? one : many);

function describeChange(change) {
  switch (change.field) {
    case "precio": return change.from == null ? `${change.to} US$` : `${change.from} → ${change.to} US$`;
    case "cantidad": return change.from == null ? `${change.to} uds` : `${change.from} → ${change.to} uds`;
    case "formato": return change.from ? `${change.from} → ${change.to}` : `${change.to}`;
    case "foto": return "foto";
    default: return "";
  }
}

const STATUS_LABELS = { nuevo: "nuevo", actualiza: "se actualiza", igual: "sin cambios", existe: "ya existe" };
const MAX_ROWS = 12;

export default function ProductListCard({ products, prices, stock, productFormats, exchangeRate, onApply, getPhotoBlob, savePhoto }) {
  const hasRate = !!exchangeRate && exchangeRate > 0;
  const fileInput = useRef(null);
  const [mode, setMode] = useState(null); // null | "export" | "import"
  const [exportFields, setExportFields] = useState(() => new Set(FIELD_ORDER));
  const [parsed, setParsed] = useState(null);
  const [importFields, setImportFields] = useState(() => new Set());
  const [existing, setExisting] = useState("nuevos");
  const [qty, setQty] = useState("reemplazar");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const exportChecked = (f) => (f === "precio" ? hasRate && exportFields.has(f) : exportFields.has(f));

  function toggle(setter, field) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function close() {
    setMode(null);
    setParsed(null);
    setMessage("");
    setError("");
  }

  async function runExport() {
    setBusy(true);
    setMessage("");
    try {
      const list = await buildProductListExport({
        products, prices, stock, productFormats, exchangeRate,
        fields: FIELD_ORDER.filter(exportChecked),
        getPhoto: async (code) => {
          const blob = await getPhotoBlob(code);
          return blob ? { type: blob.type || "image/jpeg", data: await blobToBase64(blob) } : null;
        },
      });
      const result = await shareProductListFile(list);
      if (result !== "cancelled") {
        setMessage(`Lista exportada: ${list.products.length} ${plural(list.products.length, "producto", "productos")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onFileChosen(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    try {
      const data = parseProductList(await readText(file));
      setParsed(data);
      setImportFields(new Set(data.fields.filter((f) => f !== "precio" || hasRate)));
      setExisting("nuevos");
      setQty("reemplazar");
      setError("");
      setMode("import");
    } catch (e) {
      setParsed(null);
      setMode(null);
      setError(e && e.message ? e.message : "No se pudo leer el archivo.");
    }
  }

  const plan = useMemo(() => {
    if (!parsed) return null;
    return planProductImport({
      products, prices, stock, productFormats, exchangeRate, parsed,
      fields: FIELD_ORDER.filter((f) => importFields.has(f)), existing, qty,
    });
  }, [parsed, importFields, existing, qty, products, prices, stock, productFormats, exchangeRate]);

  async function applyImport() {
    if (!plan) return;
    setBusy(true);
    const { nuevos, actualizan } = plan.counts;
    onApply(plan);
    let failed = 0;
    for (const photo of plan.photos) {
      try {
        const result = await savePhoto(photo.code, base64ToFile(photo.data, photo.type, `${photo.code}.jpg`));
        if (result && result.ok === false) failed += 1;
      } catch {
        failed += 1;
      }
    }
    const parts = [];
    if (nuevos > 0) parts.push(`${nuevos} ${plural(nuevos, "nuevo", "nuevos")}`);
    if (actualizan > 0) parts.push(`${actualizan} ${plural(actualizan, "actualizado", "actualizados")}`);
    let text = `Importación aplicada: ${parts.join(", ")}`;
    if (failed > 0) text += `. ${failed} ${plural(failed, "foto no se pudo guardar", "fotos no se pudieron guardar")}`;
    setBusy(false);
    close();
    setMessage(text);
  }

  const changesToApply = plan ? plan.counts.nuevos + plan.counts.actualizan : 0;

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Lista de productos</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        Pasa tu catálogo a otro teléfono o actualiza precios y cantidades desde un archivo. Eliges qué datos mover; no toca pedidos, clientes ni historial.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle} onClick={() => { setMessage(""); setError(""); setParsed(null); setMode("export"); }}>
          <Upload size={16} />
          Exportar lista
        </button>
        <button type="button" style={buttonStyle} onClick={() => fileInput.current && fileInput.current.click()}>
          <Download size={16} />
          Importar lista
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="Archivo de lista de productos"
          onChange={onFileChosen}
          style={{ display: "none" }}
        />
      </div>

      {error && <div role="alert" style={{ fontSize: 12.5, color: "var(--error-text)", marginTop: 10 }}>{error}</div>}
      {message && mode === null && <div role="status" style={{ fontSize: 12.5, color: "var(--green)", marginTop: 10 }}>{message}</div>}

      {mode === "export" && (
        <div role="group" aria-label="Datos a exportar" style={panelStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 4 }}>DATOS A EXPORTAR</div>
          <label style={{ ...labelStyle, cursor: "default", color: "var(--text-muted)" }}>
            <input type="checkbox" checked disabled readOnly />
            Nombre (siempre)
          </label>
          {FIELD_ORDER.map((f) => (
            <div key={f}>
              <label style={{ ...labelStyle, opacity: f === "precio" && !hasRate ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={exportChecked(f)}
                  disabled={f === "precio" && !hasRate}
                  onChange={() => toggle(setExportFields, f)}
                />
                {FIELD_LABELS[f]}
              </label>
              {f === "precio" && !hasRate && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 4px 26px" }}>Carga la tasa de conversión (en Productos) para usarlo.</div>
              )}
              {f === "foto" && exportChecked("foto") && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 4px 26px" }}>Las fotos hacen el archivo más pesado.</div>
              )}
            </div>
          ))}
          {message && <div role="status" style={{ fontSize: 12.5, color: "var(--green)", margin: "8px 0" }}>{message}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={primaryStyle} onClick={runExport} disabled={busy}>Compartir lista</button>
            <button type="button" style={buttonStyle} onClick={close}>{message ? "Cerrar" : "Cancelar"}</button>
          </div>
        </div>
      )}

      {mode === "import" && parsed && plan && (
        <div role="group" aria-label="Importar lista de productos" style={panelStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 2 }}>IMPORTAR</div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>
            {parsed.products.length} {plural(parsed.products.length, "producto", "productos")} en el archivo
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, margin: "8px 0 2px" }}>Datos a importar</div>
          {parsed.fields.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>El archivo solo trae nombres.</div>
          )}
          {FIELD_ORDER.filter((f) => parsed.fields.includes(f)).map((f) => (
            <div key={f}>
              <label style={{ ...labelStyle, opacity: f === "precio" && !hasRate ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={importFields.has(f)}
                  disabled={f === "precio" && !hasRate}
                  onChange={() => toggle(setImportFields, f)}
                />
                {FIELD_LABELS[f]}
              </label>
              {f === "precio" && !hasRate && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 4px 26px" }}>Carga la tasa de conversión (en Productos) para usarlo.</div>
              )}
            </div>
          ))}

          <div style={{ fontSize: 12.5, fontWeight: 600, margin: "10px 0 2px" }}>Productos que ya existen</div>
          <label style={labelStyle}>
            <input type="radio" name="plist-existing" checked={existing === "nuevos"} onChange={() => setExisting("nuevos")} />
            Solo agregar los nuevos
          </label>
          <label style={labelStyle}>
            <input type="radio" name="plist-existing" checked={existing === "actualizar"} onChange={() => setExisting("actualizar")} />
            Actualizar también los que ya existen
          </label>

          {importFields.has("cantidad") && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, margin: "10px 0 2px" }}>Cantidad</div>
              <label style={labelStyle}>
                <input type="radio" name="plist-qty" checked={qty === "reemplazar"} onChange={() => setQty("reemplazar")} />
                Reemplazar el stock actual
              </label>
              <label style={labelStyle}>
                <input type="radio" name="plist-qty" checked={qty === "sumar"} onChange={() => setQty("sumar")} />
                Sumar al stock actual
              </label>
            </>
          )}

          <div style={{ fontSize: 12.5, fontWeight: 600, margin: "12px 0 4px" }}>Vista previa</div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>
            {plan.counts.nuevos} {plural(plan.counts.nuevos, "nuevo", "nuevos")} · {plan.counts.actualizan} {plural(plan.counts.actualizan, "se actualiza", "se actualizan")} · {plan.counts.iguales} sin cambios · {plan.counts.existentes} {plural(plan.counts.existentes, "ya existe", "ya existen")}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {plan.rows.slice(0, MAX_ROWS).map((row) => (
              <div key={row.name} style={{ borderTop: "1px solid var(--divider)", padding: "5px 0 2px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {row.changes.length > 0 ? row.changes.map(describeChange).join(" · ") : STATUS_LABELS[row.status]}
                </div>
              </div>
            ))}
            {plan.rows.length > MAX_ROWS && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>y {plan.rows.length - MAX_ROWS} más</div>
            )}
          </div>
          {plan.warnings.map((w) => (
            <div key={w} style={{ fontSize: 12, color: "var(--orange)", marginTop: 6 }}>{w}</div>
          ))}

          {changesToApply === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>No hay cambios que aplicar con estas opciones.</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {changesToApply > 0 && <button type="button" style={primaryStyle} onClick={applyImport} disabled={busy}>Aplicar</button>}
            <button type="button" style={buttonStyle} onClick={close}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
