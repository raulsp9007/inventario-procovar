import { Component } from "react";

// Los error boundaries de React solo existen como class component (no hay
// equivalente con hooks) -- getDerivedStateFromError/componentDidCatch no
// tienen versión funcional todavía.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary atrapó un error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh", background: "var(--bg)", color: "var(--text)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: 24, textAlign: "center", fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Algo falló</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20, maxWidth: 320 }}>
          La app tuvo un error inesperado. Tus datos están a salvo en este dispositivo -- recargá para seguir.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "var(--ink)", color: "var(--cream)", border: "none",
            borderRadius: 7, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          Recargar
        </button>
      </div>
    );
  }
}
