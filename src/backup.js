import { todayStr } from "./dateUtils.js";

export function downloadBackup(persistedState) {
  const blob = new Blob([JSON.stringify(persistedState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `procovar-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseBackupFile(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El archivo no tiene el formato esperado.");
  }
  return parsed;
}
