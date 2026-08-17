import Today from "./Today.jsx";
import { tomorrowStr } from "./dateUtils";

export default function Tomorrow(props) {
  return (
    <Today
      {...props}
      dateStr={tomorrowStr()}
      title="MAÑANA"
      ordersLabel="PEDIDOS DE MAÑANA"
      soldLabel="Para mañana"
    />
  );
}
