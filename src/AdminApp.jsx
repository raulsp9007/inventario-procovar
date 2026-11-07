import { useEffect, useRef, useState } from "react";
import SalesSummary from "./SalesSummary.jsx";
import ShipmentsSummary from "./ShipmentsSummary.jsx";
import { clock12 } from "./cierreFacturacion";
import { Copy, RefreshCw, Power, Check } from "lucide-react";
import { useAdmin } from "./useAdmin";
import { makeLinkCode } from "./linkCode";
import { buildVendorMessage, buildAccessMessage } from "./vendorMessage";

// Sitio de administración (admin.html): el administrador maneja los nombres y los
// enlaces de los vendedores. La lógica vive en useAdmin; acá solo está la pantalla.

const pageStyle = { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 60 };
const column = { maxWidth: 980, margin: "0 auto" };
const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 12 };
const button = { height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface-subtle)", color: "var(--text)", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const primary = { ...button, border: "none", background: "var(--ink)", color: "var(--cream)", fontWeight: 700 };
const inputStyle = { height: 36, boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", color: "var(--text)" };

function useTheme() {
  useEffect(() => {
    let theme = "light";
    try {
      const saved = localStorage.getItem("procovar-theme");
      if (saved === "dark" || saved === "light") theme = saved;
      else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
    } catch {
      theme = "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
    document.title = "Administración Procovar";
  }, []);
}

function Header({ title, subtitle, children }) {
  return (
    <div style={{ background: "var(--ink)", color: "var(--cream)", padding: "18px 20px" }}>
      <div style={{ ...column, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--on-ink-label)", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · ADMINISTRACIÓN</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 12.5, color: "var(--on-ink-subtitle)", marginTop: 4 }}>{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

function LinkScreen({ onLink, onSignIn, notice, onNoticeClear }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [signError, setSignError] = useState("");
  const [signing, setSigning] = useState(false);

  async function signIn() {
    setSignError("");
    if (!usuario.trim() || !clave) {
      setSignError("Escribe el usuario y la contraseña.");
      return;
    }
    setSigning(true);
    try {
      await onSignIn({ usuario, clave });
    } catch (e) {
      setSignError(e && e.message ? e.message : "No se pudo entrar.");
    } finally {
      setSigning(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onLink(code);
    } catch (e) {
      setError(e && e.message ? e.message : "No se pudo enlazar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={pageStyle}>
      <Header title="Administración" subtitle="Entra con tu usuario y contraseña, o con tu código de administrador." />
      <div style={{ ...column, padding: 20, maxWidth: 560 }}>
        {onSignIn && (
          <div role="group" aria-label="Entrar con usuario y contraseña" style={{ ...card, marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Entrar con usuario y contraseña</div>
            <input
              aria-label="Usuario"
              placeholder="Usuario"
              value={usuario}
              maxLength={40}
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => { setUsuario(e.target.value); setSignError(""); }}
              style={{ ...inputStyle, width: "100%", height: 42, marginBottom: 10 }}
            />
            <input
              type="password"
              aria-label="Contraseña"
              placeholder="Contraseña"
              value={clave}
              maxLength={100}
              autoComplete="current-password"
              onChange={(e) => { setClave(e.target.value); setSignError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
              style={{ ...inputStyle, width: "100%", height: 42, marginBottom: 10 }}
            />
            <button type="button" onClick={signIn} disabled={signing} style={{ ...primary, width: "100%", height: 42, justifyContent: "center", fontSize: 14 }}>Entrar</button>
            {signError && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 10 }}>{signError}</div>}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>O pega tu código de administrador:</div>
        <input
          type="text"
          aria-label="Código de enlace"
          placeholder="Pega el código de enlace"
          value={code}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => { setCode(e.target.value); setError(""); if (onNoticeClear) onNoticeClear(); }}
          style={{ ...inputStyle, width: "100%", height: 42, marginBottom: 10 }}
        />
        <button type="button" onClick={submit} disabled={busy} style={{ ...primary, width: "100%", height: 42, justifyContent: "center", fontSize: 14 }}>Enlazar</button>
        {(error || notice) && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 10 }}>{error || notice}</div>}
      </div>
    </div>
  );
}

function VendorRow({ vendor, busy, codeOf, onRename, onToggle, onRegenerate, onCopy }) {
  const [draft, setDraft] = useState(vendor.name);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setDraft(vendor.name); }, [vendor.name]);
  const changed = draft.trim() !== vendor.name;
  const on = vendor.active;

  return (
    <div data-vendor-id={vendor.id} style={{ ...card, opacity: on ? 1 : 0.7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          data-name
          aria-label={`Nombre de ${vendor.name}`}
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && changed) onRename(vendor.id, draft); if (e.key === "Escape") setDraft(vendor.name); }}
          style={{ ...inputStyle, flex: "1 1 200px", minWidth: 0, fontWeight: 700 }}
        />
        {changed && (
          <button type="button" aria-label={`Guardar nombre de ${vendor.name}`} disabled={busy} onClick={() => onRename(vendor.id, draft)} style={primary}>
            <Check size={14} strokeWidth={2.6} aria-hidden="true" /> Guardar
          </button>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", border: `1px solid ${on ? "var(--green)" : "var(--border-strong)"}`, color: on ? "var(--green)" : "var(--text-muted)" }}>
          {on ? "Activo" : "Desactivado"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" aria-label={`Copiar código de ${vendor.name}`} onClick={() => onCopy(codeOf(vendor), "Código copiado")} style={button}>
          <Copy size={13} strokeWidth={2.2} aria-hidden="true" /> Copiar código
        </button>
        <button type="button" aria-label={`Copiar mensaje para ${vendor.name}`} onClick={() => onCopy(buildVendorMessage(vendor.name, codeOf(vendor)), "Mensaje copiado")} style={button}>
          <Copy size={13} strokeWidth={2.2} aria-hidden="true" /> Copiar mensaje
        </button>
        <button type="button" aria-label={`Regenerar enlace de ${vendor.name}`} onClick={() => setConfirming(true)} style={button}>
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" /> Regenerar enlace
        </button>
        <button type="button" aria-label={on ? `Desactivar a ${vendor.name}` : `Reactivar a ${vendor.name}`} disabled={busy} onClick={() => onToggle(vendor.id, !on)} style={button}>
          <Power size={13} strokeWidth={2.2} aria-hidden="true" /> {on ? "Desactivar" : "Reactivar"}
        </button>
      </div>

      {confirming && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "var(--banner-bg)", border: "1px solid var(--border-warn)", fontSize: 13 }}>
          El código anterior dejará de servir: {vendor.name} tendrá que enlazar de nuevo con el código nuevo.
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" disabled={busy} onClick={() => { setConfirming(false); onRegenerate(vendor.id); }} style={primary}>Sí, regenerar</button>
            <button type="button" onClick={() => setConfirming(false)} style={button}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const PASSWORD_MIN = 8;

const ROLE_INFO = {
  facturacion: { label: "Facturación", blurb: "Hace todo: ve y confirma pedidos, y los deshace." },
  supervision: { label: "Supervisión", blurb: "Solo lectura: ve los pedidos con sus estados, sin poder confirmar nada." },
  administrador: { label: "Administrador", blurb: "Maneja este sitio: vendedores, usuarios, horarios y ajustes." },
};

// Un usuario con usuario y contraseña (de facturación, de supervisión o administrador). La contraseña
// no vuelve del buzón: solo se conoce mientras se acaba de escribir (`known`).
function UserCard({ account, known, busy, siteUrl, onSave, onCopy, onKnown }) {
  const [usuario, setUsuario] = useState(account.usuario);
  const [clave, setClave] = useState("");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");
  // (Al cambiar el usuario guardado, la tarjeta se vuelve a crear: ver `key` en AdminApp.)
  const info = ROLE_INFO[account.rol] || { label: account.rol, blurb: "" };

  async function changePassword() {
    setError("");
    if (clave.length < PASSWORD_MIN) return setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
    if (await onSave(account.id, { clave })) { onKnown(account.usuario, clave); setClave(""); setChanging(false); }
    return undefined;
  }

  const on = account.activo;
  const changedName = usuario.trim() !== account.usuario;

  return (
    <div role="group" aria-label={`Usuario ${account.usuario}`} style={{ ...card, opacity: on ? 1 : 0.7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "var(--surface-subtle)", border: "1px solid var(--border-strong)" }}>{info.label}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", border: `1px solid ${on ? "var(--green)" : "var(--border-strong)"}`, color: on ? "var(--green)" : "var(--text-muted)" }}>
          {on ? "Activo" : "Desactivado"}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>{info.blurb}</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          aria-label="Usuario"
          placeholder="Usuario"
          value={usuario}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => { setUsuario(e.target.value); setError(""); }}
          style={{ ...inputStyle, flex: "1 1 180px", minWidth: 0 }}
        />
        {changedName && (
          <button type="button" disabled={busy} onClick={() => onSave(account.id, { usuario: usuario.trim() })} style={primary}>
            <Check size={14} strokeWidth={2.6} aria-hidden="true" /> Guardar usuario
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" onClick={() => { setChanging((v) => !v); setClave(""); setError(""); }} style={button}>Cambiar contraseña</button>
        <button type="button" disabled={busy} onClick={() => onSave(account.id, { activo: !on })} style={button}>
          <Power size={13} strokeWidth={2.2} aria-hidden="true" /> {on ? "Desactivar" : "Reactivar"}
        </button>
        <button type="button" onClick={() => onCopy(buildAccessMessage({ title: info.label, usuario: account.usuario, clave: known, url: siteUrl }), "Datos copiados")} style={button}>
          <Copy size={13} strokeWidth={2.2} aria-hidden="true" /> Copiar datos de acceso
        </button>
      </div>

      {changing && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <input
            aria-label="Contraseña nueva"
            placeholder="Contraseña nueva (mínimo 8)"
            value={clave}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => { setClave(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") changePassword(); }}
            style={{ ...inputStyle, flex: "1 1 220px", minWidth: 0 }}
          />
          <button type="button" disabled={busy} onClick={changePassword} style={primary}>Guardar contraseña</button>
        </div>
      )}

      {error && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// Formulario para crear un usuario nuevo (de facturación, de supervisión o administrador).
function NewUserCard({ busy, onCreate }) {
  const [rol, setRol] = useState("facturacion");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");

  async function create() {
    setError("");
    if (!usuario.trim()) return setError("Escribe el usuario.");
    if (clave.length < PASSWORD_MIN) return setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
    if (await onCreate({ rol, usuario: usuario.trim(), clave })) { setUsuario(""); setClave(""); }
    return undefined;
  }

  return (
    <div role="group" aria-label="Crear usuario" style={card}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Crear usuario</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>{ROLE_INFO[rol].blurb}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select aria-label="Tipo de usuario" value={rol} onChange={(e) => { setRol(e.target.value); setError(""); }} style={{ ...inputStyle, flex: "1 1 150px", minWidth: 0 }}>
          {Object.entries(ROLE_INFO).map(([slug, info]) => <option key={slug} value={slug}>{info.label}</option>)}
        </select>
        <input
          aria-label="Usuario"
          placeholder="Usuario"
          value={usuario}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => { setUsuario(e.target.value); setError(""); }}
          style={{ ...inputStyle, flex: "1 1 160px", minWidth: 0 }}
        />
        <input
          aria-label="Contraseña"
          placeholder="Contraseña (mínimo 8)"
          value={clave}
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => { setClave(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          style={{ ...inputStyle, flex: "1 1 160px", minWidth: 0 }}
        />
        <button type="button" disabled={busy} onClick={create} style={primary}>Crear usuario</button>
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// Horario de facturación: un solo horario (apertura y cierre) de lunes a sábado, en la hora de
// Cuba; el domingo está cerrado. Fuera de horario se pausa el sitio.
function ScheduleCard({ schedule, busy, onSave }) {
  const [enabled, setEnabled] = useState(schedule.activo);
  const [open, setOpen] = useState(schedule.abre);
  const [close, setClose] = useState(schedule.cierra);
  const [error, setError] = useState("");
  useEffect(() => { setEnabled(schedule.activo); setOpen(schedule.abre); setClose(schedule.cierra); }, [schedule.activo, schedule.abre, schedule.cierra]);
  const changed = enabled !== schedule.activo || open !== schedule.abre || close !== schedule.cierra;

  async function save() {
    setError("");
    if (!open || !close || open >= close) {
      setError("La hora de apertura debe ser antes que la de cierre.");
      return;
    }
    await onSave({ activo: enabled, abre: open, cierra: close });
  }

  const field = { height: 36, border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", color: "var(--text)" };
  return (
    <div role="group" aria-label="Horario de facturación" style={card}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Horario de facturación</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
        Un solo horario de lunes a sábado, en la hora del sitio (ver "Hora del sitio"); el domingo está cerrado. Fuera de horario se pausa el sitio: los vendedores no pueden enviar a facturación (sus pedidos esperan en cola) y la facturadora no puede confirmar.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 10 }}>
        <input type="checkbox" aria-label="Activar el horario" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setError(""); }} />
        Activar el horario
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
          Abre
          <input type="time" aria-label="Abre" value={open} onChange={(e) => { setOpen(e.target.value); setError(""); }} style={field} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
          Cierra
          <input type="time" aria-label="Cierra" value={close} onChange={(e) => { setClose(e.target.value); setError(""); }} style={field} />
        </label>
        {changed && <button type="button" disabled={busy} onClick={save} style={primary}>Guardar horario</button>}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
        {schedule.activo ? (schedule.abierto ? "Ahora: abierto." : schedule.mensaje) : "Sin horario: el sitio está abierto a cualquier hora."}
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// Hora del sitio: la zona horaria en la que trabajan el horario, el cierre del día y el contador de
// ventas. Por defecto la de Cuba; el administrador elige la de su ciudad.
function ZonaCard({ zona, busy, onSave }) {
  const [value, setValue] = useState(zona.zona);
  // Hora puesta a mano (opcional): se enciende para corregir la hora del sitio y se vuelve a la
  // automática con el botón.
  const [manual, setManual] = useState(!!zona.manual);
  const [time, setTime] = useState(zona.ahora);
  const [error, setError] = useState("");
  useEffect(() => { setValue(zona.zona); }, [zona.zona]);
  useEffect(() => { setManual(!!zona.manual); setTime(zona.ahora); }, [zona.manual, zona.ahora]);

  async function saveTime() {
    setError("");
    if (!time) {
      setError("Escribe la hora que es ahora.");
      return;
    }
    await onSave({ manual: time });
  }
  const field = { height: 36, border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", color: "var(--text)", maxWidth: "100%" };
  return (
    <div role="group" aria-label="Hora del sitio" style={card}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Hora del sitio</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
        La zona horaria en la que trabaja el sitio: con ella se cuentan el horario de facturación, el cierre del día y el día del contador de ventas. Elige la de tu ciudad.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, flexWrap: "wrap" }}>
          Zona
          <select aria-label="Zona horaria" value={value} onChange={(e) => setValue(e.target.value)} style={field}>
            {zona.zonas.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </label>
        {value !== zona.zona && <button type="button" disabled={busy} onClick={() => onSave({ zona: value })} style={primary}>Guardar zona</button>}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
        Ahora en el sitio: {clock12(zona.ahora)}{zona.manual ? " (hora puesta a mano)" : ""}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 12 }}>
        <input type="checkbox" aria-label="Poner la hora a mano" checked={manual} onChange={(e) => { setManual(e.target.checked); setError(""); }} />
        Poner la hora a mano
      </label>
      {manual && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>
            Si la hora del sitio no coincide con la tuya, escribe qué hora es ahora donde estás. El sitio guarda la diferencia y la usa para el horario, el cierre del día y el contador de ventas.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
              Hora que es ahora
              <input type="time" aria-label="Hora que es ahora" value={time} onChange={(e) => { setTime(e.target.value); setError(""); }} style={field} />
            </label>
            {(time !== zona.ahora || !zona.manual) && <button type="button" disabled={busy} onClick={saveTime} style={primary}>Guardar hora</button>}
            {zona.manual && <button type="button" disabled={busy} onClick={() => onSave({ manual: null })} style={button}>Volver a la hora automática</button>}
          </div>
        </div>
      )}
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// Cierre de facturación del día: una hora; pasada esa hora ya no se envían pedidos para hoy (sí para
// otro día). Aparte del horario del sitio, que pausa todo.
function CierreCard({ cierre, busy, onSave }) {
  const [enabled, setEnabled] = useState(cierre.activo);
  const [time, setTime] = useState(cierre.hora);
  const [error, setError] = useState("");
  useEffect(() => { setEnabled(cierre.activo); setTime(cierre.hora); }, [cierre.activo, cierre.hora]);
  const changed = enabled !== cierre.activo || time !== cierre.hora;

  async function save() {
    setError("");
    if (!time) {
      setError("Elige la hora de cierre.");
      return;
    }
    await onSave({ activo: enabled, hora: time });
  }

  const field = { height: 36, border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", color: "var(--text)" };
  return (
    <div role="group" aria-label="Cierre de facturación del día" style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Cierre de facturación del día</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
        Pasada esta hora, en la hora del sitio, los vendedores ya no pueden enviar pedidos para hoy. Los pedidos para otro día sí se pueden enviar, y también borrar o pasar para mañana.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 10 }}>
        <input type="checkbox" aria-label="Activar el cierre del día" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setError(""); }} />
        Activar el cierre del día
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
          Cierra a las
          <input type="time" aria-label="Hora de cierre" value={time} onChange={(e) => { setTime(e.target.value); setError(""); }} style={field} />
        </label>
        {changed && <button type="button" disabled={busy} onClick={save} style={primary}>Guardar cierre</button>}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
        {cierre.activo ? `Cierra a las ${clock12(cierre.hora)}. ${cierre.cerrado ? "Ahora: ya cerró." : "Ahora: abierto."}` : "Sin cierre: se puede enviar pedidos para hoy a cualquier hora."}
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

export default function AdminApp() {
  useTheme();
  const admin = useAdmin();
  const [newName, setNewName] = useState("");
  // Contraseñas recién puestas (el buzón no las devuelve): solo para armar los datos de acceso a copiar.
  const [known, setKnown] = useState({});
  const [localError, setLocalError] = useState("");
  const [linkNotice, setLinkNotice] = useState("");
  const [toast, setToast] = useState("");
  const [manual, setManual] = useState("");
  const manualRef = useRef(null);

  // Enlace personal (#código): se usa una vez y se quita de la barra de direcciones.
  useEffect(() => {
    const code = window.location.hash.replace(/^#/, "");
    if (!code.startsWith("procovar1:")) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (admin.link) return;
    admin.linkWith(code).catch((e) => setLinkNotice(e && e.message ? e.message : "No se pudo enlazar."));
    // Solo al abrir la página.
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (manual && manualRef.current) manualRef.current.select();
  }, [manual]);

  if (!admin.link) return <LinkScreen onLink={admin.linkWith} onSignIn={admin.signIn} notice={linkNotice} onNoticeClear={() => setLinkNotice("")} />;

  const codeOf = (vendor) => makeLinkCode({ url: admin.link.url, token: vendor.token });
  const siteUrl = new URL("facturadora.html", window.location.href).href;
  const adminSiteUrl = new URL("admin.html", window.location.href).href;
  const rememberPassword = (usuario, clave) => setKnown((prev) => ({ ...prev, [usuario]: clave }));
  async function createUser(body) {
    const ok = await admin.createAccount(body);
    if (ok) rememberPassword(body.usuario, body.clave);
    return ok;
  }
  const factLink = admin.facturadora
    ? `${new URL("facturadora.html", window.location.href).href}#${makeLinkCode({ url: admin.link.url, token: admin.facturadora.token })}`
    : "";

  async function copy(text, label) {
    setManual("");
    try {
      await navigator.clipboard.writeText(text);
      setToast(label);
    } catch {
      setManual(text);
    }
  }

  async function add() {
    setLocalError("");
    admin.clearError();
    if (!newName.trim()) {
      setLocalError("Escribe el nombre del vendedor.");
      return;
    }
    if (await admin.addVendor(newName)) setNewName("");
  }

  const error = localError || admin.error;

  return (
    <div style={pageStyle}>
      <Header title="Vendedores" subtitle="Nombres y enlaces de cada vendedor. Los cambios se ven al instante en el sitio de la facturadora.">
        <button type="button" onClick={admin.unlink} style={{ ...button, background: "transparent", color: "var(--on-ink-subtitle)", border: "1px solid var(--on-ink-subtitle)" }}>Desenlazar</button>
      </Header>

      <div style={{ ...column, padding: "16px 20px" }}>
        {error && <div role="alert" style={{ ...card, borderColor: "var(--danger-border)", color: "var(--error-text)", fontSize: 13.5 }}>{error}</div>}

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "4px 2px 8px" }}>VENDEDORES</div>
        {admin.vendors.map((v) => (
          <VendorRow
            key={v.id}
            vendor={v}
            busy={admin.busy}
            codeOf={codeOf}
            onRename={async (id, name) => { setLocalError(""); await admin.renameVendor(id, name); }}
            onToggle={admin.setActive}
            onRegenerate={admin.regenerate}
            onCopy={copy}
          />
        ))}
        {admin.vendors.length === 0 && admin.phase === "ok" && <div style={{ ...card, color: "var(--text-muted)", fontSize: 13.5 }}>Todavía no hay vendedores.</div>}

        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            aria-label="Nombre del nuevo vendedor"
            placeholder="Nombre del nuevo vendedor"
            value={newName}
            maxLength={60}
            onChange={(e) => { setNewName(e.target.value); setLocalError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            style={{ ...inputStyle, flex: "1 1 220px", minWidth: 0 }}
          />
          <button type="button" onClick={add} disabled={admin.busy} style={primary}>Agregar</button>
        </div>

        {admin.zona && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "18px 2px 8px" }}>HORA DEL SITIO</div>
            <ZonaCard zona={admin.zona} busy={admin.busy} onSave={admin.saveZona} />
          </>
        )}

        {admin.schedule && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "18px 2px 8px" }}>HORARIO DE FACTURACIÓN</div>
            <ScheduleCard schedule={admin.schedule} busy={admin.busy} onSave={admin.saveSchedule} />
          </>
        )}
        {admin.cierre && <CierreCard cierre={admin.cierre} busy={admin.busy} onSave={admin.saveCierre} />}

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "18px 2px 8px" }}>VENTAS POR DÍA</div>
        <SalesSummary load={admin.loadSales} />

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "18px 2px 8px" }}>ENVÍOS DEL DÍA</div>
        <ShipmentsSummary load={admin.loadShipments} />

        {admin.accounts && admin.accounts.cuentas && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "18px 2px 8px" }}>USUARIOS CON USUARIO Y CONTRASEÑA</div>
            {admin.accounts.cuentas.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 2px 10px" }}>
                Todavía no hay usuarios. Crea el primero abajo; un usuario de administrador te deja entrar a este sitio sin el código de enlace.
              </div>
            )}
            {admin.accounts.cuentas.map((account) => (
              <UserCard
                key={`${account.id}:${account.usuario}`}
                account={account}
                known={known[account.usuario]}
                busy={admin.busy}
                siteUrl={account.rol === "administrador" ? adminSiteUrl : siteUrl}
                onSave={admin.updateAccount}
                onCopy={copy}
                onKnown={rememberPassword}
              />
            ))}
            <NewUserCard busy={admin.busy} onCreate={createUser} />
          </>
        )}

        {admin.facturadora && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "18px 2px 8px" }}>FACTURADORA</div>
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700 }}>{admin.facturadora.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Su enlace personal abre el sitio ya enlazado.</div>
              </div>
              <button type="button" aria-label="Copiar enlace de la facturadora" onClick={() => copy(factLink, "Enlace copiado")} style={button}>
                <Copy size={13} strokeWidth={2.2} aria-hidden="true" /> Copiar enlace
              </button>
            </div>
          </>
        )}

        {manual && (
          <div style={card}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>El navegador no dejó copiar. Selecciona y copia este texto:</div>
            <textarea ref={manualRef} readOnly aria-label="Texto para copiar" value={manual} rows={6} style={{ ...inputStyle, width: "100%", height: "auto", padding: 10, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12 }} />
          </div>
        )}
      </div>

      {toast && (
        <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 24, zIndex: 50, background: "#111", color: "#eee", borderRadius: 10, padding: "10px 16px", fontSize: 13 }}>{toast}</div>
      )}
    </div>
  );
}
