import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, History, Settings2, Eye, EyeOff, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { getData, setData } from "./storage";
import { todayStr, formatDate, formatDateTime } from "./dateUtils";
import { formatCUP, totalHlSold } from "./money";
import WeeklySummary from "./WeeklySummary";
import Orders from "./Orders.jsx";
import Customers from "./Customers.jsx";
import Today from "./Today.jsx";
import { generateProductCode, nextProductColor } from "./productHelpers";

const DEFAULT_PRODUCTS = [
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", color: "#C77A2E" },
  { code: "P500",  name: "Parranda 500ml",  short: "P-500",  color: "#C77A2E" },
  { code: "P330",  name: "Parranda 330ml",  short: "P-330",  color: "#C77A2E" },
  { code: "M330",  name: "Malta Guajira 330ml",  short: "M-330",  color: "#274E37" },
  { code: "M1500", name: "Malta Guajira 1500ml", short: "M-1500", color: "#274E37" },
];

const LOW_STOCK_THRESHOLD = 20;
const STORAGE_KEY = "procovar-inventario-v1";

function lowStockThresholdFor(product) {
  return product.lowStockThreshold != null ? product.lowStockThreshold : LOW_STOCK_THRESHOLD;
}

export default function InventoryApp() {
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [stock, setStock] = useState(() =>
    DEFAULT_PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: 0 }), {})
  );
  const [movements, setMovements] = useState([]);
  const [lastAdjustedAt, setLastAdjustedAt] = useState({});
  const [prices, setPrices] = useState(() =>
    DEFAULT_PRODUCTS.reduce((acc, p) => ({ ...acc, [p.code]: 0 }), {})
  );
  const [cumulativeRevenue, setCumulativeRevenue] = useState(0);
  const [cumulativeHl, setCumulativeHl] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [showPrices, setShowPrices] = useState(true);
  const [hlGoal, setHlGoal] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [editMode, setEditMode] = useState(false);
  const [editInputs, setEditInputs] = useState({});
  const [editPriceInputs, setEditPriceInputs] = useState({});
  const [editNameInputs, setEditNameInputs] = useState({});
  const [editHlInputs, setEditHlInputs] = useState({});
  const [editLowStockInputs, setEditLowStockInputs] = useState({});
  const [newProductName, setNewProductName] = useState("");
  const [newProductHl, setNewProductHl] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showLowStockList, setShowLowStockList] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("stock"); // "stock" | "resumen" | "pedidos" | "clientes" | "hoy"
  const currentPersistedState = {
    stock, movements, lastAdjustedAt, products,
    prices, cumulativeRevenue, cumulativeHl, exchangeRate, commissionPercent, showPrices, hlGoal,
  };

  useEffect(() => {
    (async () => {
      try {
        const result = await getData(STORAGE_KEY);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          // Campo nuevo agregado alguna vez: siempre con `|| default` / `?? default` acá.
          // Así datos guardados en una versión anterior nunca rompen ni se borran.
          const loadedMovements = parsed.movements || [];
          const loadedProducts = parsed.products || DEFAULT_PRODUCTS;
          setStock(parsed.stock || {});
          setMovements(loadedMovements);
          setLastAdjustedAt(parsed.lastAdjustedAt || {});
          setProducts(loadedProducts);
          setPrices(parsed.prices || {});
          setCumulativeRevenue(parsed.cumulativeRevenue || 0);
          setExchangeRate(parsed.exchangeRate ?? null);
          setCommissionPercent(parsed.commissionPercent || 0);
          setShowPrices(parsed.showPrices ?? true);
          setHlGoal(parsed.hlGoal ?? null);

          if (parsed.cumulativeHl != null) {
            setCumulativeHl(parsed.cumulativeHl);
          } else {
            // Migración: usuario de antes de este campo — se siembra una sola vez
            // desde el HL ya vendido (derivado del historial actual), para no perder
            // lo que ya se contó. De acá en adelante cumulativeHl es la fuente de verdad.
            const backfilledHl = totalHlSold(loadedMovements, loadedProducts);
            setCumulativeHl(backfilledHl);
            setData(STORAGE_KEY, JSON.stringify({ ...parsed, cumulativeHl: backfilledHl }));
          }
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

  const activeProducts = products.filter((p) => !p.archived);
  const archivedProducts = products.filter((p) => p.archived);
  const totalStock = activeProducts.reduce((sum, p) => sum + (stock[p.code] || 0), 0);
  const lowStockCount = activeProducts.filter((p) => (stock[p.code] || 0) <= lowStockThresholdFor(p)).length;
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

  function openEdit() {
    const inputs = {};
    const priceInputs = {};
    const nameInputs = {};
    const hlInputs = {};
    const lowStockInputs = {};
    activeProducts.forEach((p) => {
      inputs[p.code] = String(stock[p.code] || 0);
      priceInputs[p.code] = String(prices[p.code] || 0);
      nameInputs[p.code] = p.name;
      hlInputs[p.code] = p.hl != null ? String(p.hl) : "";
      lowStockInputs[p.code] = p.lowStockThreshold != null ? String(p.lowStockThreshold) : "";
    });
    setEditInputs(inputs);
    setEditPriceInputs(priceInputs);
    setEditNameInputs(nameInputs);
    setEditHlInputs(hlInputs);
    setEditLowStockInputs(lowStockInputs);
    setEditMode(true);
  }

  function addProduct() {
    const trimmed = newProductName.trim();
    if (!trimmed) {
      setError("Ingresa el nombre del producto.");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const code = generateProductCode(trimmed, products.map((p) => p.code));
    const color = nextProductColor(products.length);
    const hlVal = parseFloat(newProductHl);
    const newProduct = {
      code, name: trimmed, short: trimmed, color,
      ...(Number.isFinite(hlVal) && hlVal >= 0 ? { hl: hlVal } : {}),
    };
    const nextProducts = [...products, newProduct];
    setProducts(nextProducts);
    setNewProductName("");
    setNewProductHl("");
    if (editMode) {
      setEditInputs((s) => ({ ...s, [code]: "0" }));
      setEditPriceInputs((s) => ({ ...s, [code]: "0" }));
      setEditNameInputs((s) => ({ ...s, [code]: trimmed }));
      setEditHlInputs((s) => ({ ...s, [code]: newProductHl }));
      setEditLowStockInputs((s) => ({ ...s, [code]: "" }));
    }
    persist({ ...currentPersistedState, products: nextProducts });
  }

  function saveEdit() {
    const nextStock = { ...stock };
    const nextPrices = { ...prices };
    const adjustments = [];
    const nextLastAdjustedAt = { ...lastAdjustedAt };
    const now = new Date().toISOString();
    activeProducts.forEach((p) => {
      const val = parseInt(editInputs[p.code], 10);
      const newVal = isNaN(val) || val < 0 ? 0 : val;
      const diff = newVal - (stock[p.code] || 0);
      if (diff !== 0) {
        adjustments.push(makeMovement(p.code, "ajuste", diff));
        nextLastAdjustedAt[p.code] = now;
      }
      nextStock[p.code] = newVal;

      // Precio no genera movimiento ni timestamp de ajuste (no hay "historial de precio",
      // solo el unitPrice congelado en cada venta) — se sobreescribe siempre, sin diff-check.
      const priceVal = parseFloat(editPriceInputs[p.code]);
      nextPrices[p.code] = !Number.isFinite(priceVal) || priceVal < 0 ? 0 : priceVal;
    });
    const nextProducts = products.map((p) => {
      if (p.archived) return p;
      const trimmedName = (editNameInputs[p.code] || "").trim();
      const hlVal = parseFloat(editHlInputs[p.code]);
      const lowStockVal = parseInt(editLowStockInputs[p.code], 10);
      const nextP = trimmedName ? { ...p, name: trimmedName } : { ...p };
      if (Number.isFinite(hlVal) && hlVal >= 0) nextP.hl = hlVal;
      else delete nextP.hl;
      if (Number.isFinite(lowStockVal) && lowStockVal >= 0) nextP.lowStockThreshold = lowStockVal;
      else delete nextP.lowStockThreshold;
      return nextP;
    });
    const nextMovements = [...adjustments, ...movements].slice(0, 500);
    setStock(nextStock);
    setPrices(nextPrices);
    setMovements(nextMovements);
    setLastAdjustedAt(nextLastAdjustedAt);
    setProducts(nextProducts);
    setEditMode(false);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      lastAdjustedAt: nextLastAdjustedAt,
      prices: nextPrices,
      products: nextProducts,
    });
  }

  function archiveProduct(code) {
    const nextProducts = products.map((p) => (p.code === code ? { ...p, archived: true } : p));
    setProducts(nextProducts);
    persist({ ...currentPersistedState, products: nextProducts });
  }

  function restoreProduct(code) {
    const nextProducts = products.map((p) => (p.code === code ? { ...p, archived: false } : p));
    setProducts(nextProducts);
    persist({ ...currentPersistedState, products: nextProducts });
  }

  function confirmOrder({ customerName, isDelivery, lines }) {
    const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextStock = { ...stock };
    const newMovements = [];
    let addedRevenue = 0;
    let addedHl = 0;
    lines.forEach(({ code, qty }) => {
      const unitPrice = prices[code] || 0;
      const product = products.find((p) => p.code === code);
      const unitHl = product?.hl || 0;
      nextStock[code] = (nextStock[code] || 0) - qty;
      newMovements.push(makeMovement(code, "venta", qty, { unitPrice, unitHl, exchangeRate, orderId, customerName, isDelivery }));
      addedRevenue += qty * unitPrice;
      addedHl += qty * unitHl;
    });
    const nextMovements = [...newMovements, ...movements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue + addedRevenue;
    const nextCumulativeHl = cumulativeHl + addedHl;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
      cumulativeHl: nextCumulativeHl,
    });
  }

  function deleteOrder(orderId) {
    const orderMovements = movements.filter((m) => m.orderId === orderId);
    if (orderMovements.length === 0) return;
    const nextStock = { ...stock };
    let removedRevenue = 0;
    let removedHl = 0;
    orderMovements.forEach((m) => {
      nextStock[m.code] = (nextStock[m.code] || 0) + m.qty;
      removedRevenue += m.qty * (m.unitPrice || 0);
      removedHl += m.qty * (m.unitHl || 0);
    });
    const nextMovements = movements.filter((m) => m.orderId !== orderId);
    const nextCumulativeRevenue = cumulativeRevenue - removedRevenue;
    const nextCumulativeHl = cumulativeHl - removedHl;
    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
      cumulativeHl: nextCumulativeHl,
    });
  }

  function editOrder(orderId, { customerName, isDelivery, lines }) {
    const originalMovements = movements.filter((m) => m.orderId === orderId);
    if (originalMovements.length === 0) return;
    const originalDate = originalMovements[0].date;

    const restoredStock = { ...stock };
    let removedRevenue = 0;
    let removedHl = 0;
    originalMovements.forEach((m) => {
      restoredStock[m.code] = (restoredStock[m.code] || 0) + m.qty;
      removedRevenue += m.qty * (m.unitPrice || 0);
      removedHl += m.qty * (m.unitHl || 0);
    });

    const nextStock = { ...restoredStock };
    const newMovements = [];
    let addedRevenue = 0;
    let addedHl = 0;
    lines.forEach(({ code, qty }) => {
      const unitPrice = prices[code] || 0;
      const product = products.find((p) => p.code === code);
      const unitHl = product?.hl || 0;
      nextStock[code] = (nextStock[code] || 0) - qty;
      newMovements.push(makeMovement(code, "venta", qty, { unitPrice, unitHl, exchangeRate, orderId, customerName, isDelivery, sent: false, date: originalDate }));
      addedRevenue += qty * unitPrice;
      addedHl += qty * unitHl;
    });

    const otherMovements = movements.filter((m) => m.orderId !== orderId);
    const nextMovements = [...newMovements, ...otherMovements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue - removedRevenue + addedRevenue;
    const nextCumulativeHl = cumulativeHl - removedHl + addedHl;

    setStock(nextStock);
    setMovements(nextMovements);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    persist({
      ...currentPersistedState,
      stock: nextStock,
      movements: nextMovements,
      cumulativeRevenue: nextCumulativeRevenue,
      cumulativeHl: nextCumulativeHl,
    });
  }

  function markOrderSent(orderId, sent) {
    const nextMovements = movements.map((m) =>
      m.orderId === orderId ? { ...m, sent } : m
    );
    setMovements(nextMovements);
    persist({ ...currentPersistedState, movements: nextMovements });
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

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 16px 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          onClick={() => setView("hoy")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "hoy" ? "#22261F" : "transparent",
            color: view === "hoy" ? "#F7F4EC" : "#22261F",
          }}
        >
          Hoy
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
        <button
          onClick={() => setView("pedidos")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "pedidos" ? "#22261F" : "transparent",
            color: view === "pedidos" ? "#F7F4EC" : "#22261F",
          }}
        >
          Pedidos
        </button>
        <button
          onClick={() => setView("clientes")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "clientes" ? "#22261F" : "transparent",
            color: view === "clientes" ? "#F7F4EC" : "#22261F",
          }}
        >
          Clientes
        </button>
        <button
          onClick={() => setView("stock")}
          style={{
            flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: view === "stock" ? "#22261F" : "transparent",
            color: view === "stock" ? "#F7F4EC" : "#22261F",
          }}
        >
          Productos
        </button>
        <button
          onClick={() => {
            const next = !showPrices;
            setShowPrices(next);
            persist({ ...currentPersistedState, showPrices: next });
          }}
          title={showPrices ? "Ocultar precios" : "Mostrar precios"}
          aria-label={showPrices ? "Ocultar precios" : "Mostrar precios"}
          style={{
            flex: "0 0 auto", width: 40, padding: "9px", cursor: "pointer",
            borderRadius: 7, border: "1px solid #22261F",
            background: "transparent", color: "#22261F",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {showPrices ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px 0" }}>
        {lowStockCount > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowLowStockList((s) => !s)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                background: "#FBEFE0", border: "1px solid #E9CFA0", color: "#8A5A1E",
                padding: "10px 14px", borderRadius: 8, fontSize: 13.5, cursor: "pointer",
              }}
            >
              <AlertTriangle size={16} strokeWidth={2} />
              {lowStockCount === 1
                ? "1 producto con stock bajo."
                : `${lowStockCount} productos con stock bajo.`}
              {showLowStockList ? <ChevronUp size={14} style={{ marginLeft: "auto" }} /> : <ChevronDown size={14} style={{ marginLeft: "auto" }} />}
            </button>
            {showLowStockList && (
              <div style={{ background: "#FFFFFF", border: "1px solid #E9CFA0", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                {activeProducts
                  .filter((p) => (stock[p.code] || 0) <= lowStockThresholdFor(p))
                  .map((p, i) => (
                    <div
                      key={p.code}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "9px 14px", fontSize: 13, borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: "#8A5A1E", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {stock[p.code] || 0} uds (aviso ≤ {lowStockThresholdFor(p)})
                      </span>
                    </div>
                  ))}
              </div>
            )}
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
          {activeProducts.map((p) => {
            const qty = stock[p.code] || 0;
            const isLow = qty <= lowStockThresholdFor(p);
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
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{
                      width: 6, height: 40, borderRadius: 3, background: p.color, flexShrink: 0,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      {editMode ? (
                        <input
                          type="text"
                          value={editNameInputs[p.code] ?? p.name}
                          onChange={(e) => setEditNameInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                          style={{
                            fontWeight: 700, fontSize: 15.5, border: "1px solid #D8D2C0", borderRadius: 7,
                            padding: "4px 8px", marginBottom: 2, width: "100%", boxSizing: "border-box",
                          }}
                        />
                      ) : (
                        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.name}</div>
                      )}
                      <div style={{ fontSize: 12, color: "#9A9484" }}>{p.short}{lastMovement ? ` · último movimiento ${formatDate(lastMovement.date)}` : ""}</div>
                      {lastAdjustedAt[p.code] && (
                        <div style={{ fontSize: 11, color: "#B4AF9E" }}>ajustado {formatDateTime(lastAdjustedAt[p.code])}</div>
                      )}
                      {!editMode && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", fontSize: 11, color: "#8A8574", marginTop: 3 }}>
                          {showPrices && (
                            <span>Precio: {prices[p.code] ? formatCUP(prices[p.code]) : "no definido"}</span>
                          )}
                          <span>HL/unidad: {p.hl != null ? p.hl : "no definido"}</span>
                          <span>Aviso stock bajo: ≤ {lowStockThresholdFor(p)} uds</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {!editMode && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isLow ? "#B4661E" : "#22261F" }}>
                        {qty} <span style={{ fontSize: 12, fontWeight: 500, color: "#9A9484" }}>uds</span>
                      </div>
                    </div>
                  )}
                </div>

                {editMode && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px", marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#9A9484", letterSpacing: "0.04em", marginBottom: 3 }}>STOCK ACTUAL</div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editInputs[p.code]}
                        onChange={(e) => setEditInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        style={{
                          width: "100%", boxSizing: "border-box", fontSize: 18, fontWeight: 700,
                          border: "1px solid #D8D2C0", borderRadius: 7, padding: "7px 10px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9A9484", letterSpacing: "0.04em", marginBottom: 3 }}>PRECIO CUP</div>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editPriceInputs[p.code]}
                        onChange={(e) => setEditPriceInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        title="Precio en CUP"
                        style={{
                          width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                          border: "1px solid #D8D2C0", borderRadius: 7, padding: "8px 10px",
                          fontVariantNumeric: "tabular-nums", color: "#26241F",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9A9484", letterSpacing: "0.04em", marginBottom: 3 }}>HL POR UNIDAD</div>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editHlInputs[p.code] ?? ""}
                        onChange={(e) => setEditHlInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        title="Hectolitros por unidad"
                        style={{
                          width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                          border: "1px solid #D8D2C0", borderRadius: 7, padding: "8px 10px",
                          fontVariantNumeric: "tabular-nums", color: "#26241F",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9A9484", letterSpacing: "0.04em", marginBottom: 3 }}>AVISO STOCK BAJO</div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editLowStockInputs[p.code] ?? ""}
                        onChange={(e) => setEditLowStockInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        title="Cantidad de stock a partir de la cual avisar"
                        placeholder={String(LOW_STOCK_THRESHOLD)}
                        style={{
                          width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                          border: "1px solid #D8D2C0", borderRadius: 7, padding: "8px 10px",
                          fontVariantNumeric: "tabular-nums", color: "#26241F",
                        }}
                      />
                    </div>
                  </div>
                )}

                {editMode && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <button
                      onClick={() => archiveProduct(p.code)}
                      title="Eliminar producto"
                      aria-label="Eliminar producto"
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "transparent", border: "1px solid #E7E2D3", color: "#8A5A1E",
                        borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                      }}
                    >
                      <Trash2 size={13} /> Eliminar producto
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {editMode && (
            <div
              style={{
                background: "#FFFFFF", border: "1px dashed #D8D2C0", borderRadius: 12,
                padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="Nombre del producto nuevo"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addProduct(); }}
                style={{
                  flex: "1 1 auto", minWidth: 160, border: "1px solid #E7E2D3", borderRadius: 7,
                  padding: "9px 12px", fontSize: 14,
                }}
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder="HL/unidad"
                value={newProductHl}
                onChange={(e) => setNewProductHl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addProduct(); }}
                style={{
                  flex: "0 1 110px", minWidth: 90, border: "1px solid #E7E2D3", borderRadius: 7,
                  padding: "9px 12px", fontSize: 14,
                }}
              />
              <button
                onClick={addProduct}
                style={{
                  flex: "0 0 auto", background: "#22261F", color: "#F7F4EC", border: "none",
                  borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                + Agregar producto
              </button>
            </div>
          )}
        </div>

        {editMode && archivedProducts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setShowArchived((s) => !s)}
              style={{
                display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
                color: "#8A8574", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
                padding: 0, marginBottom: showArchived ? 10 : 0,
              }}
            >
              {showArchived ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              PRODUCTOS ELIMINADOS ({archivedProducts.length})
            </button>

            {showArchived && (
              <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
                {archivedProducts.map((p, i) => (
                  <div
                    key={p.code}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: 8, padding: "10px 16px", fontSize: 13.5,
                      borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                    }}
                  >
                    <span>{p.name}</span>
                    <button
                      onClick={() => restoreProduct(p.code)}
                      style={{
                        background: "transparent", border: "1px solid #E7E2D3", color: "#3C6E4A",
                        borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                      }}
                    >
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                const product = products.find((p) => p.code === m.code);
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

        {view === "resumen" && (
          <WeeklySummary
            products={products}
            movements={movements}
            cumulativeRevenue={cumulativeRevenue}
            cumulativeHl={cumulativeHl}
            exchangeRate={exchangeRate}
            commissionPercent={commissionPercent}
            showPrices={showPrices}
            onExchangeRateChange={(next) => {
              setExchangeRate(next);
              persist({ ...currentPersistedState, exchangeRate: next });
            }}
            onCommissionPercentChange={(next) => {
              setCommissionPercent(next);
              persist({ ...currentPersistedState, commissionPercent: next });
            }}
            hlGoal={hlGoal}
            onHlGoalChange={(next) => {
              setHlGoal(next);
              persist({ ...currentPersistedState, hlGoal: next });
            }}
          />
        )}

        {view === "pedidos" && (
          <Orders
            products={products}
            movements={movements}
            stock={stock}
            onConfirmOrder={confirmOrder}
            onEditOrder={editOrder}
            onDeleteOrder={deleteOrder}
            onMarkSent={markOrderSent}
            onError={(message) => {
              setError(message);
              setTimeout(() => setError(""), 2500);
            }}
          />
        )}

        {view === "clientes" && (
          <Customers products={products} movements={movements} />
        )}

        {view === "hoy" && (
          <Today
            products={products}
            movements={movements}
            stock={stock}
            showPrices={showPrices}
            exchangeRate={exchangeRate}
          />
        )}

        <div style={{ marginTop: 20, fontSize: 11.5, color: "#B4AF9E", textAlign: "center" }}>
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : "Los datos se guardan automáticamente en este dispositivo"}
        </div>
      </div>
    </div>
  );
}
