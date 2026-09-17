import { useState, useEffect, useRef, useMemo } from "react";
import { Trash2, Receipt, Pencil, ChevronDown, Check, Search, X, Plus } from "lucide-react";
import { todayStr, tomorrowStr, formatDate, formatDateTime, getDateNDaysAgoStr } from "./dateUtils";
import { formatCUP } from "./money";
import { groupAllOrders, formatOrderForWhatsApp, formatOrderForCustomer, isCommittedOrder, reservedForTomorrow } from "./orderHelpers";
import { getCustomerNames, matchCustomerNames, getCustomerBusinessName, getCustomerPhone, getCustomerOrders, findNearDuplicateCustomerName, toCubanPhone, cubanPhoneLocalPart, getBusinessNames, getCustomerNameForBusiness } from "./customerHelpers";
import { productChipColors } from "./colorUtils";
import Today from "./Today.jsx";
import OrderFormModal from "./OrderFormModal.jsx";
import CierreDeVentasBanner from "./CierreDeVentasBanner.jsx";

const PAST_ORDERS_DAYS = 14;
const FILTERS_STORAGE_KEY = "procovar-pedidos-filtros";

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Nombre de producto alfabéticamente más chico entre las líneas de un
// pedido -- decide dónde cae ese pedido en el orden "Alfabético por
// producto" cuando tiene varios productos distintos.
function orderFirstProductName(order, products) {
  const names = order.lines.map((l) => products.find((p) => p.code === l.code)?.name || l.code);
  return names.sort((a, b) => a.localeCompare(b))[0] || "";
}

// Ícono de WhatsApp (no viene en lucide-react, que es solo outline
// genérico) -- para el botón que manda la copia al cliente, donde el
// glifo típico ayuda a reconocer la acción de un vistazo.
function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.876 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.001 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.762.462 3.484 1.34 5.001L2 22l5.109-1.34a9.958 9.958 0 0 0 4.892 1.284h.004c5.514 0 9.997-4.483 9.997-9.997 0-2.671-1.04-5.182-2.929-7.071a9.933 9.933 0 0 0-7.072-2.873zm0 18.164a8.16 8.16 0 0 1-4.152-1.136l-.298-.177-3.09.81.826-3.014-.194-.31a8.155 8.155 0 0 1-1.257-4.34c0-4.507 3.667-8.174 8.174-8.174a8.128 8.128 0 0 1 5.782 2.396 8.128 8.128 0 0 1 2.393 5.78c0 4.508-3.667 8.165-8.184 8.165z" />
    </svg>
  );
}

// Ícono de moto (domicilio) -- tampoco viene en lucide-react.
function MotoIcon({ size = 15, color = "currentColor", strokeWidth = 1.7 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="17.5" r="2.8" />
      <circle cx="18" cy="17.5" r="2.8" />
      <path d="M8.8 17.5h6.4M6 14.7V9h5l3.2 4.4 3.8 1.2v2.9" />
      <path d="M11 9V6h2.6" />
    </svg>
  );
}

