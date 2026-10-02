import { useState, useEffect } from "react";

export const SPLASH_MS = 2000;

// Pantalla de carga de la app: logo, barra de 2 s y marca de agua. Los
// colores van fijos (crema = el background_color del manifest, que es el que
// ya muestra Android al arrancar) para que la transición desde el arranque
// nativo no pegue un salto, sin importar el tema claro/oscuro de la app. La
// app se monta debajo desde el primer momento: la pantalla solo la tapa.
export default function SplashScreen({ children }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), SPLASH_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      {children}
      {visible && (
        <div
          role="status"
          aria-label="Cargando"
          style={{
            position: "fixed", inset: 0, zIndex: 9999, background: "#F7F4EC",
            display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <style>{`@keyframes splashFill { from { width: 0; } to { width: 100%; } }`}</style>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <img
              src={`${import.meta.env.BASE_URL}icon-192.png`}
              alt=""
              width={112}
              height={112}
              style={{ borderRadius: 28 }}
            />
            <div style={{ fontSize: 20, fontWeight: 600, color: "#22261F" }}>Inventario Procovar</div>
            <div style={{ width: 160, height: 5, borderRadius: 3, background: "#E2DDCF", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#E8692C", animation: `splashFill ${SPLASH_MS}ms linear forwards` }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#6B6A5F", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
            Desarrollado por raulsp9007
          </div>
        </div>
      )}
    </>
  );
}
