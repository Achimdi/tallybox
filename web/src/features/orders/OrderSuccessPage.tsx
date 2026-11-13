import { useParams } from 'react-router'
import { ButtonLink } from '@/components/Button'
import { Money } from '@/components/Money'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { SuccessCheck } from '@/components/SuccessCheck'
import { formatOrderNumber, paymentMethodLabel } from '@/domain/orders'
import { useSessionUser } from '@/features/auth/session'
import { ReceiptActions } from '@/features/receipts/ReceiptActions'
import { useOrder } from './api'
import { portalBase } from './portal'

/** Shown straight after confirming: the order is saved and stock has gone down. */
export default function OrderSuccessPage() {
  const { orderId = '' } = useParams()
  const user = useSessionUser()
  const base = portalBase(user.role)
  const order = useOrder(orderId)

  if (order.isPending) {
    return (
      <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 py-10">
        <span className="sr-only">Loading order</span>
        <Skeleton className="size-18 rounded-full" />
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }
  if (order.isError) {
    return <ErrorState headingLevel={1} error={order.error} onRetry={() => void order.refetch()} />
  }

  const data = order.data
  const itemCount = data.lines.reduce((sum, line) => sum + line.quantity, 0)
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-6 text-center">
      <SuccessCheck />
      <div className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">
          Order {formatOrderNumber(data.orderNumber)} confirmed
        </h1>
        <p className="text-body text-ink-muted">
          {itemCount} {itemCount === 1 ? 'item' : 'items'} ·{' '}
          {paymentMethodLabel(data.paymentMethod)}
          {data.customerName ? ` · ${data.customerName}` : ''}
        </p>
      </div>
      <Money
        minor={data.total}
        currency={user.currencyCode ?? 'NGN'}
        className="text-display text-ink"
      />
      <ReceiptActions order={data} />
      <div className="flex w-full flex-col gap-3 border-t border-line pt-6">
        <ButtonLink to={`${base}/new-order`} size="lg" variant="secondary" fullWidth>
          New order
        </ButtonLink>
        <ButtonLink to={`${base}/orders/${data.id}`} variant="ghost" fullWidth>
          View order
        </ButtonLink>
      </div>
    </div>
  )
}
