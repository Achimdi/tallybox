import { Ban } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import type { Order } from '@/api/types'
import { Banner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Money } from '@/components/Money'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { formatOrderNumber, paymentMethodLabel } from '@/domain/orders'
import { STOCK_LIMITS } from '@/domain/stock'
import { useSessionUser } from '@/features/auth/session'
import { ReceiptActions } from '@/features/receipts/ReceiptActions'
import { formatDateTime } from '@/lib/dates'
import { userMessage, toAppError } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useOrder, useVoidOrder } from './api'
import { portalBase } from './portal'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-normal text-ink-muted">{label}</dt>
      <dd className="text-body break-words text-ink">{children}</dd>
    </div>
  )
}

/** Owner only: cancel a completed order. Its stock goes back and it stays on record as voided. */
function VoidOrder({ order }: { order: Order }) {
  const toast = useToast()
  const online = useOnlineStatus()
  const voidOrder = useVoidOrder()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | undefined>()

  const confirm = () => {
    if (reason.trim() === '') {
      setProblem('Say why it is being voided.')
      return
    }
    voidOrder.mutate(
      { orderId: order.id, reason },
      {
        onSuccess: () => {
          setOpen(false)
          toast({
            title: `Order ${formatOrderNumber(order.orderNumber)} voided`,
            description: 'Its stock was returned.',
            tone: 'success',
          })
        },
        onError: (thrown) => {
          const message = userMessage(toAppError(thrown))
          setProblem(`${message.title}. ${message.description}`)
        },
      },
    )
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setReason('')
          setProblem(undefined)
          setOpen(true)
        }}
        disabled={!online}
        leadingIcon={<Ban aria-hidden="true" className="size-5" />}
      >
        Void order
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Void order ${formatOrderNumber(order.orderNumber)}?`}
        description="Use this for a mistake or a refund. Its items go back into stock. The order stays on record, marked voided, and this can't be undone."
        confirmLabel="Void order"
        tone="danger"
        loading={voidOrder.isPending}
        onConfirm={confirm}
      >
        <TextField
          label="Reason"
          required
          autoComplete="off"
          maxLength={STOCK_LIMITS.voidReasonMax}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setProblem(undefined)
          }}
          error={problem}
        />
      </ConfirmDialog>
    </>
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

      <section aria-labelledby="receipt-title" className="flex flex-col gap-3">
        <h2 id="receipt-title" className="text-title text-ink">
          Receipt
        </h2>
        <ReceiptActions order={data} />
      </section>

      {user.role === 'owner' && data.status === 'completed' ? (
        <div>
          <VoidOrder order={data} />
        </div>
      ) : null}
    </div>
  )
}
