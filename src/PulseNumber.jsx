import { useState, useEffect, useRef } from "react";

// Número que da un pulso breve cuando cambia (no al aparecer por primera
// vez, para no animar todos los contadores a la vez al abrir la app). El
// `key` por cambio remonta el span y reinicia la animación de CSS.
export default function PulseNumber({ value }) {
  const previous = useRef(value);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setChanges((n) => n + 1);
    }
  }, [value]);

  return <span key={changes} className={changes > 0 ? "numpulse" : undefined}>{value}</span>;
}
