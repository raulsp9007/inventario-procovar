import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getData, setData } from "./storage";
import { todayStr, tomorrowStr } from "./dateUtils";
import { isCommittedMovement } from "./orderHelpers";
import { totalHlSold } from "./money";
import { parseBackupFile } from "./backup";
import { generateProductCode, nextProductColor } from "./productHelpers";

const DEFAULT_PRODUCTS = [
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", color: "#C77A2E" },
  { code: "P500",  name: "Parranda 500ml",  short: "P-500",  color: "#C77A2E" },
  { code: "P330",  name: "Parranda 330ml",  short: "P-330",  color: "#C77A2E" },
  { code: "M330",  name: "Malta Guajira 330ml",  short: "M-330",  color: "#274E37" },
  { code: "M1500", name: "Malta Guajira 1500ml", short: "M-1500", color: "#274E37" },
];

export const LOW_STOCK_THRESHOLD = 20;
const STORAGE_KEY = "procovar-inventario-v1";
const VALID_VIEWS = ["hoy", "manana", "resumen", "pedidos", "clientes", "stock", "config"];
const VIEW_STORAGE_KEY = "procovar-active-tab";
const THEME_STORAGE_KEY = "procovar-theme";

export function lowStockThresholdFor(product) {
  return product.lowStockThreshold != null ? product.lowStockThreshold : LOW_STOCK_THRESHOLD;
}

