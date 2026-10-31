import { useState } from "react";
import InventoryApp from "./InventoryApp.jsx";
import FacturadoraApp from "./FacturadoraApp.jsx";
import { resolveAppRole } from "./appRole.js";

// La misma app sirve para el vendedor y para la facturadora: el rol de este
// teléfono (?rol=facturadora la primera vez) decide qué pantalla se ve.
export default function AppRoot() {
  const [role] = useState(() => resolveAppRole());
  return role === "facturadora" ? <FacturadoraApp /> : <InventoryApp />;
}
