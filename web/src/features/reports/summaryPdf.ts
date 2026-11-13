import { PAYMENT_METHODS } from '@/domain/orders'
import { bucketDays, granularityFor, type SalesReport } from '@/domain/salesReport'
import { font, fontsReady, INK, MUTED, renderDocument, RULE, wrapText } from '@/lib/canvasText'
import { formatDateKey } from '@/lib/dates'
import { rangeLabel } from '@/lib/periods'
import { canvasToJpeg, imagesToPdf, PAGE } from '@/lib/imagePdf'
import { formatMoney, formatMoneyCompact } from '@/lib/money'

/** A4 at 96 dpi, drawn twice as sharp. */
const WIDTH = 794
const MIN_HEIGHT = 1123
const SCALE = 2
const PAD = 56
const INNER = WIDTH - PAD * 2
const TEAL = '#0e7c7b'

interface SummaryInput {
  report: SalesReport
  businessName: string
  currency: string
  generatedAt: string
}

/** A one-page summary of a report, as a PDF to download or share. */
export async function reportSummaryPdf(input: SummaryInput): Promise<File> {
  await fontsReady()
  const { report, businessName, currency } = input
  const money = (minor: number) => formatMoney(minor, currency)

  const canvas = renderDocument(
    WIDTH,
    SCALE,
    (context, draw) => {
      let y = PAD
      const write = (
        text: string,
        size: number,
        options: {
          weight?: 400 | 600 | 700
          color?: string
          x?: number
          width?: number
          align?: 'left' | 'right'
        } = {},
      ) => {
        const { weight = 400, color = INK, x = PAD, width = INNER, align = 'left' } = options
        context.font = font(size, weight)
        const lines = wrapText(context, text, width)
        if (draw) {
          context.fillStyle = color
          context.textAlign = align
          lines.forEach((line, index) =>
            context.fillText(line, align === 'right' ? x + width : x, y + index * size * 1.3),
          )
        }
        return lines.length * size * 1.3
      }
      const heading = (text: string) => {
        y += 18
        y += write(text, 15, { weight: 700 })
        if (draw) {
          context.fillStyle = RULE
          context.fillRect(PAD, y + 2, INNER, 1)
        }
        y += 10
      }
      /** Rows of label and amount in two columns of the page. */
      const table = (rows: readonly [string, string][], columnWidth = INNER) => {
        for (const [label, value] of rows) {
          const height = Math.max(
            write(label, 12, { width: columnWidth - 140 }),
            write(value, 12, { weight: 600, width: columnWidth, align: 'right' }),
          )
          y += height + 4
        }
      }

      y += write(businessName, 22, { weight: 700 })
      y += write(`Sales report · ${rangeLabel(report.from, report.to)}`, 14, { color: MUTED })
      y += write(`Made ${input.generatedAt}`, 11, { color: MUTED })
      y += 16

      // Headline figures in four boxes.
      const tiles: [string, string][] = [
        ['Sales', money(report.sales)],
        ['Orders', String(report.orders)],
        ['Average order', money(report.averageOrder)],
        ['Voided', `${report.voided} · ${money(report.voidedTotal)}`],
      ]
      const tileWidth = (INNER - 3 * 12) / 4
      tiles.forEach(([label, value], index) => {
        const x = PAD + index * (tileWidth + 12)
        if (draw) {
          context.strokeStyle = RULE
          context.lineWidth = 1
          context.strokeRect(x + 0.5, y + 0.5, tileWidth, 64)
          context.textAlign = 'left'
          context.fillStyle = MUTED
          context.font = font(11, 400)
          context.fillText(label, x + 12, y + 12)
          context.fillStyle = INK
          context.font = font(15, 700)
          context.fillText(wrapText(context, value, tileWidth - 24)[0] ?? '', x + 12, y + 32)
        }
      })
      y += 64

      // Sales over time, as simple columns.
      const series = bucketDays(report.byDay, granularityFor(report))
      if (series.length > 1) {
        heading(`Sales by ${granularityFor(report)}`)
        const chartHeight = 120
        const max = Math.max(1, ...series.map((point) => point.sales))
        const slot = INNER / series.length
        const bar = Math.max(2, Math.min(18, slot * 0.6))
        if (draw) {
          context.fillStyle = MUTED
          context.font = font(10, 400)
          context.textAlign = 'left'
          context.fillText(formatMoneyCompact(max, currency), PAD, y)
          context.fillStyle = RULE
          context.fillRect(PAD, y + chartHeight, INNER, 1)
          context.fillStyle = TEAL
          series.forEach((point, index) => {
            const height = (point.sales / max) * (chartHeight - 16)
            context.fillRect(
              PAD + index * slot + (slot - bar) / 2,
              y + chartHeight - height,
              bar,
              height,
            )
          })
        }
        y += chartHeight + 6
        y += write(
          `${formatDateKey(series[0]?.dateKey ?? '')} to ${formatDateKey(report.to)}`,
          10,
          { color: MUTED },
        )
      }

      heading('By payment method')
      table(
        PAYMENT_METHODS.map((method) => [
          `${method.label} (${report.byPaymentMethod[method.value].orders} orders)`,
          money(report.byPaymentMethod[method.value].sales),
        ]),
      )

      if (report.byStaff.length > 0) {
        heading('By person')
        table(
          report.byStaff
            .slice(0, 8)
            .map((entry) => [`${entry.staffName} (${entry.orders} orders)`, money(entry.sales)]),
        )
      }

      const sellers = report.items.filter((entry) => entry.sales > 0)
      if (sellers.length > 0) {
        heading('Best sellers')
        table(
          sellers
            .slice(0, 10)
            .map((entry) => [`${entry.name} (${entry.quantity} sold)`, money(entry.sales)]),
        )
      }

      if (report.stockValue) {
        heading('Stock value now')
        table([
          ['At cost price', money(report.stockValue.atCost)],
          ['At selling price', money(report.stockValue.atPrice)],
        ])
        if (report.stockValue.itemsWithoutCost > 0) {
          y += write(
            `${report.stockValue.itemsWithoutCost} items have no cost price and are not counted.`,
            11,
            { color: MUTED },
          )
        }
      }

      y += 28
      y += write('Powered by Tallybox. Voided orders are not counted as sales.', 10, {
        color: MUTED,
      })
      return y + PAD
    },
    MIN_HEIGHT,
  )

  const jpeg = await canvasToJpeg(canvas, 0.9)
  const pageWidth = PAGE.a4.width
  const pdf = imagesToPdf(
    [
      {
        jpeg,
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
        pageWidth,
        pageHeight: (canvas.height / canvas.width) * pageWidth,
      },
    ],
    `${businessName} sales report ${report.from} to ${report.to}`,
  )
  const name = report.from === report.to ? report.from : `${report.from}-to-${report.to}`
  return new File([pdf], `tallybox-report-${name}.pdf`, { type: 'application/pdf' })
}
