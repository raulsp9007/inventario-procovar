import { useState, useEffect, useRef } from "react";

// Número que sube de a poco hasta su valor (y de ahí al nuevo si cambia) --
// solo al aparecer y al cambiar. Con ms <= 0 (reducir movimiento, o un
// entorno sin matchMedia como los tests) salta directo al valor.
export default function useAnimatedNumber(target, ms) {
  const [shown, setShown] = useState(ms > 0 ? 0 : target);
  const shownRef = useRef(ms > 0 ? 0 : target);

  useEffect(() => {
    if (ms <= 0) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    const from = shownRef.current;
    const start = performance.now();
    let frame;
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = from + (target - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return shown;
}
