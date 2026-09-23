import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import InventoryApp from "./InventoryApp.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { COPYRIGHT_NOTICE, LICENSE_SUMMARY } from "./legal.js";
import { initPwaStatus } from "./pwaStatus.js";

console.info(`Inventario Procovar\n${COPYRIGHT_NOTICE}\n${LICENSE_SUMMARY}`);

// Registra el service worker y deja el estado (conexión/actualización)
// disponible para el indicador de Configuración. Ver src/pwaStatus.js.
initPwaStatus();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <InventoryApp />
    </ErrorBoundary>
  </React.StrictMode>
);
