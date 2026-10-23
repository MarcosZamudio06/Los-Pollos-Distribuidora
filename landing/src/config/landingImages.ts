export const LANDING_IMAGES = {
  // Whole-frame derivatives of the screenshots approved in screenshots erp/.
  heroDashboard: "/images/landing/approved/dashboard.jpg",

  // Whole POS workspace; legacy mobile/detail crops remain separate.
  pos: "/images/landing/approved/pos.jpg",
  posMobile: "/images/landing/pos-checkout-mobile.jpg",
  posDetail: "/images/landing/pos-confirmation.webp",

  // Whole-frame location-balance capture from the approved ERP screenshots.
  inventory: "/images/landing/approved/inventory.jpg",
  purchases: "/images/landing/approved/purchases.jpg",
  collections: "/images/landing/approved/collections.jpg",
  closing: "/images/landing/approved/closing.jpg",

  // Approved administrative CEDIS context.
  cedis: "/images/landing/approved/cedis.jpg",
  cedisSupply: "/images/landing/approved/cedis-supply.jpg",
  cedisReceptions: "/images/landing/approved/cedis-receptions.jpg",
  cedisReconciliation: "/images/landing/approved/cedis-reconciliation.jpg",
  cedisReturns: "/images/landing/approved/cedis-returns.jpg",
  cedisReturnConfirmation: "/images/landing/approved/cedis-return-confirmation.jpg",

  // Approved administrative fleet context.
  fleet: "/images/landing/approved/fleet.jpg",

  // Approved administrative route context.
  routePlanner: "/images/landing/approved/route-planner.jpg",

  // Approved web-mobile driver transport views, never enlarged desktop substitutes.
  driver: "/images/landing/approved/driver.jpg",
  driverStop: "/images/landing/approved/driver-stop.jpg",

  // Administrative request evidence only, not fiscal emission proof.
  billing: "/images/landing/approved/billing.jpg",
} as const;

const imageEnvironmentKeys: Partial<Record<keyof typeof LANDING_IMAGES, string>> = {
  heroDashboard: "VITE_LANDING_DASHBOARD_IMAGE",
  pos: "VITE_LANDING_POS_IMAGE",
  posMobile: "VITE_LANDING_POS_MOBILE_IMAGE",
  posDetail: "VITE_LANDING_POS_DETAIL_IMAGE",
  inventory: "VITE_LANDING_INVENTORY_IMAGE",
  purchases: "VITE_LANDING_PURCHASES_IMAGE",
  collections: "VITE_LANDING_COLLECTIONS_IMAGE",
  closing: "VITE_LANDING_CLOSING_IMAGE",
  cedis: "VITE_LANDING_CEDIS_IMAGE",
  fleet: "VITE_LANDING_FLEET_IMAGE",
  routePlanner: "VITE_LANDING_ROUTE_PLANNER_IMAGE",
  driver: "VITE_LANDING_DRIVER_IMAGE",
  driverStop: "VITE_LANDING_DRIVER_STOP_IMAGE",
  billing: "VITE_LANDING_BILLING_IMAGE",
} as const;

export function getLandingImage(image: keyof typeof LANDING_IMAGES) {
  const environmentKey = imageEnvironmentKeys[image];
  return (environmentKey ? import.meta.env[environmentKey]?.trim() : undefined) || LANDING_IMAGES[image];
}
