const detailPropertyLabels: Record<string, string> = {
  id: 'Identificador', productId: 'Identificador del producto', productName: 'Producto', quantity: 'Cantidad', unit: 'Unidad',
  unitPrice: 'Precio unitario', subtotal: 'Subtotal', discount: 'Descuento', taxableBase: 'Base gravable', tax: 'Impuesto', total: 'Total',
  status: 'Estado', version: 'Versión', requestedAt: 'Fecha de solicitud', requestedTotal: 'Total solicitado', reversedAt: 'Fecha de reversión',
  series: 'Serie', folio: 'Folio', uuid: 'UUID', totalApplied: 'Total aplicado', amount: 'Importe', paymentMethod: 'Método de pago',
  paidAt: 'Fecha de pago', deliveredAt: 'Fecha de entrega', notes: 'Notas', action: 'Acción', actorName: 'Responsable', reason: 'Motivo', createdAt: 'Fecha de registro',
}

export function getDetailPropertyLabel(property: string) { return detailPropertyLabels[property] ?? property }
