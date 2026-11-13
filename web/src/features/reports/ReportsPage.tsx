import { Ban, Banknote, Calculator, FileDown, FileSpreadsheet, ReceiptText } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useApi } from '@/api/context'
import { Button } from '@/components/Button'
import { FilterChips } from '@/components/FilterChips'
import { Money } from '@/components/Money'
import { SectionHeader } from '@/components/SectionHeader'
import { Skeleton } from '@/components/Skeleton'
import { StatCard } from '@/components/StatCard'
import { EmptyState, ErrorState } from '@/components/states'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { PAYMENT_METHODS } from '@/domain/orders'
import {
  bucketDays,
  granularityFor,
  isValidRange,
  REPORT_MAX_DAYS,
  type SalesReport,
} from '@/domain/salesReport'
import { useSessionUser } from '@/features/auth/session'
import { downloadFile, shareOrDownload } from '@/features/receipts/output'
import { addDays, dateKey, formatDateKey, formatDateTime } from '@/lib/dates'
import { logger } from '@/lib/logger'
import { formatMoney, formatMoneyCompact } from '@/lib/money'
import { PRESETS, rangeFor, rangeLabel, type Preset } from '@/lib/periods'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useSalesReport } from './api'
import { BarList } from './BarList'
import { ColumnChart, type Column } from './ColumnChart'
import { csvFileName, ordersCsv } from './exportCsv'

