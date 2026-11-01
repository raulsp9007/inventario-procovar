import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import AdminApp from "./AdminApp.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

// Sitio de administración (admin.html): página aparte, sin la app de los vendedores
// ni service worker.

// La página cargó bien: el guardián de caché (ver admin.html) puede volver a actuar.
try { sessionStorage.removeItem("procovar-recarga-cache"); } catch { /* sin almacenamiento */ }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  </React.StrictMode>
);
