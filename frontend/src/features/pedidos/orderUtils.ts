import type { SaleOrder } from '@/lib/salesSocket'

export function mergeOrders(current: SaleOrder[], next: SaleOrder[]) {
  const orders = new Map(current.map((order) => [order.id, order]))
  next.forEach((order) => orders.set(order.id, order))
  return [...orders.values()].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}
