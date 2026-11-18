import {
  Ban,
  Banknote,
  CirclePlus,
  Package,
  PackagePlus,
  ReceiptText,
  Truck,
  UserPlus,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Banner } from '@/components/Banner'
import { ButtonLink } from '@/components/Button'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { SectionHeader } from '@/components/SectionHeader'
import { Skeleton } from '@/components/Skeleton'
import { StatCard } from '@/components/StatCard'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { ACCESS_GRACE_DAYS, accessEndsSoon, DAY_MS, daysUntilAccessEnds } from '@/domain/access'
import { PAYMENT_METHODS } from '@/domain/orders'
import { trendAgainst } from '@/domain/reports'
import { useSessionUser } from '@/features/auth/session'
import { useItems } from '@/features/items/api'
import { useStaffList } from '@/features/staff/api'
import { SUPPORT_EMAIL } from '@/lib/config'
import { formatDate, formatDateKey } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { stockStatus } from '@/lib/stock'
import { useDashboard } from './api'

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface-raised p-4 shadow-soft">
      {children}
    </div>
  )
}

/** The owner's first screen: today at a glance, what needs attention, quick actions. */
export default function OwnerHomePage() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'
  const dashboard = useDashboard()
  const items = useItems()
  const staff = useStaffList()

  const daysLeft = daysUntilAccessEnds(user.accessEndsAt, new Date())
  const showAccessBanner = accessEndsSoon(user.accessEndsAt, new Date())
  const needsItems = items.data !== undefined && items.data.length === 0
  const needsStaff = staff.data !== undefined && staff.data.length === 0
  const endsOn = user.accessEndsAt ? new Date(user.accessEndsAt) : null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">Dashboard</h1>
        <p className="text-body text-ink-muted">
          {dashboard.data ? formatDateKey(dashboard.data.today.dateKey) : 'Today'}
        </p>
      </header>

      {showAccessBanner && endsOn && daysLeft !== null ? (
        <Banner
          tone="info"
          title={
            daysLeft >= 0
              ? `Your Tallybox access ends on ${formatDate(endsOn, timezone)}`
              : `Your Tallybox access ended on ${formatDate(endsOn, timezone)}`
          }
          description={
            daysLeft >= 0
              ? `Contact ${SUPPORT_EMAIL}`
              : `You can keep working until ${formatDate(new Date(endsOn.getTime() + ACCESS_GRACE_DAYS * DAY_MS), timezone)}. Contact ${SUPPORT_EMAIL}`
          }
        />
      ) : null}

      <nav aria-label="Quick actions" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ButtonLink
          to="/owner/new-order"
          leadingIcon={<CirclePlus aria-hidden="true" className="size-5" />}
        >
          New order
        </ButtonLink>
        <ButtonLink
          to="/owner/restock"
          variant="secondary"
          leadingIcon={<Truck aria-hidden="true" className="size-5" />}
        >
          Restock
        </ButtonLink>
        <ButtonLink
          to="/owner/items/new"
          variant="secondary"
          leadingIcon={<PackagePlus aria-hidden="true" className="size-5" />}
        >
          Add item
        </ButtonLink>
      </nav>

      {needsItems || needsStaff ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Get set up" />
          <ListGroup>
            <ListItem
              to="/owner/items/new"
              leading={<Package aria-hidden="true" className="size-5" />}
              title="Add your first items"
              subtitle="What you sell, with prices and stock"
              trailing={needsItems ? undefined : <StatusChip status="completed" label="Done" />}
            />
            <ListItem
              to="/owner/staff/new"
              leading={<UserPlus aria-hidden="true" className="size-5" />}
              title="Create a staff account"
              subtitle={`Staff sign in with your business code: ${user.businessCode ?? ''}`}
              trailing={needsStaff ? undefined : <StatusChip status="completed" label="Done" />}
            />
          </ListGroup>
        </section>
      ) : null}

      {dashboard.isPending ? (
        <div role="status" className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <span className="sr-only">Loading today&apos;s figures</span>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-card" />
          ))}
        </div>
      ) : dashboard.isError ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      ) : (
        <>
          <section aria-label="Today" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard
              label="Sales today"
              icon={Banknote}
              value={<Money minor={dashboard.data.today.sales} currency={currency} />}
              trend={trendAgainst(
                dashboard.data.today.sales,
                dashboard.data.yesterday.sales,
                'percent',
              )}
              className="col-span-2 md:col-span-1"
            />
            <StatCard
              label="Orders"
              icon={ReceiptText}
              value={dashboard.data.today.orders}
              trend={trendAgainst(
                dashboard.data.today.orders,
                dashboard.data.yesterday.orders,
                'count',
              )}
            />
            <StatCard
              label="Voided"
              icon={Ban}
              value={dashboard.data.today.voided}
              trend={{
                direction: 'flat',
                label:
                  dashboard.data.today.voided > 0
                    ? `${formatMoney(dashboard.data.today.voidedTotal, currency)} voided`
                    : 'None today',
              }}
            />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <SectionHeader title="Payment methods today" />
              <Card>
                {dashboard.data.today.sales === 0 ? (
                  <p className="text-body text-ink-muted">No sales yet today.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {PAYMENT_METHODS.map((method) => {
                      const amount = dashboard.data.today.byPaymentMethod[method.value]
                      const share = Math.round((amount / dashboard.data.today.sales) * 100)
                      return (
                        <li key={method.value} className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="text-body text-ink">{method.label}</span>
                            <span className="text-body text-ink">
                              <Money minor={amount} currency={currency} className="font-semibold" />
                              <span className="text-label font-normal text-ink-muted">
                                {' '}
                                · {share}%
                              </span>
                            </span>
                          </div>
                          <div
                            className="h-2 overflow-hidden rounded-full bg-surface-sunken"
                            aria-hidden="true"
                          >
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            </section>

            <section className="flex flex-col gap-3">
              <SectionHeader title="Top items today" />
              {dashboard.data.topItemsToday.length === 0 ? (
                <Card>
                  <p className="text-body text-ink-muted">Nothing sold yet today.</p>
                </Card>
              ) : (
                <ListGroup>
                  {dashboard.data.topItemsToday.map((entry) => (
                    <ListItem
                      key={entry.itemId}
                      to={`/owner/items/${entry.itemId}`}
                      title={entry.name}
                      subtitle={`${entry.quantity} sold`}
                      trailing={
                        <Money
                          minor={entry.sales}
                          currency={currency}
                          className="font-semibold text-ink"
                        />
                      }
                    />
                  ))}
                </ListGroup>
              )}
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Low on stock"
              action={
                <ButtonLink to="/owner/restock" variant="ghost">
                  Restock
                </ButtonLink>
              }
            />
            {dashboard.data.lowStock.length === 0 && dashboard.data.lowSupplies.length === 0 ? (
              <Card>
                <EmptyState title="Nothing is running low" className="py-4" />
              </Card>
            ) : (
              <ListGroup>
                {dashboard.data.lowSupplies.map((supply) => {
                  const status = stockStatus(supply.quantity, supply.lowStockLevel)
                  return (
                    <ListItem
                      key={supply.id}
                      to={`/owner/supplies/${supply.id}`}
                      title={supply.name}
                      subtitle={`Shared supply · low-stock level ${supply.lowStockLevel}`}
                      trailing={
                        <StatusChip
                          status={status}
                          label={
                            status === 'out_of_stock' ? 'Out of stock' : `${supply.quantity} left`
                          }
                        />
                      }
                    />
                  )
                })}
                {dashboard.data.lowStock.map((item) => {
                  const status = stockStatus(item.quantity, item.lowStockLevel)
                  return (
                    <ListItem
                      key={item.id}
                      to={`/owner/items/${item.id}`}
                      title={item.name}
                      subtitle={`Low-stock level: ${item.lowStockLevel}`}
                      trailing={
                        <StatusChip
                          status={status}
                          label={
                            status === 'out_of_stock' ? 'Out of stock' : `${item.quantity} left`
                          }
                        />
                      }
                    />
                  )
                })}
              </ListGroup>
            )}
          </section>
        </>
      )}
    </div>
  )
}
