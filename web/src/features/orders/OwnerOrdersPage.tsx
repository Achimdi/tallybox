import { ReceiptText } from 'lucide-react'
import { useState } from 'react'
import type { OrderStatus } from '@/api/types'
import { Button } from '@/components/Button'
import { FilterChips } from '@/components/FilterChips'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { SearchBar } from '@/components/SearchBar'
import { SelectField } from '@/components/SelectField'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { Tabs } from '@/components/Tabs'
import { TextField } from '@/components/TextField'
import {
  formatOrderNumber,
  PAYMENT_METHODS,
  paymentMethodLabel,
  type PaymentMethod,
} from '@/domain/orders'
import { useSessionUser } from '@/features/auth/session'
import { useStaffList } from '@/features/staff/api'
import { addDays, dateKey, formatDateTime, formatTime, monthStart, weekStart } from '@/lib/dates'
import { useHeldOrders, useOrderList } from './api'
import { HeldOrdersList, itemCount } from './HeldOrdersList'

type Tab = 'orders' | 'held'
type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

const PRESETS: readonly { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]

function rangeFor(preset: Preset, today: string): { from: string; to: string } | null {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'week':
      return { from: weekStart(today), to: today }
    case 'month':
      return { from: monthStart(today), to: today }
    case 'custom':
      return null
  }
}

function OrdersTab() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'
  const today = dateKey(new Date(), timezone)
  const staff = useStaffList()

  const [preset, setPreset] = useState<Preset>('today')
  const [customFrom, setCustomFrom] = useState(addDays(today, -6))
  const [customTo, setCustomTo] = useState(today)
  const [staffId, setStaffId] = useState('')
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [search, setSearch] = useState('')

  const range = rangeFor(preset, today) ?? { from: customFrom, to: customTo }
  const orders = useOrderList({
    from: range.from,
    to: range.to,
    ...(staffId ? { staffId } : {}),
    ...(status ? { status } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  })

  const rows = orders.data?.pages.flatMap((page) => page.rows) ?? []
  const total = orders.data?.pages[0]?.total ?? 0
  const filtered = staffId !== '' || status !== '' || paymentMethod !== '' || search.trim() !== ''

  let list
  if (orders.isPending) {
    list = <SkeletonList rows={5} label="Loading orders" />
  } else if (orders.isError) {
    list = (
      <div className="rounded-card border border-line bg-surface-raised">
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      </div>
    )
  } else if (rows.length === 0) {
    list = (
      <div className="rounded-card border border-line bg-surface-raised">
        <EmptyState
          title={filtered ? 'No orders match' : 'No orders in this period'}
          description={
            filtered
              ? 'Try clearing a filter.'
              : 'Orders appear here as soon as they are confirmed.'
          }
        />
      </div>
    )
  } else {
    list = (
      <div className="flex flex-col gap-3">
        <p className="text-label font-normal text-ink-muted" aria-live="polite">
          {total} {total === 1 ? 'order' : 'orders'}
        </p>
        <ListGroup>
          {rows.map((order) => (
            <ListItem
              key={order.id}
              to={`/owner/orders/${order.id}`}
              leading={<ReceiptText aria-hidden="true" className="size-5" />}
              title={`${formatOrderNumber(order.orderNumber)} · ${(range.from === range.to ? formatTime : formatDateTime)(new Date(order.createdAt), timezone)}`}
              subtitle={[
                order.staffName,
                itemCount(order.lines),
                paymentMethodLabel(order.paymentMethod),
              ].join(' · ')}
              trailing={
                order.status === 'voided' ? (
                  <StatusChip status="voided" />
                ) : (
                  <Money
                    minor={order.total}
                    currency={currency}
                    className="font-semibold text-ink"
                  />
                )
              }
            />
          ))}
        </ListGroup>
        {orders.hasNextPage ? (
          <Button
            variant="secondary"
            onClick={() => void orders.fetchNextPage()}
            loading={orders.isFetchingNextPage}
            loadingLabel="Loading…"
          >
            Load more
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterChips label="Period" options={PRESETS} value={preset} onChange={setPreset} />
      {preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
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
      <SearchBar
        value={search}
        onChange={setSearch}
        label="Find an order number"
        placeholder="Order number, like 1042"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField
          label="Taken by"
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
          options={[
            { value: '', label: 'Everyone' },
            { value: user.id, label: `${user.displayName} (you)` },
            ...(staff.data ?? []).map((member) => ({
              value: member.id,
              label: member.displayName,
            })),
          ]}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as OrderStatus | '')}
          options={[
            { value: '', label: 'All' },
            { value: 'completed', label: 'Completed' },
            { value: 'voided', label: 'Voided' },
          ]}
        />
        <SelectField
          label="Payment"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | '')}
          options={[{ value: '', label: 'All' }, ...PAYMENT_METHODS]}
        />
      </div>
      {list}
    </div>
  )
}

/** Owner: every order in the business, filterable, plus everyone's held orders. */
export default function OwnerOrdersPage() {
  const held = useHeldOrders()
  const [tab, setTab] = useState<Tab>('orders')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title-lg text-ink">Orders</h1>
      <Tabs
        label="Orders"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'orders', label: 'Orders', content: <OrdersTab /> },
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
