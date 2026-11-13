import { CirclePause, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { HeldOrder } from '@/api/types'
import { Button, ButtonLink } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { Tabs } from '@/components/Tabs'
import { useToast } from '@/components/toast-context'
import { formatOrderNumber, paymentMethodLabel } from '@/domain/orders'
import { useSessionUser } from '@/features/auth/session'
import { formatTime } from '@/lib/dates'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useDiscardHeldOrder, useHeldOrders, useMyOrders } from './api'
import { cartIsEmpty, loadHeldIntoCart } from './cartStore'
import { portalBase } from './portal'

type Tab = 'today' | 'held'

function itemCount(lines: readonly { quantity: number }[]): string {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

/**
 * Today's orders taken by the signed-in person, and their held orders.
 * There is no day total here: staff do not see sales totals.
 */
export default function MyOrdersPage() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'
  const base = portalBase(user.role)
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const orders = useMyOrders()
  const held = useHeldOrders()
  const discard = useDiscardHeldOrder()
  const [tab, setTab] = useState<Tab>('today')
  const [toDiscard, setToDiscard] = useState<HeldOrder | null>(null)
  const [toResume, setToResume] = useState<HeldOrder | null>(null)

  const resume = (hold: HeldOrder) => {
    loadHeldIntoCart(user.id, hold)
    void navigate(`${base}/new-order`)
  }

  const askToResume = (hold: HeldOrder) => {
    if (cartIsEmpty(user.id)) resume(hold)
    else setToResume(hold)
  }

  const confirmDiscard = () => {
    if (!toDiscard) return
    discard.mutate(toDiscard.id, {
      onSuccess: () => toast({ title: 'Held order discarded', tone: 'success' }),
      onError: () =>
        toast({ title: "Couldn't discard it", description: 'Try again.', tone: 'error' }),
      onSettled: () => setToDiscard(null),
    })
  }

  const todayContent = orders.isPending ? (
    <SkeletonList rows={4} label="Loading orders" />
  ) : orders.isError ? (
    <div className="rounded-card border border-line bg-surface-raised">
      <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
    </div>
  ) : orders.data.length === 0 ? (
    <div className="rounded-card border border-line bg-surface-raised">
      <EmptyState
        title="No orders yet today"
        action={<ButtonLink to={`${base}/new-order`}>New order</ButtonLink>}
      />
    </div>
  ) : (
    <ListGroup>
      {orders.data.map((order) => (
        <ListItem
          key={order.id}
          to={`${base}/orders/${order.id}`}
          leading={<ReceiptText aria-hidden="true" className="size-5" />}
          title={`${formatOrderNumber(order.orderNumber)} · ${formatTime(new Date(order.createdAt), timezone)}`}
          subtitle={[
            itemCount(order.lines),
            paymentMethodLabel(order.paymentMethod),
            order.customerName,
          ]
            .filter(Boolean)
            .join(' · ')}
          trailing={
            order.status === 'voided' ? (
              <StatusChip status="voided" />
            ) : (
              <Money minor={order.total} currency={currency} className="font-semibold text-ink" />
            )
          }
        />
      ))}
    </ListGroup>
  )

  const heldContent = held.isPending ? (
    <SkeletonList rows={2} label="Loading held orders" />
  ) : held.isError ? (
    <div className="rounded-card border border-line bg-surface-raised">
      <ErrorState error={held.error} onRetry={() => void held.refetch()} />
    </div>
  ) : held.data.length === 0 ? (
    <div className="rounded-card border border-line bg-surface-raised">
      <EmptyState
        title="No held orders"
        description="Hold an order on New order while you wait for a payment to arrive."
      />
    </div>
  ) : (
    <ul className="flex flex-col gap-3">
      {held.data.map((hold) => (
        <li
          key={hold.id}
          className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <CirclePause aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
              <div className="flex min-w-0 flex-col">
                <span className="text-body font-medium break-words text-ink">
                  {hold.customerName ?? 'Held order'}
                </span>
                <span className="text-label font-normal text-ink-muted">
                  {[
                    `Held ${formatTime(new Date(hold.updatedAt), timezone)}`,
                    itemCount(hold.lines),
                    user.role === 'owner' ? hold.staffName : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {hold.note ? (
                  <span className="text-label font-normal break-words text-ink-muted">
                    {hold.note}
                  </span>
                ) : null}
              </div>
            </div>
            <Money
              minor={hold.total}
              currency={currency}
              className="shrink-0 font-semibold text-ink"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => askToResume(hold)} className="flex-1">
              Resume
            </Button>
            <Button variant="secondary" onClick={() => setToDiscard(hold)} disabled={!online}>
              Discard
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title-lg text-ink">My orders</h1>
      <Tabs
        label="Orders"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            value: 'today',
            label: 'Today',
            ...(orders.data ? { count: orders.data.length } : {}),
            content: todayContent,
          },
          {
            value: 'held',
            label: 'Held',
            ...(held.data ? { count: held.data.length } : {}),
            content: heldContent,
          },
        ]}
      />

      <ConfirmDialog
        open={toDiscard !== null}
        onOpenChange={(open) => {
          if (!open) setToDiscard(null)
        }}
        title="Discard this held order?"
        description="It is removed for good. No stock was taken for it, so nothing else changes."
        confirmLabel="Discard"
        tone="danger"
        loading={discard.isPending}
        onConfirm={confirmDiscard}
      />
      <ConfirmDialog
        open={toResume !== null}
        onOpenChange={(open) => {
          if (!open) setToResume(null)
        }}
        title="Replace the current cart?"
        description="The cart on New order has items in it. Resuming this held order replaces them."
        confirmLabel="Replace cart"
        onConfirm={() => {
          if (toResume) resume(toResume)
          setToResume(null)
        }}
      />
    </div>
  )
}
