import { ArrowDownRight, ArrowUpRight, CircleCheck, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Drawn previews of the app for the landing page. They are pictures made of
 * the app's own colours and type (no screenshots), so they stay sharp, load
 * instantly and follow light and dark mode. Screen readers get one short
 * description each instead of the made-up numbers inside.
 */

const ITEMS = [
  { name: 'Paracetamol', price: '₦450', left: '48 in stock' },
  { name: 'Malt drink', price: '₦600', left: '36 in stock' },
  { name: 'Baby wipes', price: '₦1,800', left: 'Low: 4 left', low: true },
  { name: 'Coke 300ml', price: '₦500', left: '961 can be sold' },
] as const

/** A phone showing New order: items, prices and a cart bar. */
export function PhonePreview({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Tallybox on a phone: the New order screen with items, prices, stock and a cart total."
      className={cn(
        'relative mx-auto w-[16.5rem] rounded-[2.25rem] border-[6px] border-grey-900 bg-surface shadow-raised sm:w-[18rem]',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex flex-col gap-3 overflow-hidden rounded-[1.75rem] p-3 pt-5"
      >
        <div className="mx-auto mb-1 h-1.5 w-16 rounded-full bg-grey-900/80" />
        <div className="flex items-center justify-between px-1">
          <span className="text-label font-bold text-ink">New order</span>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary">
            Sunrise Pharmacy
          </span>
        </div>
        <div className="rounded-control border border-line-control bg-surface-raised px-3 py-2 text-caption text-ink-subtle">
          Search items
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ITEMS.map((item) => (
            <div
              key={item.name}
              className="flex flex-col gap-0.5 rounded-control border border-line bg-surface-raised p-2.5 shadow-soft"
            >
              <span className="truncate text-caption font-semibold text-ink">{item.name}</span>
              <span className="text-label font-bold text-ink">{item.price}</span>
              <span
                className={cn(
                  'text-[0.65rem] leading-4',
                  'low' in item && item.low ? 'font-semibold text-warning' : 'text-ink-muted',
                )}
              >
                {item.left}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between rounded-control bg-primary px-3 py-2.5 text-on-primary">
          <span className="text-caption font-semibold">View cart · 4 items</span>
          <span className="text-label font-bold">₦2,700</span>
        </div>
      </div>
    </div>
  )
}

/** A floating card: the order is confirmed and the receipt is ready. */
export function ConfirmedCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex items-center gap-3 rounded-card border border-line bg-surface-raised p-3 pr-4 shadow-raised',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-success">
        <CircleCheck className="size-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-label font-bold text-ink">Order #0048 confirmed</span>
        <span className="text-caption text-ink-muted">Receipt sent on WhatsApp</span>
      </span>
    </div>
  )
}

/** A floating card: an item is running low. */
export function LowStockCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex items-center gap-3 rounded-card border border-line bg-surface-raised p-3 pr-4 shadow-raised',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-warning-soft text-warning">
        <TriangleAlert className="size-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-label font-bold text-ink">Baby wipes: 4 left</span>
        <span className="text-caption text-ink-muted">Time to restock</span>
      </span>
    </div>
  )
}

const WEEK = [38, 62, 45, 80, 56, 92, 70]
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** A small sales card with a week of columns. */
export function SalesCard({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="A sales summary: this week's sales by day, up 12% on last week."
      className={cn(
        'flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-raised',
        className,
      )}
    >
      <div aria-hidden="true" className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-caption text-ink-muted">Sales this week</span>
          <span className="text-title font-bold text-ink">₦234,150</span>
        </div>
        <span className="flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-caption font-semibold text-success">
          <ArrowUpRight className="size-3.5" />
          12%
        </span>
      </div>
      <div aria-hidden="true" className="flex h-24 items-end gap-2">
        {WEEK.map((value, index) => (
          <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className={cn(
                  'w-full max-w-5 rounded-t-[4px] bg-primary',
                  index === 5 ? 'opacity-100' : 'opacity-70',
                )}
                style={{ height: `${value}%` }}
              />
            </div>
            <span className="text-[0.65rem] text-ink-subtle">{DAYS[index]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Shared supplies: three drinks drawing on one stock of bottles. */
export function SuppliesPreview({ className }: { className?: string }) {
  const drinks = [
    { name: 'Coke', sold: 10 },
    { name: 'Fanta', sold: 10 },
    { name: 'Apple juice', sold: 10 },
  ]
  return (
    <div
      role="img"
      aria-label="Shared supplies: selling 10 Coke, 10 Fanta and 10 apple juice takes 30 bottles from one stock of 1,000, leaving 970."
      className={cn(
        'flex flex-col gap-4 rounded-card border border-line bg-surface-raised p-5 shadow-raised',
        className,
      )}
    >
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        {drinks.map((drink) => (
          <div
            key={drink.name}
            className="flex flex-col items-center gap-1 rounded-control bg-surface-sunken p-3 text-center"
          >
            <Bottle />
            <span className="text-caption font-semibold text-ink">{drink.name}</span>
            <span className="text-[0.65rem] text-ink-muted">{drink.sold} sold</span>
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex items-center justify-between rounded-control border border-dashed border-line-control p-3"
      >
        <span className="flex flex-col">
          <span className="text-caption text-ink-muted">300 ml bottles</span>
          <span className="text-title font-bold text-ink tabular-nums">
            1,000 <span className="text-ink-subtle">→</span> 970
          </span>
        </span>
        <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-label font-semibold text-primary">
          <ArrowDownRight className="size-4" />
          30 used
        </span>
      </div>
    </div>
  )
}

function Bottle() {
  return (
    <svg viewBox="0 0 24 40" className="h-10 w-6 text-primary" aria-hidden="true">
      <rect x="9" y="1" width="6" height="5" rx="1.5" className="fill-current opacity-60" />
      <path
        d="M9 6h6v4c0 1.5 4 3 4 7v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V17c0-4 4-5.5 4-7V6Z"
        className="fill-current"
      />
      <rect x="7" y="20" width="10" height="8" rx="1" className="fill-surface-raised opacity-80" />
    </svg>
  )
}

/** A receipt, as customers receive it. */
export function ReceiptPreview({ className }: { className?: string }) {
  const lines = [
    { name: 'Paracetamol 500mg', detail: '2 × ₦450', total: '₦900' },
    { name: 'Malt drink 33cl', detail: '3 × ₦600', total: '₦1,800' },
  ]
  return (
    <div
      role="img"
      aria-label="A Tallybox receipt with the business name, order number, items, total and payment method."
      className={cn(
        'w-64 rounded-card border border-line bg-white p-5 text-grey-900 shadow-raised',
        className,
      )}
    >
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="text-center">
          <p className="text-label font-bold">Sunrise Pharmacy</p>
          <p className="text-caption text-grey-600">12 Example Street, Lagos</p>
        </div>
        <div className="border-t border-dashed border-grey-300" />
        <div className="flex justify-between text-caption">
          <span className="font-semibold">Receipt</span>
          <span className="font-semibold">#0048</span>
        </div>
        {lines.map((line) => (
          <div key={line.name} className="flex justify-between gap-2 text-caption">
            <span className="flex flex-col">
              <span>{line.name}</span>
              <span className="text-grey-600">{line.detail}</span>
            </span>
            <span className="font-semibold">{line.total}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-grey-300" />
        <div className="flex justify-between text-label font-bold">
          <span>Total</span>
          <span>₦2,700</span>
        </div>
        <p className="text-center text-[0.65rem] text-grey-600">
          Paid by bank transfer · Powered by Tallybox
        </p>
      </div>
    </div>
  )
}