// Track de 3 pasos del pedido, en el orden real del flujo de venta: primero
// se manda al cliente, después se factura (esto es lo que antes era
// "Enviado" -- dispara el descuento de stock/ingreso para pedidos de
// mañana, ver markOrdersSent), y por último se confirma a mano. Cada
// columna entera es el área tocable (no solo el círculo). Marcar un paso no
// encadena a los anteriores (se puede corregir uno solo a mano), pero
// DESmarcar sí encadena hacia adelante -- no tiene sentido un pedido
// "Confirmado" sin estar "Facturado". Con los 3 hechos, colapsa a una
// pastilla para no ocupar tanto alto; tocarla la vuelve a expandir.
function OrderStepTrack({ order, onMarkSentToCustomer, onMarkSent, onMarkConfirmed, onSetOrderSteps, expanded, onToggleExpanded }) {
  const steps = [
    { key: "sentToCustomer", label: "Enviado", short: "ENV.", done: !!order.sentToCustomer },
    { key: "sent", label: "Facturado", short: "FACT.", done: !!order.sent },
    { key: "confirmed", label: "Confirmado", short: "CONF.", done: !!order.confirmed },
  ];
  const allDone = steps.every((s) => s.done);
  const firstPendingIndex = steps.findIndex((s) => !s.done);

  function toggleStep(index) {
    const step = steps[index];
    if (!step.done) {
      if (index === 0) onMarkSentToCustomer(order.orderId, true);
      else if (index === 1) onMarkSent(order.orderId, true);
      else onMarkConfirmed(order.orderId, true);
      return;
    }
    const patch = {};
    steps.slice(index).forEach((s) => { if (s.done) patch[s.key] = false; });
    onSetOrderSteps(order.orderId, patch);
  }

  if (allDone && !expanded) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 7, height: 44 }}>
        <button
          onClick={onToggleExpanded}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "rgba(60,110,74,.1)",
            border: "none", borderRadius: 999, padding: "6px 11px", cursor: "pointer",
          }}
        >
          <Check size={13} strokeWidth={3} color="var(--green)" />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--green)" }}>Confirmado</span>
        </button>
        <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--faintest)", whiteSpace: "nowrap" }}>tocar para editar</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", height: 44 }}>
      {steps.map((step, i) => {
        const isNextPending = i === firstPendingIndex;
        const circleColor = step.done ? "var(--green)" : isNextPending ? "var(--orange)" : "var(--muted)";
        const labelColor = step.done ? "var(--green)" : isNextPending ? "var(--orange)" : "var(--faint)";
        return (
          <button
            key={step.key}
            onClick={() => toggleStep(i)}
            title={step.label}
            aria-label={step.label}
            aria-pressed={step.done}
            style={{
              flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            {i < steps.length - 1 && (
              <div style={{
                position: "absolute", top: 12, left: "50%", right: "-50%", height: 2,
                background: step.done ? "var(--green)" : "var(--border)",
              }} />
            )}
            <div style={{
              position: "relative", width: 24, height: 24, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: step.done ? "var(--green)" : "var(--surface-sunken)",
              border: step.done ? "none" : isNextPending ? "1.5px solid var(--orange-2)" : "1px solid var(--border-strong)",
            }}>
              {step.done
                ? <Check size={12} strokeWidth={3} color="var(--cream)" />
                : <span style={{ fontSize: 12, fontWeight: isNextPending ? 700 : 600, color: circleColor }}>{i + 1}</span>}
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", color: labelColor }}>{step.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function openOrderWhatsApp(order, products, phone, senderOptions) {
  const text = formatOrderForWhatsApp(order, products, senderOptions);
  const url = `https://wa.me/${phone || ""}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// Copia del pedido directo al teléfono del cliente (no al contacto de
// negocio configurado) -- mensaje aparte, sin remitente ni negocio, ver
// formatOrderForCustomer.
function openOrderWhatsAppToCustomer(order, products) {
  const text = formatOrderForCustomer(order, products);
  // toCubanPhone de nuevo acá (ya se aplica al guardar el pedido) -- por
  // si el número viene de un dato viejo importado que nunca pasó por esa
  // normalización. Así el link de wa.me nunca sale mal armado.
  const url = `https://wa.me/${toCubanPhone(order.customerPhone)}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function orderTotal(order) {
  return order.lines.reduce((sum, l) => sum + l.qty * (l.unitPrice || 0), 0);
}

export default function Orders({ products, movements, stock, prices, showPrices, exchangeRate, todaysMovements, mananaMovements, whatsappPhone, senderName, sendSenderName, sendBusinessName, onToggleSendBusinessName, onConfirmOrder, onEditOrder, onDeleteOrder, onMarkSent, onMarkConfirmed, onMarkSentToCustomer, onSetOrderSteps, onRefreshPendingPrices, onError, cierreVentasHour, dailyHlGoal }) {
  const senderOptions = { senderName, sendSenderName };
  const [customerName, setCustomerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [note, setNote] = useState("");
  const [draftLines, setDraftLines] = useState([]);
  const [draftBucket, setDraftBucket] = useState("hoy");
  const [draftDate, setDraftDate] = useState(() => tomorrowStr());
  const [pendingReserveConfirm, setPendingReserveConfirm] = useState(null); // { draft, reserveDips } | null
  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [pendingQty, setPendingQty] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showBusinessSuggestions, setShowBusinessSuggestions] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingOrderSeq, setEditingOrderSeq] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [confirmingPostponeId, setConfirmingPostponeId] = useState(null);
  // Trackers ya completados que el usuario reabrió a mano para corregir un
  // paso -- por default un pedido con los 3 pasos hechos se ve colapsado.
  const [expandedCompletedTrackers, setExpandedCompletedTrackers] = useState(() => new Set());
  function toggleTrackerExpanded(orderId) {
    setExpandedCompletedTrackers((s) => {
      const next = new Set(s);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  }
  // Momento en que se armó cada "¿Seguro?" -- si el segundo toque llega
  // demasiado rápido (mal-tap doble sin querer, no una decisión real) se
  // ignora en vez de confirmar la acción destructiva.
  const armedDeleteAtRef = useRef(new Map());
  const armedPostponeAtRef = useRef(new Map());
  const DOUBLE_TAP_GUARD_MS = 400;
  const [pendingDeletes, setPendingDeletes] = useState(() => new Map());
  const [pendingPostpones, setPendingPostpones] = useState(() => new Map());
  const [pendingEditUndo, setPendingEditUndo] = useState(null); // { orderId, customerName, revertDraft, timeoutId } | null
  // Solo oculta el toast del stack visual -- el timeout real que aplica la
  // eliminación/pospuesta sigue corriendo igual, esto no cancela nada.
  const [dismissedToastKeys, setDismissedToastKeys] = useState(() => new Set());
  function dismissToast(key) {
    setDismissedToastKeys((s) => new Set(s).add(key));
  }
  const [hoyOrderSort, setHoyOrderSort] = useState(() => (loadSavedFilters().sort === "oldest" ? "oldest" : "recent"));
  const [mananaOrderSort, setMananaOrderSort] = useState(() => (loadSavedFilters().sortManana === "oldest" ? "oldest" : "recent"));
  const [orderSearch, setOrderSearch] = useState("");
  const [filterUnsent, setFilterUnsent] = useState(() => !!loadSavedFilters().filterUnsent);
  const [filterUnconfirmed, setFilterUnconfirmed] = useState(() => !!loadSavedFilters().filterUnconfirmed);
  const [filterDelivery, setFilterDelivery] = useState(() => !!loadSavedFilters().filterDelivery);
  const [filterProductCode, setFilterProductCode] = useState(() => loadSavedFilters().filterProductCode || "");
  const [searchOpen, setSearchOpen] = useState(false);
  // Vista de la lista (Hoy/Programar), independiente del bucket del pedido
  // que se está creando/editando en el modal -- podés estar mirando la
  // lista de Hoy y aun así abrir el modal para cargar un pedido Programado.
  // Pasado el cierre de ventas, lo que tenga sentido armar ya es un pedido
  // para mañana -- arranca ahí en vez de "Hoy". Se recalcula solo (esta
  // pestaña se desmonta/remonta cada vez que se entra a Pedidos) y, pasada
  // la medianoche, getHours() vuelve a 0 así que esto vuelve a dar "hoy"
  // sin nada especial para la medianoche.
  const [activeSection, setActiveSection] = useState(() =>
    cierreVentasHour != null && new Date().getHours() >= cierreVentasHour ? "manana" : "hoy"
  );
  const [modalOpen, setModalOpen] = useState(false);
  // Bloquea envíos repetidos (doble clic/doble toque) mientras el formulario
  // todavía no reflejó el reset -- el estado de React (customerName, etc.)
  // se actualiza en batch, así que un segundo click puede leer el mismo
  // formulario "todavía lleno" antes de que se limpie. El ref cambia de
  // inmediato y solo se libera cuando el re-render con el formulario ya
  // vacío efectivamente ocurre (ver useEffect debajo).
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ sort: hoyOrderSort, sortManana: mananaOrderSort, filterUnsent, filterUnconfirmed, filterDelivery, filterProductCode }));
    } catch {}
  }, [hoyOrderSort, mananaOrderSort, filterUnsent, filterUnconfirmed, filterDelivery, filterProductCode]);

  useEffect(() => {
    submittingRef.current = false;
  }, [customerName]);

  // El filtro de producto se puede activar sin querer -- tocando un
  // producto en el resumen embebido (Hoy o Pendiente), no solo desde acá.
  // Como queda guardado (persiste entre pestañas y recargas) y antes no
  // había forma de verlo salvo mirando el selector, un pedido programado
  // podía "desaparecer" sin que se notara que había un filtro puesto. Estas
  // etiquetas se muestran explícitas en el mensaje de "sin resultados".
  const activeFilterLabels = [];
  if (orderSearch.trim()) activeFilterLabels.push(`cliente "${orderSearch.trim()}"`);
  if (filterProductCode) {
    const product = products.find((p) => p.code === filterProductCode);
    activeFilterLabels.push(`producto "${product ? product.name : filterProductCode}"`);
  }
  if (filterUnsent) activeFilterLabels.push("no facturados");
  if (filterUnconfirmed) activeFilterLabels.push("no confirmados");
  if (filterDelivery) activeFilterLabels.push("domicilio");
  const hasActiveFilters = activeFilterLabels.length > 0;

  function clearAllFilters() {
    setOrderSearch("");
    setFilterProductCode("");
    setFilterUnsent(false);
    setFilterUnconfirmed(false);
    setFilterDelivery(false);
  }

  // Clic en un producto dentro del resumen embebido (Hoy/Programar): filtra
  // la lista de pedidos de esta misma pestaña por ese producto, sin navegar
  // a ningún lado (ya estamos en Pedidos).
  function handleSummaryProductClick(code) {
    setFilterProductCode(code);
  }

  const today = todayStr();
  const belongsToToday = (o) => o.date === today;
  const isUpcoming = (o) => o.date > today;
  const pastCierreDeVentas = cierreVentasHour != null && new Date().getHours() >= cierreVentasHour;
  const searchTerm = orderSearch.trim().toLowerCase();
  const pastCutoff = getDateNDaysAgoStr(PAST_ORDERS_DAYS, today);

  // groupAllOrders + los 3 filtros/sorts escanean todos los movimientos en
  // cada uno -- se memoizan juntos para no repetir el trabajo en cada
  // render que no cambia ninguno de estos valores (ej. tipear en un input
  // que no es la búsqueda).
  const {
    allOrders, todaysOrders, sortedTodaysOrders,
    upcomingOrders, sortedUpcomingOrders,
    pastOrdersByDate, pastDatesDesc, pastOrdersCount,
    unconfirmedTodayOrders,
    totalTodayCount, totalUpcomingCount,
    filterCounts,
  } = useMemo(() => {
    const matchesSearch = (order) => !searchTerm || order.customerName.toLowerCase().includes(searchTerm);
    const matchesStatusFilter = (order) =>
      (!filterUnsent && !filterUnconfirmed) ||
      (filterUnsent && !order.sent) ||
      (filterUnconfirmed && !order.confirmed);
    const matchesProduct = (order) => !filterProductCode || order.lines.some((l) => l.code === filterProductCode);
    const matchesDelivery = (order) => !filterDelivery || order.isDelivery;
    const matchesFilters = (order) => matchesSearch(order) && matchesStatusFilter(order) && matchesProduct(order) && matchesDelivery(order);

    // "product": agrupa por el producto alfabéticamente primero de cada
    // pedido; dentro del mismo producto, más reciente primero (mismo criterio
    // que el sort "recent" para no introducir un tercer orden distinto ahí).
    const orderSortComparator = (sortMode) => (a, b) => {
      if (sortMode === "product") {
        const cmp = orderFirstProductName(a, products).localeCompare(orderFirstProductName(b, products));
        return cmp !== 0 ? cmp : b.timestamp.localeCompare(a.timestamp);
      }
      return sortMode === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp);
    };

    const allOrders = groupAllOrders(movements).filter((o) => !pendingDeletes.has(o.orderId) && !pendingPostpones.has(o.orderId));
    const todaysOrders = allOrders.filter((o) => belongsToToday(o) && matchesFilters(o));
    const sortedTodaysOrders = [...todaysOrders].sort(orderSortComparator(hoyOrderSort));
    const upcomingOrders = allOrders.filter((o) => isUpcoming(o) && matchesFilters(o));
    const sortedUpcomingOrders = [...upcomingOrders].sort(orderSortComparator(mananaOrderSort));
    const pastOrdersByDate = new Map();
    allOrders
      .filter((o) => o.date < today && o.date >= pastCutoff && matchesFilters(o))
      .forEach((o) => {
        if (!pastOrdersByDate.has(o.date)) pastOrdersByDate.set(o.date, []);
        pastOrdersByDate.get(o.date).push(o);
      });
    const pastDatesDesc = Array.from(pastOrdersByDate.keys()).sort((a, b) => b.localeCompare(a));
    const pastOrdersCount = pastDatesDesc.reduce((sum, d) => sum + pastOrdersByDate.get(d).length, 0);

    // Totales sin filtrar por estado/domicilio -- "cuántos pedidos hay hoy/
    // programados", no cuántos coinciden con los checkboxes.
    const totalTodayCount = allOrders.filter((o) => belongsToToday(o)).length;
    const totalUpcomingCount = allOrders.filter((o) => isUpcoming(o)).length;

    // Cuántos pedidos de la sección activa coincidirían con cada filtro de
    // estado si lo marcaras -- independientes entre sí (no se combinan),
    // para que el número al lado del checkbox tenga sentido por separado.
    // Solo tiene en cuenta búsqueda + producto (no los otros checkboxes).
    const sectionBase = (activeSection === "hoy" ? allOrders.filter(belongsToToday) : allOrders.filter(isUpcoming))
      .filter((o) => matchesSearch(o) && matchesProduct(o));
    const filterCounts = {
      unsent: sectionBase.filter((o) => !o.sent).length,
      unconfirmed: sectionBase.filter((o) => !o.confirmed).length,
      delivery: sectionBase.filter((o) => o.isDelivery).length,
    };

    // Independiente de la búsqueda/filtros -- es un aviso del sistema, no
    // una vista que el usuario esté filtrando a mano.
    const unconfirmedTodayOrders = allOrders.filter((o) => belongsToToday(o) && !o.confirmed);

    return {
      allOrders, todaysOrders, sortedTodaysOrders, upcomingOrders, sortedUpcomingOrders,
      pastOrdersByDate, pastDatesDesc, pastOrdersCount, unconfirmedTodayOrders,
      totalTodayCount, totalUpcomingCount, filterCounts,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, products, today, pastCutoff, searchTerm, filterUnsent, filterUnconfirmed, filterDelivery, filterProductCode, hoyOrderSort, mananaOrderSort, pendingDeletes, pendingPostpones, activeSection]);

  // Solo entra al panel si queda algo libre para prometer, o si ya tiene
  // reservas encima (aunque esté en 0 libre) -- un producto sin nada de
  // ninguna de las dos cosas solo ensucia la lista.
  const reservablePanelRows = products
    .filter((p) => !p.archived)
    .map((p) => {
      const reserved = reservedForTomorrow(allOrders, p.code);
      const libre = (stock[p.code] || 0) - reserved;
      return { product: p, reserved, libre };
    })
    .filter((row) => row.libre !== 0 || row.reserved !== 0);

  // Dropdown de filtro por producto: solo ofrece productos que aparecen en
  // algún pedido de hoy o para mañana -- no tiene sentido filtrar por algo
  // que no vas a encontrar en ninguna de las dos listas.
  const productCodesWithOrders = new Set(
    allOrders.filter((o) => belongsToToday(o) || isUpcoming(o)).flatMap((o) => o.lines.map((l) => l.code))
  );
  const filterableProducts = products.filter((p) => productCodesWithOrders.has(p.code));

  // Techo duro (incluye reserva manual) -- si un producto ya llegó a cero,
  // sea porque el stock real está en 0 o porque otros pedidos ya reservaron
  // toda la cantidad disponible, desaparece del selector. Si todavía queda
  // algo en la reserva manual, sigue apareciendo (se puede seguir pidiendo,
  // avisando antes de tocarla -- ver pendingReserveConfirm).
  const availableProducts = products.filter((p) =>
    !p.archived && computeAvailable(p.code, { includeReserve: true }) > 0 && !draftLines.some((l) => l.code === p.code)
  );
  const effectiveSelectedProductCode = availableProducts.some((p) => p.code === selectedProductCode)
    ? selectedProductCode
    : (availableProducts[0]?.code || "");

  const customerNamesList = getCustomerNames(movements);
  const suggestions = showSuggestions
    ? matchCustomerNames(customerNamesList, customerName).map((name) => ({ name, count: getCustomerOrders(movements, name).length }))
    : [];
  // Aviso de "cliente parecido" -- ej. typo de mayúsculas o espacio de más
  // -- para no terminar con dos clientes que en realidad son la misma
  // persona. No aplica mientras se están mostrando sugerencias (ya se ve
  // la lista completa ahí) ni si el nombre ya coincide exacto.
  const nearDuplicateName = !showSuggestions
    ? findNearDuplicateCustomerName(customerNamesList, customerName)
    : null;

  function pickSuggestion(name) {
    setCustomerName(name);
    setShowSuggestions(false);
    // Cliente ya registrado -- autocompleta negocio y teléfono guardados de
    // algún pedido anterior (si nunca se cargaron, quedan vacíos).
    setBusinessName(getCustomerBusinessName(movements, name));
    setCustomerPhone(cubanPhoneLocalPart(getCustomerPhone(movements, name)));
  }

  const businessNamesList = getBusinessNames(movements);
  const businessSuggestions = showBusinessSuggestions
    ? matchCustomerNames(businessNamesList, businessName).map((name) => ({ name, customerName: getCustomerNameForBusiness(movements, name) }))
    : [];

  // Camino inverso a pickSuggestion -- útil cuando te acordás del negocio
  // pero no de a nombre de quién está el pedido. Autocompleta cliente y
  // teléfono igual que si lo hubieras elegido por nombre.
  function pickBusinessSuggestion(name) {
    setBusinessName(name);
    setShowBusinessSuggestions(false);
    const customer = getCustomerNameForBusiness(movements, name);
    if (customer) {
      setCustomerName(customer);
      setCustomerPhone(cubanPhoneLocalPart(getCustomerPhone(movements, customer)));
    }
  }

  function resetForm() {
    setCustomerName("");
    setBusinessName("");
    setCustomerPhone("");
    setIsDelivery(false);
    setNote("");
    setDraftLines([]);
    setPendingQty("");
    setEditingOrderId(null);
    setEditingOrderSeq(null);
    setPendingReserveConfirm(null);
    // No se resetea draftBucket: si confirmaste un pedido Programado,
    // te quedás en "Programar" para seguir cargando pedidos del mismo tipo.
    setDraftDate(tomorrowStr());
  }

  function startEdit(order) {
    setCustomerName(order.customerName);
    setBusinessName(order.businessName || "");
    setCustomerPhone(cubanPhoneLocalPart(order.customerPhone || ""));
    setIsDelivery(order.isDelivery);
    setNote(order.note || "");
    setDraftLines(order.lines.map((l) => ({ code: l.code, qty: String(l.qty) })));
    setPendingQty("");
    setEditingOrderId(order.orderId);
    setEditingOrderSeq(order.orderSeq);
    setDraftBucket(order.bucket);
    setDraftDate(order.bucket === "manana" ? order.date : tomorrowStr());
    setModalOpen(true);
  }

  // Abre el modal para un pedido nuevo, arrancando en el mismo bucket que
  // la lista que estás mirando (si estás en Programar, el pedido nuevo
  // arranca en Programar).
  function openNewOrderModal() {
    resetForm();
    setDraftBucket(activeSection);
    setModalOpen(true);
  }

  function closeModal() {
    resetForm();
    setModalOpen(false);
  }

  function addDraftLine() {
    if (!effectiveSelectedProductCode) return;
    const qty = parseInt(pendingQty, 10);
    if (!pendingQty || isNaN(qty) || qty <= 0) {
      onError("Ingresa una cantidad válida.");
      return;
    }
    setDraftLines((lines) => [...lines, { code: effectiveSelectedProductCode, qty: String(qty) }]);
    setPendingQty("");
  }

  function updateDraftLineQty(code, value) {
    setDraftLines((lines) => lines.map((l) => (l.code === code ? { ...l, qty: value } : l)));
  }

  function removeDraftLine(code) {
    setDraftLines((lines) => lines.filter((l) => l.code !== code));
  }

  // Disponible NORMAL para una línea del pedido en edición/creación (no
  // toca la reserva manual del producto): stock actual (+ lo que este mismo
  // pedido ya tenía comprometido, si se está editando uno que ya estaba
  // comprometido) MENOS lo ya reservado por otros pedidos de mañana sin
  // enviar -- sea el draft de Hoy o de Mañana, esas unidades ya están
  // prometidas a otro cliente y no se pueden volver a ofrecer.
  // Con includeReserve=true da el TECHO real (cuánto hay contando la
  // reserva manual) -- se usa para saber si vale la pena avisar "¿usar la
  // reserva?" en vez de bloquear directo por falta de stock. La reserva de
  // mañana (reservedForTomorrow), a diferencia de la manual, nunca se puede
  // "pisar" con solo confirmar -- es un compromiso real con un cliente.
  function computeAvailable(code, { includeReserve = false } = {}) {
    const editingOrder = editingOrderId ? allOrders.find((o) => o.orderId === editingOrderId) : null;
    const creditBack = editingOrder && isCommittedOrder(editingOrder)
      ? (editingOrder.lines.find((l) => l.code === code)?.qty || 0)
      : 0;
    let base = (stock[code] || 0) + creditBack - reservedForTomorrow(allOrders, code, editingOrderId);
    if (!includeReserve) {
      const product = products.find((p) => p.code === code);
      base -= product?.reserveQty || 0;
    }
    return base;
  }

  function confirmOrder() {
    if (submittingRef.current) return;
    if (!customerName.trim()) {
      onError("Ingresa el nombre del cliente.");
      return;
    }
    const lines = draftLines
      .map((l) => ({ code: l.code, qty: parseInt(l.qty, 10) }))
      .filter((l) => !isNaN(l.qty) && l.qty > 0);
    if (lines.length === 0) {
      onError("Agrega al menos un producto al pedido.");
      return;
    }
    if (draftBucket === "manana" && (!draftDate || draftDate <= today)) {
      onError("Elegí una fecha futura para el pedido programado.");
      return;
    }
    const reserveDips = [];
    for (const line of lines) {
      const hardAvailable = computeAvailable(line.code, { includeReserve: true });
      if (line.qty > hardAvailable) {
        const product = products.find((p) => p.code === line.code);
        const motivo = draftBucket === "manana"
          ? ` para el ${formatDate(draftDate)} (ya reservado por otros pedidos)`
          : reservedForTomorrow(allOrders, line.code, editingOrderId) > 0 ? " (parte ya está reservada para mañana)" : "";
        onError(`No hay suficiente stock de ${product ? product.name : line.code}${motivo}.`);
        return;
      }
      const available = computeAvailable(line.code);
      if (line.qty > available) {
        const product = products.find((p) => p.code === line.code);
        reserveDips.push({ code: line.code, name: product ? product.name : line.code, fromReserve: line.qty - Math.max(0, available) });
      }
    }
    const draft = { customerName: customerName.trim(), businessName: businessName.trim(), customerPhone: customerPhone.trim(), isDelivery, note: note.trim(), lines, bucket: draftBucket, date: draftDate };
    // Si alguna línea solo entra usando la reserva, no se manda directo --
    // se avisa primero y se confirma acá mismo (submitDraft con el draft ya
    // armado), en vez de bloquear como si no hubiera stock.
    if (reserveDips.length > 0) {
      setPendingReserveConfirm({ draft, reserveDips });
      return;
    }
    submittingRef.current = true;
    submitDraft(draft);
  }

  function confirmUseReserve() {
    if (!pendingReserveConfirm) return;
    const { draft } = pendingReserveConfirm;
    setPendingReserveConfirm(null);
    submittingRef.current = true;
    submitDraft(draft);
  }

  function cancelReserveConfirm() {
    setPendingReserveConfirm(null);
  }

  function submitDraft(draft) {
    if (editingOrderId) {
      const previousOrder = allOrders.find((o) => o.orderId === editingOrderId);
      onEditOrder(editingOrderId, draft);
      if (previousOrder) stageEditUndo(previousOrder);
    } else {
      onConfirmOrder(draft);
    }
    // La lista sigue al pedido recién guardado -- si lo mandaste a
    // Programar, pasás a ver la lista de Programar, no la de Hoy.
    setActiveSection(draft.bucket);
    resetForm();
    setModalOpen(false);
  }

  // A diferencia de Eliminar/Posponer, editar guarda al toque (el usuario
  // ya vio el resultado en el modal antes de confirmar) -- acá el aviso con
  // "Deshacer" aparece DESPUÉS de aplicar el cambio, y deshacer significa
  // volver a editar el pedido con los datos que tenía antes.
  function stageEditUndo(previousOrder) {
    setPendingEditUndo((prev) => {
      if (prev) clearTimeout(prev.timeoutId);
      const timeoutId = setTimeout(() => {
        setPendingEditUndo((cur) => (cur && cur.orderId === previousOrder.orderId ? null : cur));
      }, 5000);
      const revertDraft = {
        customerName: previousOrder.customerName,
        businessName: previousOrder.businessName,
        customerPhone: previousOrder.customerPhone,
        isDelivery: previousOrder.isDelivery,
        note: previousOrder.note,
        lines: previousOrder.lines.map((l) => ({ code: l.code, qty: l.qty })),
        bucket: previousOrder.bucket,
        date: previousOrder.date,
        forceSent: previousOrder.sent,
      };
      return { orderId: previousOrder.orderId, customerName: previousOrder.customerName, revertDraft, timeoutId };
    });
  }

  function undoEdit() {
    if (!pendingEditUndo) return;
    clearTimeout(pendingEditUndo.timeoutId);
    onEditOrder(pendingEditUndo.orderId, pendingEditUndo.revertDraft);
    setPendingEditUndo(null);
  }

  // Revisión de cierre de ventas: reprograma un pedido de hoy sin confirmar
  // para mañana -- mismo mecanismo que editar y cambiar a "Programar" a
  // mano (devuelve el stock/ingreso de hoy, queda reservado sin comprometer).
  function postponeToTomorrow(order) {
    onEditOrder(order.orderId, {
      customerName: order.customerName,
      businessName: order.businessName,
      customerPhone: order.customerPhone,
      isDelivery: order.isDelivery,
      note: order.note,
      lines: order.lines.map((l) => ({ code: l.code, qty: l.qty })),
      bucket: "manana",
      date: tomorrowStr(),
      forceSent: false,
    });
  }

  // Confirmación de 2 toques -- misma mecánica que Eliminar (armar, esperar
  // 3s, o confirmar con un segundo toque) -- para no aplazar un pedido de
  // un toque accidental en el aviso de cierre de ventas.
  function handlePostponeClick(order) {
    if (confirmingPostponeId === order.orderId) {
      const armedAt = armedPostponeAtRef.current.get(order.orderId);
      if (armedAt && Date.now() - armedAt < DOUBLE_TAP_GUARD_MS) return;
      setConfirmingPostponeId(null);
      stagePostpone(order);
      return;
    }
    armedPostponeAtRef.current.set(order.orderId, Date.now());
    setConfirmingPostponeId(order.orderId);
    setTimeout(() => {
      setConfirmingPostponeId((current) => (current === order.orderId ? null : current));
    }, 3000);
  }

  // Igual que stageDelete: recién se reprograma de verdad cuando pasan los
  // 5s sin que se apriete "Deshacer". Mientras tanto el pedido se esconde
  // de las listas (pendingPostpones), pero nada del pedido cambió todavía.
  function stagePostpone(order) {
    const timeoutId = setTimeout(() => {
      postponeToTomorrow(order);
      setPendingPostpones((m) => {
        const next = new Map(m);
        next.delete(order.orderId);
        return next;
      });
    }, 5000);
    setPendingPostpones((m) => new Map(m).set(order.orderId, { timeoutId, customerName: order.customerName }));
  }

  function undoPostpone(orderId) {
    setPendingPostpones((m) => {
      const entry = m.get(orderId);
      if (entry) clearTimeout(entry.timeoutId);
      const next = new Map(m);
      next.delete(orderId);
      return next;
    });
  }

  function handleDeleteClick(order) {
    if (confirmingDeleteId === order.orderId) {
      const armedAt = armedDeleteAtRef.current.get(order.orderId);
      if (armedAt && Date.now() - armedAt < DOUBLE_TAP_GUARD_MS) return;
      setConfirmingDeleteId(null);
      stageDelete(order);
      return;
    }
    armedDeleteAtRef.current.set(order.orderId, Date.now());
    setConfirmingDeleteId(order.orderId);
    setTimeout(() => {
      setConfirmingDeleteId((current) => (current === order.orderId ? null : current));
    }, 3000);
  }

  // La tarjeta de pedido (a diferencia del aviso de cierre de ventas, que
  // sigue con el botón único que alterna a "¿Seguro?") arma la confirmación
  // reemplazando todo el pie por dos botones separados -- Cancelar y
  // Eliminar ya no son el mismo control tocado dos veces, así que no hace
  // falta el guard anti-doble-tap acá.
  function cancelDeleteArm() {
    setConfirmingDeleteId(null);
  }

  function confirmDeleteFromCard(order) {
    setConfirmingDeleteId(null);
    stageDelete(order);
  }

  // Borrado real recién pasa cuando expiran los 5s sin que se apriete
  // "Deshacer" -- nada se pierde hasta ese momento, el pedido solo se
  // esconde de las listas mientras tanto (pendingDeletes). Se guarda el
  // customerName ademas del timeout para poder mostrarlo en el aviso sin
  // tener que buscarlo en una lista de la que ya lo filtramos.
  function stageDelete(order) {
    const timeoutId = setTimeout(() => {
      onDeleteOrder(order.orderId);
      setPendingDeletes((m) => {
        const next = new Map(m);
        next.delete(order.orderId);
        return next;
      });
    }, 5000);
    setPendingDeletes((m) => new Map(m).set(order.orderId, { timeoutId, customerName: order.customerName }));
  }

  function undoDelete(orderId) {
    setPendingDeletes((m) => {
      const entry = m.get(orderId);
      if (entry) clearTimeout(entry.timeoutId);
      const next = new Map(m);
      next.delete(orderId);
      return next;
    });
  }

  function renderOrderRow(order, i, { showDate }) {
    const isDeleting = confirmingDeleteId === order.orderId;
    const allStepsDone = order.sentToCustomer && order.sent && order.confirmed;
    const statusColor = isDeleting ? "var(--red)" : allStepsDone ? "var(--green)" : "var(--orange-2)";
    const totalStr = formatCUP(orderTotal(order));
    const [totalNumber, totalUnit] = totalStr.split(" ");
    return (
      <div
        key={order.orderId}
        style={{
          display: "flex", alignItems: "stretch", background: "var(--surface)",
          border: `1px solid ${isDeleting ? "var(--danger-border)" : "var(--border)"}`,
          borderRadius: 12, overflow: "hidden",
        }}
      >
        <div style={{ width: 4, flexShrink: 0, background: statusColor }} />
        <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                {order.orderSeq && (
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 500, color: "var(--faintest)", fontVariantNumeric: "tabular-nums" }}>#{order.orderSeq}</span>
                )}
                {order.isDelivery && <MotoIcon size={15} color="var(--text)" />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {order.customerName}
                </span>
              </div>
              {sendBusinessName && order.businessName && (
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {order.businessName}
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              {showPrices && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 3, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{totalNumber}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--faint)" }}>{totalUnit}</span>
                </div>
              )}
              {showDate && (
                <span style={{
                  display: "inline-flex", marginTop: 4, background: "var(--banner-bg)", border: "1px solid var(--border-warn)",
                  borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 600, color: "var(--orange-text)",
                }}>
                  {formatDate(order.date)}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {[...order.lines]
              .sort((a, b) => {
                const nameA = products.find((p) => p.code === a.code)?.name || a.code;
                const nameB = products.find((p) => p.code === b.code)?.name || b.code;
                return nameA.localeCompare(nameB);
              })
              .map((line) => {
              const product = products.find((p) => p.code === line.code);
              const colors = productChipColors(product?.color);
              return (
                <span
                  key={line.code}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    borderRadius: 999, padding: "3px 9px",
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: colors.text }}>{product ? product.short : line.code}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.text, fontVariantNumeric: "tabular-nums" }}>x{line.qty}</span>
                </span>
              );
            })}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--faintest)", fontVariantNumeric: "tabular-nums" }}>
              {formatDateTime(order.timestamp)}
            </span>
          </div>

          {order.note && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "var(--surface-subtle)", borderLeft: "2px solid var(--border)", borderRadius: "0 7px 7px 0", padding: "6px 8px" }}>
              <span style={{ flexShrink: 0, marginTop: 1, fontSize: 12, color: "var(--faint)" }}>📝</span>
              <span style={{ fontSize: 12, fontStyle: "italic", color: "var(--muted)" }}>{order.note}</span>
            </div>
          )}

          {isDeleting ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid var(--hairline)" }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: "var(--red)" }}>
                Se elimina el pedido {order.orderSeq ? `#${order.orderSeq}` : ""}
              </div>
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={cancelDeleteArm}
                  style={{
                    height: 36, padding: "0 12px", borderRadius: 999, border: "1px solid var(--border-strong)",
                    background: "var(--surface)", color: "var(--text)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmDeleteFromCard(order)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 999,
                    border: "none", background: "var(--red)", color: "#FFFFFF", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Trash2 size={13} strokeWidth={1.9} /> Eliminar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid var(--hairline)" }}>
              <OrderStepTrack
                order={order}
                onMarkSentToCustomer={onMarkSentToCustomer}
                onMarkSent={onMarkSent}
                onMarkConfirmed={onMarkConfirmed}
                onSetOrderSteps={onSetOrderSteps}
                expanded={expandedCompletedTrackers.has(order.orderId)}
                onToggleExpanded={() => toggleTrackerExpanded(order.orderId)}
              />
              <div style={{ flexShrink: 0, width: 1, height: 34, background: "var(--hairline)" }} />
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                {order.customerPhone && (
                  <button
                    onClick={() => {
                      openOrderWhatsAppToCustomer(order, products);
                      onMarkSentToCustomer(order.orderId, true);
                    }}
                    title="Enviar copia al cliente"
                    aria-label="Enviar copia al cliente"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "var(--whatsapp)", border: "none", borderRadius: "50%", color: "#FFFFFF",
                      width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <WhatsAppIcon size={20} />
                  </button>
                )}
                <button
                  onClick={() => {
                    openOrderWhatsApp(order, products, whatsappPhone, senderOptions);
                    onMarkSent(order.orderId, true);
                  }}
                  title="Registrar (negocio)"
                  aria-label="Registrar (negocio)"
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: "var(--surface-subtle)", border: "1px solid var(--border-strong)", color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <Receipt size={15} strokeWidth={1.7} />
                  <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)" }}>FACT.</span>
                </button>
                <button
                  onClick={() => startEdit(order)}
                  title="Editar pedido"
                  aria-label="Editar pedido"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32, background: "transparent", border: "none", color: "var(--faint)", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <Pencil size={16} strokeWidth={1.8} />
                </button>
                <button
                  onClick={() => handleDeleteClick(order)}
                  title="Eliminar pedido"
                  aria-label="Eliminar pedido"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32, background: "transparent", border: "none", color: "var(--faint)", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Misma estructura para PEDIDOS DE HOY y PEDIDOS DE MAÑANA: título +
  // orden + lista (o mensaje vacío). Cada pedido tiene su propio botón de
  // envío por WhatsApp en la fila -- no hace falta un modo de selección
  // masiva acá.
  function renderOrdersSection({ title, sorted, emptyText, sortValue, onSortChange, showDate }) {
    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.07em", color: "var(--muted)", fontWeight: 800, textTransform: "uppercase" }}>{title}</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={sendBusinessName}
              onChange={(e) => onToggleSendBusinessName(e.target.checked)}
            />
            Mostrar negocio en todos los pedidos
          </label>
        </div>

        {sorted.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <select
              value={sortValue}
              onChange={(e) => onSortChange(e.target.value)}
              style={{
                border: "1px solid var(--border)", borderRadius: 7,
                padding: "7px 10px", fontSize: 12.5, background: "var(--surface)", color: "var(--text-muted)",
              }}
            >
              <option value="recent">Más recientes primero</option>
              <option value="oldest">Más antiguos primero</option>
              <option value="product">Alfabético por producto</option>
            </select>
          </div>
        )}

        {sorted.length === 0 ? (
          hasActiveFilters ? (
            <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
              <div style={{ marginBottom: 6 }}>Ningún pedido coincide con: {activeFilterLabels.join(" · ")}.</div>
              <button
                onClick={clearAllFilters}
                style={{
                  background: "transparent", border: "1px solid var(--border)", color: "var(--text)",
                  borderRadius: 7, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Quitar filtros
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>{emptyText}</div>
          )
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {sorted.map((order, i) => renderOrderRow(order, i, { showDate }))}
          </div>
        )}
      </div>
    );
  }

  const toasts = [
    ...Array.from(pendingDeletes.entries()).map(([orderId, { customerName: n }]) => ({
      key: `del-${orderId}`, message: `Pedido de ${n} eliminado.`, onUndo: () => undoDelete(orderId),
    })),
    ...Array.from(pendingPostpones.entries()).map(([orderId, { customerName: n }]) => ({
      key: `post-${orderId}`, message: `Pedido de ${n} programado para mañana.`, onUndo: () => undoPostpone(orderId),
    })),
    ...(pendingEditUndo ? [{ key: `edit-${pendingEditUndo.orderId}`, message: `Pedido de ${pendingEditUndo.customerName} editado.`, onUndo: undoEdit }] : []),
  ].filter((t) => !dismissedToastKeys.has(t.key));

  return (
    <div>
      <div style={{ background: "var(--segment-track)", borderRadius: 12, padding: 3, display: "flex", gap: 2, marginBottom: 16 }}>
        <button
          onClick={() => setActiveSection("hoy")}
          style={{
            flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer",
            background: activeSection === "hoy" ? "var(--ink)" : "transparent",
            color: activeSection === "hoy" ? "var(--cream)" : "var(--muted)",
            boxShadow: activeSection === "hoy" ? "0 1px 2px rgba(30,27,22,.06)" : "none",
          }}
        >
          Hoy
        </button>
        <button
          onClick={() => setActiveSection("manana")}
          style={{
            flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer",
            background: activeSection === "manana" ? "var(--ink)" : "transparent",
            color: activeSection === "manana" ? "var(--cream)" : "var(--muted)",
            boxShadow: activeSection === "manana" ? "0 1px 2px rgba(30,27,22,.06)" : "none",
          }}
        >
          Para mañana
        </button>
      </div>

      <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", alignItems: "stretch", marginBottom: 10 }}>
        <select
          value={filterProductCode}
          onChange={(e) => setFilterProductCode(e.target.value)}
          style={{
            flex: 1, minWidth: 0, boxSizing: "border-box", border: "none", background: "transparent",
            padding: "0 8px 0 12px", height: 44, fontSize: 14, fontWeight: 600, color: "var(--text)",
          }}
        >
          <option value="">Todos los productos</option>
          {filterableProducts.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        <div style={{ width: 1, background: "var(--border)", margin: "8px 0" }} />
        <button
          onClick={() => setSearchOpen(true)}
          title="Buscar cliente"
          aria-label="Buscar cliente"
          style={{
            flexShrink: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", cursor: "pointer",
            background: orderSearch ? "var(--ink)" : "transparent",
            color: orderSearch ? "var(--cream)" : "var(--muted)",
          }}
        >
          <Search size={16} />
        </button>
        <div style={{ width: 1, background: "var(--border)", margin: "8px 0" }} />
        <button
          onClick={clearAllFilters}
          style={{
            flexShrink: 0, padding: "0 14px", height: 44, background: "transparent", border: "none",
            color: "var(--faint)", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Limpiar
        </button>
      </div>

      {searchOpen && (
        <div
          onClick={() => setSearchOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,17,12,0.45)", zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 300, background: "var(--surface)", borderRadius: 16,
              padding: 18, boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Buscar cliente</span>
              <button
                onClick={() => setSearchOpen(false)}
                title="Cerrar"
                aria-label="Cerrar búsqueda"
                style={{
                  width: 26, height: 26, border: "none", background: "var(--surface-subtle)", borderRadius: 8,
                  color: "var(--faint)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Nombre del cliente"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
              style={{
                width: "100%", boxSizing: "border-box", height: 40, border: "1px solid var(--border)", borderRadius: 8,
                padding: "0 12px", fontSize: 14, fontFamily: "inherit", color: "var(--text)", background: "var(--surface-subtle)",
                marginBottom: 10,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto" }}>
              {matchCustomerNames(customerNamesList, orderSearch).slice(0, 8).map((name) => (
                <button
                  key={name}
                  onClick={() => { setOrderSearch(name); setSearchOpen(false); }}
                  style={{
                    padding: "10px 8px", fontSize: 13, color: "var(--text)", borderRadius: 8,
                    background: "none", border: "none", textAlign: "left", cursor: "pointer",
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {[
          { key: "unsent", label: "No facturados", active: filterUnsent, onClick: () => setFilterUnsent((v) => !v), count: filterCounts.unsent },
          { key: "unconfirmed", label: "No confirmados", active: filterUnconfirmed, onClick: () => setFilterUnconfirmed((v) => !v), count: filterCounts.unconfirmed },
          { key: "delivery", label: "Domicilio", active: filterDelivery, onClick: () => setFilterDelivery((v) => !v), count: filterCounts.delivery },
        ].map((chip) => (
          <button
            key={chip.key}
            onClick={chip.onClick}
            aria-pressed={chip.active}
            style={{
              display: "flex", alignItems: "center", gap: 6, minHeight: 44, padding: "10px 14px", borderRadius: 999,
              fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text)",
              border: `1px solid ${chip.active ? "var(--orange)" : "var(--border)"}`,
              background: chip.active ? "var(--banner-bg)" : "var(--surface)",
            }}
          >
            {chip.label}
            <span style={{ color: "var(--faint)", fontWeight: 700 }}>{chip.count}</span>
          </button>
        ))}
      </div>

      {activeSection === "hoy" && pastCierreDeVentas && unconfirmedTodayOrders.length > 0 && (
        <CierreDeVentasBanner
          unconfirmedTodayOrders={unconfirmedTodayOrders}
          cierreVentasHour={cierreVentasHour}
          confirmingPostponeId={confirmingPostponeId}
          confirmingDeleteId={confirmingDeleteId}
          onPostponeClick={handlePostponeClick}
          onDeleteClick={handleDeleteClick}
          onConfirmClick={(order) => onMarkConfirmed(order.orderId, true)}
        />
      )}

      {activeSection === "hoy" && renderOrdersSection({
        title: `PEDIDOS DE HOY (${totalTodayCount})`,
        sorted: sortedTodaysOrders,
        emptyText: "Aún no hay pedidos hoy.",
        sortValue: hoyOrderSort,
        onSortChange: setHoyOrderSort,
      })}

      {activeSection === "hoy" && (
        <div style={{ marginTop: 20 }}>
          <Today
            products={products}
            movements={todaysMovements}
            stock={stock}
            allOrders={allOrders}
            showPrices={showPrices}
            exchangeRate={exchangeRate}
            title="RESUMEN DE HOY"
            dailyHlGoal={dailyHlGoal}
            onProductClick={handleSummaryProductClick}
          />
        </div>
      )}

      {activeSection === "manana" && exchangeRate && upcomingOrders.some((o) => !o.sent) && (
        <button
          onClick={onRefreshPendingPrices}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
            background: "transparent", border: "1px solid var(--border)", color: "var(--text)",
            borderRadius: 7, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            marginBottom: 14,
          }}
          title="Recalcula el CUP de los pedidos programados sin facturar a la tasa de cambio actual -- los ya facturados no se tocan"
        >
          Actualizar a la tasa actual (1 USD = {exchangeRate})
        </button>
      )}

      {activeSection === "manana" && renderOrdersSection({
        title: `PRÓXIMOS PEDIDOS (${totalUpcomingCount})`,
        sorted: sortedUpcomingOrders,
        emptyText: "Aún no hay pedidos programados.",
        sortValue: mananaOrderSort,
        onSortChange: setMananaOrderSort,
        showDate: true,
      })}

      {activeSection === "manana" && (
        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <Today
            products={products}
            movements={mananaMovements}
            stock={stock}
            allOrders={allOrders}
            showPrices={showPrices}
            exchangeRate={exchangeRate}
            title="RESUMEN PENDIENTE"
            ordersLabel="PEDIDOS PENDIENTES"
            soldLabel="Pendiente"
            pendingMode
            onProductClick={handleSummaryProductClick}
          />
        </div>
      )}

      {activeSection === "manana" && reservablePanelRows.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>Disponible para reservar</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Stock libre después de reservas manuales</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px", gap: "6px 4px", fontSize: 11, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.04em", paddingBottom: 6, borderBottom: "1px solid var(--hairline)" }}>
            <div>Producto</div>
            <div style={{ textAlign: "right" }}>Reserv.</div>
            <div style={{ textAlign: "right" }}>Libres</div>
          </div>
          {reservablePanelRows.map(({ product: p, reserved, libre }) => (
            <div
              key={p.code}
              style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px", gap: "6px 4px", padding: "10px 0", borderBottom: "1px solid var(--hairline)", alignItems: "center" }}
            >
              <span style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              <span style={{ fontSize: 13, color: "var(--muted)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{reserved}</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", color: libre > 0 ? "var(--green)" : "var(--red)" }}>{libre}</span>
            </div>
          ))}
        </div>
      )}

      {pastOrdersCount > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowPast((s) => !s)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "transparent", border: "none", cursor: "pointer", padding: 0,
              marginBottom: showPast ? 10 : 0,
            }}
          >
            <span style={{ fontSize: 12, letterSpacing: "0.07em", color: "var(--muted)", fontWeight: 800, textTransform: "uppercase" }}>
              PEDIDOS ANTERIORES ({pastOrdersCount})
            </span>
            <ChevronDown size={16} color="var(--muted)" style={{ transition: "transform .2s", transform: `rotate(${showPast ? 180 : 0}deg)` }} />
          </button>

          {showPast && pastDatesDesc.map((date) => (
            <div key={date} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--faint)", textTransform: "uppercase", marginBottom: 6 }}>
                {formatDate(date)}
              </div>
              <div style={{ display: "grid", gap: 10, opacity: 0.85 }}>
                {pastOrdersByDate.get(date).map((order, i) => renderOrderRow(order, i, {}))}
              </div>
            </div>
          ))}
        </div>
      )}

      {toasts.length > 0 && (
        <div style={{ position: "fixed", left: 16, right: 16, bottom: 92, zIndex: 40, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map((t) => (
            <div
              key={t.key}
              style={{
                background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
                animation: "toastIn 0.2s ease-out",
              }}
            >
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{t.message}</span>
              <button
                onClick={t.onUndo}
                style={{ flexShrink: 0, background: "none", border: "none", color: "var(--ink)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}
              >
                Deshacer
              </button>
              <button
                onClick={() => dismissToast(t.key)}
                title="Cerrar"
                aria-label="Cerrar"
                style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: "none", background: "none", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={openNewOrderModal}
        title="Nuevo pedido"
        aria-label="Nuevo pedido"
        style={{
          position: "fixed", bottom: "calc(76px + env(safe-area-inset-bottom, 0px))", right: 20, width: 56, height: 56, borderRadius: "50%",
          background: "var(--ink)", color: "var(--cream)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)", zIndex: 40,
        }}
      >
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <OrderFormModal
        open={modalOpen}
        onClose={closeModal}
        editingOrderId={editingOrderId}
        editingOrderSeq={editingOrderSeq}
        draftBucket={draftBucket}
        onDraftBucketChange={setDraftBucket}
        draftDate={draftDate}
        onDraftDateChange={setDraftDate}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        businessName={businessName}
        onBusinessNameChange={setBusinessName}
        showBusinessSuggestions={showBusinessSuggestions}
        onShowBusinessSuggestions={setShowBusinessSuggestions}
        businessSuggestions={businessSuggestions}
        onPickBusinessSuggestion={pickBusinessSuggestion}
        customerPhone={customerPhone}
        onCustomerPhoneChange={setCustomerPhone}
        showSuggestions={showSuggestions}
        onShowSuggestions={setShowSuggestions}
        suggestions={suggestions}
        onPickSuggestion={pickSuggestion}
        nearDuplicateName={nearDuplicateName}
        onUseNearDuplicateName={() => setCustomerName(nearDuplicateName)}
        isDelivery={isDelivery}
        onIsDeliveryChange={setIsDelivery}
        note={note}
        onNoteChange={setNote}
        draftLines={draftLines}
        onUpdateDraftLineQty={updateDraftLineQty}
        onRemoveDraftLine={removeDraftLine}
        showPrices={showPrices}
        prices={prices}
        exchangeRate={exchangeRate}
        products={products}
        movements={movements}
        availableProducts={availableProducts}
        effectiveSelectedProductCode={effectiveSelectedProductCode}
        onSelectedProductCodeChange={setSelectedProductCode}
        computeAvailable={computeAvailable}
        pendingQty={pendingQty}
        onPendingQtyChange={setPendingQty}
        onAddDraftLine={addDraftLine}
        onConfirmOrder={confirmOrder}
        pendingReserveConfirm={pendingReserveConfirm}
        onConfirmUseReserve={confirmUseReserve}
        onCancelReserveConfirm={cancelReserveConfirm}
      />
    </div>
  );
}
