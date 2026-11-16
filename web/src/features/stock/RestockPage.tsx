import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/Button'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SearchBar } from '@/components/SearchBar'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { STOCK_LIMITS } from '@/domain/stock'
import { useSessionUser } from '@/features/auth/session'
import { matchesSearch, useItems } from '@/features/items/api'
import { useSupplies } from '@/features/supplies/api'
import { addDays, dateKey } from '@/lib/dates'
import { toAppError, type AppError } from '@/lib/errors'
import { parseMoney } from '@/lib/money'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useRestock } from './api'

interface DraftLine {
  /** "item:<id>" or "supply:<id>". */
  key: string
  quantity: string
  unitCost: string
}

/** Something a delivery can add to: an item that counts its own stock, or a shared supply. */
interface StockOption {
  key: string
  kind: 'item' | 'supply'
  id: string
  name: string
  quantity: number
}

/** Records one delivery: several items at once, each adding to stock, with a ledger entry each. */
export default function RestockPage() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const today = dateKey(new Date(), user.timezone ?? 'UTC')
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const items = useItems()
  const supplies = useSupplies()
  const restock = useRestock()
  const [params] = useSearchParams()

  const [lines, setLines] = useState<DraftLine[]>(() => {
    const item = params.get('item')
    const supply = params.get('supply')
    const key = item ? `item:${item}` : supply ? `supply:${supply}` : null
    return key ? [{ key, quantity: '', unitCost: '' }] : []
  })
  const [receivedOn, setReceivedOn] = useState(today)
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  // One id per delivery form: saving twice never adds the stock twice.
  const [clientId] = useState(() => crypto.randomUUID())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  // Items whose own stock isn't counted are restocked through their supplies instead.
  const options: StockOption[] = [
    ...(supplies.data ?? [])
      .filter((supply) => supply.active)
      .map((supply) => ({
        key: `supply:${supply.id}`,
        kind: 'supply' as const,
        id: supply.id,
        name: supply.name,
        quantity: supply.quantity,
      })),
    ...(items.data ?? [])
      .filter((item) => item.active && item.tracksOwnStock)
      .map((item) => ({
        key: `item:${item.id}`,
        kind: 'item' as const,
        id: item.id,
        name: item.name,
        quantity: item.quantity,
      })),
  ]
  const byKey = new Map(options.map((option) => [option.key, option]))
  const choosable = options.filter(
    (option) =>
      !lines.some((line) => line.key === option.key) && matchesSearch(option.name, search),
  )

  const quantityError = (line: DraftLine) =>
    /^\d+$/.test(line.quantity.trim()) &&
    Number(line.quantity) >= 1 &&
    Number(line.quantity) <= STOCK_LIMITS.maxRestockQuantity
      ? undefined
      : 'Enter how many arrived, a whole number of at least 1.'
  const costError = (line: DraftLine) =>
    line.unitCost.trim() === '' || parseMoney(line.unitCost, currency) !== null
      ? undefined
      : 'Enter an amount like 280.50'
  const dateError =
    receivedOn > today
      ? "A delivery can't be in the future."
      : receivedOn < addDays(today, -STOCK_LIMITS.restockMaxAgeDays)
        ? 'Use a date within the last year.'
        : undefined

  const update = (key: string, change: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))

  const save = async () => {
    setShowErrors(true)
    setError(null)
    if (
      lines.length === 0 ||
      dateError ||
      lines.some((line) => quantityError(line) || costError(line))
    )
      return
    try {
      await restock.mutateAsync({
        clientId,
        receivedOn,
        supplier,
        note,
        lines: lines.map((line) => {
          const [kind, id = ''] = line.key.split(':')
          return {
            ...(kind === 'supply' ? { supplyId: id } : { itemId: id }),
            quantity: Number(line.quantity),
            unitCost: line.unitCost.trim() === '' ? null : parseMoney(line.unitCost, currency),
          }
        }),
      })
      toast({
        title: `Delivery recorded: ${lines.length} ${lines.length === 1 ? 'item' : 'items'}`,
        tone: 'success',
      })
      await navigate('/owner/items')
    } catch (thrown) {
      setError(toAppError(thrown))
    }
  }

  let body
  if (items.isPending || supplies.isPending) {
    body = <Skeleton className="h-40 w-full rounded-card" />
  } else if (items.isError || supplies.isError) {
    body = (
      <ErrorState
        error={items.error ?? supplies.error}
        onRetry={() => void Promise.all([items.refetch(), supplies.refetch()])}
      />
    )
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <ErrorBanner error={error} />
        <TextField
          label="Date received"
          type="date"
          required
          max={today}
          value={receivedOn}
          onChange={(event) => setReceivedOn(event.target.value)}
          error={showErrors ? dateError : undefined}
        />
        <TextField
          label="Supplier"
          autoComplete="off"
          maxLength={STOCK_LIMITS.supplierMax}
          value={supplier}
          onChange={(event) => setSupplier(event.target.value)}
        />

        <section aria-labelledby="lines-title" className="flex flex-col gap-3">
          <h2 id="lines-title" className="text-title text-ink">
            Items received
          </h2>
          {lines.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-control">
              <EmptyState title="Add the items that arrived" className="py-6" />
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((line) => {
                const item = byKey.get(line.key)
                return (
                  <li
                    key={line.key}
                    className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-body font-medium break-words text-ink">
                          {item?.name ?? 'Unknown item'}
                        </span>
                        <span className="text-label font-normal text-ink-muted">
                          {item
                            ? `${item.kind === 'supply' ? 'Supply · ' : ''}${item.quantity} in stock now`
                            : 'No longer on sale'}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        aria-label={`Remove ${item?.name ?? 'item'}`}
                        onClick={() =>
                          setLines((current) => current.filter((entry) => entry.key !== line.key))
                        }
                        leadingIcon={<Trash2 aria-hidden="true" className="size-5" />}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <TextField
                        label="Quantity received"
                        inputMode="numeric"
                        autoComplete="off"
                        value={line.quantity}
                        onChange={(event) => update(line.key, { quantity: event.target.value })}
                        error={showErrors ? quantityError(line) : undefined}
                      />
                      <TextField
                        label={`Unit cost (${currency})`}
                        inputMode="decimal"
                        autoComplete="off"
                        hint="Optional"
                        value={line.unitCost}
                        onChange={(event) => update(line.key, { unitCost: event.target.value })}
                        error={showErrors ? costError(line) : undefined}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Button
            variant="secondary"
            onClick={() => setPickerOpen(true)}
            leadingIcon={<Plus aria-hidden="true" className="size-5" />}
          >
            Add item
          </Button>
          {showErrors && lines.length === 0 ? (
            <p className="text-label font-medium text-error-strong">Add at least one item.</p>
          ) : null}
        </section>

        <TextField
          label="Note"
          autoComplete="off"
          maxLength={STOCK_LIMITS.noteMax}
          hint="Optional. For example the invoice number."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          size="lg"
          fullWidth
          onClick={() => void save()}
          loading={restock.isPending}
          loadingLabel="Saving…"
          disabled={!online}
        >
          Save delivery
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <BackLink to="/owner/items" label="Items" />
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">Restock</h1>
        <p className="text-body text-ink-muted">
          Record a delivery of items or supplies. Each one&apos;s stock goes up by what arrived.
        </p>
      </header>
      {body}

      <BottomSheet open={pickerOpen} onOpenChange={setPickerOpen} title="Add to the delivery">
        <div className="flex flex-col gap-3">
          <SearchBar
            value={search}
            onChange={setSearch}
            label="Search items and supplies"
            placeholder="Search items and supplies"
          />
          {choosable.length === 0 ? (
            <EmptyState
              title={options.length === 0 ? 'Nothing to restock yet' : 'Nothing matches'}
              className="py-6"
            />
          ) : (
            <ListGroup>
              {choosable.map((option) => (
                <ListItem
                  key={option.key}
                  wrap
                  title={option.name}
                  subtitle={`${option.kind === 'supply' ? 'Supply · ' : ''}${option.quantity} in stock`}
                  onClick={() => {
                    setLines((current) => [
                      ...current,
                      { key: option.key, quantity: '', unitCost: '' },
                    ])
                    setSearch('')
                    setPickerOpen(false)
                  }}
                />
              ))}
            </ListGroup>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
