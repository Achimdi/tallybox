import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { Banner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Money } from '@/components/Money'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { formatOrderNumber, paymentMethodLabel } from '@/domain/orders'
import { useSessionUser } from '@/features/auth/session'
import { formatDateTime } from '@/lib/dates'
import { useOrder } from './api'
import { portalBase } from './portal'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-normal text-ink-muted">{label}</dt>
      <dd className="text-body break-words text-ink">{children}</dd>
    </div>
  )
}

/** One order: what was sold, for how much, how it was paid, and by whom. */
export default function OrderDetailPage() {
  const { orderId = '' } = useParams()
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'
  const back = `${portalBase(user.role)}/orders`
  const order = useOrder(orderId)

  if (order.isPending) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading order</span>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    )
  }
  if (order.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to={back} label="Orders" />
        <ErrorState headingLevel={1} error={order.error} onRetry={() => void order.refetch()} />
      </div>
    )
  }

  const data = order.data
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <BackLink to={back} label="Orders" />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-title-lg text-ink">Order {formatOrderNumber(data.orderNumber)}</h1>
        <StatusChip status={data.status} />
      </header>

      {data.status === 'voided' ? (
        <Banner
          tone="error"
          title={`Voided${data.voidedByName ? ` by ${data.voidedByName}` : ''}${data.voidedAt ? ` on ${formatDateTime(new Date(data.voidedAt), timezone)}` : ''}`}
          description={
            data.voidReason
              ? `Reason: ${data.voidReason}. Stock was returned.`
              : 'Stock was returned.'
          }
        />
      ) : null}

      <section
        aria-label="Items"
        className="rounded-card border border-line bg-surface-raised p-5 shadow-soft"
      >
        <table className="w-full text-left">
          <thead>
            <tr className="text-label text-ink-muted">
              <th scope="col" className="pb-2 font-normal">
                Item
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Qty
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.lines.map((line) => (
              <tr key={line.itemId} className="align-top">
                <td className="py-2 pr-3">
                  <span className="block text-body text-ink">{line.name}</span>
                  <span className="text-label font-normal text-ink-muted">
                    <Money minor={line.unitPrice} currency={currency} /> each
                  </span>
                </td>
                <td className="py-2 text-right text-body text-ink tabular-nums">{line.quantity}</td>
                <td className="py-2 pl-3 text-right text-body text-ink">
                  <Money minor={line.lineTotal} currency={currency} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line">
              <th scope="row" colSpan={2} className="pt-3 text-body font-semibold text-ink">
                Total
              </th>
              <td className="pt-3 text-right">
                <Money minor={data.total} currency={currency} className="text-title text-ink" />
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section
        aria-label="Details"
        className="rounded-card border border-line bg-surface-raised p-5 shadow-soft"
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Time">{formatDateTime(new Date(data.createdAt), timezone)}</Detail>
          <Detail label="Taken by">{data.staffName}</Detail>
          <Detail label="Payment">
            {paymentMethodLabel(data.paymentMethod)}
            {data.paymentReference ? ` · ${data.paymentReference}` : ''}
          </Detail>
          <Detail label="Payment confirmed by">{data.paymentConfirmedByName}</Detail>
          {data.customerName ? <Detail label="Customer">{data.customerName}</Detail> : null}
          {data.customerPhone ? <Detail label="Customer phone">{data.customerPhone}</Detail> : null}
          {data.note ? <Detail label="Note">{data.note}</Detail> : null}
        </dl>
      </section>
    </div>
  )
}
