import { Boxes, Plus, Truck } from 'lucide-react'
import { useState } from 'react'
import type { Supply } from '@/api/types'
import { BackLink } from '@/components/BackLink'
import { ButtonLink } from '@/components/Button'
import { FilterChips } from '@/components/FilterChips'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { joinNames } from '@/domain/supplies'
import { stockStatus } from '@/lib/stock'
import { useSupplies } from './api'

type View = 'in_use' | 'low' | 'archived'

export function SupplyStock({
  supply,
}: {
  supply: Pick<Supply, 'quantity' | 'lowStockLevel' | 'unit'>
}) {
  const status = stockStatus(supply.quantity, supply.lowStockLevel)
  if (status === 'in_stock') {
    return (
      <span className="text-label font-normal text-ink-muted tabular-nums">
        {supply.quantity} {supply.unit ? `${supply.unit}s` : 'in stock'}
      </span>
    )
  }
  return (
    <StatusChip
      status={status}
      label={status === 'out_of_stock' ? 'Out of stock' : `Low: ${supply.quantity} left`}
    />
  )
}

/**
 * Shared supplies: packaging or materials that several items use, like 300 ml
 * bottles for every drink. Selling one of those items uses some of each.
 */
export default function SuppliesPage() {
  const supplies = useSupplies()
  const [view, setView] = useState<View>('in_use')
  const all = supplies.data ?? []
  const low = (supply: Supply) => supply.active && supply.quantity <= supply.lowStockLevel
  const views = [
    {
      value: 'in_use' as const,
      label: 'In use',
      count: all.filter((supply) => supply.active).length,
    },
    { value: 'low' as const, label: 'Low', count: all.filter(low).length },
    {
      value: 'archived' as const,
      label: 'Archived',
      count: all.filter((supply) => !supply.active).length,
    },
  ]
  const shown = all.filter((supply) =>
    view === 'archived' ? !supply.active : view === 'low' ? low(supply) : supply.active,
  )

  let body
  if (supplies.isPending) {
    body = <SkeletonList rows={3} label="Loading supplies" />
  } else if (supplies.isError) {
    body = (
      <div className="rounded-card border border-line bg-surface-raised">
        <ErrorState error={supplies.error} onRetry={() => void supplies.refetch()} />
      </div>
    )
  } else if (all.length === 0) {
    body = (
      <div className="rounded-card border border-line bg-surface-raised">
        <EmptyState
          title="No supplies yet"
          description="Add a supply when several items share packaging or materials, for example 300 ml bottles used by every drink. Then choose it on each item."
          action={<ButtonLink to="/owner/supplies/new">Add supply</ButtonLink>}
        />
      </div>
    )
  } else if (shown.length === 0) {
    body = (
      <div className="rounded-card border border-line bg-surface-raised">
        <EmptyState title={view === 'low' ? 'Nothing is running low' : 'No archived supplies'} />
      </div>
    )
  } else {
    body = (
      <ListGroup>
        {shown.map((supply) => (
          <ListItem
            key={supply.id}
            wrap
            to={`/owner/supplies/${supply.id}`}
            leading={<Boxes aria-hidden="true" className="size-5" />}
            title={supply.name}
            subtitle={
              supply.usedBy.length === 0
                ? 'Not used by any item yet'
                : `Used by ${joinNames(supply.usedBy.map((use) => use.name))}`
            }
            trailing={
              supply.active ? (
                <SupplyStock supply={supply} />
              ) : (
                <StatusChip status="voided" label="Archived" />
              )
            }
          />
        ))}
      </ListGroup>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/owner/items" label="Items" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title-lg text-ink">Supplies</h1>
          <p className="text-body text-ink-muted">
            Stock shared by several items, like bottles and caps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            to="/owner/restock"
            variant="secondary"
            leadingIcon={<Truck aria-hidden="true" className="size-5" />}
          >
            Restock
          </ButtonLink>
          <ButtonLink
            to="/owner/supplies/new"
            leadingIcon={<Plus aria-hidden="true" className="size-5" />}
          >
            Add supply
          </ButtonLink>
        </div>
      </header>
      {all.length > 0 ? (
        <FilterChips label="Show" options={views} value={view} onChange={setView} />
      ) : null}
      {body}
    </div>
  )
}
