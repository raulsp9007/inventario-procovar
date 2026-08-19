import { AlertTriangle, Eye, EyeOff, ChevronDown, ChevronUp, Download, Upload, Sun, Moon } from "lucide-react";
import { downloadBackup } from "./backup";
import TabButton from "./TabButton.jsx";
import Banner from "./Banner.jsx";
import ProductsView from "./ProductsView.jsx";
import WeeklySummary from "./WeeklySummary";
import Orders from "./Orders.jsx";
import Customers from "./Customers.jsx";
import Today from "./Today.jsx";
import Tomorrow from "./Tomorrow.jsx";
import Settings from "./Settings.jsx";
import { useInventoryStore, LOW_STOCK_THRESHOLD, lowStockThresholdFor } from "./useInventoryStore.js";

export default function InventoryApp() {
  const {
    products, stock, movements, lastAdjustedAt, prices,
    cumulativeRevenue, cumulativeHl, exchangeRate, setExchangeRate, commissionPercent, setCommissionPercent,
    showPrices, setShowPrices, hlGoal, setHlGoal,
    whatsappPhone, setWhatsappPhone, senderName, setSenderName, sendSenderName, setSendSenderName,
    loaded, saveState, error, setError,
    editMode, editInputs, setEditInputs, editPriceInputs, setEditPriceInputs,
    editNameInputs, setEditNameInputs, editHlInputs, setEditHlInputs,
    editLowStockInputs, setEditLowStockInputs,
    newProductName, setNewProductName, newProductHl, setNewProductHl,
    showArchived, setShowArchived, showLowStockList, setShowLowStockList,
    pendingImport, setPendingImport, fileInputRef,
    view, setView, theme, toggleTheme,
    currentPersistedState, persist,
    handleImportFileChange, confirmImport,
    todaysMovements, mananaMovements,
    activeProducts, archivedProducts, totalStock, lowStockCount, todaysUnitsSold, pendingTodayFor,
    openEdit, addProduct, saveEdit, archiveProduct, restoreProduct, moveProduct,
    registerManualSale,
    confirmOrder, deleteOrder, editOrder, markOrderSent, markOrdersSent,
    renameCustomer, markOrderConfirmed,
  } = useInventoryStore();

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ color: "var(--text-faint)", fontSize: 14, letterSpacing: "0.05em" }}>CARGANDO INVENTARIO…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "'Inter', system-ui, sans-serif", color: "var(--text)", paddingBottom: 48 }}>
      <style>{`
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .rowfade { animation: fadeIn 0.25s ease; }
      `}</style>

      <div style={{ background: "var(--ink)", color: "var(--cream)", padding: "24px 16px 20px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--on-ink-label)", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · CONTROL DE STOCK</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>Inventario diario</h1>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--on-ink-subtitle)", letterSpacing: "0.06em" }}>UNIDADES TOTALES</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totalStock}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--on-ink-subtitle)", letterSpacing: "0.06em" }}>VENDIDO HOY</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--on-ink-accent)" }}>{todaysUnitsSold}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 16px 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
        <TabButton active={view === "hoy"} onClick={() => setView("hoy")}>Hoy</TabButton>
        <TabButton active={view === "manana"} onClick={() => setView("manana")}>Mañana</TabButton>
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
            borderRadius: 7, border: "1px solid var(--text)",
            background: "transparent", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {showPrices ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          aria-label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          style={{
            flex: "0 0 auto", width: 40, padding: "9px", cursor: "pointer",
            borderRadius: 7, border: "1px solid var(--text)",
            background: "transparent", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px 0" }}>
        {lowStockCount > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowLowStockList((s) => !s)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                background: "var(--banner-warning-bg)", border: "1px solid var(--border-warn)", color: "var(--warning-text)",
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
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-warn)", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                {activeProducts
                  .filter((p) => (stock[p.code] || 0) > 0 && (stock[p.code] || 0) <= lowStockThresholdFor(p))
                  .map((p, i) => (
                    <div
                      key={p.code}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "9px 14px", fontSize: 13, borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: "var(--warning-text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
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
          <Banner variant="error" style={{ marginBottom: 16 }}>{error}</Banner>
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
            onMoveProduct={moveProduct}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            onRegisterManualSale={registerManualSale}
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
            lowStockThresholdFor={lowStockThresholdFor}
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
          <Customers products={products} movements={movements} showPrices={showPrices} onRenameCustomer={renameCustomer} />
        )}

        {view === "hoy" && (
          <Today
            products={products}
            movements={todaysMovements}
            stock={stock}
            showPrices={showPrices}
            exchangeRate={exchangeRate}
          />
        )}

        {view === "manana" && (
          <Tomorrow
            products={products}
            movements={mananaMovements}
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
          <Banner
            variant="warning"
            style={{ marginTop: 20 }}
            actions={[
              { label: "Sí, reemplazar", kind: "primary", onClick: confirmImport },
              { label: "Cancelar", kind: "secondary", onClick: () => setPendingImport(null) },
            ]}
          >
            Vas a reemplazar TODOS los datos actuales con el archivo importado. Esta acción no se puede deshacer.
          </Banner>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 8 }}>
          <button
            onClick={() => downloadBackup(currentPersistedState)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)",
              borderRadius: 7, padding: "7px 12px", fontSize: 12, cursor: "pointer",
            }}
          >
            <Download size={13} /> Exportar datos
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)",
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

        <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-faint-2)", textAlign: "center" }}>
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : "Los datos se guardan automáticamente en este dispositivo"}
        </div>
      </div>
    </div>
  );
}
