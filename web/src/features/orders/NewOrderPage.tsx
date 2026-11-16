import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheet } from '@/components/BottomSheet'
import { Button, ButtonLink } from '@/components/Button'
import { CartBar } from '@/components/CartBar'
import { FilterChips } from '@/components/FilterChips'
import { ItemCard } from '@/components/ItemCard'
import { SearchBar } from '@/components/SearchBar'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { cartCount } from '@/domain/orders'
import { useSessionUser } from '@/features/auth/session'
import { categoriesOf, matchesSearch, useItems } from '@/features/items/api'
import { useMediaQuery, WIDE_SCREEN } from '@/lib/useMediaQuery'
import { useSupplies } from '@/features/supplies/api'
import { CartPanel } from './CartPanel'
import { useCart } from './cartStore'
import { capOrMax, sellingStock } from './stockRoom'

const ALL = '__all__'

/**
 * Taking an order: find items, tap to add, then fill in payment and confirm.
 * Phone: items full width, cart in a sheet from the bar at the bottom.
 * Tablet and up: items on the left, cart always visible on the right.
 */
export default function NewOrderPage() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const items = useItems()
  const supplies = useSupplies()
  const { cart, add } = useCart(user.id)
  const wide = useMediaQuery(WIDE_SCREEN)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(ALL)
  const [sheetOpen, setSheetOpen] = useState(false)

  const forSale = useMemo(() => (items.data ?? []).filter((item) => item.active), [items.data])
  const categories = useMemo(
    () => [
      { value: ALL, label: 'All' },
      ...categoriesOf(forSale).map((name) => ({ value: name, label: name })),
    ],
    [forSale],
  )
  const shown = forSale.filter(
    (item) => (category === ALL || item.category === category) && matchesSearch(item.name, search),
  )
  const inCart = new Map(cart.lines.map((line) => [line.itemId, line.quantity]))
  // What the cart may still take: own stock and shared supplies, with the cart counted.
  const stock = sellingStock(forSale, supplies.data ?? [], cart.lines)
  const total = cart.lines.reduce(
    (sum, line) =>
      sum + (forSale.find((item) => item.id === line.itemId)?.price ?? 0) * line.quantity,
    0,
  )

  let grid
  if (items.isPending || supplies.isPending) {
    grid = (
      <div role="status" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <span className="sr-only">Loading items</span>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-card" />
        ))}
      </div>
    )
  } else if (items.isError || supplies.isError) {
    grid = (
      <div className="rounded-card border border-line bg-surface-raised">
        <ErrorState
          error={items.error ?? supplies.error}
          onRetry={() => void Promise.all([items.refetch(), supplies.refetch()])}
        />
      </div>
    )
  } else if (forSale.length === 0) {
    grid = (
      <div className="rounded-card border border-line bg-surface-raised">
        <EmptyState
          title="No items to sell yet"
          description={
            user.role === 'owner'
              ? 'Add what you sell, with prices and stock.'
              : 'Ask the owner to add items.'
          }
          action={
            user.role === 'owner' ? (
              <ButtonLink to="/owner/items/new">Add item</ButtonLink>
            ) : undefined
          }
        />
      </div>
    )
  } else if (shown.length === 0) {
    grid = (
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
    )
  } else {
    grid = (
      <ul aria-label="Items" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {shown.map((item) => (
          <li key={item.id} className="flex">
            <ItemCard
              name={item.name}
              price={item.price}
              currency={currency}
              available={stock.capFor(item.id)}
              lowStockLevel={item.lowStockLevel}
              shared={item.supplies.length > 0}
              inCart={inCart.get(item.id) ?? 0}
              onAdd={() => add(item.id, capOrMax(stock.capFor(item.id)))}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-20 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-6 md:pb-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-labelledby="new-order-title" className="flex min-w-0 flex-col gap-4">
        <h1 id="new-order-title" className="text-title-lg text-ink">
          New order
        </h1>
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
        {grid}
      </section>

      {wide ? (
        <aside
          aria-label="Cart and payment"
          className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col gap-3 overflow-y-auto rounded-card border border-line bg-surface-raised p-5 shadow-soft"
        >
          <h2 className="text-title text-ink">Cart</h2>
          <CartPanel items={items.data ?? []} supplies={supplies.data ?? []} />
        </aside>
      ) : (
        <>
          {/* Rendered at the top of the page, so it stays pinned above the
              navigation bar however far the item list scrolls. */}
          {createPortal(
            <div className="no-print fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 px-4">
              <CartBar
                itemCount={cartCount(cart.lines)}
                total={total}
                currency={currency}
                onOpen={() => setSheetOpen(true)}
              />
            </div>,
            document.body,
          )}
          <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title="Cart">
            <CartPanel
              items={items.data ?? []}
              supplies={supplies.data ?? []}
              onDone={() => setSheetOpen(false)}
            />
          </BottomSheet>
        </>
      )}
    </div>
  )
}