function Card({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex flex-col gap-3 ${className ?? ''}`}>
      <SectionHeader title={title} />
      <div className="rounded-card border border-line bg-surface-raised p-4 shadow-soft">
        {children}
      </div>
    </section>
  )
}

const shortDay = new Intl.DateTimeFormat('en', { timeZone: 'UTC', day: 'numeric', month: 'short' })

function SalesOverTime({ report, currency }: { report: SalesReport; currency: string }) {
  const granularity = granularityFor(report)
  const points = bucketDays(report.byDay, granularity)
  const columns: Column[] = points.map((point) => {
    const date = new Date(`${point.dateKey}T00:00:00Z`)
    return {
      key: point.dateKey,
      label:
        granularity === 'month'
          ? date.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
          : shortDay.format(date),
      fullLabel:
        granularity === 'day'
          ? formatDateKey(point.dateKey)
          : `${granularity === 'week' ? 'Week from' : 'Month from'} ${formatDateKey(point.dateKey)}`,
      value: point.sales,
      valueText: formatMoney(point.sales, currency),
      detail: `${point.orders} ${point.orders === 1 ? 'order' : 'orders'}`,
    }
  })
  const title = `Sales by ${granularity}`
  return (
    <Card title={title}>
      <ColumnChart
        title={title}
        columns={columns}
        formatTick={(value) => formatMoneyCompact(value, currency)}
      />
      <details className="mt-3">
        <summary className="inline-flex min-h-12 cursor-pointer items-center text-label font-semibold text-primary">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-left text-body">
          <thead>
            <tr className="text-label text-ink-muted">
              <th scope="col" className="py-1 font-normal">
                {granularity === 'day'
                  ? 'Day'
                  : granularity === 'week'
                    ? 'Week from'
                    : 'Month from'}
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Orders
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Sales
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {points.map((point) => (
              <tr key={point.dateKey}>
                <td className="py-1.5 text-ink">{formatDateKey(point.dateKey)}</td>
                <td className="py-1.5 text-right text-ink tabular-nums">{point.orders}</td>
                <td className="py-1.5 text-right text-ink tabular-nums">
                  {formatMoney(point.sales, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  )
}

function ReportBody({ report, currency }: { report: SalesReport; currency: string }) {
  const money = (minor: number) => formatMoney(minor, currency)
  const sellers = report.items.filter((entry) => entry.sales > 0)
  const slow = [...report.items].reverse().slice(0, 8)
  const nothing = report.orders === 0 && report.voided === 0

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sales"
          icon={Banknote}
          value={<Money minor={report.sales} currency={currency} />}
          className="col-span-2 lg:col-span-1"
        />
        <StatCard label="Orders" icon={ReceiptText} value={report.orders} />
        <StatCard
          label="Average order"
          icon={Calculator}
          value={<Money minor={report.averageOrder} currency={currency} />}
        />
        <StatCard
          label="Voided"
          icon={Ban}
          value={report.voided}
          trend={{
            direction: 'flat',
            label: report.voided > 0 ? `${money(report.voidedTotal)} voided` : 'None',
          }}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {nothing ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <EmptyState
            title="No sales in this range"
            description="Try a longer range, or check back after the first orders."
          />
        </div>
      ) : (
        <>
          {report.byDay.length > 1 ? <SalesOverTime report={report} currency={currency} /> : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="By payment method">
              <BarList
                label="Sales by payment method"
                rows={PAYMENT_METHODS.map((method) => ({
                  key: method.value,
                  label: method.label,
                  value: report.byPaymentMethod[method.value].sales,
                  valueText: money(report.byPaymentMethod[method.value].sales),
                  detail: `${report.byPaymentMethod[method.value].orders} orders`,
                }))}
              />
            </Card>
            <Card title="By person">
              {report.byStaff.length === 0 ? (
                <p className="text-body text-ink-muted">No completed orders.</p>
              ) : (
                <BarList
                  label="Sales by person"
                  rows={report.byStaff.map((entry) => ({
                    key: entry.staffId,
                    label: entry.staffName,
                    value: entry.sales,
                    valueText: money(entry.sales),
                    detail: `${entry.orders} ${entry.orders === 1 ? 'order' : 'orders'}`,
                  }))}
                />
              )}
            </Card>
            <Card title="Best sellers">
              {sellers.length === 0 ? (
                <p className="text-body text-ink-muted">Nothing sold.</p>
              ) : (
                <BarList
                  label="Best sellers"
                  rows={sellers.slice(0, 10).map((entry) => ({
                    key: entry.itemId,
                    label: entry.name,
                    value: entry.sales,
                    valueText: money(entry.sales),
                    detail: `${entry.quantity} sold`,
                  }))}
                />
              )}
            </Card>
            <Card title="Slowest sellers">
              <ul aria-label="Slowest sellers" className="flex flex-col divide-y divide-line">
                {slow.map((entry) => (
                  <li key={entry.itemId} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 text-body break-words text-ink">{entry.name}</span>
                    <span className="shrink-0 text-label text-ink-muted tabular-nums">
                      {entry.quantity === 0
                        ? 'None sold'
                        : `${entry.quantity} sold · ${money(entry.sales)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      <Card title="Stock value now">
        {report.stockValue ? (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-label font-normal text-ink-muted">At cost price</dt>
                <dd className="text-title text-ink">
                  <Money minor={report.stockValue.atCost} currency={currency} />
                </dd>
              </div>
              <div>
                <dt className="text-label font-normal text-ink-muted">At selling price</dt>
                <dd className="text-title text-ink">
                  <Money minor={report.stockValue.atPrice} currency={currency} />
                </dd>
              </div>
            </dl>
            {report.stockValue.itemsWithoutCost > 0 ? (
              <p className="text-label font-normal text-ink-muted">
                {report.stockValue.itemsWithoutCost}{' '}
                {report.stockValue.itemsWithoutCost === 1 ? 'item has' : 'items have'} no cost price
                and
                {report.stockValue.itemsWithoutCost === 1 ? ' is' : ' are'} not counted. Add cost
                prices on Items.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-body text-ink-muted">
            Add cost prices to your items to see what your stock is worth.
          </p>
        )}
      </Card>
    </div>
  )
}

/** The owner's reports: totals, charts and breakdowns for any range, with CSV and PDF downloads. */
export default function ReportsPage() {
  const api = useApi()
  const user = useSessionUser()
  const toast = useToast()
  const online = useOnlineStatus()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'
  const today = dateKey(new Date(), timezone)

  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(addDays(today, -29))
  const [customTo, setCustomTo] = useState(today)
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null)

  const range = rangeFor(preset, today) ?? { from: customFrom, to: customTo }
  const valid = isValidRange(range)
  const report = useSalesReport(range, valid)

  const exportCsv = async () => {
    setBusy('csv')
    try {
      const { orders, truncated } = await api.reports.exportOrders(range)
      const csv = ordersCsv(orders, currency, timezone)
      downloadFile(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        csvFileName(range.from, range.to),
      )
      toast(
        truncated
          ? {
              title: 'CSV downloaded, but cut short',
              description:
                'The range has too many orders for one file. Choose a shorter range for the rest.',
              tone: 'info',
            }
          : {
              title: 'CSV downloaded',
              description: `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}.`,
              tone: 'success',
            },
      )
    } catch (error) {
      logger.error('report_export_failed', error, { kind: 'csv' })
      toast({ title: "The CSV couldn't be made", description: 'Try again.', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const downloadPdf = async () => {
    if (!report.data) return
    setBusy('pdf')
    try {
      const { reportSummaryPdf } = await import('./summaryPdf')
      const file = await reportSummaryPdf({
        report: report.data,
        businessName: user.businessName ?? 'Tallybox',
        currency,
        generatedAt: formatDateTime(new Date(), timezone),
      })
      const result = await shareOrDownload(file, 'Sales report')
      if (result === 'downloaded') toast({ title: 'PDF summary downloaded', tone: 'success' })
    } catch (error) {
      logger.error('report_export_failed', error, { kind: 'pdf' })
      toast({ title: "The PDF couldn't be made", description: 'Try again.', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  let body
  if (!valid) {
    body = (
      <p role="alert" className="text-body font-medium text-error-strong">
        Choose a start date on or before the end date, at most {REPORT_MAX_DAYS} days apart.
      </p>
    )
  } else if (report.isPending) {
    body = (
      <div role="status" className="flex flex-col gap-6">
        <span className="sr-only">Loading the report</span>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  } else if (report.isError) {
    body = (
      <div className="rounded-card border border-line bg-surface-raised">
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      </div>
    )
  } else {
    body = <ReportBody report={report.data} currency={currency} />
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title-lg text-ink">Reports</h1>
          <p className="text-body text-ink-muted">
            {valid ? rangeLabel(range.from, range.to) : 'Choose a range'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => void exportCsv()}
            loading={busy === 'csv'}
            loadingLabel="Preparing…"
            disabled={!valid || !online}
            leadingIcon={<FileSpreadsheet aria-hidden="true" className="size-5" />}
          >
            Export CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => void downloadPdf()}
            loading={busy === 'pdf'}
            loadingLabel="Preparing…"
            disabled={!report.data || !valid}
            leadingIcon={<FileDown aria-hidden="true" className="size-5" />}
          >
            PDF summary
          </Button>
        </div>
      </header>

      <FilterChips label="Period" options={PRESETS} value={preset} onChange={setPreset} />
      {preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <TextField
            label="From"
            type="date"
            max={customTo}
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
          />
          <TextField
            label="To"
            type="date"
            min={customFrom}
            max={today}
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
          />
        </div>
      ) : null}
      {body}
    </div>
  )
}
