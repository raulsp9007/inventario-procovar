import Today from "./Today.jsx";

export default function Tomorrow(props) {
  return (
    <Today
      {...props}
      title="MAÑANA"
      ordersLabel="PEDIDOS PENDIENTES"
      soldLabel="Pendiente"
      pendingMode
    />
  );
}
