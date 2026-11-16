import { Archive, Pencil, RotateCcw, Scale, Truck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Banner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button, ButtonLink } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { SectionHeader } from '@/components/SectionHeader'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { useToast } from '@/components/toast-context'
import { useSessionUser } from '@/features/auth/session'
import { useMovements } from '@/features/stock/api'
import { MovementList } from '@/features/stock/MovementList'
import { AppError, toAppError, userMessage } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useSetSupplyArchived, useSupplies, useSupplyCosts } from './api'
import { SupplyStock } from './SuppliesPage'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-normal text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  )
}

/** One supply: how much is left, which items use it, actions, and its full history. */
export default function SupplyDetailPage() {
  const { supplyId = '' } = useParams()
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const toast = useToast()
  const online = useOnlineStatus()
  const supplies = useSupplies()
  const costs = useSupplyCosts()
  const history = useMovements({ supplyId })
  const setArchived = useSetSupplyArchived()
  const [confirming, setConfirming] = useState(false)

  if (supplies.isPending) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading supply</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    )
  }
  const supply = supplies.data?.find((candidate) => candidate.id === supplyId)
  if (supplies.isError || !supply) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/owner/supplies" label="Supplies" />
        <ErrorState headingLevel={1} error={supplies.error ?? new AppError('not_found')} />
      </div>
    )
  }

  const cost = costs.data?.[supply.id]
  const toggle = () => {
    setArchived.mutate(
      { supplyId: supply.id, archived: supply.active },
      {
        onSuccess: () =>
          toast({ title: supply.active ? 'Supply archived' : 'Supply restored', tone: 'success' }),
        onError: (thrown) => {
          const message = userMessage(toAppError(thrown))
          toast({ title: message.title, description: message.description, tone: 'error' })
        },
        onSettled: () => setConfirming(false),
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <BackLink to="/owner/supplies" label="Supplies" />
      <header className="flex flex-col gap-2">
        <h1 className="text-title-lg break-words text-ink">{supply.name}</h1>
        <div>
          {supply.active ? (
            <SupplyStock supply={supply} />
          ) : (
            <StatusChip status="voided" label="Archived" />
          )}
        </div>
      </header>

      {!supply.active ? (
        <Banner
          tone="info"
          title="This supply is archived"
          description="Items can't use it. Its history is kept. Restore it to use it again."
        />
      ) : null}

      <section
        aria-label="Details"
        className="rounded-card border border-line bg-surface-raised p-5 shadow-soft"
      >
        <dl className="grid grid-cols-2 gap-4">
          <Detail label="In stock">
            <span className="tabular-nums">{supply.quantity}</span>
            {supply.unit ? <span className="text-ink-muted"> {supply.unit}s</span> : null}
          </Detail>
          <Detail label="Low-stock level">
            <span className="tabular-nums">{supply.lowStockLevel}</span>
          </Detail>
          <Detail label="Cost price">
            {cost !== undefined ? (
              <Money minor={cost} currency={currency} />
            ) : (
              <span className="text-ink-muted">Not set</span>
            )}
          </Detail>
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ButtonLink
          to={`/owner/supplies/${supply.id}/edit`}
          variant="secondary"
          leadingIcon={<Pencil aria-hidden="true" className="size-5" />}
        >
          Edit
        </ButtonLink>
        {supply.active ? (
          <ButtonLink
            to={`/owner/restock?supply=${supply.id}`}
            variant="secondary"
            leadingIcon={<Truck aria-hidden="true" className="size-5" />}
          >
            Restock
          </ButtonLink>
        ) : null}
        {/* Archived stock can still be counted, for example down to zero. */}
        <ButtonLink
          to={`/owner/supplies/${supply.id}/adjust`}
          variant="secondary"
          leadingIcon={<Scale aria-hidden="true" className="size-5" />}
        >
          Adjust
        </ButtonLink>
        <Button
          variant="secondary"
          onClick={() => (supply.active ? setConfirming(true) : toggle())}
          disabled={!online}
          loading={setArchived.isPending && !confirming}
          leadingIcon={
            supply.active ? (
              <Archive aria-hidden="true" className="size-5" />
            ) : (
              <RotateCcw aria-hidden="true" className="size-5" />
            )
          }
        >
          {supply.active ? 'Archive' : 'Restore'}
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Used by" />
        {supply.usedBy.length === 0 ? (
          <p className="text-body text-ink-muted">
            No item uses it yet. Edit an item and turn on &ldquo;Use shared supplies&rdquo; to
            choose it.
          </p>
        ) : (
          <ListGroup>
            {supply.usedBy.map((use) => (
              <ListItem
                key={use.itemId}
                to={`/owner/items/${use.itemId}`}
                title={use.name}
                subtitle={`Uses ${use.unitsPerSale} per sale`}
              />
            ))}
          </ListGroup>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Stock history" />
        <MovementList movements={history} showItem={false} emptyTitle="No stock changes yet" />
      </section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${supply.name}?`}
        description={
          supply.usedBy.length > 0
            ? 'Items on sale still use it, so it can only be archived after you change those items.'
            : 'Items can no longer use it. Its history is kept, and you can restore it at any time.'
        }
        confirmLabel="Archive"
        loading={setArchived.isPending}
        onConfirm={toggle}
      />
    </div>
  )
}