// Todo el estado y los handlers de InventoryApp.jsx, movidos tal cual (sin
// cambios de lógica) para que ese archivo se quede solo con el render.
export function useInventoryStore() {
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
  const [editColorInputs, setEditColorInputs] = useState({});
  const [newProductName, setNewProductName] = useState("");
  const [newProductHl, setNewProductHl] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showLowStockList, setShowLowStockList] = useState(false);
  const [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);
  const [view, setViewState] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      return VALID_VIEWS.includes(saved) ? saved : "stock";
    } catch {
      return "stock";
    }
  }); // "stock" | "resumen" | "pedidos" | "clientes" | "hoy" | "config"
  function setView(next) {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {}
  }

  // Navegación cruzada Hoy -> Pedidos: clickear un producto en el resumen de
  // Hoy manda a Pedidos ya filtrado por ese producto. `requestId` cambia
  // siempre (aunque se clickee el mismo producto dos veces seguidas) para
  // que Orders.jsx detecte el pedido de filtro incluso si el código no cambió.
  const [productFilterRequest, setProductFilterRequest] = useState(null);
  function goToOrdersForProduct(code) {
    setProductFilterRequest({ code, requestId: Date.now() });
    setView("pedidos");
  }

  // Tema (claro/oscuro): preferencia de interfaz, no dato de negocio -- vive
  // en su propia key de localStorage, separada de "procovar-inventario-v1",
  // y no pasa nunca por persist()/setData.
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark" || saved === "light") return saved;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);
  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }
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

  // "Hoy" = movimientos comprometidos de hoy (bucket Hoy, o Mañana ya
  // enviado, con date === hoy). "Mañana" = todo lo que todavía está
  // pendiente de enviar y es relevante para mañana: pedidos de HOY sin
  // enviar (por si no salen hoy, ya los tenés a la vista para mañana) +
  // reservas para mañana sin comprometer todavía -- una vez enviados,
  // ambos dejan de aparecer acá porque ya no son "pendientes de envío".
  const todayCal = todayStr();
  const tomorrowCal = tomorrowStr();
  const { todaysMovements, mananaMovements } = useMemo(() => {
    const todaysMovements = movements.filter((m) => {
      if (m.date !== todayCal) return false;
      return m.type !== "venta" || isCommittedMovement(m);
    });
    const mananaMovements = movements.filter((m) => {
      if (m.type !== "venta") return false;
      if (m.date === todayCal) return !m.sent;
      if (m.date === tomorrowCal) return !isCommittedMovement(m);
      return false;
    });
    return { todaysMovements, mananaMovements };
  }, [movements, todayCal, tomorrowCal]);

  const activeProducts = products.filter((p) => !p.archived);
  const archivedProducts = products.filter((p) => p.archived);
  const totalStock = activeProducts.reduce((sum, p) => sum + (stock[p.code] || 0), 0);
  const lowStockCount = activeProducts.filter((p) => (stock[p.code] || 0) > 0 && (stock[p.code] || 0) <= lowStockThresholdFor(p)).length;
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
    const colorInputs = {};
    activeProducts.forEach((p) => {
      inputs[p.code] = String(stock[p.code] || 0);
      priceInputs[p.code] = String(prices[p.code] || 0);
      nameInputs[p.code] = p.name;
      hlInputs[p.code] = p.hl != null ? String(p.hl) : "";
      lowStockInputs[p.code] = p.lowStockThreshold != null ? String(p.lowStockThreshold) : "";
      colorInputs[p.code] = p.color || "#8A8574";
    });
    setEditInputs(inputs);
    setEditPriceInputs(priceInputs);
    setEditNameInputs(nameInputs);
    setEditHlInputs(hlInputs);
    setEditLowStockInputs(lowStockInputs);
    setEditColorInputs(colorInputs);
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
      setEditColorInputs((s) => ({ ...s, [code]: color }));
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
      if (editColorInputs[p.code]) nextP.color = editColorInputs[p.code];
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

  // Intercambia el producto con su vecino activo más cercano en esa dirección
  // (salta los archivados, que no se muestran ni se reordenan a mano).
  function moveProduct(code, direction) {
    const currentIndex = products.findIndex((p) => p.code === code);
    if (currentIndex === -1) return;
    let targetIndex = currentIndex + direction;
    while (targetIndex >= 0 && targetIndex < products.length && products[targetIndex].archived) {
      targetIndex += direction;
    }
    if (targetIndex < 0 || targetIndex >= products.length) return;
    const nextProducts = [...products];
    [nextProducts[currentIndex], nextProducts[targetIndex]] = [nextProducts[targetIndex], nextProducts[currentIndex]];
    setProducts(nextProducts);
    persist({ ...currentPersistedState, products: nextProducts });
  }

  // Venta suelta sin pedido/cliente formal (ej. venta de mostrador que no
  // se armó como pedido, o corregir un conteo de ventas del día) -- resta
  // stock y suma ingreso/HL de inmediato, igual que un pedido de Hoy ya
  // enviado. qty negativo = corrección (una venta contada de más): devuelve
  // stock y resta ingreso/HL. Sin orderId -- no aparece en Pedidos ni en
  // el historial de compras de ningún cliente.
  function registerManualSale(code, qty) {
    const unitPrice = prices[code] || 0;
    const product = products.find((p) => p.code === code);
    const unitHl = product?.hl || 0;
    const movement = makeMovement(code, "venta", qty, {
      unitPrice, unitHl, exchangeRate, bucket: "hoy", date: todayStr(), sent: true, manual: true,
    });
    const nextStock = { ...stock, [code]: (stock[code] || 0) - qty };
    const nextMovements = [movement, ...movements].slice(0, 500);
    const nextCumulativeRevenue = cumulativeRevenue + qty * unitPrice;
    const nextCumulativeHl = cumulativeHl + qty * unitHl;
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

  function confirmOrder({ customerName, isDelivery, note, lines, bucket, date: chosenDate }) {
    const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Numero consecutivo solo para ubicar el pedido en la app (no se manda
    // por WhatsApp) -- se deriva del maximo ya usado en vez de guardar un
    // contador aparte, asi no hace falta migrar datos viejos.
    const orderSeq = movements.reduce((max, m) => (m.orderSeq && m.orderSeq > max ? m.orderSeq : max), 0) + 1;
    const committed = bucket === "hoy";
    const date = bucket === "hoy" ? todayStr() : (chosenDate || tomorrowStr());
    const nextStock = { ...stock };
    const newMovements = [];
    let addedRevenue = 0;
    let addedHl = 0;
    lines.forEach(({ code, qty }) => {
      const unitPrice = prices[code] || 0;
      const product = products.find((p) => p.code === code);
      const unitHl = product?.hl || 0;
      newMovements.push(makeMovement(code, "venta", qty, { unitPrice, unitHl, exchangeRate, orderId, orderSeq, customerName, isDelivery, note, bucket, date }));
      if (committed) {
        nextStock[code] = (nextStock[code] || 0) - qty;
        addedRevenue += qty * unitPrice;
        addedHl += qty * unitHl;
      }
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
    const wasCommitted = isCommittedMovement(orderMovements[0]);

    const nextStock = { ...stock };
    let removedRevenue = 0;
    let removedHl = 0;
    if (wasCommitted) {
      orderMovements.forEach((m) => {
        nextStock[m.code] = (nextStock[m.code] || 0) + m.qty;
        removedRevenue += m.qty * (m.unitPrice || 0);
        removedHl += m.qty * (m.unitHl || 0);
      });
    }
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

  // La fecha se recalcula siempre desde el bucket actual (hoy/mañana de
  // HOY, no la fecha original) -- así editar un pedido viejo estancado lo
  // "refresca" al día correspondiente sin necesitar un botón Aplazar aparte.
  function editOrder(orderId, { customerName, isDelivery, note, lines, bucket, date: chosenDate }) {
    const originalMovements = movements.filter((m) => m.orderId === orderId);
    if (originalMovements.length === 0) return;
    const wasSent = !!originalMovements[0].sent;
    const wasCommitted = isCommittedMovement(originalMovements[0]);

    const restoredStock = { ...stock };
    let removedRevenue = 0;
    let removedHl = 0;
    if (wasCommitted) {
      originalMovements.forEach((m) => {
        restoredStock[m.code] = (restoredStock[m.code] || 0) + m.qty;
        removedRevenue += m.qty * (m.unitPrice || 0);
        removedHl += m.qty * (m.unitHl || 0);
      });
    }

    const nextSent = wasSent;
    const willBeCommitted = bucket === "hoy" || (bucket === "manana" && nextSent);
    const date = bucket === "hoy" ? todayStr() : (chosenDate || tomorrowStr());
    const orderSeq = originalMovements[0].orderSeq;

    const nextStock = { ...restoredStock };
    const newMovements = [];
    let addedRevenue = 0;
    let addedHl = 0;
    lines.forEach(({ code, qty }) => {
      const unitPrice = prices[code] || 0;
      const product = products.find((p) => p.code === code);
      const unitHl = product?.hl || 0;
      newMovements.push(makeMovement(code, "venta", qty, { unitPrice, unitHl, exchangeRate, orderId, orderSeq, customerName, isDelivery, note, bucket, date, sent: nextSent }));
      if (willBeCommitted) {
        nextStock[code] = (nextStock[code] || 0) - qty;
        addedRevenue += qty * unitPrice;
        addedHl += qty * unitHl;
      }
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

  // Llamar una sola vez por varios pedidos a la vez (envío en bloque, Hoy o
  // Mañana): calcula todos los deltas de stock/ingreso/HL sobre el
  // `movements` de este render antes de aplicar el set, así no se pisan
  // entre sí. Los pedidos de Hoy nunca cambian de "comprometido" al
  // (des)marcar Enviado -- ya estaban comprometidos desde que se crearon.
  function markOrdersSent(orderIds, sent) {
    const idSet = new Set(orderIds);
    const nowIso = new Date().toISOString();
    const nextStock = { ...stock };
    let revenueDelta = 0;
    let hlDelta = 0;

    idSet.forEach((orderId) => {
      const orderMovements = movements.filter((m) => m.orderId === orderId);
      if (orderMovements.length === 0) return;
      const bucket = orderMovements[0].bucket || "hoy";
      if (bucket !== "manana") return;
      const wasSent = !!orderMovements[0].sent;
      if (wasSent === sent) return;
      const sign = sent ? 1 : -1;
      orderMovements.forEach((m) => {
        nextStock[m.code] = (nextStock[m.code] || 0) - sign * m.qty;
        revenueDelta += sign * m.qty * (m.unitPrice || 0);
        hlDelta += sign * m.qty * (m.unitHl || 0);
      });
    });

    const nextMovements = movements.map((m) =>
      idSet.has(m.orderId) ? { ...m, sent, sentAt: sent ? nowIso : m.sentAt } : m
    );
    const nextCumulativeRevenue = cumulativeRevenue + revenueDelta;
    const nextCumulativeHl = cumulativeHl + hlDelta;
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

  function renameCustomer(oldName, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const nextMovements = movements.map((m) =>
      m.customerName === oldName ? { ...m, customerName: trimmed } : m
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

  return {
    products, stock, movements, lastAdjustedAt, prices,
    cumulativeRevenue, cumulativeHl, exchangeRate, setExchangeRate, commissionPercent, setCommissionPercent,
    showPrices, setShowPrices, hlGoal, setHlGoal,
    whatsappPhone, setWhatsappPhone, senderName, setSenderName, sendSenderName, setSendSenderName,
    loaded, saveState, error, setError,
    editMode, editInputs, setEditInputs, editPriceInputs, setEditPriceInputs,
    editNameInputs, setEditNameInputs, editHlInputs, setEditHlInputs,
    editLowStockInputs, setEditLowStockInputs,
    editColorInputs, setEditColorInputs,
    newProductName, setNewProductName, newProductHl, setNewProductHl,
    showArchived, setShowArchived, showLowStockList, setShowLowStockList,
    pendingImport, setPendingImport, fileInputRef,
    view, setView, theme, toggleTheme,
    productFilterRequest, goToOrdersForProduct,
    currentPersistedState, persist,
    handleImportFileChange, confirmImport,
    todaysMovements, mananaMovements,
    activeProducts, archivedProducts, totalStock, lowStockCount, todaysUnitsSold, pendingTodayFor,
    openEdit, addProduct, saveEdit, archiveProduct, restoreProduct, moveProduct,
    registerManualSale,
    confirmOrder, deleteOrder, editOrder, markOrderSent, markOrdersSent,
    renameCustomer, markOrderConfirmed,
  };
}
