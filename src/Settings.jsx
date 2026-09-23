import { useState } from "react";
import { Sun, Moon, Eye, EyeOff, RefreshCw } from "lucide-react";
import { COPYRIGHT_NOTICE, LICENSE_SUMMARY } from "./legal.js";
import { formatHour12 } from "./dateUtils.js";
import { usePwaStatus } from "./pwaStatus.js";
import ConnectionStatus from "./ConnectionStatus.jsx";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

// El picker de contactos del navegador (Contact Picker API) solo existe en
// Chrome/Android por ahora -- en iPhone o desktop no aparece el botón, no
// tiene sentido ofrecer algo que va a fallar siempre.
const CONTACT_PICKER_SUPPORTED =
  typeof navigator !== "undefined" && "contacts" in navigator && typeof window !== "undefined" && "ContactsManager" in window;

export default function Settings({
  whatsappPhone, onWhatsappPhoneChange,
  whatsappContactName, onWhatsappContactNameChange,
  cierreVentasHour, onCierreVentasHourChange,
  senderName, sendSenderName, onSenderSettingsChange,
  theme, onToggleTheme,
  showPrices, onToggleShowPrices,
  commissionPercent, hlGoal, sendBusinessName,
  topSlot,
}) {
  const [phoneInput, setPhoneInput] = useState(whatsappPhone || "");
  const [contactNameInput, setContactNameInput] = useState(whatsappContactName || "");
  const [nameInput, setNameInput] = useState(senderName || "");
  const [sendChecked, setSendChecked] = useState(!!sendSenderName);
  const [pickerError, setPickerError] = useState("");
  const [clearingCache, setClearingCache] = useState(false);
  const [clearCacheError, setClearCacheError] = useState("");
  const pwaStatus = usePwaStatus();

  // Borra el service worker y el cache de la PWA (versión vieja de la app
  // que haya quedado servida offline) y recarga -- no toca `localStorage`,
  // así que los pedidos/stock/config quedan intactos.
  // Sin conexión esto es contraproducente: borra lo único que la app tiene
  // para funcionar offline (el precache) y no hay manera de traer nada
  // nuevo, así que el navegador cae a su propia caché HTTP -- que puede
  // tener una versión de index.html/JS más vieja que la que se veía antes
  // de tocar el botón. Por eso, sin conexión, no se toca nada.
  async function clearCacheAndReload() {
    if (pwaStatus.offline) {
      setClearCacheError("Necesitas internet para esto. Sin conexión no hay una versión nueva que traer, y podrías terminar viendo una todavía más vieja.");
      return;
    }
    setClearCacheError("");
    setClearingCache(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  }

  function save() {
    const digits = phoneInput.replace(/\D/g, "");
    setPhoneInput(digits);
    onWhatsappPhoneChange(digits);
  }

  async function pickContact() {
    setPickerError("");
    try {
      const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
      const contact = contacts && contacts[0];
      const tel = contact?.tel?.[0]?.replace(/\D/g, "") || "";
      if (!tel) {
        setPickerError("Ese contacto no tiene número de teléfono.");
        return;
      }
      const name = contact?.name?.[0] || "";
      setPhoneInput(tel);
      setContactNameInput(name);
      onWhatsappPhoneChange(tel);
      onWhatsappContactNameChange(name);
    } catch {
      // Usuario canceló el picker -- no es un error real, no hace falta avisar.
    }
  }

  function saveSenderSettings(nextName, nextChecked) {
    setNameInput(nextName);
    setSendChecked(nextChecked);
    onSenderSettingsChange(nextName, nextChecked);
  }

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
        CONFIGURACIÓN
      </div>

      <ConnectionStatus offline={pwaStatus.offline} updateAvailable={pwaStatus.updateAvailable} lastOnlineAt={pwaStatus.lastOnlineAt} />

      {topSlot}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Apariencia</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Cambia el tema de toda la app.
        </div>
        <button
          onClick={onToggleTheme}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "transparent", border: "1px solid var(--border)", color: "var(--text)",
            borderRadius: 7, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            marginBottom: 14,
          }}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        </button>

        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Oculta precios e ingresos en toda la app (útil para no mostrar plata al enseñar la pantalla).
        </div>
        <button
          onClick={onToggleShowPrices}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "transparent", border: "1px solid var(--border)", color: "var(--text)",
            borderRadius: 7, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          {showPrices ? <Eye size={16} /> : <EyeOff size={16} />}
          {showPrices ? "Ocultar precios" : "Mostrar precios"}
        </button>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Facturador(a)</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Código de país + número, sin espacios ni "+". Ej: 5359XXXXXXX. Al enviar un pedido, se abre el chat directo con este número.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="5359XXXXXXX"
            value={phoneInput}
            onChange={(e) => { setPhoneInput(e.target.value); setContactNameInput(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            onBlur={save}
            style={{
              flex: "1 1 auto", minWidth: 140, border: "1px solid var(--border)", borderRadius: 7,
              padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            }}
          />
          <button
            onClick={save}
            style={{
              flex: "0 0 auto", background: "var(--ink)", color: "var(--cream)", border: "none",
              borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Guardar
          </button>
        </div>
        {CONTACT_PICKER_SUPPORTED && (
          <button
            onClick={pickContact}
            style={{
              marginTop: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)",
              borderRadius: 7, padding: "7px 12px", fontSize: 12.5, cursor: "pointer",
            }}
          >
            Elegir contacto
          </button>
        )}
        {pickerError && (
          <div style={{ fontSize: 12, color: "var(--error-text)", marginTop: 8 }}>{pickerError}</div>
        )}
        {whatsappPhone && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Guardado: {whatsappContactName ? `${whatsappContactName} · ${whatsappPhone}` : whatsappPhone}
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Cierre de ventas</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Pasada esta hora, los pedidos nuevos se guardan para mañana y ves un aviso con lo que quedó pendiente hoy, para que decidas si eliminarlo o programarlo para mañana. Las ventas manuales y editar pedidos de hoy siguen permitidos.
        </div>
        <select
          value={cierreVentasHour ?? ""}
          onChange={(e) => onCierreVentasHourChange(e.target.value === "" ? null : Number(e.target.value))}
          style={{
            width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, background: "var(--surface)", color: "var(--text)",
          }}
        >
          <option value="">Desactivado</option>
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>{formatHour12(h)}</option>
          ))}
        </select>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Enviar mi nombre</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Si está activo, cada mensaje de WhatsApp de un pedido empieza con tu nombre.
        </div>
        <input
          type="text"
          placeholder="Tu nombre"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={() => saveSenderSettings(nameInput, sendChecked)}
          onKeyDown={(e) => { if (e.key === "Enter") saveSenderSettings(nameInput, sendChecked); }}
          style={{
            width: "100%", border: "1px solid var(--border)", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 10,
          }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={sendChecked}
            onChange={(e) => saveSenderSettings(nameInput, e.target.checked)}
          />
          Enviar mi nombre en los mensajes
        </label>
        {sendSenderName && senderName && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Guardado: {senderName}
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Otros ajustes</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Se editan junto al número que afectan, para ver el efecto al toque.
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>Comisión (en Resumen)</span>
            <span style={{ fontWeight: 600 }}>{commissionPercent > 0 ? `${commissionPercent}%` : "sin definir"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>Meta HL (en Resumen)</span>
            <span style={{ fontWeight: 600 }}>{hlGoal != null ? `${hlGoal} hL` : "sin definir"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>Mostrar negocio en pedidos (en Clientes)</span>
            <span style={{ fontWeight: 600 }}>{sendBusinessName ? "Sí" : "No"}</span>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Actualizar app</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Si la app se ve rara o desactualizada, borra la caché y recarga. No toca tus pedidos ni el stock -- eso se guarda aparte.
        </div>
        <button
          onClick={clearCacheAndReload}
          disabled={clearingCache}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "transparent", border: "1px solid var(--border)", color: "var(--text)",
            borderRadius: 7, padding: "9px 14px", fontSize: 13.5, fontWeight: 600,
            cursor: clearingCache ? "default" : "pointer", opacity: clearingCache ? 0.6 : 1,
          }}
        >
          <RefreshCw size={16} />
          {clearingCache ? "Borrando caché…" : "Borrar caché y recargar"}
        </button>
        {clearCacheError && (
          <div style={{ fontSize: 12, color: "var(--error-text)", marginTop: 8 }}>{clearCacheError}</div>
        )}
      </div>

      <div style={{ marginTop: 14, padding: "4px 6px 8px", textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Inventario Procovar</div>
        <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>{COPYRIGHT_NOTICE}</div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, lineHeight: 1.4 }}>{LICENSE_SUMMARY}</div>
      </div>
    </div>
  );
}
