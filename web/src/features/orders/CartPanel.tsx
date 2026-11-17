import { CircleCheckBig, CirclePause, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Item, Supply } from '@/api/types'
import { Banner, ErrorBanner } from '@/components/Banner'
import { Button } from '@/components/Button'
import { CheckboxField } from '@/components/CheckboxField'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FilterChips } from '@/components/FilterChips'
import { Money } from '@/components/Money'
import { QuantityStepper } from '@/components/QuantityStepper'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import {
  cartCount,
  describeStockProblems,
  ORDER_LIMITS,
  PAYMENT_METHODS,
  paymentMethodLabel,
  type PaymentMethod,
  type StockProblem,
} from '@/domain/orders'
import { describeSupplyProblem, type SupplyProblem } from '@/domain/supplies'
import { useSessionUser } from '@/features/auth/session'
import { toAppError, type AppError } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useCreateOrder, useSaveHeldOrder } from './api'
import { useCart } from './cartStore'
import { capOrMax, sellingStock } from './stockRoom'
import { portalBase } from './portal'

const REFERENCE_LABEL: Record<PaymentMethod, string | null> = {
  cash: null,
  bank_transfer: 'Transfer reference',
  card: 'Card machine receipt number',
}

interface CartPanelProps {
  items: readonly Item[]
  /** Shared supplies, to check items that use them. */
  supplies: readonly Supply[]
  /** Called after confirming or holding, for example to close the cart sheet. */
  onDone?: () => void
}

