import { useId } from 'react'
import type { ReceiptWatermark } from '@/domain/receiptWatermark'
import { ReceiptDocument } from '@/features/receipts/PrintReceipt'
import type { ReceiptData } from '@/features/receipts/receipt'
import { formatMoney } from '@/lib/money'

interface WatermarkPreviewProps {
  businessName: string
  currencyCode: string
  logoUrl: string | null
  footer: string
  watermark: ReceiptWatermark | null
}

/** A short made-up receipt showing the settings as they are on screen, before saving. */
export function WatermarkPreview({
  businessName,
  currencyCode,
  logoUrl,
  footer,
  watermark,
}: WatermarkPreviewProps) {
  const captionId = useId()
  const money = (minor: number) => formatMoney(minor, currencyCode)
  const receipt: ReceiptData = {
    businessName: businessName.trim() || 'Your business',
    address: null,
    phone: null,
    logoUrl,
    footer: footer.trim() || null,
    orderNumber: '#0001',
    dateTime: 'Example receipt',
    staffName: 'Staff',
    lines: [
      { name: 'First item', quantity: 2, unitPrice: money(50000), lineTotal: money(100000) },
      { name: 'Second item', quantity: 1, unitPrice: money(25000), lineTotal: money(25000) },
    ],
    itemCount: 3,
    total: money(125000),
    paymentMethod: 'Cash',
    paymentReference: null,
    customerName: null,
    customerPhone: null,
    voided: false,
    watermark,
  }
  return (
    <figure aria-labelledby={captionId} className="flex flex-col gap-2">
      <figcaption id={captionId} className="text-label text-ink">
        Preview
      </figcaption>
      <div className="overflow-hidden rounded-card border border-line bg-white px-3 py-4">
        <ReceiptDocument receipt={receipt} paper="80mm" />
      </div>
    </figure>
  )
}
