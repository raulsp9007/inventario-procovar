import { ClipboardList, PieChart, BarChart3, Users, Package, Settings } from "lucide-react";

const TABS = [
  { key: "portafolio", label: "Portafolio", short: "Portafolio", Icon: PieChart },
  { key: "resumen", label: "Resumen semanal", short: "Resumen", Icon: BarChart3 },
  { key: "pedidos", label: "Pedidos", short: "Pedidos", Icon: ClipboardList },
  { key: "stock", label: "Productos", short: "Productos", Icon: Package },
  { key: "clientes", label: "Clientes", short: "Clientes", Icon: Users },
  { key: "config", label: "Configuración", short: "Config.", Icon: Settings },
];

export const VIEW_LABELS = TABS.reduce((acc, t) => ({ ...acc, [t.key]: t.label }), {});

// Menú inferior fijo, siempre visible -- reemplaza al FAB radial de antes
// (abrir/cerrar de más para elegir una de 6 pestañas). Ícono relleno +
// nombre corto debajo, la activa en fondo --ink como el resto de estados
// "seleccionado" ya usados en la app (Hoy/Para mañana, Guardar existencias).
export default function RadialNav({ view, setView }) {
  return (
    <nav
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 56,
        display: "flex", background: "var(--surface)", borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map((tab) => {
        const active = view === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            title={tab.label}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
            style={{
              flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 3, padding: "8px 2px 7px",
              background: "transparent", border: "none", cursor: "pointer",
              color: active ? "var(--text)" : "var(--text-faint)",
            }}
          >
            <span
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 26, borderRadius: 9, flexShrink: 0,
                background: active ? "var(--ink)" : "transparent",
              }}
            >
              <tab.Icon size={18} color={active ? "var(--cream)" : "currentColor"} />
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, lineHeight: 1, whiteSpace: "nowrap" }}>
              {tab.short}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
