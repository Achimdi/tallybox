import {
  font,
  fontsReady,
  INK,
  loadImage,
  MUTED,
  renderDocument,
  rule,
  VOID_RED,
  wrapText,
} from '@/lib/canvasText'
import type { ReceiptData } from './receipt'

/** Width of the receipt in CSS pixels; drawn 3× for a sharp image (1152 px wide). */
const WIDTH = 384
const SCALE = 3
const PAD = 24
const INNER = WIDTH - PAD * 2

/** Draws the receipt as a picture, the same one used for the PNG and the PDF. */
export async function drawReceipt(receipt: ReceiptData): Promise<HTMLCanvasElement> {
  await fontsReady()
  const logo = receipt.logoUrl ? await loadImage(receipt.logoUrl) : null

  return renderDocument(WIDTH, SCALE, (context, draw) => {
    let y = PAD

    const text = (
      value: string,
      options: {
        size?: number
        weight?: 400 | 500 | 600 | 700
        color?: string
        align?: 'left' | 'center' | 'right'
        gap?: number
      } = {},
    ) => {
      const { size = 14, weight = 400, color = INK, align = 'left', gap = 4 } = options
      context.font = font(size, weight)
      const lineHeight = Math.round(size * 1.35)
      for (const line of wrapText(context, value, INNER)) {
        if (draw) {
          context.fillStyle = color
          context.textAlign = align
          const x = align === 'center' ? WIDTH / 2 : align === 'right' ? WIDTH - PAD : PAD
          context.fillText(line, x, y)
        }
        y += lineHeight
      }
      y += gap
    }

    /** A label on the left and a value on the right, the value wrapping under itself if long. */
    const pair = (left: string, right: string, size = 14, weight: 400 | 600 | 700 = 400) => {
      context.font = font(size, weight)
      const lineHeight = Math.round(size * 1.35)
      const leftWidth = context.measureText(left).width
      const rightLines = wrapText(context, right, Math.max(80, INNER - leftWidth - 16))
      if (draw) {
        context.fillStyle = INK
        context.textAlign = 'left'
        context.fillText(left, PAD, y)
        context.textAlign = 'right'
        rightLines.forEach((line, index) =>
          context.fillText(line, WIDTH - PAD, y + index * lineHeight),
        )
      }
      y += lineHeight * rightLines.length + 4
    }

    const divider = () => {
      y += 6
      rule(context, draw, PAD, y, INNER)
      y += 12
    }

    // Header
    if (logo) {
      const size = 72
      const ratio = Math.min(size / logo.width, size / logo.height)
      const w = logo.width * ratio
      const h = logo.height * ratio
      if (draw) context.drawImage(logo, (WIDTH - w) / 2, y, w, h)
      y += h + 12
    }
    text(receipt.businessName, { size: 20, weight: 700, align: 'center', gap: 2 })
    if (receipt.address) text(receipt.address, { size: 13, color: MUTED, align: 'center', gap: 0 })
    if (receipt.phone) text(receipt.phone, { size: 13, color: MUTED, align: 'center', gap: 0 })

    if (receipt.voided) {
      y += 10
      text('VOID: this order was cancelled', {
        size: 14,
        weight: 700,
        color: VOID_RED,
        align: 'center',
        gap: 0,
      })
    }
    divider()

    // Order details
    pair('Receipt', receipt.orderNumber, 14, 600)
    pair('Date', receipt.dateTime)
    pair('Served by', receipt.staffName)
    if (receipt.customerName) pair('Customer', receipt.customerName)
    divider()

    // Lines: name and amount on one row, "2 × ₦450.00" under the name.
    for (const line of receipt.lines) {
      context.font = font(14, 600)
      const totalWidth = context.measureText(line.lineTotal).width
      context.font = font(14, 500)
      const nameLines = wrapText(context, line.name, INNER - totalWidth - 16)
      if (draw) {
        context.fillStyle = INK
        context.textAlign = 'left'
        nameLines.forEach((name, index) => context.fillText(name, PAD, y + index * 19))
        context.font = font(14, 600)
        context.textAlign = 'right'
        context.fillText(line.lineTotal, WIDTH - PAD, y)
      }
      y += nameLines.length * 19
      text(`${line.quantity} × ${line.unitPrice}`, { size: 12, color: MUTED, gap: 8 })
    }
    divider()

    pair('Total', receipt.total, 20, 700)
    pair(
      'Paid by',
      receipt.paymentReference
        ? `${receipt.paymentMethod} · ${receipt.paymentReference}`
        : receipt.paymentMethod,
    )
    pair('Items', String(receipt.itemCount))

    if (receipt.footer) {
      divider()
      text(receipt.footer, { size: 13, align: 'center', gap: 0 })
    }
    y += 16
    text('Powered by Tallybox', { size: 11, color: MUTED, align: 'center', gap: 0 })
    y += PAD - 8

    // A large VOID mark across the whole receipt.
    if (receipt.voided && draw) {
      context.save()
      context.globalAlpha = 0.16
      context.fillStyle = VOID_RED
      context.font = font(110, 700)
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.translate(WIDTH / 2, y / 2)
      context.rotate(-Math.PI / 6)
      context.fillText('VOID', 0, 0)
      context.restore()
    }
    return y
  })
}
