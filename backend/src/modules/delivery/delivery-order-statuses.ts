import { DeliveryOrderStatus } from '@prisma/client';

export const FINAL_DELIVERY_ORDER_STATUSES: DeliveryOrderStatus[] = [
  DeliveryOrderStatus.DELIVERED,
  DeliveryOrderStatus.NOT_DELIVERED,
  DeliveryOrderStatus.CANCELLED,
  DeliveryOrderStatus.PARTIALLY_REJECTED,
  DeliveryOrderStatus.RETURNED,
];

export const FINAL_DELIVERY_ORDER_STATUS_SET = new Set(
  FINAL_DELIVERY_ORDER_STATUSES,
);
