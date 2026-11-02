import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useFacturadora } from "./useFacturadora";
import { mergeKnownSellers } from "./facturadoraData";
import { KNOWN_SELLERS } from "./facturadoraSellers";
import FacturadoraBoard from "./FacturadoraBoard.jsx";

// Página de la facturadora (y de la supervisión): entrar con usuario y contraseña y, adentro, una
// tarjeta grande por pedido (FacturadoraBoard). Ver
// docs/superpowers/specs/2026-10-30-facturacion-nube-design.md. La lógica vive en
// useFacturadora (nube, cola, datos sin conexión); acá solo está el acceso.

// La página de la facturadora va siempre en modo claro: no sigue el tema del navegador ni el
// que se eligió en la app de ventas (que comparte el sitio).
function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.title = "Facturación Procovar";
  }, []);
}

const pageStyle = {
  minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 96,
};
// En el teléfono ocupa todo el ancho; en una computadora queda en una columna centrada.
const column = { maxWidth: 760, margin: "0 auto" };
const primaryButton = {
  width: "100%", height: 44, borderRadius: 10, border: "none", background: "var(--ink)", color: "var(--cream)",
  fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
};

function Header({ title, subtitle, onBack, backLabel, children }) {
  return (
    <div style={{ background: "var(--ink)", color: "var(--cream)", padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 16px" }}>
      <div style={column}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 2, background: "none", border: "none", color: "var(--on-ink-subtitle)", fontSize: 13, padding: 0, marginBottom: 8, fontFamily: "inherit", cursor: "pointer" }}
        >
          <ChevronLeft size={16} strokeWidth={2.4} />
          {backLabel}
        </button>
      )}
      <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--on-ink-label)", fontWeight: 600, marginBottom: 4 }}>PROCOVAR · FACTURACIÓN</div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 12.5, color: "var(--on-ink-subtitle)", marginTop: 6 }}>{subtitle}</div>}
      {children}
      </div>
    </div>
  );
}

// Lo primero es la contraseña: no se muestra nada más hasta entrar.
function LinkScreen({ onLink, notice = "", onNoticeClear }) {
  const [usuario, setUsuario] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onLink({ usuario, clave: code });
    } catch (e) {
      setError(e && e.message ? e.message : "No se pudo enlazar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={pageStyle}>
      <Header title="Acceso" subtitle="Escribe tu usuario y contraseña para entrar." />
      <div style={{ ...column, padding: "14px 16px 16px" }}>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          type="text"
          aria-label="Usuario"
          placeholder="Usuario"
          name="username"
          autoComplete="username"
          value={usuario}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => { setUsuario(e.target.value); setError(""); if (onNoticeClear) onNoticeClear(); }}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 12px", fontSize: 14, background: "var(--surface)", color: "var(--text)", margin: "16px 0 10px" }}
        />
        <input
          type="password"
          aria-label="Contraseña"
          placeholder="Contraseña"
          name="password"
          autoComplete="current-password"
          value={code}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => { setCode(e.target.value); setError(""); if (onNoticeClear) onNoticeClear(); }}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 12px", fontSize: 14, background: "var(--surface)", color: "var(--text)", marginBottom: 10 }}
        />
        <button type="submit" disabled={busy} style={primaryButton}>Entrar</button>
        {(error || notice) && <div role="alert" style={{ fontSize: 13, color: "var(--error-text)", marginTop: 10 }}>{error || notice}</div>}
        </form>
      </div>
    </div>
  );
}

const TITLE = "Facturación Procovar";

export default function FacturadoraApp() {
  useTheme();
  const f = useFacturadora();
  const [linkNotice, setLinkNotice] = useState("");
  // Los vendedores, alfabéticamente. Con la lista del buzón en mano (la que arma el
  // administrador) manda esa; los de arranque solo valen mientras no se tiene.
  const sellers = useMemo(() => mergeKnownSellers(f.sellers, f.sellers.length > 0 ? [] : KNOWN_SELLERS), [f.sellers]);

  // Enlace personal: la dirección trae el código (#procovar1:...). Se usa una vez,
  // se guarda y se quita de la barra (no queda en el historial ni se comparte sin querer).
  // Si esta computadora ya estaba enlazada, la dirección vieja no cambia nada.
  useEffect(() => {
    const code = window.location.hash.replace(/^#/, "");
    if (!code.startsWith("procovar1:")) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (f.link) return;
    f.linkWith(code).catch((e) => setLinkNotice(e && e.message ? e.message : "No se pudo enlazar."));
    // Solo al abrir la página.
  }, []);

  // Si la sesión ya no sirve (cambiaron la contraseña, se venció), se vuelve a pedir el acceso.
  useEffect(() => {
    if (f.link && f.phase === "auth") {
      f.unlink();
      setLinkNotice("La sesión terminó. Entra de nuevo.");
    }
  }, [f.link, f.phase]);

  // El número de pendientes en la pestaña avisa aunque esté en segundo plano.
  useEffect(() => {
    document.title = f.link && f.totalPending > 0 ? `(${f.totalPending}) ${TITLE}` : TITLE;
  }, [f.link, f.totalPending]);

  if (!f.link) return <LinkScreen onLink={f.signIn} notice={linkNotice} onNoticeClear={() => setLinkNotice("")} />;
  return <FacturadoraBoard f={f} sellers={sellers} />;
}
