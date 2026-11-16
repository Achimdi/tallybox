import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { StockMovement } from '@/api/types'
import { Button } from '@/components/Button'
import { Money } from '@/components/Money'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { formatOrderNumber } from '@/domain/orders'
import { adjustReasonLabel, formatDelta, movementTypeLabel } from '@/domain/stock'
import { useSessionUser } from '@/features/auth/session'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/dates'
import type { useMovements } from './api'

function describe(move: StockMovement): string {
  const parts = [`${move.quantityBefore} → ${move.quantityAfter}`]
  // A shared supply used (or returned) by a sale says which item it was for.
  if (move.sourceItemName) parts.push(`for ${move.sourceItemName}`)
  if (move.orderNumber !== null) parts.push(`order ${formatOrderNumber(move.orderNumber)}`)
  if (move.supplier) parts.push(move.supplier)
  parts.push(`by ${move.createdByName}`)
  return parts.join(' · ')
}

interface MovementListProps {
  movements: ReturnType<typeof useMovements>
  /** Show the item name on each row (the ledger), or not (one item's history). */
  showItem: boolean
  emptyTitle: string
}

/** Stock changes, newest first, with "Load more". Direction is shown by sign and arrow, not colour alone. */
export function MovementList({ movements, showItem, emptyTitle }: MovementListProps) {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'

  if (movements.isPending) return <SkeletonList rows={5} label="Loading stock changes" />
  if (movements.isError) {
    return (
      <div className="rounded-card border border-line bg-surface-raised">
        <ErrorState error={movements.error} onRetry={() => void movements.refetch()} />
      </div>
    )
  }
  const rows = movements.data.pages.flatMap((page) => page.rows)
  const total = movements.data.pages[0]?.total ?? 0
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface-raised">
        <EmptyState title={emptyTitle} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised shadow-soft">
        {rows.map((move) => {
          const up = move.delta > 0
          const Arrow = up ? ArrowUpRight : ArrowDownRight
          return (
            <li key={move.id} className="flex items-start gap-3 px-4 py-3">
              <Arrow
                aria-hidden="true"
                className={cn('mt-0.5 size-5 shrink-0', up ? 'text-success' : 'text-error-strong')}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-medium break-words text-ink">
                  {showItem ? `${move.itemName} · ` : ''}
                  {movementTypeLabel(move.type)}
                  {move.reason ? ` · ${adjustReasonLabel(move.reason)}` : ''}
                </span>
                <span className="text-label font-normal break-words text-ink-muted">
                  {describe(move)}
                </span>
                {move.note ? (
                  <span className="text-label font-normal break-words text-ink-muted">
                    “{move.note}”
                  </span>
                ) : null}
                <span className="text-caption text-ink-subtle">
                  {formatDateTime(new Date(move.createdAt), timezone)}
                  {move.unitCost !== null ? (
                    <>
                      {' · cost '}
                      <Money minor={move.unitCost} currency={currency} /> each
                    </>
                  ) : null}
                </span>
              </div>
              <span
                className={cn(
                  'shrink-0 text-body font-bold tabular-nums',
                  up ? 'text-success' : 'text-error-strong',
                )}
              >
                {formatDelta(move.delta)}
              </span>
            </li>
          )
        })}
      </ul>
      {movements.hasNextPage ? (
        <Button
          variant="secondary"
          onClick={() => void movements.fetchNextPage()}
          loading={movements.isFetchingNextPage}
          loadingLabel="Loading…"
        >
          Load more ({rows.length} of {total})
        </Button>
      ) : null}
    </div>
  )
}
