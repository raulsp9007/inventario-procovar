import { useEffect, useState } from "react";
import { todayStr } from "./dateUtils";
import { clock12 } from "./facturadoraText";

// Envíos del día (administración): cuántos pedidos llegaron, cuáles tardaron en llegar y qué envíos se rechazaron
// (por el cierre del día, por el horario o por datos mal hechos). `load(fecha)` pide el resumen al buzón (debe ser una
// función estable).

const plural = (n, one, many) => (n === 1 ? one : many);
const box = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 };
const REASONS = { cierre: "Cierre del día", horario: "Fuera de horario", datos: "Datos no válidos" };
const row = { padding: "6px 0", borderTop: "1px solid var(--border)", fontSize: 14 };

export default function ShipmentsSummary({ load }) {
  const [fecha, setFecha] = useState(() => todayStr());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    load(fecha)
      .then((result) => { if (alive) { setData(result); setError(""); } })
      .catch((e) => { if (alive) { setData(null); setError((e && e.message) || "No se pudo cargar el resumen de envíos."); } });
    return () => { alive = false; };
  }, [fecha, load]);

  return (
    <section role="region" aria-label="Envíos del día" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }} htmlFor="envios-dia">Día</label>
        <input
          id="envios-dia"
          type="date"
          aria-label="Día de los envíos"
          value={fecha}
          onChange={(e) => { if (e.target.value) setFecha(e.target.value); }}
          style={{ height: 36, border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", color: "var(--text)" }}
        />
        <button
          type="button"
          onClick={() => setFecha(todayStr())}
          style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface-subtle)", color: "var(--text)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
        >
          Hoy
        </button>
      </div>

      {error && <div role="alert" style={{ ...box, color: "var(--error-text)", fontSize: 13.5 }}>{error}</div>}

      {data && (
        <>
          {data.recibidos === 0 ? (
            <div style={{ ...box, color: "var(--text-muted)", fontSize: 13.5 }}>Todavía no llegó ningún pedido ese día.</div>
          ) : (
            <div style={{ fontSize: 15, fontWeight: 700, margin: "0 2px 8px" }}>{`${data.recibidos} ${plural(data.recibidos, "pedido recibido", "pedidos recibidos")}`}</div>
          )}

          {data.porVendedor.map((v) => (
            <div key={v.id} role="group" aria-label={`Envíos de ${v.name}`} style={{ ...box, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700 }}>{v.name}</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {`${v.recibidos} ${plural(v.recibidos, "recibido", "recibidos")}`}
                {v.tardios > 0 ? ` · ${v.tardios} ${plural(v.tardios, "tardó", "tardaron")} más de ${data.umbralMin} min` : ""}
              </span>
            </div>
          ))}

          {data.tardios.length > 0 && (
            <div role="group" aria-label="Pedidos que tardaron en llegar" style={box}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>TARDARON EN LLEGAR</div>
              {data.tardios.map((o) => (
                <div key={o.id} style={row}>
                  <div style={{ fontWeight: 600 }}>{`${o.cliente} · ${o.vendedor}`}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{`enviado ${clock12(o.enviado)} · llegó ${clock12(o.llego)} · ${o.demoraMin} min`}</div>
                </div>
              ))}
            </div>
          )}

          {data.rechazos.length > 0 ? (
            <div role="group" aria-label="Envíos rechazados" style={box}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>RECHAZADOS</div>
              {data.rechazos.map((r, i) => (
                <div key={`${r.at}-${i}`} style={row}>
                  <div style={{ fontWeight: 600 }}>{`${clock12(r.at)} · ${r.vendedor} · ${REASONS[r.motivo] || r.motivo}`}</div>
                  {r.cliente && <div style={{ fontSize: 13 }}>{r.cliente}</div>}
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{r.detalle}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...box, color: "var(--text-muted)", fontSize: 13.5 }}>Ningún envío rechazado.</div>
          )}
        </>
      )}
    </section>
  );
}
