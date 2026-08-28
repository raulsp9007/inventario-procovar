import { useState } from "react";
import { ClipboardList, PieChart, BarChart3, Users, Package, Settings, Menu, X } from "lucide-react";

const TABS = [
  { key: "pedidos", label: "Pedidos", Icon: ClipboardList },
  { key: "portafolio", label: "Portafolio", Icon: PieChart },
  { key: "resumen", label: "Resumen semanal", Icon: BarChart3 },
  { key: "clientes", label: "Clientes", Icon: Users },
  { key: "stock", label: "Productos", Icon: Package },
  { key: "config", label: "Configuración", Icon: Settings },
];

export const VIEW_LABELS = TABS.reduce((acc, t) => ({ ...acc, [t.key]: t.label }), {});

// Botón flotante abajo a la izquierda -- al tocarlo despliega las 6 pestañas
// en una columna hacia arriba, una encima de otra (ícono + nombre completo
// lado a lado en cada pastilla), para que ambos se lean bien sin recortarse.
const FAB_SIZE = 56;
const ITEM_HEIGHT = 44;
const GAP = 8;
const CORNER_OFFSET = 20;
const STACK_BASE = CORNER_OFFSET + FAB_SIZE + GAP; // bottom del primer ítem (más cercano al FAB)
const COLLAPSE_DY = STACK_BASE - CORNER_OFFSET; // cuánto baja cada ítem para "recogerse" en el FAB al cerrar

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
        const active = view === tab.key;
        const bottom = STACK_BASE + i * (ITEM_HEIGHT + GAP);
        const dy = COLLAPSE_DY + i * (ITEM_HEIGHT + GAP);
        return (
          <button
            key={tab.key}
            onClick={() => pick(tab.key)}
            title={tab.label}
            aria-label={tab.label}
            style={{
              position: "fixed", left: CORNER_OFFSET, bottom,
              height: ITEM_HEIGHT, borderRadius: ITEM_HEIGHT / 2,
              display: "flex", alignItems: "center", gap: 10,
              padding: "0 16px 0 12px", whiteSpace: "nowrap",
              background: active ? "var(--ink)" : "var(--surface)",
              color: active ? "var(--cream)" : "var(--text)",
              border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              cursor: "pointer", zIndex: 56,
              transform: open ? "translateY(0) scale(1)" : `translateY(${dy}px) scale(0.4)`,
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition: `transform 0.25s ease ${open ? i * 0.03 : 0}s, opacity 0.2s ease`,
            }}
          >
            <tab.Icon size={19} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{tab.label}</span>
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
