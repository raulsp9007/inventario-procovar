import { useState } from "react";

export default function Settings({ whatsappPhone, onWhatsappPhoneChange, senderName, sendSenderName, onSenderSettingsChange }) {
  const [phoneInput, setPhoneInput] = useState(whatsappPhone || "");
  const [nameInput, setNameInput] = useState(senderName || "");
  const [sendChecked, setSendChecked] = useState(!!sendSenderName);

  function save() {
    const digits = phoneInput.replace(/\D/g, "");
    setPhoneInput(digits);
    onWhatsappPhoneChange(digits);
  }

  function saveSenderSettings(nextName, nextChecked) {
    setNameInput(nextName);
    setSendChecked(nextChecked);
    onSenderSettingsChange(nextName, nextChecked);
  }

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        CONFIGURACIÓN
      </div>

      <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Teléfono de WhatsApp</div>
        <div style={{ fontSize: 12, color: "#8A8574", marginBottom: 10 }}>
          Código de país + número, sin espacios ni "+". Ej: 5359XXXXXXX. Al enviar un pedido, se abre el chat directo con este número.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="5359XXXXXXX"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            style={{
              flex: "1 1 auto", border: "1px solid #E7E2D3", borderRadius: 7,
              padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            }}
          />
          <button
            onClick={save}
            style={{
              flex: "0 0 auto", background: "#22261F", color: "#F7F4EC", border: "none",
              borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Guardar
          </button>
        </div>
        {whatsappPhone && (
          <div style={{ fontSize: 12, color: "#8A8574", marginTop: 8 }}>
            Guardado: {whatsappPhone}
          </div>
        )}
      </div>

      <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "16px 18px", marginTop: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Enviar mi nombre</div>
        <div style={{ fontSize: 12, color: "#8A8574", marginBottom: 10 }}>
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
            width: "100%", border: "1px solid #E7E2D3", borderRadius: 7,
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
          <div style={{ fontSize: 12, color: "#8A8574", marginTop: 8 }}>
            Guardado: {senderName}
          </div>
        )}
      </div>
    </div>
  );
}
