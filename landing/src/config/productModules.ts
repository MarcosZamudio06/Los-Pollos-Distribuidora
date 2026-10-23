import { getLandingImage } from "./landingImages";

export const PRODUCT_MODULES = [
  { id: "dashboard", label: "Dashboard", group: "Venta y gestión", image: "heroDashboard", title: "La operación, a la vista.", detail: "Consulta ventas, inventario por ubicación, cobranza y reparto según los permisos del equipo.", note: "Dashboard real del entorno de demostración. Los importes pertenecen a la captura; no son resultados de clientes." },
  { id: "pos", label: "Punto de venta", group: "Venta y gestión", image: "pos", title: "Cada venta empieza con contexto.", detail: "Productos, ubicación operativa, cliente, contado o crédito y pagos en una misma superficie de trabajo.", note: "POS real con dos partidas y turno sin abrir. Es una venta en preparación, no una transacción confirmada." },
  { id: "inventory", label: "Inventario", group: "Mercancía", image: "inventory", title: "Existencias con ubicación, no stock global.", detail: "Consulta saldos, disponibilidad, reservas y movimientos por ubicación operativa. Conserva el contexto de cada traspaso.", note: "Captura real de saldos por ubicación; los productos, sucursales y cantidades visibles pertenecen al entorno capturado, no son resultados de clientes." },
  { id: "cedis", label: "CEDIS", group: "Mercancía", image: "cedis", title: "Del CEDIS a cada sucursal.", detail: "Organiza sucursales, suministros, recepciones y devoluciones vinculadas a su centro de distribución.", note: "Vista administrativa real de CEDIS y sucursales. No representa un suministro confirmado." },
  { id: "purchases", label: "Compras", group: "Mercancía", image: "purchases", title: "Una entrada que deja rastro.", detail: "Relaciona proveedor, CEDIS receptor, productos y movimientos de una compra. Las sucursales reciben suministros vinculados.", note: "Detalle de compra real del entorno aprobado, con ubicación receptora y partidas. No es una compra de un cliente de la plataforma." },
  { id: "fleet", label: "Logística", group: "Distribución", image: "fleet", title: "Planea la ruta. Conserva el recorrido.", detail: "Coordina rutas, vehículos y pedidos asignados. El monitoreo requiere posiciones y servicios geoespaciales habilitados.", note: "Planificador administrativo de rutas: cero paradas cargadas y sin distancia ni duración calculadas. No demuestra seguimiento de flota ni tráfico en vivo." },
  { id: "driver", label: "Repartidores", group: "Distribución", image: "driver", title: "La entrega también tiene contexto.", detail: "El repartidor consulta sus pedidos asignados y registra entregas, incidencias y evidencias conforme a sus permisos.", note: "Vista web móvil real del repartidor con un traslado CEDIS asignado. No demuestra una entrega a cliente completada, cobros ni seguimiento en vivo." },
  { id: "collections", label: "Cobranza", group: "Control", image: "collections", title: "Cada cobro, con su cuenta.", detail: "Revisa saldos, vencimientos y pagos. Cada pago de cobranza se aplica a una sola cuenta por cobrar.", note: "Resumen real de cobranza dentro del dashboard, no una captura del formulario de pago. Valores del entorno de demostración." },
  { id: "closing", label: "Cierres", group: "Control", image: "closing", title: "Cierra sin esconder diferencias.", detail: "Revisa la jornada por ubicación, sus ventas, pagos y diferencias. El cierre diario y la liquidación de ruta son operaciones distintas.", note: "Vista real de turnos y cierre diario. Los estados visibles son los de la captura; no se simula un cierre realizado." },
  { id: "billing", label: "Facturación", group: "Control", image: "billing", title: "La solicitud conserva sus referencias.", detail: "Relaciona solicitudes administrativas con ventas y clientes. Un ticket o una solicitud no es un CFDI; la emisión fiscal requiere alcance, configuración y proveedor habilitados.", note: "Formulario administrativo para crear una solicitud de facturación; no es una bandeja de solicitudes existentes ni evidencia de emisión CFDI o integración fiscal operativa." },
] as const;

export type ProductModule = typeof PRODUCT_MODULES[number];
export const CEDIS_CAPTURE_STEPS = [
  { id: "supply", label: "Envío", image: "cedisSupply", caption: "Paso previo a confirmar un envío desde CEDIS a una sucursal; la captura no muestra un suministro completado." },
  { id: "receptions", label: "Recepciones", image: "cedisReceptions", caption: "Bandeja de recepciones del CEDIS; el registro visible está pendiente de revisión." },
  { id: "reconciliation", label: "Conciliación", image: "cedisReconciliation", caption: "Comparación de cantidades enviadas y recibidas con una diferencia visible pendiente de revisión; la recepción no aparece confirmada." },
  { id: "returns", label: "Devoluciones", image: "cedisReturns", caption: "Bandeja de devoluciones en CEDIS; el registro visible sigue pendiente de confirmar." },
  { id: "return-confirmation", label: "Confirmación", image: "cedisReturnConfirmation", caption: "Diálogo previo a confirmar la recepción física de una devolución; no acredita que la acción se haya completado." },
] as const;

export type ProductImageKey = ProductModule["image"] | "routePlanner" | "driverStop" | (typeof CEDIS_CAPTURE_STEPS)[number]["image"];

/** Intrinsic whole-frame sizes reserve layout space without enlarging mobile captures. */
const captureSizes = {
  heroDashboard: [1600, 924, 2048, 1183], pos: [1600, 1003, 2048, 1284],
  cedis: [1600, 924, 2048, 1183], purchases: [1600, 925, 2048, 1184],
  cedisSupply: [1600, 833, 2048, 1067], cedisReceptions: [1600, 923, 2048, 1182],
  cedisReconciliation: [1600, 926, 2048, 1185], cedisReturns: [1600, 928, 2048, 1187],
  cedisReturnConfirmation: [1600, 874, 2048, 1118],
  fleet: [1600, 926, 2048, 1186], routePlanner: [1600, 928, 2048, 1188],
  collections: [1600, 830, 2048, 1063], closing: [1600, 925, 2048, 1184],
  billing: [1600, 926, 2048, 1185], inventory: [1600, 930, 2048, 1189],
  driver: [386, 834, 386, 834], driverStop: [378, 828, 378, 828],
} as const;

export function getProductCapture(key: ProductImageKey) {
  const src = getLandingImage(key);
  const [width, height, fullWidth, fullHeight] = captureSizes[key];
  const portrait = height > width;
  const bundled = src.startsWith("/images/landing/approved/");
  return { src, full: bundled && !portrait ? src.replace(/\.jpg$/, "-full.jpg") : src, width, height, fullWidth, fullHeight, portrait };
}
