import { useState, useEffect, useRef } from "react";
import AnimatedNumber from "./AnimatedNumber.jsx";

// Número que da un pulso breve cuando cambia (no al aparecer por primera
// vez, para no animar todos los contadores a la vez al abrir la app). El
// `key` por cambio remonta el span y reinicia la animación de CSS.
// Con `countUp` la cifra además cuenta hacia arriba al aparecer y al cambiar.
export default function PulseNumber({ value, countUp = false }) {
  const previous = useRef(value);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setChanges((n) => n + 1);
    }
  }, [value]);

  return <span key={changes} className={changes > 0 ? "numpulse" : undefined}>{countUp ? <AnimatedNumber value={value} /> : value}</span>;
}
