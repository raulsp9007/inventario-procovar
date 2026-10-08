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

// Cada cuánto se busca una versión nueva con la app abierta, y el mínimo entre
// dos búsquedas (al volver al primer plano varias veces seguidas).
const UPDATE_CHECK_EVERY_MS = 60 * 60 * 1000;
const UPDATE_CHECK_MIN_GAP_MS = 60 * 1000;

let state = {
  offline: !initialOnline(),
  updateAvailable: false,
  // El aviso de versión nueva se puede cerrar con la ×; vuelve solo si llega
  // una versión todavía más nueva.
  updateDismissed: false,
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
let updateSW = null;
let lastCheckAt = 0;

// Busca una versión nueva (no hace nada sin conexión ni sin registro del
// service worker). Un fallo de red no es un error: se reintenta en la
// próxima ocasión.
function checkForUpdate(registration) {
  if (!registration || !initialOnline()) return;
  const now = Date.now();
  if (now - lastCheckAt < UPDATE_CHECK_MIN_GAP_MS) return;
  lastCheckAt = now;
  Promise.resolve(registration.update()).catch(() => {});
}

// Con la app abierta: busca una versión nueva cada hora y cada vez que vuelve
// al primer plano (al desbloquear el teléfono o volver desde WhatsApp).
function watchForUpdates(registration) {
  if (!registration) return;
  setInterval(() => checkForUpdate(registration), UPDATE_CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate(registration);
  });
}

// Aplica la versión nueva (la que ya está descargada y esperando) y recarga.
// Los datos de pedidos y stock se guardan aparte: no se tocan.
export function applyUpdate() {
  if (updateSW) updateSW(true);
}

// Cierra el aviso de versión nueva hasta que llegue otra todavía más nueva.
export function dismissUpdate() {
  setState({ updateDismissed: true });
}

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
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setState({ updateAvailable: true, updateDismissed: false });
      },
      onRegisteredSW(_swUrl, registration) {
        watchForUpdates(registration);
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
  state = { offline: !initialOnline(), updateAvailable: false, updateDismissed: false, lastOnlineAt: initialOnline() ? new Date().toISOString() : null };
  listeners.clear();
  started = false;
  updateSW = null;
  lastCheckAt = 0;
}
