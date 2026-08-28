import { useState } from "react";
import { Sun, Moon, Eye, EyeOff, RefreshCw } from "lucide-react";

function formatHour(h) {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

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
}) {
  const [phoneInput, setPhoneInput] = useState(whatsappPhone || "");
  const [contactNameInput, setContactNameInput] = useState(whatsappContactName || "");
  const [nameInput, setNameInput] = useState(senderName || "");
  const [sendChecked, setSendChecked] = useState(!!sendSenderName);
  const [pickerError, setPickerError] = useState("");
  const [clearingCache, setClearingCache] = useState(false);

  // Borra el service worker y el cache de la PWA (versión vieja de la app
  // que haya quedado servida offline) y recarga -- no toca `localStorage`,
  // así que los pedidos/stock/config quedan intactos.
  async function clearCacheAndReload() {
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
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Teléfono de WhatsApp</div>
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
          Pasada esta hora, en Pedidos vas a ver un aviso con los pedidos de hoy que sigan sin marcar Confirmado, para que decidas si eliminarlos o programarlos para mañana.
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
            <option key={h} value={h}>{formatHour(h)}</option>
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
      </div>
    </div>
  );
}
