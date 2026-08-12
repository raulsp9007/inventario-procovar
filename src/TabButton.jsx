export default function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        borderRadius: 7, border: "1px solid #22261F",
        background: active ? "#22261F" : "transparent",
        color: active ? "#F7F4EC" : "#22261F",
      }}
    >
      {children}
    </button>
  );
}
