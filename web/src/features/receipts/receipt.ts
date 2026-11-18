import type { BusinessSettings, Order } from '@/api/types'
import { formatOrderNumber, paymentMethodLabel } from '@/domain/orders'
import { receiptWatermark, type ReceiptWatermark } from '@/domain/receiptWatermark'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

/**
 * Everything printed on a receipt, already formatted. Every way of sending a
 * receipt (image, PDF, print, WhatsApp, and later a thermal printer) starts here.
 * Names and prices come from the order's snapshots, so a later price change
 * never rewrites an old receipt.
 */
export interface ReceiptData {
  businessName: string
  address: string | null
  phone: string | null
  logoUrl: string | null
  footer: string | null
  orderNumber: string
  dateTime: string
  staffName: string
  lines: { name: string; quantity: number; unitPrice: string; lineTotal: string }[]
  itemCount: number
  total: string
  paymentMethod: string
  paymentReference: string | null
  customerName: string | null
  customerPhone: string | null
  /** A voided order's receipt carries a large VOID mark. */
  voided: boolean
  /** The faint mark behind the receipt, or null for none. */
  watermark: ReceiptWatermark | null
}

export function buildReceipt(order: Order, settings: BusinessSettings): ReceiptData {
  const money = (minor: number) => formatMoney(minor, settings.currencyCode)
  return {
    businessName: settings.name,
    address: settings.address,
    phone: settings.phone,
    logoUrl: settings.logoUrl,
    footer: settings.receiptFooter,
    orderNumber: formatOrderNumber(order.orderNumber),
    dateTime: formatDateTime(new Date(order.createdAt), settings.timezone),
    staffName: order.staffName,
    lines: order.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: money(line.unitPrice),
      lineTotal: money(line.lineTotal),
    })),
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    total: money(order.total),
    paymentMethod: paymentMethodLabel(order.paymentMethod),
    paymentReference: order.paymentReference,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    voided: order.status === 'voided',
    watermark: receiptWatermark(settings.watermark, settings.logoUrl),
  }
}

/** "sunrise-pharmacy-receipt-0048.pdf" */
export function receiptFileName(receipt: ReceiptData, extension: 'pdf' | 'png'): string {
  const business = receipt.businessName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  const number = receipt.orderNumber.replace('#', '')
  return `${business || 'tallybox'}-receipt-${number}${receipt.voided ? '-void' : ''}.${extension}`
}

/** The short message sent with "Send on WhatsApp": a link can carry text but not a file. */
export function receiptMessage(receipt: ReceiptData): string {
  return [
    `${receipt.businessName}: receipt ${receipt.orderNumber}${receipt.voided ? ' (VOID)' : ''}`,
    receipt.dateTime,
    '',
    ...receipt.lines.map((line) => `${line.quantity} × ${line.name}: ${line.lineTotal}`),
    '',
    `Total: ${receipt.total} (${receipt.paymentMethod})`,
    ...(receipt.footer ? ['', receipt.footer] : []),
  ].join('\n')
}

/**
 * Country calling codes for local numbers ("0803…"), chosen by the business's
 * currency because a business has no country setting. Numbers written with
 * + or 00 are used as they are.
 */
const CALLING_CODE: Record<string, string> = {
  NGN: '234',
  GHS: '233',
  KES: '254',
  UGX: '256',
  TZS: '255',
  RWF: '250',
  ZAR: '27',
  EGP: '20',
  MAD: '212',
  GBP: '44',
  INR: '91',
}

/** The number in international form, digits only, as WhatsApp links need. Null if it can't be worked out. */
export function whatsAppNumber(phone: string, currencyCode: string): string | null {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  if (trimmed.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  const code = CALLING_CODE[currencyCode]
  if (digits.startsWith('0')) return code ? `${code}${digits.slice(1)}` : null
  return digits
}

/** Opens a chat with the customer, message ready to send. */
export function whatsAppChatUrl(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
