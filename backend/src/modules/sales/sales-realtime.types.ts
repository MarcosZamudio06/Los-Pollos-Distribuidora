export const SALE_CREATED_EVENT = 'sale.created' as const;
export const SALES_GATEWAY_NAMESPACE = '/sales' as const;
export const SALES_GATEWAY_PATH = '/api/socket.io' as const;

export type SaleOrderItem = {
  id: string;
  productId: string;
  productName: string;
  unit: 'KG' | 'PIECE' | 'KG_AND_PIECE';
  quantityKg: string | null;
  quantityPieces: number | null;
};

export type SaleOrderPayload = {
  id: string;
  saleNumber: string;
  createdAt: string;
  location: {
    id: string;
    name: string;
  };
  customer: {
    id: string;
    name: string;
  } | null;
  items: SaleOrderItem[];
  total: string;
  status: 'CONFIRMED';
};

export type SalesServerToClientEvents = {
  [SALE_CREATED_EVENT]: (order: SaleOrderPayload) => void;
};

export type SalesClientToServerEvents = Record<string, never>;

export function salesLocationRoom(locationId: string): string {
  return `sales:location:${locationId}`;
}
