import { useState } from "react";

// El picker de contactos del navegador (Contact Picker API) solo existe en
// Chrome/Android por ahora -- en iPhone o desktop no aparece el botón, no
// tiene sentido ofrecer algo que va a fallar siempre.
const CONTACT_PICKER_SUPPORTED =
  typeof navigator !== "undefined" && "contacts" in navigator && typeof window !== "undefined" && "ContactsManager" in window;

// Tarjeta de Config para un contacto de WhatsApp (teléfono + nombre opcional
// sacado de la agenda). La usan Facturador(a) y Supervisor(a): misma forma,
// distinto título, texto y dato guardado.
export default function WhatsappContactCard({
  title, description, inputLabel,
  phone, onPhoneChange,
  contactName, onContactNameChange,
  marginTop = 0,
}) {
  const [phoneInput, setPhoneInput] = useState(phone || "");
  const [pickerError, setPickerError] = useState("");

  function save() {
    const digits = phoneInput.replace(/\D/g, "");
    setPhoneInput(digits);
    onPhoneChange(digits);
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
      onPhoneChange(tel);
      onContactNameChange(name);
    } catch {
      // Usuario canceló el picker -- no es un error real, no hace falta avisar.
    }
  }

  return (
    <div
      data-contact-card
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{description}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="5359XXXXXXX"
          aria-label={inputLabel}
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
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
      {phone && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          Guardado: {contactName ? `${contactName} · ${phone}` : phone}
        </div>
      )}
    </div>
  );
}
