import { useState } from "react";
import { ClipboardList, PieChart, BarChart3, Users, Package, Settings, Menu, X } from "lucide-react";

const TABS = [
  { key: "pedidos", label: "Pedidos", shortLabel: "Pedidos", Icon: ClipboardList },
  { key: "portafolio", label: "Portafolio", shortLabel: "Portafolio", Icon: PieChart },
  { key: "resumen", label: "Resumen semanal", shortLabel: "Resumen", Icon: BarChart3 },
  { key: "clientes", label: "Clientes", shortLabel: "Clientes", Icon: Users },
  { key: "stock", label: "Productos", shortLabel: "Productos", Icon: Package },
  { key: "config", label: "Configuración", shortLabel: "Config.", Icon: Settings },
];

export const VIEW_LABELS = TABS.reduce((acc, t) => ({ ...acc, [t.key]: t.label }), {});

// Botón flotante abajo a la izquierda -- al tocarlo despliega las 6
// pestañas en cuarto de círculo (de la derecha hacia arriba) para no
// pisar el botón "Nuevo pedido" que vive en la esquina opuesta.
const RADIUS = 100;
const START_DEG = 0; // derecha
const END_DEG = 90; // arriba
const FAB_SIZE = 56;
const ITEM_SIZE = 46;
const CORNER_OFFSET = 20;
const ITEM_OFFSET = CORNER_OFFSET + (FAB_SIZE - ITEM_SIZE) / 2;

function arcOffset(index, total) {
  const t = total === 1 ? 0 : index / (total - 1);
  const deg = START_DEG + (END_DEG - START_DEG) * t;
  const rad = (deg * Math.PI) / 180;
  return { dx: Math.cos(rad) * RADIUS, dy: -Math.sin(rad) * RADIUS };
}

export default function RadialNav({ view, setView }) {
  const [open, setOpen] = useState(false);

  function pick(key) {
    setView(key);
    setOpen(false);
  }

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 55 }}
        />
      )}

      {TABS.map((tab, i) => {
        const { dx, dy } = arcOffset(i, TABS.length);
        const active = view === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => pick(tab.key)}
            title={tab.label}
            aria-label={tab.label}
            style={{
              position: "fixed", left: ITEM_OFFSET, bottom: ITEM_OFFSET,
              width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: active ? "var(--ink)" : "var(--surface)",
              color: active ? "var(--cream)" : "var(--text)",
              border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              cursor: "pointer", zIndex: 56, padding: 0,
              transform: open ? `translate(${dx}px, ${dy}px) scale(1)` : "translate(0, 0) scale(0.4)",
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition: `transform 0.25s ease ${open ? i * 0.03 : 0}s, opacity 0.2s ease`,
            }}
          >
            <tab.Icon size={19} />
            <span
              aria-hidden="true"
              style={{
                position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                marginTop: 4, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
                background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)",
                borderRadius: 5, padding: "1px 5px", pointerEvents: "none",
                opacity: open ? 1 : 0, transition: "opacity 0.2s ease",
              }}
            >
              {tab.shortLabel}
            </span>
          </button>
        );
      })}

      <button
        onClick={() => setOpen((o) => !o)}
        title={open ? "Cerrar menú" : "Abrir menú"}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        style={{
          position: "fixed", left: CORNER_OFFSET, bottom: CORNER_OFFSET,
          width: FAB_SIZE, height: FAB_SIZE, borderRadius: "50%",
          background: "var(--ink)", color: "var(--cream)", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 57, boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.25s ease",
        }}
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>
    </>
  );
}
