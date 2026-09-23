// Estado de conexión + actualización de la app, para el indicador en
// Configuración. Vive a nivel de módulo (no de componente) porque el
// registro del service worker debe pasar una sola vez, sin importar cuántas
// veces se monte o desmonte la pantalla que lo muestra -- los componentes
// solo se suscriben a los cambios (ver usePwaStatus más abajo).
import { useState, useEffect } from "react";
import { registerSW } from "virtual:pwa-register";

function initialOnline() {
  try {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  } catch {
    return true;
  }
}

let state = {
  offline: !initialOnline(),
  updateAvailable: false,
  // Última vez que se confirmó conexión -- no "última vez que se revisó
  // el servidor", que no tenemos manera de saber sin backend. Sirve para
  // decirle al usuario desde cuándo viene usando la copia guardada.
  lastOnlineAt: initialOnline() ? new Date().toISOString() : null,
};
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

let started = false;

// Se llama una sola vez al arrancar la app (ver main.jsx). Si el navegador
// no soporta service worker, o el entorno no tiene el plugin de PWA (ej.
// tests), no rompe nada -- el estado por default ("actualizada") es
// inofensivo.
export function initPwaStatus() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("online", () => setState({ offline: false, lastOnlineAt: new Date().toISOString() }));
  window.addEventListener("offline", () => setState({ offline: true }));

  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        setState({ updateAvailable: true });
      },
    });
  } catch {
    // Sin soporte de service worker -- el indicador queda en "actualizada"
    // (no hay nada que revisar), que es el estado correcto para ese caso.
  }
}

export function subscribePwaStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaStatus() {
  return state;
}

export function usePwaStatus() {
  const [status, setStatus] = useState(getPwaStatus);
  useEffect(() => subscribePwaStatus(setStatus), []);
  return status;
}

// Solo para tests: vuelve al estado inicial y desregistra todo, así un test
// no arrastra el estado (ni el "started") del anterior.
export function resetPwaStatusForTests() {
  state = { offline: !initialOnline(), updateAvailable: false, lastOnlineAt: initialOnline() ? new Date().toISOString() : null };
  listeners.clear();
  started = false;
}
