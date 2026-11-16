import { useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { FilterChips } from '@/components/FilterChips'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { SearchBar } from '@/components/SearchBar'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { useSessionUser } from '@/features/auth/session'
import { StockLabel } from './StockLabel'
import { categoriesOf, matchesSearch, useItems } from './api'

const ALL = '__all__'

/** Read-only item list for staff: what is sold, its price and how many are left. */
export default function StaffItemsPage() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const items = useItems()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(ALL)

  const forSale = useMemo(() => (items.data ?? []).filter((item) => item.active), [items.data])
  const categories = [
    { value: ALL, label: 'All' },
    ...categoriesOf(forSale).map((name) => ({ value: name, label: name })),
  ]
  const shown = forSale.filter(
    (item) => (category === ALL || item.category === category) && matchesSearch(item.name, search),
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title-lg text-ink">Items</h1>
      <SearchBar
        value={search}
        onChange={setSearch}
        label="Search items"
        placeholder="Search items"
      />
      {categories.length > 1 ? (
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
      ) : forSale.length === 0 ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <EmptyState title="No items yet" description="Ask the owner to add items." />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <EmptyState
            title="No items match"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setCategory(ALL)
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <ListGroup>
          {shown.map((item) => (
            <ListItem
              key={item.id}
              wrap
              title={item.name}
              subtitle={
                <>
                  <Money minor={item.price} currency={currency} />
                  {item.unit ? ` per ${item.unit}` : ''}
                  {item.category ? ` · ${item.category}` : ''}
                </>
              }
              trailing={<StockLabel item={item} />}
            />
          ))}
        </ListGroup>
      )}
    </div>
  )
}
