import { useState, useEffect, useCallback } from "react";
import { Plus, RotateCcw, AlertTriangle, History, Settings2 } from "lucide-react";
import { getData, setData } from "./storage";
import { todayStr, formatDate, formatDateTime } from "./dateUtils";
import WeeklySummary from "./WeeklySummary";

const PRODUCTS = [
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", color: "#C77A2E" },
  { code: "P500",  name: "Parranda 500ml",  short: "P-500",  color: "#C77A2E" },
  { code: "P330",  name: "Parranda 330ml",  short: "P-330",  color: "#C77A2E" },
  { code: "M330",  name: "Malta Guajira 330ml",  short: "M-330",  color: "#274E37" },
  { code: "M1500", name: "Malta Guajira 1500ml", short: "M-1500", color: "#274E37" },
];

const LOW_STOCK_THRESHOLD = 20;
const STORAGE_KEY = "procovar-inventario-v1";

export default function InventoryApp() {
  const [stock, setStock] = useState(() =>
    PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: 0 }), {})
  );
  const [movements, setMovements] = useState([]);
  const [lastAdjustedAt, setLastAdjustedAt] = useState({});
  const [prices, setPrices] = useState(() =>
    PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: 0 }), {})
  );
  const [cumulativeRevenue, setCumulativeRevenue] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [showPrices, setShowPrices] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [saleInputs, setSaleInputs] = useState(() =>
    PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {})
  );
  const [editMode, setEditMode] = useState(false);
  const [editInputs, setEditInputs] = useState({});
  const [error, setError] = useState("");
  const [view, setView] = useState("stock"); // "stock" | "resumen"
  const currentPersistedState = {
    stock, movements, lastAdjustedAt,
    prices, cumulativeRevenue, exchangeRate, commissionPercent, showPrices,
  };

  useEffect(() => {
    (async () => {
      try {
        const result = await getData(STORAGE_KEY);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          setStock(parsed.stock || {});
          setMovements(parsed.movements || []);
          setLastAdjustedAt(parsed.lastAdjustedAt || {});
          setPrices(parsed.prices || {});
          setCumulativeRevenue(parsed.cumulativeRevenue || 0);
          setExchangeRate(parsed.exchangeRate ?? null);
          setCommissionPercent(parsed.commissionPercent || 0);
          setShowPrices(parsed.showPrices ?? true);
        }
      } catch (e) {
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (nextState) => {
    setSaveState("saving");
    try {
      await setData(STORAGE_KEY, JSON.stringify(nextState));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      setSaveState("idle");
      setError("No se pudo guardar. Intenta de nuevo.");
      setTimeout(() => setError(""), 3000);
    }
  }, []);

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F4EC", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ color: "#9A9484", fontSize: 14, letterSpacing: "0.05em" }}>CARGANDO INVENTARIO…</div>
      </div>
    );
  }

  const totalStock = PRODUCTS.reduce((sum, p) => sum + (stock[p.code] || 0), 0);
  const lowStockCount = PRODUCTS.filter((p) => (stock[p.code] || 0) <= LOW_STOCK_THRESHOLD).length;
  const todaysMovements = movements.filter((m) => m.date === todayStr());
  const todaysUnitsSold = todaysMovements
    .filter((m) => m.type === "venta")
    .reduce((sum, m) => sum + m.qty, 0);

  function makeMovement(code, type, qty, extra = {}) {
    return {
      id: `${Date.now()}-${type}-${code}-${Math.random().toString(36).slice(2, 7)}`,
      code,
      type,
      qty,
      date: todayStr(),
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }

  function registerSale(code) {
    const raw = saleInputs[code];
    const qty = parseInt(raw, 10);
    if (!raw || isNaN(qty) || qty <= 0) {
      setError("Ingresa una cantidad válida.");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const current = stock[code] || 0;
    if (qty > current) {
      setError("No hay suficiente stock para esa venta.");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const unitPrice = prices[code] || 0;
    const nextStock = { ...stock, [code]: current - qty };
    const movement = makeMovement(code, "venta", qty, { unitPrice });
    const nextMovements = [movement, ...movements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue + qty * unitPrice;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setSaleInputs((s) => ({ ...s, [code]: "" }));
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
    });
  }

  function undoLast(code) {
    const idx = movements.findIndex((m) => m.code === code);
    if (idx === -1) return;
    const m = movements[idx];
    const current = stock[code] || 0;
    const restored = m.type === "venta" ? current + m.qty : Math.max(0, current - m.qty);
    const nextStock = { ...stock, [code]: restored };
    const nextMovements = movements.filter((_, i) => i !== idx);
    const nextCumulativeRevenue =
      m.type === "venta" ? cumulativeRevenue - m.qty * (m.unitPrice || 0) : cumulativeRevenue;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
    });
  }

  function openEdit() {
    const inputs = {};
    PRODUCTS.forEach((p) => (inputs[p.code] = String(stock[p.code] || 0)));
    setEditInputs(inputs);
    setEditMode(true);
  }

  function saveEdit() {
    const nextStock = { ...stock };
    const adjustments = [];
    const nextLastAdjustedAt = { ...lastAdjustedAt };
    const now = new Date().toISOString();
    PRODUCTS.forEach((p) => {
      const val = parseInt(editInputs[p.code], 10);
      const newVal = isNaN(val) || val < 0 ? 0 : val;
      const diff = newVal - (stock[p.code] || 0);
      if (diff !== 0) {
        adjustments.push(makeMovement(p.code, "ajuste", diff));
        nextLastAdjustedAt[p.code] = now;
      }
      nextStock[p.code] = newVal;
    });
    const nextMovements = [...adjustments, ...movements].slice(0, 500);
    setStock(nextStock);
    setMovements(nextMovements);
    setLastAdjustedAt(nextLastAdjustedAt);
    setEditMode(false);
    persist({ ...currentPersistedState, stock: nextStock, movements: nextMovements, lastAdjustedAt: nextLastAdjustedAt });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EC", fontFamily: "'Inter', system-ui, sans-serif", color: "#26241F", paddingBottom: 48 }}>
      <style>{`
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .rowfade { animation: fadeIn 0.25s ease; }
      `}</style>

      <div style={{ background: "#22261F", color: "#F7F4EC", padding: "24px 16px 20px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "#B7C9A8", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · CONTROL DE STOCK</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>Inventario diario</h1>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#9AA890", letterSpacing: "0.06em" }}>UNIDADES TOTALES</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totalStock}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#9AA890", letterSpacing: "0.06em" }}>VENDIDO HOY</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#E3B463" }}>{todaysUnitsSold}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 16px 0", display: "flex", gap: 8 }}>
        <button
          onClick={() => setView("stock")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "stock" ? "#22261F" : "transparent",
            color: view === "stock" ? "#F7F4EC" : "#22261F",
          }}
        >
          Stock
        </button>
        <button
          onClick={() => setView("resumen")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "resumen" ? "#22261F" : "transparent",
            color: view === "resumen" ? "#F7F4EC" : "#22261F",
          }}
        >
          Resumen semanal
        </button>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px 0" }}>
        {lowStockCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FBEFE0", border: "1px solid #E9CFA0", color: "#8A5A1E", padding: "10px 14px", borderRadius: 8, fontSize: 13.5, marginBottom: 16 }}>
            <AlertTriangle size={16} strokeWidth={2} />
            {lowStockCount === 1
              ? "1 producto con stock bajo (≤ 20 unidades)."
              : `${lowStockCount} productos con stock bajo (≤ 20 unidades).`}
          </div>
        )}

        {error && (
          <div style={{ background: "#FBE4E0", border: "1px solid #E9A79C", color: "#8A2E1E", padding: "9px 14px", borderRadius: 8, fontSize: 13.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {view === "stock" && (
        <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PRODUCTOS</div>
          <button
            onClick={editMode ? saveEdit : openEdit}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: editMode ? "#22261F" : "transparent",
              color: editMode ? "#F7F4EC" : "#22261F",
              border: "1px solid #22261F",
              borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Settings2 size={14} />
            {editMode ? "Guardar existencias" : "Ajustar existencias"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {PRODUCTS.map((p) => {
            const qty = stock[p.code] || 0;
            const isLow = qty <= LOW_STOCK_THRESHOLD;
            const lastMovement = movements.find((m) => m.code === p.code);
            return (
              <div
                key={p.code}
                className="rowfade"
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${isLow ? "#E9CFA0" : "#E7E2D3"}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{
                      width: 6, height: 40, borderRadius: 3, background: p.color, flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "#9A9484" }}>{p.short}{lastMovement ? ` · último movimiento ${formatDate(lastMovement.date)}` : ""}</div>
                      {lastAdjustedAt[p.code] && (
                        <div style={{ fontSize: 11, color: "#B4AF9E" }}>ajustado {formatDateTime(lastAdjustedAt[p.code])}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    {editMode ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editInputs[p.code]}
                        onChange={(e) => setEditInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        style={{
                          width: 90, textAlign: "right", fontSize: 20, fontWeight: 700,
                          border: "1px solid #D8D2C0", borderRadius: 7, padding: "6px 10px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isLow ? "#B4661E" : "#22261F" }}>
                        {qty} <span style={{ fontSize: 12, fontWeight: 500, color: "#9A9484" }}>uds</span>
                      </div>
                    )}
                  </div>
                </div>

                {!editMode && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Cant. vendida"
                      value={saleInputs[p.code]}
                      onChange={(e) => setSaleInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") registerSale(p.code); }}
                      style={{
                        flex: "1 1 auto", minWidth: 110, border: "1px solid #E7E2D3", borderRadius: 7,
                        padding: "9px 12px", fontSize: 16, fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={() => registerSale(p.code)}
                      title="Registrar venta"
                      aria-label="Registrar venta"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flex: "0 0 auto", width: 40, height: 40,
                        background: "#22261F", color: "#F7F4EC", border: "none",
                        borderRadius: 7, padding: "10px", cursor: "pointer",
                      }}
                    >
                      <Plus size={18} strokeWidth={2.5} />
                    </button>
                    {lastMovement && (
                      <button
                        onClick={() => undoLast(p.code)}
                        title="Deshacer último movimiento"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "transparent", border: "1px solid #E7E2D3", color: "#8A8574",
                          borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                        }}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
            <History size={14} /> HISTORIAL DE MOVIMIENTOS
          </div>
          {movements.length === 0 ? (
            <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
              Aún no hay movimientos registrados.
            </div>
          ) : (
            <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
              {movements.slice(0, 25).map((m, i) => {
                const product = PRODUCTS.find((p) => p.code === m.code);
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                      gap: 6, padding: "10px 16px", fontSize: 13.5,
                      borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: product?.color || "#9A9484" }} />
                      <span style={{ fontWeight: 600 }}>{product?.short || m.code}</span>
                      <span style={{ color: "#9A9484" }}>{m.type === "venta" ? "venta" : "ajuste manual"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <span style={{ color: "#9A9484", fontSize: 12 }}>{formatDate(m.date)}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: m.type === "venta" ? "#B4661E" : (m.qty >= 0 ? "#3C6E4A" : "#B4661E") }}>
                        {m.type === "venta" ? `-${m.qty}` : (m.qty >= 0 ? `+${m.qty}` : m.qty)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}

        {view === "resumen" && <WeeklySummary products={PRODUCTS} movements={movements} />}

        <div style={{ marginTop: 20, fontSize: 11.5, color: "#B4AF9E", textAlign: "center" }}>
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : "Los datos se guardan automáticamente en este dispositivo"}
        </div>
      </div>
    </div>
  );
}
