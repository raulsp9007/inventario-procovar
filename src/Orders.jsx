import { useState, useEffect, useRef, useMemo } from "react";
import { Trash2, Receipt, Pencil, ChevronDown, ChevronUp, CheckCheck, Search, X, Plus } from "lucide-react";
import { todayStr, tomorrowStr, formatDate, formatDateTime, getDateNDaysAgoStr } from "./dateUtils";
import { formatCUP } from "./money";
import { groupAllOrders, formatOrderForWhatsApp, formatOrderForCustomer, isCommittedOrder, reservedForTomorrow } from "./orderHelpers";
import { getCustomerNames, matchCustomerNames, getCustomerBusinessName, getCustomerPhone, findNearDuplicateCustomerName, toCubanPhone, cubanPhoneLocalPart } from "./customerHelpers";
import Banner from "./Banner.jsx";
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

export default function Orders({ products, movements, stock, prices, showPrices, exchangeRate, todaysMovements, mananaMovements, whatsappPhone, senderName, sendSenderName, sendBusinessName, onToggleSendBusinessName, onConfirmOrder, onEditOrder, onDeleteOrder, onMarkSent, onMarkConfirmed, onRefreshPendingPrices, onError, cierreVentasHour }) {
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
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [confirmingPostponeId, setConfirmingPostponeId] = useState(null);
  const [pendingDeletes, setPendingDeletes] = useState(() => new Map());
  const [pendingPostpones, setPendingPostpones] = useState(() => new Map());
  const [pendingEditUndo, setPendingEditUndo] = useState(null); // { orderId, customerName, revertDraft, timeoutId } | null
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
  const [activeSection, setActiveSection] = useState("hoy");
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
  if (filterUnsent) activeFilterLabels.push("no enviados");
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

    const allOrders = groupAllOrders(movements).filter((o) => !pendingDeletes.has(o.orderId) && !pendingPostpones.has(o.orderId));
    const todaysOrders = allOrders.filter((o) => belongsToToday(o) && matchesFilters(o));
    const sortedTodaysOrders = [...todaysOrders].sort((a, b) =>
      hoyOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
    );
    const upcomingOrders = allOrders.filter((o) => isUpcoming(o) && matchesFilters(o));
    const sortedUpcomingOrders = [...upcomingOrders].sort((a, b) =>
      mananaOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
    );
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
  }, [movements, today, pastCutoff, searchTerm, filterUnsent, filterUnconfirmed, filterDelivery, filterProductCode, hoyOrderSort, mananaOrderSort, pendingDeletes, pendingPostpones, activeSection]);

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

  const availableProducts = products.filter((p) => !p.archived && (stock[p.code] || 0) > 0 && !draftLines.some((l) => l.code === p.code));
  const effectiveSelectedProductCode = availableProducts.some((p) => p.code === selectedProductCode)
    ? selectedProductCode
    : (availableProducts[0]?.code || "");

  const customerNamesList = getCustomerNames(movements);
  const suggestions = showSuggestions
    ? matchCustomerNames(customerNamesList, customerName)
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

  function resetForm() {
    setCustomerName("");
    setBusinessName("");
    setCustomerPhone("");
    setIsDelivery(false);
    setNote("");
    setDraftLines([]);
    setPendingQty("");
    setEditingOrderId(null);
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
  // toca la reserva manual del producto):
  // - Si es para Hoy: stock actual (+ lo que este mismo pedido ya tenía
  //   comprometido, si se está editando uno que ya estaba comprometido).
  // - Si es para Mañana: lo mismo, menos lo que ya reservaron OTROS pedidos
  //   de mañana sin enviar (no se puede prometer más de lo que hay físico).
  // Con includeReserve=true da el TECHO real (cuánto hay contando la
  // reserva) -- se usa para saber si vale la pena avisar "¿usar la
  // reserva?" en vez de bloquear directo por falta de stock.
  function computeAvailable(code, { includeReserve = false } = {}) {
    const editingOrder = editingOrderId ? allOrders.find((o) => o.orderId === editingOrderId) : null;
    const creditBack = editingOrder && isCommittedOrder(editingOrder)
      ? (editingOrder.lines.find((l) => l.code === code)?.qty || 0)
      : 0;
    let base = (stock[code] || 0) + creditBack;
    if (draftBucket === "manana") base -= reservedForTomorrow(allOrders, code, editingOrderId);
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
        const motivo = draftBucket === "manana" ? ` para el ${formatDate(draftDate)} (ya reservado por otros pedidos)` : "";
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
      setConfirmingPostponeId(null);
      stagePostpone(order);
      return;
    }
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
      setConfirmingDeleteId(null);
      stageDelete(order);
      return;
    }
    setConfirmingDeleteId(order.orderId);
    setTimeout(() => {
      setConfirmingDeleteId((current) => (current === order.orderId ? null : current));
    }, 3000);
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
    return (
      <div
        key={order.orderId}
        style={{
          padding: "12px 16px", fontSize: 13.5,
          borderTop: i === 0 ? "none" : "1px solid var(--divider)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {order.orderSeq && (
                <span style={{ color: "var(--text-faint)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>#{order.orderSeq}</span>
              )}
              {order.isDelivery ? "🛺 " : ""}{order.customerName}
              {showDate && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "var(--accent-orange-soft-text)",
                  border: "1px solid var(--border-warn)", borderRadius: 5, padding: "1px 6px",
                }}>
                  {formatDate(order.date)}
                </span>
              )}
            </div>
            {sendBusinessName && order.businessName && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                {order.businessName}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {order.lines.map((line) => {
                const product = products.find((p) => p.code === line.code);
                const color = product?.color || "#8A8574";
                return (
                  <span
                    key={line.code}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      background: `${color}22`, border: `1px solid ${color}55`,
                      borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {product ? product.short : line.code} x{line.qty}
                  </span>
                );
              })}
            </div>
            {showPrices && (
              <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 6 }}>
                {formatCUP(orderTotal(order))}
              </div>
            )}
            <div style={{ color: "var(--text-faint-2)", fontSize: 11.5, marginTop: 4 }}>
              {formatDateTime(order.timestamp)}
            </div>
            {order.note && (
              <div style={{ color: "var(--warning-text)", fontSize: 12.5, marginTop: 4, fontStyle: "italic" }}>
                📝 {order.note}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={order.sent}
                  onChange={(e) => onMarkSent(order.orderId, e.target.checked)}
                />
                Enviado
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={order.confirmed}
                  onChange={(e) => onMarkConfirmed(order.orderId, e.target.checked)}
                />
                <CheckCheck size={13} /> Confirmado
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => startEdit(order)}
                title="Editar pedido"
                aria-label="Editar pedido"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)",
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => {
                  openOrderWhatsApp(order, products, whatsappPhone, senderOptions);
                  onMarkSent(order.orderId, true);
                }}
                title="Registrar (WhatsApp)"
                aria-label="Registrar (WhatsApp)"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--whatsapp)", color: "var(--on-accent)", border: "none",
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Receipt size={16} />
              </button>
              {order.customerPhone && (
                <button
                  onClick={() => openOrderWhatsAppToCustomer(order, products)}
                  title="Enviar copia al cliente"
                  aria-label="Enviar copia al cliente"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--whatsapp)", color: "var(--on-accent)", border: "none",
                    borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <WhatsAppIcon size={16} />
                </button>
              )}
              <button
                onClick={() => handleDeleteClick(order)}
                title={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                aria-label={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, width: confirmingDeleteId === order.orderId ? "auto" : 40, height: 40,
                  padding: confirmingDeleteId === order.orderId ? "0 10px" : 0,
                  background: confirmingDeleteId === order.orderId ? "var(--danger)" : "transparent",
                  border: confirmingDeleteId === order.orderId ? "1px solid var(--danger)" : "1px solid var(--border)",
                  color: confirmingDeleteId === order.orderId ? "var(--on-accent)" : "var(--text-muted)",
                  borderRadius: 7, cursor: "pointer", flexShrink: 0, fontSize: 12, fontWeight: 600,
                }}
              >
                <Trash2 size={14} />
                {confirmingDeleteId === order.orderId && "¿Seguro?"}
              </button>
            </div>
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
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>{title}</div>
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
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {sorted.map((order, i) => renderOrderRow(order, i, { showDate }))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setActiveSection("hoy")}
          style={{
            flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
            background: activeSection === "hoy" ? "var(--ink)" : "transparent",
            color: activeSection === "hoy" ? "var(--cream)" : "var(--text)",
          }}
        >
          Hoy
        </button>
        <button
          onClick={() => setActiveSection("manana")}
          style={{
            flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
            background: activeSection === "manana" ? "var(--ink)" : "transparent",
            color: activeSection === "manana" ? "var(--cream)" : "var(--text)",
          }}
        >
          Para mañana
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <select
          value={filterProductCode}
          onChange={(e) => setFilterProductCode(e.target.value)}
          style={{
            flex: 1, minWidth: 0, boxSizing: "border-box", borderRadius: 7,
            border: filterProductCode ? "1px solid var(--border-warn)" : "1px solid var(--border)",
            padding: "9px 12px", fontSize: 14, background: "var(--surface)", color: "var(--text)",
          }}
        >
          <option value="">Todos los productos</option>
          {filterableProducts.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={() => setSearchOpen(true)}
          title="Buscar cliente"
          aria-label="Buscar cliente"
          style={{
            flex: "0 0 auto", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 7, border: "1px solid var(--border)", cursor: "pointer",
            background: orderSearch ? "var(--ink)" : "transparent",
            color: orderSearch ? "var(--cream)" : "var(--text)",
          }}
        >
          <Search size={16} />
        </button>
        {orderSearch && (
          <button
            onClick={() => setOrderSearch("")}
            title="Limpiar búsqueda"
            aria-label="Limpiar búsqueda"
            style={{
              flex: "0 0 auto", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {searchOpen && (
        <div
          onClick={() => setSearchOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50,
            display: "flex", justifyContent: "center", padding: "80px 16px 0",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420, height: "fit-content",
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
              padding: 10, display: "flex", gap: 8, alignItems: "center",
            }}
          >
            <Search size={16} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
            <input
              autoFocus
              type="text"
              placeholder="Buscar cliente en pedidos"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
                fontSize: 14, color: "var(--text)",
              }}
            />
            <button
              onClick={() => setSearchOpen(false)}
              title="Cerrar"
              aria-label="Cerrar búsqueda"
              style={{
                flex: "0 0 auto", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnsent}
            onChange={(e) => setFilterUnsent(e.target.checked)}
          />
          No enviados ({filterCounts.unsent})
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnconfirmed}
            onChange={(e) => setFilterUnconfirmed(e.target.checked)}
          />
          No confirmados ({filterCounts.unconfirmed})
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterDelivery}
            onChange={(e) => setFilterDelivery(e.target.checked)}
          />
          Domicilio ({filterCounts.delivery})
        </label>
      </div>

      {pendingDeletes.size > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {Array.from(pendingDeletes.entries()).map(([orderId, { customerName: deletedName }]) => (
            <Banner
              key={orderId}
              variant="dark"
              layout="row"
              style={{ fontSize: 13 }}
              actions={[{ label: "Deshacer", kind: "secondary", onClick: () => undoDelete(orderId) }]}
            >
              Pedido de {deletedName} eliminado.
            </Banner>
          ))}
        </div>
      )}

      {pendingPostpones.size > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {Array.from(pendingPostpones.entries()).map(([orderId, { customerName: postponedName }]) => (
            <Banner
              key={orderId}
              variant="dark"
              layout="row"
              style={{ fontSize: 13 }}
              actions={[{ label: "Deshacer", kind: "secondary", onClick: () => undoPostpone(orderId) }]}
            >
              Pedido de {postponedName} programado para mañana.
            </Banner>
          ))}
        </div>
      )}

      {pendingEditUndo && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          <Banner
            variant="dark"
            layout="row"
            style={{ fontSize: 13 }}
            actions={[{ label: "Deshacer", kind: "secondary", onClick: undoEdit }]}
          >
            Pedido de {pendingEditUndo.customerName} editado.
          </Banner>
        </div>
      )}

      {activeSection === "hoy" && pastCierreDeVentas && unconfirmedTodayOrders.length > 0 && (
        <CierreDeVentasBanner
          unconfirmedTodayOrders={unconfirmedTodayOrders}
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
            showPrices={showPrices}
            exchangeRate={exchangeRate}
            title="RESUMEN DE HOY"
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
          title="Recalcula el CUP de los pedidos programados sin enviar a la tasa de cambio actual -- los ya enviados no se tocan"
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
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
            DISPONIBLE PARA RESERVAR
          </div>
          {reservablePanelRows.map(({ product: p, reserved, libre }, i) => (
            <div
              key={p.code}
              style={{
                display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--divider)",
              }}
            >
              <span>{p.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {reserved > 0 && <span style={{ color: "var(--accent-orange-soft-text)", marginRight: 8 }}>Reservado: {reserved}</span>}
                <b>{libre} libres</b>
              </span>
            </div>
          ))}
        </div>
      )}

      {pastOrdersCount > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowPast((s) => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
              color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
              padding: 0, marginBottom: showPast ? 10 : 0,
            }}
          >
            {showPast ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            PEDIDOS ANTERIORES ({pastOrdersCount})
          </button>

          {showPast && pastDatesDesc.map((date) => (
            <div key={date} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>
                {formatDate(date)}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {pastOrdersByDate.get(date).map((order, i) => renderOrderRow(order, i, {}))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={openNewOrderModal}
        title="Nuevo pedido"
        aria-label="Nuevo pedido"
        style={{
          position: "fixed", bottom: 24, right: 20, width: 56, height: 56, borderRadius: "50%",
          background: "var(--ink)", color: "var(--cream)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)", zIndex: 40,
        }}
      >
        <Plus size={26} />
      </button>

      <OrderFormModal
        open={modalOpen}
        onClose={closeModal}
        editingOrderId={editingOrderId}
        draftBucket={draftBucket}
        onDraftBucketChange={setDraftBucket}
        draftDate={draftDate}
        onDraftDateChange={setDraftDate}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        businessName={businessName}
        onBusinessNameChange={setBusinessName}
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