/** The cart, the payment details, and the Hold and Confirm buttons. */
export function CartPanel({ items, supplies, onDone }: CartPanelProps) {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const { cart, setQuantity, setFields, clear } = useCart(user.id)
  const createOrder = useCreateOrder()
  const saveHeld = useSaveHeldOrder()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  const itemsById = new Map(items.map((item) => [item.id, item]))
  const stock = sellingStock(items, supplies, cart.lines)
  const lines = cart.lines.map((line) => {
    const item = itemsById.get(line.itemId)
    const ownLeft = stock.ownShortfall(line.itemId, line.quantity)
    return {
      ...line,
      item,
      ownLeft,
      lineTotal: item ? item.price * line.quantity : 0,
      // Checked again on the server when confirming; this is a quick warning.
      problem: !item || !item.active ? 'unavailable' : ownLeft !== null ? 'short' : null,
    }
  })
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const hasProblems = lines.some((line) => line.problem !== null) || stock.supplyProblems.length > 0
  const empty = cart.lines.length === 0
  const busy = createOrder.isPending || saveHeld.isPending

  const canConfirm =
    online &&
    !empty &&
    !hasProblems &&
    cart.paymentMethod !== null &&
    cart.paymentConfirmed &&
    !busy

  const confirm = async () => {
    if (!cart.paymentMethod) return
    setError(null)
    try {
      const order = await createOrder.mutateAsync({
        clientOrderId: cart.clientOrderId,
        lines: cart.lines,
        paymentMethod: cart.paymentMethod,
        paymentReference: cart.paymentReference,
        paymentConfirmed: cart.paymentConfirmed,
        customerName: cart.customerName,
        customerPhone: cart.customerPhone,
        note: cart.note,
        heldOrderId: cart.heldOrderId,
      })
      setConfirming(false)
      clear()
      onDone?.()
      await navigate(`${portalBase(user.role)}/orders/${order.id}/done`)
    } catch (thrown) {
      setConfirming(false)
      setError(toAppError(thrown))
    }
  }

  const hold = async () => {
    setError(null)
    try {
      await saveHeld.mutateAsync({
        heldOrderId: cart.heldOrderId,
        lines: cart.lines,
        customerName: cart.customerName,
        customerPhone: cart.customerPhone,
        note: cart.note,
      })
      clear()
      onDone?.()
      toast({
        title: 'Order held',
        description: 'Tap Held orders at the top of New order to carry on with it.',
        tone: 'success',
      })
    } catch (thrown) {
      setError(toAppError(thrown))
    }
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-body font-semibold text-ink">The cart is empty</p>
        <p className="text-label font-normal text-ink-muted">Tap an item to add it.</p>
      </div>
    )
  }

  const problems = error?.details?.problems as StockProblem[] | undefined
  const shortSupplies = error?.details?.supplyProblems as SupplyProblem[] | undefined
  const unavailableNames = error?.details?.names as string[] | undefined
  const referenceLabel = cart.paymentMethod ? REFERENCE_LABEL[cart.paymentMethod] : null

  return (
    <div className="flex flex-col gap-5">
      {cart.heldOrderId ? (
        <Banner
          tone="info"
          title="Resumed from a held order"
          description="Confirming it removes the hold."
        />
      ) : null}

      {error?.code === 'insufficient_stock' && (problems?.length || shortSupplies?.length) ? (
        <Banner
          tone="error"
          title={[
            problems?.length ? describeStockProblems(problems) : null,
            ...(shortSupplies ?? []).map(describeSupplyProblem),
          ]
            .filter(Boolean)
            .join(' ')}
          description="Stock changed while you were selling. Lower the quantity or remove an item, then confirm again."
        />
      ) : error?.code === 'item_unavailable' && unavailableNames ? (
        <Banner
          tone="error"
          title={`No longer sold: ${unavailableNames.join(', ')}`}
          description="Remove it from the cart, then confirm again."
        />
      ) : (
        <ErrorBanner error={error} />
      )}

      {!error && stock.supplyProblems.length > 0 ? (
        <Banner
          tone="error"
          title={stock.supplyProblems.map(describeSupplyProblem).join(' ')}
          description="These items share a supply. Lower a quantity or remove an item."
        />
      ) : null}

      <section aria-label="Cart" className="flex flex-col gap-3">
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((line) => (
            <li key={line.itemId} className="flex flex-col gap-2 py-3 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-body font-medium text-ink">
                    {line.item?.name ?? 'Removed item'}
                  </span>
                  {line.item ? (
                    <span className="text-label font-normal text-ink-muted">
                      <Money minor={line.item.price} currency={currency} /> each
                    </span>
                  ) : null}
                  {line.problem === 'short' ? (
                    <span className="text-label font-semibold text-error-strong">
                      Only {line.ownLeft ?? 0} left
                    </span>
                  ) : line.problem === 'unavailable' ? (
                    <span className="text-label font-semibold text-error-strong">
                      No longer sold
                    </span>
                  ) : null}
                </div>
                <Money
                  minor={line.lineTotal}
                  currency={currency}
                  className="text-body font-semibold text-ink"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <QuantityStepper
                  label={`Quantity of ${line.item?.name ?? 'item'}`}
                  value={line.quantity}
                  min={1}
                  max={Math.max(capOrMax(stock.capFor(line.itemId)), line.quantity)}
                  onChange={(quantity) => setQuantity(line.itemId, quantity)}
                />
                <Button
                  variant="ghost"
                  onClick={() => setQuantity(line.itemId, 0)}
                  aria-label={`Remove ${line.item?.name ?? 'item'}`}
                  leadingIcon={<Trash2 aria-hidden="true" className="size-5" />}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t-2 border-line pt-3">
          <span className="text-body font-semibold text-ink">
            Total · {cartCount(cart.lines)} {cartCount(cart.lines) === 1 ? 'item' : 'items'}
          </span>
          <Money minor={total} currency={currency} className="text-title-lg text-ink" />
        </div>
      </section>

      <details className="group rounded-control border border-line bg-surface-raised">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-label text-ink">
          Customer details (optional)
          {cart.customerName ? (
            <span className="ml-2 font-normal text-ink-muted">· {cart.customerName}</span>
          ) : null}
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <TextField
            label="Customer name"
            autoComplete="off"
            maxLength={ORDER_LIMITS.customerNameMax}
            value={cart.customerName}
            onChange={(event) => setFields({ customerName: event.target.value })}
          />
          <TextField
            label="Customer phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={ORDER_LIMITS.customerPhoneMax}
            hint="Used to send the receipt on WhatsApp."
            value={cart.customerPhone}
            onChange={(event) => setFields({ customerPhone: event.target.value })}
          />
          <TextField
            label="Note"
            autoComplete="off"
            maxLength={ORDER_LIMITS.noteMax}
            value={cart.note}
            onChange={(event) => setFields({ note: event.target.value })}
          />
        </div>
      </details>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-label text-ink">How did the customer pay?</legend>
        <FilterChips
          label="Payment method"
          options={PAYMENT_METHODS}
          value={cart.paymentMethod ?? ('' as PaymentMethod)}
          onChange={(paymentMethod) => setFields({ paymentMethod })}
        />
      </fieldset>

      {referenceLabel ? (
        <TextField
          label={referenceLabel}
          autoComplete="off"
          maxLength={ORDER_LIMITS.paymentReferenceMax}
          optional
          hint="Helps match the payment later."
          value={cart.paymentReference}
          onChange={(event) => setFields({ paymentReference: event.target.value })}
        />
      ) : null}

      <CheckboxField
        label="Payment received"
        description="Tick only after checking the money has really arrived."
        checked={cart.paymentConfirmed}
        onChange={(paymentConfirmed) => setFields({ paymentConfirmed })}
        disabled={hasProblems}
        emphasis
      />

      <div className="flex flex-col-reverse gap-3">
        <Button
          variant="secondary"
          onClick={() => void hold()}
          loading={saveHeld.isPending}
          loadingLabel="Holding…"
          disabled={!online || busy}
          leadingIcon={<CirclePause aria-hidden="true" className="size-5" />}
        >
          Hold order
        </Button>
        <Button
          size="lg"
          onClick={() => setConfirming(true)}
          disabled={!canConfirm}
          leadingIcon={<CircleCheckBig aria-hidden="true" className="size-5" />}
          fullWidth
        >
          Confirm order
        </Button>
      </div>
      {!cart.paymentConfirmed && cart.paymentMethod ? (
        <p className="text-center text-label font-normal text-ink-muted">
          Confirm unlocks once &quot;Payment received&quot; is ticked.
        </p>
      ) : !cart.paymentMethod ? (
        <p className="text-center text-label font-normal text-ink-muted">
          Choose how the customer paid.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Confirm this order?"
        description={`${formatMoney(total, currency)} paid by ${cart.paymentMethod ? paymentMethodLabel(cart.paymentMethod).toLowerCase() : ''}. Stock goes down straight away.`}
        confirmLabel="Confirm order"
        loading={createOrder.isPending}
        onConfirm={() => void confirm()}
      />
    </div>
  )
}
