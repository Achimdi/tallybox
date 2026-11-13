import { ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { ButtonLink } from '@/components/Button'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { Tabs } from '@/components/Tabs'
import { formatOrderNumber, paymentMethodLabel } from '@/domain/orders'
import { useSessionUser } from '@/features/auth/session'
import { formatTime } from '@/lib/dates'
import { useHeldOrders, useMyOrders } from './api'
import { HeldOrdersList, itemCount } from './HeldOrdersList'
import { portalBase } from './portal'

type Tab = 'today' | 'held'

/**
 * Today's orders taken by the signed-in person, and their held orders.
 * There is no day total here: staff do not see sales totals.
 */
export default function MyOrdersPage() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'
  const base = portalBase(user.role)
  const orders = useMyOrders()
  const held = useHeldOrders()
  const [tab, setTab] = useState<Tab>('today')

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
            content: <HeldOrdersList />,
          },
        ]}
      />
    </div>
  )
}
