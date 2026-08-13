import {
  Activity,
  MapPin,
  Package,
  PackageCheck,
  RotateCcw,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type InventorySectionKey =
  | "returns"
  | "products"
  | "cedisSummary"
  | "balances"
  | "transfers"
  | "movements";

export type InventorySection = {
  key: InventorySectionKey;
  label: string;
  icon: LucideIcon;
};

export const inventoryAdminSections: readonly InventorySection[] = [
  { key: "returns", label: "Devoluciones a CEDIS", icon: RotateCcw },
  { key: "products", label: "Productos y stock", icon: Package },
  { key: "cedisSummary", label: "Resumen CEDIS", icon: PackageCheck },
  { key: "balances", label: "Inventario por ubicación", icon: MapPin },
  { key: "transfers", label: "Traspasos", icon: Truck },
  { key: "movements", label: "Movimientos", icon: Activity },
];

export const inventorySellerSections: readonly InventorySection[] = [
  inventoryAdminSections[0],
  inventoryAdminSections[1],
];

export function getInventorySectionTabId(key: InventorySectionKey) {
  return `inventory-section-tab-${key}`;
}

export function getInventorySectionPanelId(key: InventorySectionKey) {
  return `inventory-section-panel-${key}`;
}
