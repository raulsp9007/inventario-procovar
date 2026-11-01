import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import FacturadoraApp from "./FacturadoraApp.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

// Sitio web de la facturadora (facturadora.html): una página aparte, sin la app de
// los vendedores ni service worker (necesita internet para ver los pedidos).
// La página cargó bien: el guardián de caché (ver facturadora.html) puede volver a actuar.
try { sessionStorage.removeItem("procovar-recarga-cache"); } catch { /* sin almacenamiento */ }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FacturadoraApp />
    </ErrorBoundary>
  </React.StrictMode>
);
