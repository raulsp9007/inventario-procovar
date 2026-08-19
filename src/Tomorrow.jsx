import Today from "./Today.jsx";

export default function Tomorrow(props) {
  return (
    <Today
      {...props}
      title="MAÑANA"
      ordersLabel="PEDIDOS DE MAÑANA"
      soldLabel="Reservado para mañana"
      pendingMode
    />
  );
}
