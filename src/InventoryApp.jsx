import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Eye, EyeOff, ChevronDown, ChevronUp, Download, Upload } from "lucide-react";
import { getData, setData } from "./storage";
import { todayStr } from "./dateUtils";
import { totalHlSold } from "./money";
import { downloadBackup, parseBackupFile } from "./backup";
import TabButton from "./TabButton.jsx";
import ProductsView from "./ProductsView.jsx";
import WeeklySummary from "./WeeklySummary";
import Orders from "./Orders.jsx";
import Customers from "./Customers.jsx";
import Today from "./Today.jsx";
import Settings from "./Settings.jsx";
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
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [sendSenderName, setSendSenderName] = useState(false);
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
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);
  const [view, setView] = useState("stock"); // "stock" | "resumen" | "pedidos" | "clientes" | "hoy"
  const currentPersistedState = {
    stock, movements, lastAdjustedAt, products,
    prices, cumulativeRevenue, cumulativeHl, exchangeRate, commissionPercent, showPrices, hlGoal, whatsappPhone,
    senderName, sendSenderName,
  };

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

  // Campo nuevo agregado alguna vez: siempre con `|| default` / `?? default` acá.
  // Así datos guardados en una versión anterior (o un backup importado viejo) nunca rompen ni se borran.
  // Se usa tanto para la carga inicial como para aplicar un backup importado.
  function applyPersistedData(parsed, { alwaysPersist = false } = {}) {
    const loadedMovements = parsed.movements || [];
    const loadedProducts = parsed.products || DEFAULT_PRODUCTS;
    const nextStock = parsed.stock || {};
    const nextLastAdjustedAt = parsed.lastAdjustedAt || {};
    const nextPrices = parsed.prices || {};
    const nextCumulativeRevenue = parsed.cumulativeRevenue || 0;
    const nextExchangeRate = parsed.exchangeRate ?? null;
    const nextCommissionPercent = parsed.commissionPercent || 0;
    const nextShowPrices = parsed.showPrices ?? true;
    const nextHlGoal = parsed.hlGoal ?? null;
    const nextWhatsappPhone = parsed.whatsappPhone || "";
    const nextSenderName = parsed.senderName || "";
    const nextSendSenderName = parsed.sendSenderName ?? false;
    const migratedHl = parsed.cumulativeHl == null;
    // Migración: dato guardado (o backup) de antes de este campo — se siembra una sola vez
    // desde el HL ya vendido (derivado del historial), para no perder lo que ya se contó.
    const nextCumulativeHl = migratedHl ? totalHlSold(loadedMovements, loadedProducts) : parsed.cumulativeHl;

    setStock(nextStock);
    setMovements(loadedMovements);
    setLastAdjustedAt(nextLastAdjustedAt);
    setProducts(loadedProducts);
    setPrices(nextPrices);
    setCumulativeRevenue(nextCumulativeRevenue);
    setCumulativeHl(nextCumulativeHl);
    setExchangeRate(nextExchangeRate);
    setCommissionPercent(nextCommissionPercent);
    setShowPrices(nextShowPrices);
    setHlGoal(nextHlGoal);
    setWhatsappPhone(nextWhatsappPhone);
    setSenderName(nextSenderName);
    setSendSenderName(nextSendSenderName);

    if (alwaysPersist || migratedHl) {
      persist({
        stock: nextStock, movements: loadedMovements, lastAdjustedAt: nextLastAdjustedAt, products: loadedProducts,
        prices: nextPrices, cumulativeRevenue: nextCumulativeRevenue, cumulativeHl: nextCumulativeHl,
        exchangeRate: nextExchangeRate, commissionPercent: nextCommissionPercent, showPrices: nextShowPrices, hlGoal: nextHlGoal,
        whatsappPhone: nextWhatsappPhone, senderName: nextSenderName, sendSenderName: nextSendSenderName,
      });
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const result = await getData(STORAGE_KEY);
        if (result && result.value) {
          applyPersistedData(JSON.parse(result.value));
        }
      } catch (e) {
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function handleImportFileChange(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseBackupFile(reader.result);
        setPendingImport(parsed);
      } catch (err) {
        setError("Archivo inválido, no se pudo leer como backup.");
        setTimeout(() => setError(""), 3000);
      }
    };
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!pendingImport) return;
    applyPersistedData(pendingImport, { alwaysPersist: true });
    setPendingImport(null);
  }

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
  const lowStockCount = activeProducts.filter((p) => (stock[p.code] || 0) > 0 && (stock[p.code] || 0) <= lowStockThresholdFor(p)).length;
  const todaysMovements = movements.filter((m) => m.date === todayStr());
  const todaysUnitsSold = todaysMovements
    .filter((m) => m.type === "venta")
    .reduce((sum, m) => sum + m.qty, 0);
  const todaysPendingSales = todaysMovements.filter((m) => m.type === "venta" && !m.sent);
  function pendingTodayFor(code) {
    return todaysPendingSales.filter((m) => m.code === code).reduce((sum, m) => sum + m.qty, 0);
  }

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
    markOrdersSent([orderId], sent);
  }

  // Llamar una sola vez por varios pedidos a la vez (envío en bloque): cada
  // llamada a setMovements/persist usa el `movements` de este render, así que
  // encadenar markOrderSent una vez por pedido pisaba las marcas anteriores.
  function markOrdersSent(orderIds, sent) {
    const idSet = new Set(orderIds);
    const nextMovements = movements.map((m) =>
      idSet.has(m.orderId) ? { ...m, sent } : m
    );
    setMovements(nextMovements);
    persist({ ...currentPersistedState, movements: nextMovements });
  }

  function markOrderConfirmed(orderId, confirmed) {
    const nextMovements = movements.map((m) =>
      m.orderId === orderId ? { ...m, confirmed } : m
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
        <TabButton active={view === "hoy"} onClick={() => setView("hoy")}>Hoy</TabButton>
        <TabButton active={view === "resumen"} onClick={() => setView("resumen")}>Resumen semanal</TabButton>
        <TabButton active={view === "pedidos"} onClick={() => setView("pedidos")}>Pedidos</TabButton>
        <TabButton active={view === "clientes"} onClick={() => setView("clientes")}>Clientes</TabButton>
        <TabButton active={view === "stock"} onClick={() => setView("stock")}>Productos</TabButton>
        <TabButton active={view === "config"} onClick={() => setView("config")}>Configuración</TabButton>
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
                  .filter((p) => (stock[p.code] || 0) > 0 && (stock[p.code] || 0) <= lowStockThresholdFor(p))
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
                        {pendingTodayFor(p.code) > 0 && ` · Pendiente: ${pendingTodayFor(p.code)}`}
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
          <ProductsView
            products={products}
            activeProducts={activeProducts}
            archivedProducts={archivedProducts}
            stock={stock}
            prices={prices}
            movements={movements}
            lastAdjustedAt={lastAdjustedAt}
            showPrices={showPrices}
            lowStockThresholdFor={lowStockThresholdFor}
            defaultLowStockThreshold={LOW_STOCK_THRESHOLD}
            editMode={editMode}
            onToggleEditMode={editMode ? saveEdit : openEdit}
            editInputs={editInputs}
            setEditInputs={setEditInputs}
            editPriceInputs={editPriceInputs}
            setEditPriceInputs={setEditPriceInputs}
            editNameInputs={editNameInputs}
            setEditNameInputs={setEditNameInputs}
            editHlInputs={editHlInputs}
            setEditHlInputs={setEditHlInputs}
            editLowStockInputs={editLowStockInputs}
            setEditLowStockInputs={setEditLowStockInputs}
            newProductName={newProductName}
            setNewProductName={setNewProductName}
            newProductHl={newProductHl}
            setNewProductHl={setNewProductHl}
            onAddProduct={addProduct}
            onArchiveProduct={archiveProduct}
            onRestoreProduct={restoreProduct}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
          />
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
            prices={prices}
            showPrices={showPrices}
            whatsappPhone={whatsappPhone}
            senderName={senderName}
            sendSenderName={sendSenderName}
            onConfirmOrder={confirmOrder}
            onEditOrder={editOrder}
            onDeleteOrder={deleteOrder}
            onMarkSent={markOrderSent}
            onMarkOrdersSent={markOrdersSent}
            onMarkConfirmed={markOrderConfirmed}
            onError={(message) => {
              setError(message);
              setTimeout(() => setError(""), 2500);
            }}
          />
        )}

        {view === "clientes" && (
          <Customers products={products} movements={movements} showPrices={showPrices} />
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

        {view === "config" && (
          <Settings
            whatsappPhone={whatsappPhone}
            onWhatsappPhoneChange={(next) => {
              setWhatsappPhone(next);
              persist({ ...currentPersistedState, whatsappPhone: next });
            }}
            senderName={senderName}
            sendSenderName={sendSenderName}
            onSenderSettingsChange={(nextSenderName, nextSendSenderName) => {
              setSenderName(nextSenderName);
              setSendSenderName(nextSendSenderName);
              persist({ ...currentPersistedState, senderName: nextSenderName, sendSenderName: nextSendSenderName });
            }}
          />
        )}

        {pendingImport && (
          <div style={{ marginTop: 20, background: "#FBEFE0", border: "1px solid #E9CFA0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13.5, color: "#8A5A1E", marginBottom: 10 }}>
              Vas a reemplazar TODOS los datos actuales con el archivo importado. Esta acción no se puede deshacer.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={confirmImport}
                style={{
                  background: "#8A5A1E", color: "#FFFFFF", border: "none", borderRadius: 7,
                  padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Sí, reemplazar
              </button>
              <button
                onClick={() => setPendingImport(null)}
                style={{
                  background: "transparent", color: "#8A5A1E", border: "1px solid #E9CFA0", borderRadius: 7,
                  padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 8 }}>
          <button
            onClick={() => downloadBackup(currentPersistedState)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: "1px solid #D8D2C0", color: "#8A8574",
              borderRadius: 7, padding: "7px 12px", fontSize: 12, cursor: "pointer",
            }}
          >
            <Download size={13} /> Exportar datos
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: "1px solid #D8D2C0", color: "#8A8574",
              borderRadius: 7, padding: "7px 12px", fontSize: 12, cursor: "pointer",
            }}
          >
            <Upload size={13} /> Importar datos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFileChange}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 11.5, color: "#B4AF9E", textAlign: "center" }}>
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : "Los datos se guardan automáticamente en este dispositivo"}
        </div>
      </div>
    </div>
  );
}
