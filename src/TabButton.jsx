export default function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        borderRadius: 7, border: "1px solid var(--text)",
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--cream)" : "var(--text)",
      }}
    >
      {children}
    </button>
  );
}
