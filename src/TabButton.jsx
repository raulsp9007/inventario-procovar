export default function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "0 0 auto", whiteSpace: "nowrap", padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
        borderRadius: 20, border: "1px solid var(--text)",
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--cream)" : "var(--text)",
      }}
    >
      {children}
    </button>
  );
}
