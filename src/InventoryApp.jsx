import { AlertTriangle, ChevronDown, ChevronUp, Download, Upload } from "lucide-react";
import { downloadBackup } from "./backup";
import RadialNav, { VIEW_LABELS } from "./RadialNav.jsx";
import Banner from "./Banner.jsx";
import ProductsView from "./ProductsView.jsx";
import WeeklySummary from "./WeeklySummary";
import Orders from "./Orders.jsx";
import Portfolio from "./Portfolio.jsx";
import Customers from "./Customers.jsx";
import Settings from "./Settings.jsx";
import { useInventoryStore, LOW_STOCK_THRESHOLD, MOVEMENTS_CAP, lowStockThresholdFor } from "./useInventoryStore.js";

export default function InventoryApp() {
  const {
    products, stock, movements, lastAdjustedAt, prices,
    cumulativeRevenue, cumulativeHl, exchangeRate, setExchangeRate, commissionPercent, setCommissionPercent,
    showPrices, setShowPrices, hlGoal, setHlGoal,
    whatsappPhone, setWhatsappPhone, whatsappContactName, setWhatsappContactName,
    cierreVentasHour, setCierreVentasHour,
    senderName, setSenderName, sendSenderName, setSendSenderName,
    sendBusinessName, setSendBusinessNameSetting,
    loaded, saveState, error, setError,
    editMode, editInputs, setEditInputs, editPriceInputs, setEditPriceInputs,
    editNameInputs, setEditNameInputs, editHlInputs, setEditHlInputs,
    editLowStockInputs, setEditLowStockInputs,
    editColorInputs, setEditColorInputs,
    newProductName, setNewProductName, newProductHl, setNewProductHl,
    showArchived, setShowArchived, showLowStockList, setShowLowStockList,
    pendingImport, setPendingImport, fileInputRef,
    view, setView, theme, toggleTheme,
    currentPersistedState, persist,
    handleImportFileChange, confirmImport,
    todaysMovements, mananaMovements,
    activeProducts, archivedProducts, totalStock, lowStockCount, todaysUnitsSold, pendingTodayFor,
    movementsNearCap,
    openEdit, addProduct, saveEdit, archiveProduct, restoreProduct, moveProduct,
    registerManualSale,
    confirmOrder, deleteOrder, editOrder, markOrderSent,
    updateCustomer, markOrderConfirmed,
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

      <RadialNav view={view} setView={setView} />

      <div style={{ background: "var(--ink)", color: "var(--cream)", padding: "24px 16px 20px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--on-ink-label)", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · GESTOR DE VENTAS</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>Control de inventario</h1>
            <div style={{ fontSize: 12.5, color: "var(--on-ink-subtitle)", marginTop: 6 }}>{VIEW_LABELS[view] || ""}</div>
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

        {movementsNearCap && (
          <Banner
            variant="warning"
            style={{ marginBottom: 16 }}
            actions={[{ label: "Exportar respaldo", kind: "dark", onClick: () => downloadBackup(currentPersistedState) }]}
          >
            El historial de movimientos está por llenarse ({movements.length}/{MOVEMENTS_CAP}). Exportá un respaldo pronto -- al llegar al tope, los movimientos más viejos se empiezan a perder.
          </Banner>
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
            exchangeRate={exchangeRate}
            onExchangeRateChange={(next) => {
              setExchangeRate(next);
              persist({ ...currentPersistedState, exchangeRate: next });
            }}
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
            editColorInputs={editColorInputs}
            setEditColorInputs={setEditColorInputs}
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
            exchangeRate={exchangeRate}
            todaysMovements={todaysMovements}
            mananaMovements={mananaMovements}
            whatsappPhone={whatsappPhone}
            senderName={senderName}
            sendSenderName={sendSenderName}
            sendBusinessName={sendBusinessName}
            onToggleSendBusinessName={() => setSendBusinessNameSetting(!sendBusinessName)}
            onConfirmOrder={confirmOrder}
            onEditOrder={editOrder}
            onDeleteOrder={deleteOrder}
            onMarkSent={markOrderSent}
            onMarkConfirmed={markOrderConfirmed}
            onError={(message) => {
              setError(message);
              setTimeout(() => setError(""), 2500);
            }}
            cierreVentasHour={cierreVentasHour}
          />
        )}

        {view === "portafolio" && (
          <Portfolio products={products} movements={movements} showPrices={showPrices} />
        )}

        {view === "clientes" && (
          <Customers
            products={products}
            movements={movements}
            showPrices={showPrices}
            onUpdateCustomer={updateCustomer}
          />
        )}

        {view === "config" && (
          <Settings
            whatsappPhone={whatsappPhone}
            onWhatsappPhoneChange={(next) => {
              setWhatsappPhone(next);
              persist({ ...currentPersistedState, whatsappPhone: next });
            }}
            whatsappContactName={whatsappContactName}
            onWhatsappContactNameChange={(next) => {
              setWhatsappContactName(next);
              persist({ ...currentPersistedState, whatsappContactName: next });
            }}
            cierreVentasHour={cierreVentasHour}
            onCierreVentasHourChange={(next) => {
              setCierreVentasHour(next);
              persist({ ...currentPersistedState, cierreVentasHour: next });
            }}
            senderName={senderName}
            sendSenderName={sendSenderName}
            onSenderSettingsChange={(nextSenderName, nextSendSenderName) => {
              setSenderName(nextSenderName);
              setSendSenderName(nextSendSenderName);
              persist({ ...currentPersistedState, senderName: nextSenderName, sendSenderName: nextSendSenderName });
            }}
            theme={theme}
            onToggleTheme={toggleTheme}
            showPrices={showPrices}
            onToggleShowPrices={() => {
              const next = !showPrices;
              setShowPrices(next);
              persist({ ...currentPersistedState, showPrices: next });
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
