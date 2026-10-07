import { useState, useEffect, useRef } from "react";
import { enterAnimationMs } from "./motion.js";

const MAX_BATCH = 3;

// Ids que aparecieron DESPUÉS de la primera vez (p. ej. un pedido recién
// creado), durante `ms`. Lo que ya estaba al montar no cuenta; tampoco un id
// que se fue y volvió (deshacer eliminar), ni una carga masiva (más de
// MAX_BATCH de golpe: un respaldo importado). Con ms = 0 (reducir movimiento)
// no marca nada.
export default function useEnteringIds(ids, ms = enterAnimationMs()) {
  const seen = useRef(null);
  const [entering, setEntering] = useState(() => new Set());
  const timers = useRef([]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seen.current.has(id));
    fresh.forEach((id) => seen.current.add(id));
    if (ms <= 0 || fresh.length === 0 || fresh.length > MAX_BATCH) return;
    setEntering((prev) => new Set([...prev, ...fresh]));
    const timer = setTimeout(() => {
      setEntering((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.delete(id));
        return next;
      });
    }, ms);
    timers.current.push(timer);
  }, [ids, ms]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return entering;
}
