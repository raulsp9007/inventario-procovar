export default function FieldLabel({ children }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-faint)", letterSpacing: "0.04em", marginBottom: 3 }}>
      {children}
    </div>
  );
}
