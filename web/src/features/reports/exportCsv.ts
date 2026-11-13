import type { Order } from '@/api/types'
import { csvAmount, toCsv } from '@/domain/csv'
import { formatOrderNumber, paymentMethodLabel } from '@/domain/orders'
import { minorUnitDigits } from '@/lib/money'

const HEADER = [
  'Order',
  'Date',
  'Time',
  'Status',
  'Taken by',
  'Payment method',
  'Payment reference',
  'Customer',
  'Item',
  'Quantity',
  'Unit price',
  'Line total',
  'Order total',
  'Void reason',
] as const

/**
 * One row per item sold, with the order's details repeated, so the file can be
 * filtered and summed in a spreadsheet. Amounts are plain decimals in the
 * business's currency. Customer phone numbers are left out on purpose.
 */
export function ordersCsv(orders: readonly Order[], currency: string, timeZone: string): string {
  const digits = minorUnitDigits(currency)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const rows = orders.flatMap((order) =>
    order.lines.map((line) => [
      formatOrderNumber(order.orderNumber),
      order.dateKey,
      time.format(new Date(order.createdAt)),
      order.status === 'voided' ? 'Voided' : 'Completed',
      order.staffName,
      paymentMethodLabel(order.paymentMethod),
      order.paymentReference,
      order.customerName,
      line.name,
      line.quantity,
      csvAmount(line.unitPrice, digits),
      csvAmount(line.lineTotal, digits),
      csvAmount(order.total, digits),
      order.voidReason,
    ]),
  )
  return toCsv(HEADER, rows)
}

export function csvFileName(from: string, to: string): string {
  return from === to ? `tallybox-orders-${from}.csv` : `tallybox-orders-${from}-to-${to}.csv`
}
