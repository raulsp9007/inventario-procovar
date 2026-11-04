import { useEffect, useState } from "react";
import { todayStr } from "./dateUtils";

// Contador de ventas por día: lo enviado a facturación, producto por producto y por vendedor, con
// un selector de día. Lo usan la administración y la supervisión; `load(fecha)` pide el resumen
// al buzón (debe ser una función estable).

const plural = (n, one, many) => (n === 1 ? one : many);
const counts = (pedidos, unidades) => `${pedidos} ${plural(pedidos, "pedido", "pedidos")} · ${unidades} ${plural(unidades, "unidad", "unidades")}`;

const box = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 };

function ProductRows({ productos }) {
  return productos.map((p) => (
    <div key={p.code} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderTop: "1px solid var(--border)", fontSize: 14 }}>
      <span>{p.name}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{p.qty}</span>
    </div>
  ));
}

export default function SalesSummary({ load }) {
  const [fecha, setFecha] = useState(() => todayStr());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    load(fecha)
      .then((result) => { if (alive) { setData(result); setError(""); } })
      .catch((e) => { if (alive) { setData(null); setError((e && e.message) || "No se pudo cargar el resumen."); } });
    return () => { alive = false; };
  }, [fecha, load]);

  const empty = data && data.totales.pedidos === 0;

  return (
    <section role="region" aria-label="Ventas por día" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }} htmlFor="ventas-dia">Día</label>
        <input
          id="ventas-dia"
          type="date"
          aria-label="Día"
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
          <div style={{ fontSize: 15, fontWeight: 700, margin: "0 2px 8px" }}>{counts(data.totales.pedidos, data.totales.unidades)}</div>
          {empty ? (
            <div style={{ ...box, color: "var(--text-muted)", fontSize: 13.5 }}>No hay ventas enviadas a facturación ese día.</div>
          ) : (
            <div role="group" aria-label="Total del día" style={box}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>TOTAL DEL DÍA</div>
              <ProductRows productos={data.productos} />
            </div>
          )}
          {data.vendedores.map((v) => (
            <div key={v.id} role="group" aria-label={`Ventas de ${v.name}`} style={box}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: v.pedidos ? 4 : 0 }}>
                <span style={{ fontWeight: 700 }}>{v.name}</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{v.pedidos ? counts(v.pedidos, v.unidades) : "Sin ventas"}</span>
              </div>
              <ProductRows productos={v.productos} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}
