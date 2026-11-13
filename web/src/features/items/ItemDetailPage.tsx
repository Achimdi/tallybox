import { Archive, Pencil, RotateCcw, Scale, Truck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Banner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button, ButtonLink } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Money } from '@/components/Money'
import { SectionHeader } from '@/components/SectionHeader'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { useToast } from '@/components/toast-context'
import { useSessionUser } from '@/features/auth/session'
import { useMovements } from '@/features/stock/api'
import { MovementList } from '@/features/stock/MovementList'
import { AppError } from '@/lib/errors'
import { stockStatus } from '@/lib/stock'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useItemCosts, useItems, useSetItemArchived } from './api'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-normal text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  )
}

/** One item: prices, stock, actions, and every stock change it has had. */
export default function ItemDetailPage() {
  const { itemId = '' } = useParams()
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const toast = useToast()
  const online = useOnlineStatus()
  const items = useItems()
  const costs = useItemCosts()
  const history = useMovements({ itemId })
  const setArchived = useSetItemArchived()
  const [confirming, setConfirming] = useState(false)

  if (items.isPending) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading item</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    )
  }
  const item = items.data?.find((candidate) => candidate.id === itemId)
  if (items.isError || !item) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/owner/items" label="Items" />
        <ErrorState
          headingLevel={1}
          error={items.error ?? new AppError('not_found')}
          {...(items.isError ? { onRetry: () => void items.refetch() } : {})}
        />
      </div>
    )
  }

  const cost = costs.data?.[item.id]
  const status = stockStatus(item.quantity, item.lowStockLevel)
  const margin =
    cost !== undefined && item.price > 0
      ? Math.round(((item.price - cost) / item.price) * 100)
      : null

  const toggleArchived = () => {
    setArchived.mutate(
      { itemId: item.id, archived: item.active },
      {
        onSuccess: () =>
          toast({ title: item.active ? 'Item archived' : 'Item restored', tone: 'success' }),
        onSettled: () => setConfirming(false),
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <BackLink to="/owner/items" label="Items" />
      <header className="flex flex-col gap-2">
        <h1 className="text-title-lg break-words text-ink">{item.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {item.active ? (
            <StatusChip
              status={status}
              label={
                status === 'in_stock'
                  ? `${item.quantity} in stock`
                  : status === 'out_of_stock'
                    ? 'Out of stock'
                    : `Low: ${item.quantity} left`
              }
            />
          ) : (
            <StatusChip status="voided" label="Archived" />
          )}
          {item.category ? (
            <span className="text-label font-normal text-ink-muted">{item.category}</span>
          ) : null}
        </div>
      </header>

      {!item.active ? (
        <Banner
          tone="info"
          title="This item is archived"
          description="It can't be sold and staff don't see it. Its history and stock are kept. Restore it to sell it again."
        />
      ) : null}

      <section
        aria-label="Details"
        className="rounded-card border border-line bg-surface-raised p-5 shadow-soft"
      >
        <dl className="grid grid-cols-2 gap-4">
          <Detail label="Selling price">
            <Money minor={item.price} currency={currency} className="font-semibold" />
            {item.unit ? <span className="text-ink-muted"> per {item.unit}</span> : null}
          </Detail>
          <Detail label="Cost price">
            {cost !== undefined ? (
              <Money minor={cost} currency={currency} />
            ) : (
              <span className="text-ink-muted">Not set</span>
            )}
            {margin !== null ? <span className="text-ink-muted"> · {margin}% margin</span> : null}
          </Detail>
          <Detail label="In stock">
            <span className="tabular-nums">{item.quantity}</span>
          </Detail>
          <Detail label="Low-stock level">
            <span className="tabular-nums">{item.lowStockLevel}</span>
          </Detail>
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ButtonLink
          to={`/owner/items/${item.id}/edit`}
          variant="secondary"
          leadingIcon={<Pencil aria-hidden="true" className="size-5" />}
        >
          Edit
        </ButtonLink>
        {item.active ? (
          <>
            <ButtonLink
              to={`/owner/restock?item=${item.id}`}
              variant="secondary"
              leadingIcon={<Truck aria-hidden="true" className="size-5" />}
            >
              Restock
            </ButtonLink>
            <ButtonLink
              to={`/owner/items/${item.id}/adjust`}
              variant="secondary"
              leadingIcon={<Scale aria-hidden="true" className="size-5" />}
            >
              Adjust
            </ButtonLink>
          </>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => (item.active ? setConfirming(true) : toggleArchived())}
          disabled={!online}
          loading={setArchived.isPending && !confirming}
          leadingIcon={
            item.active ? (
              <Archive aria-hidden="true" className="size-5" />
            ) : (
              <RotateCcw aria-hidden="true" className="size-5" />
            )
          }
        >
          {item.active ? 'Archive' : 'Restore'}
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Stock history" />
        <MovementList movements={history} showItem={false} emptyTitle="No stock changes yet" />
      </section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${item.name}?`}
        description="It stops being sold and staff no longer see it. Its history and stock are kept, and you can restore it at any time."
        confirmLabel="Archive"
        loading={setArchived.isPending}
        onConfirm={toggleArchived}
      />
    </div>
  )
}
