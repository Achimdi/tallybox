import { PackagePlus, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, ButtonLink } from '@/components/Button'
import { FilterChips } from '@/components/FilterChips'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { SearchBar } from '@/components/SearchBar'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { useSessionUser } from '@/features/auth/session'
import { stockStatus } from '@/lib/stock'
import { categoriesOf, matchesSearch, useItems } from './api'

type View = 'on_sale' | 'low' | 'archived'
const ALL = '__all__'

/** The owner's item list: search, category, low stock and archived. */
export default function OwnerItemsPage() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const items = useItems()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('on_sale')
  const [category, setCategory] = useState(ALL)

  const all = useMemo(() => items.data ?? [], [items.data])
  const views = [
    {
      value: 'on_sale' as const,
      label: 'On sale',
      count: all.filter((item) => item.active).length,
    },
    {
      value: 'low' as const,
      label: 'Low stock',
      count: all.filter((item) => item.active && item.quantity <= item.lowStockLevel).length,
    },
    {
      value: 'archived' as const,
      label: 'Archived',
      count: all.filter((item) => !item.active).length,
    },
  ]
  const categories = [
    { value: ALL, label: 'All categories' },
    ...categoriesOf(all).map((name) => ({ value: name, label: name })),
  ]
  const shown = all.filter(
    (item) =>
      (view === 'archived' ? !item.active : item.active) &&
      (view !== 'low' || item.quantity <= item.lowStockLevel) &&
      (category === ALL || item.category === category) &&
      matchesSearch(item.name, search),
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title-lg text-ink">Items</h1>
        <div className="flex gap-2">
          <ButtonLink
            to="/owner/restock"
            variant="secondary"
            leadingIcon={<Truck aria-hidden="true" className="size-5" />}
          >
            Restock
          </ButtonLink>
          <ButtonLink
            to="/owner/items/new"
            leadingIcon={<PackagePlus aria-hidden="true" className="size-5" />}
          >
            Add item
          </ButtonLink>
        </div>
      </header>

      <SearchBar
        value={search}
        onChange={setSearch}
        label="Search items"
        placeholder="Search items"
      />
      <FilterChips label="Show" options={views} value={view} onChange={setView} />
      {categories.length > 2 ? (
        <FilterChips
          label="Category"
          options={categories}
          value={category}
          onChange={setCategory}
        />
      ) : null}

      {items.isPending ? (
        <SkeletonList rows={6} label="Loading items" />
      ) : items.isError ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <ErrorState error={items.error} onRetry={() => void items.refetch()} />
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <EmptyState
            title="No items yet"
            description="Add what you sell, with prices and stock."
            action={<ButtonLink to="/owner/items/new">Add item</ButtonLink>}
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <EmptyState
            title={
              view === 'archived'
                ? 'No archived items'
                : view === 'low'
                  ? 'Nothing is running low'
                  : 'No items match'
            }
            action={
              search || category !== ALL ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    setCategory(ALL)
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ListGroup>
          {shown.map((item) => {
            const status = stockStatus(item.quantity, item.lowStockLevel)
            return (
              <ListItem
                key={item.id}
                wrap
                to={`/owner/items/${item.id}`}
                title={item.name}
                subtitle={
                  <>
                    <Money minor={item.price} currency={currency} />
                    {item.category ? ` · ${item.category}` : ''}
                  </>
                }
                trailing={
                  !item.active ? (
                    <StatusChip status="voided" label="Archived" />
                  ) : status === 'in_stock' ? (
                    <span className="text-label font-normal text-ink-muted tabular-nums">
                      {item.quantity} in stock
                    </span>
                  ) : (
                    <StatusChip
                      status={status}
                      label={
                        status === 'out_of_stock' ? 'Out of stock' : `Low: ${item.quantity} left`
                      }
                    />
                  )
                }
              />
            )
          })}
        </ListGroup>
      )}
    </div>
  )
}
