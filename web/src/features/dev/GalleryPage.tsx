import { zodResolver } from '@hookform/resolvers/zod'
import { Banknote, Package, Plus, ReceiptText, Share2, User } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { BottomSheet } from '@/components/BottomSheet'
import { Logo, LogoSymbol } from '@/components/brand/Logo'
import { TallyLoader } from '@/components/brand/TallyLoader'
import { TallyMark } from '@/components/brand/TallyMark'
import { Button } from '@/components/Button'
import { CartBar } from '@/components/CartBar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ItemCard } from '@/components/ItemCard'
import { ListGroup, ListItem } from '@/components/ListItem'
import { Money } from '@/components/Money'
import { QuantityStepper } from '@/components/QuantityStepper'
import { RadioCards } from '@/components/RadioCards'
import { SearchBar } from '@/components/SearchBar'
import { SectionHeader } from '@/components/SectionHeader'
import { Skeleton, SkeletonList } from '@/components/Skeleton'
import { StatCard } from '@/components/StatCard'
import { EmptyState, ErrorState, PermissionDenied } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { SuccessCheck } from '@/components/SuccessCheck'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { Banner } from '@/components/Banner'
import { BarList } from '@/features/reports/BarList'
import { ColumnChart } from '@/features/reports/ColumnChart'
import { AppError } from '@/lib/errors'
import { parseMoney, sumMinor } from '@/lib/money'

/**
 * DEVELOPMENT ONLY: every shared component on one page, at /dev/gallery.
 * Check new UI here on a phone-sized window before using it in a screen.
 */

const CURRENCY = 'NGN'

const DEMO_ITEMS = [
  { id: 'a', name: 'Paracetamol 500mg (pack of 12)', price: 45000, quantity: 48, low: 10 },
  { id: 'b', name: 'Bottled water 75cl', price: 25000, quantity: 6, low: 12 },
  { id: 'c', name: 'Jollof rice, large', price: 350000, quantity: 0, low: 5 },
  { id: 'd', name: 'Phone charger, USB-C', price: 480000, quantity: 3, low: 2 },
] as const

const SWATCHES = [
  ['teal', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']],
  ['amber', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']],
  ['grey', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']],
  ['success', ['50', '100', '600', '700']],
  ['error', ['50', '100', '600', '700']],
  ['info', ['50', '100', '600', '700']],
] as const

const demoFormSchema = z.object({
  name: z.string().trim().min(2, 'Enter the item name (at least 2 characters).'),
  price: z
    .string()
    .trim()
    .refine((value) => parseMoney(value, CURRENCY) !== null, 'Enter a price like 1,250.50.'),
})
type DemoForm = z.infer<typeof demoFormSchema>

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={title} />
      {children}
    </section>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

export default function GalleryPage() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [quantity, setQuantity] = useState(2)
  const [cart, setCart] = useState<Record<string, number>>({ a: 1 })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [checkKey, setCheckKey] = useState(0)
  const [choice, setChoice] = useState<'tallybox' | 'custom' | 'none'>('tallybox')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DemoForm>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: { name: '', price: '' },
  })

  const cartCount = sumMinor(Object.values(cart))
  const cartTotal = sumMinor(DEMO_ITEMS.map((item) => item.price * (cart[item.id] ?? 0)))

  const fakeConfirm = () => {
    setConfirming(true)
    window.setTimeout(() => {
      setConfirming(false)
      setConfirmOpen(false)
      toast({ title: 'Order voided', description: 'Stock was returned.', tone: 'success' })
    }, 900)
  }

  const fakeLoad = () => {
    setLoadingDemo(true)
    window.setTimeout(() => setLoadingDemo(false), 1200)
  }

  return (
    <div className="flex flex-col gap-10 pb-28">
      <header className="flex flex-col gap-2">
        <Link to="/" className="text-label font-semibold text-primary underline">
          Back to welcome
        </Link>
        <h1 className="text-title-lg text-ink">Design gallery</h1>
        <p className="text-body text-ink-muted">
          Development only. Every shared component, with the Tallybox tokens.
        </p>
      </header>

      <Section title="Brand">
        <Row>
          <Logo size="lg" />
          <Logo />
          <Logo size="sm" />
          <LogoSymbol className="size-12" />
          <TallyMark className="text-primary" />
        </Row>
      </Section>

      <Section title="Colors">
        <div className="flex flex-col gap-3">
          {SWATCHES.map(([name, steps]) => (
            <div key={name} className="flex flex-col gap-1">
              <span className="text-label text-ink-muted capitalize">{name}</span>
              <div className="flex overflow-hidden rounded-md">
                {steps.map((step) => (
                  <div
                    key={step}
                    title={`${name}-${step}`}
                    className="h-10 flex-1"
                    style={{ backgroundColor: `var(--color-${name}-${step})` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <p className="text-display">Display 32</p>
          <p className="text-title-lg">Title large 24</p>
          <p className="text-title">Title 20</p>
          <p className="text-body-lg">Body large 18</p>
          <p className="text-body">Body 16. Short, friendly, plain.</p>
          <p className="text-label">Label 14</p>
          <p className="text-caption">Caption 12</p>
          <p className="text-title tabular-nums">
            Tabular numerals: <Money minor={111111} currency={CURRENCY} /> ·{' '}
            <Money minor={908070} currency={CURRENCY} />
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <Row>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row>
          <Button leadingIcon={<Plus aria-hidden="true" className="size-5" />}>Add item</Button>
          <Button loading={loadingDemo} loadingLabel="Saving…" onClick={fakeLoad}>
            Tap to load
          </Button>
          <Button disabled>Disabled</Button>
          <Button size="lg">Large</Button>
        </Row>
      </Section>

      <Section title="Text fields with validation">
        <form
          noValidate
          onSubmit={(event) =>
            void handleSubmit((values) =>
              toast({ title: 'Form is valid', description: values.name, tone: 'success' }),
            )(event)
          }
          className="flex max-w-md flex-col gap-4"
        >
          <TextField
            label="Item name"
            required
            autoComplete="off"
            error={errors.name?.message}
            {...register('name')}
          />
          <TextField
            label="Selling price"
            required
            inputMode="decimal"
            hint="In naira. For example 1,250.50"
            error={errors.price?.message}
            {...register('price')}
          />
          <TextField
            label="Unit name"
            optional
            autoComplete="off"
            placeholder="pack, bottle, piece…"
            hint="A word for one of this item, like pack or bottle. Not a number."
          />
          <TextField label="Disabled field" disabled defaultValue="Cannot change this" />
          <div>
            <Button type="submit">Check form</Button>
          </div>
        </form>
      </Section>

      <Section title="Choice cards">
        <RadioCards
          className="max-w-md"
          legend="Receipt watermark"
          description="Pick one. The whole card is tappable, and arrow keys move between them."
          value={choice}
          options={[
            { value: 'tallybox', label: 'Tallybox', description: 'The default.' },
            { value: 'custom', label: 'Your own', description: 'Words, a logo, or both.' },
            { value: 'none', label: 'None' },
          ]}
          onChange={setChoice}
        />
      </Section>

      <Section title="Search bar">
        <SearchBar
          value={search}
          onChange={setSearch}
          label="Search items"
          placeholder="Search items"
          className="max-w-md"
        />
      </Section>

      <Section title="Status chips">
        <Row>
          <StatusChip status="completed" />
          <StatusChip status="voided" />
          <StatusChip status="held" />
          <StatusChip status="in_stock" />
          <StatusChip status="low_stock" />
          <StatusChip status="out_of_stock" />
        </Row>
      </Section>

      <Section title="Item cards and quantity stepper">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DEMO_ITEMS.map((item) => (
            <ItemCard
              key={item.id}
              name={item.name}
              price={item.price}
              currency={CURRENCY}
              available={item.quantity}
              lowStockLevel={item.low}
              inCart={cart[item.id] ?? 0}
              onAdd={() =>
                setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))
              }
            />
          ))}
        </div>
        <Row>
          <QuantityStepper value={quantity} onChange={setQuantity} label="Quantity" max={5} />
          <span className="text-label font-normal text-ink-muted">Stops at 0 and at 5.</span>
          <Button variant="ghost" onClick={() => setCart({})}>
            Empty cart
          </Button>
        </Row>
      </Section>

      <Section title="Cart bar">
        <div className="max-w-md">
          <CartBar
            itemCount={cartCount}
            total={cartTotal}
            currency={CURRENCY}
            onOpen={() => setSheetOpen(true)}
          />
          {cartCount === 0 ? (
            <p className="text-label font-normal text-ink-muted">
              Hidden while the cart is empty. Tap an item card above.
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="Stat cards">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Sales today"
            icon={Banknote}
            value={<Money minor={18450000} currency={CURRENCY} />}
            trend={{ direction: 'up', label: '12% vs yesterday' }}
          />
          <StatCard
            label="Orders"
            icon={ReceiptText}
            value="24"
            trend={{ direction: 'down', label: '3 fewer' }}
          />
          <StatCard label="Voided" value="1" trend={{ direction: 'flat', label: 'Same' }} />
          <StatCard label="Low stock" icon={Package} value="5" />
        </div>
      </Section>

      <Section title="List items">
        <ListGroup className="max-w-xl">
          <ListItem
            leading={<ReceiptText aria-hidden="true" className="size-5" />}
            title="Order #0042"
            subtitle="2:05 PM · Cash · Ada"
            trailing={<Money minor={1250050} currency={CURRENCY} className="font-semibold" />}
            onClick={() => toast({ title: 'Row tapped' })}
          />
          <ListItem
            leading={<ReceiptText aria-hidden="true" className="size-5" />}
            title="Order #0041"
            subtitle="1:40 PM · Transfer · Ada"
            trailing={<StatusChip status="voided" />}
            onClick={() => toast({ title: 'Row tapped' })}
          />
          <ListItem
            leading={<User aria-hidden="true" className="size-5" />}
            title="A plain row"
            subtitle="Not tappable, so no arrow"
          />
        </ListGroup>
      </Section>

      <Section title="Dialogs, sheets and toasts">
        <Row>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Confirmation dialog
          </Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Bottom sheet
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ title: 'Item saved', tone: 'success' })}
          >
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Couldn't save",
                description: 'Check your connection, then try again.',
                tone: 'error',
              })
            }
          >
            Error toast
          </Button>
        </Row>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Void order #0042?"
          description="Stock goes back on the shelf and the order stays on record as voided. This can't be undone."
          confirmLabel="Void order"
          tone="danger"
          loading={confirming}
          onConfirm={fakeConfirm}
        />
        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Cart"
          description="Slides up on phones, centered on larger screens."
        >
          <div className="flex flex-col gap-4">
            <p className="text-body text-ink-muted">
              {cartCount} {cartCount === 1 ? 'item' : 'items'}, total{' '}
              <Money minor={cartTotal} currency={CURRENCY} className="font-semibold text-ink" />
            </p>
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              Done
            </Button>
          </div>
        </BottomSheet>
      </Section>

      <Section title="Loading">
        <Row>
          <TallyLoader className="py-2" />
          <TallyLoader className="py-2" showLabel label="Loading items" />
        </Row>
        <div className="grid max-w-xl gap-3">
          <SkeletonList rows={3} />
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>

      <Section title="Success check">
        <Row>
          <SuccessCheck key={checkKey} />
          <Button
            variant="secondary"
            onClick={() => setCheckKey((key) => key + 1)}
            leadingIcon={<Share2 aria-hidden="true" className="size-5" />}
          >
            Play again
          </Button>
        </Row>
      </Section>

      <Section title="Empty, error and permission-denied states">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-card border border-line bg-surface-raised">
            <EmptyState
              title="No items yet"
              description="Add your first item to start selling."
              action={<Button>Add item</Button>}
            />
          </div>
          <div className="rounded-card border border-line bg-surface-raised">
            <ErrorState
              error={new AppError('offline')}
              onRetry={() => toast({ title: 'Trying again' })}
            />
          </div>
          <div className="rounded-card border border-line bg-surface-raised">
            <PermissionDenied />
          </div>
        </div>
      </Section>

      <Section title="Banners">
        <div className="flex flex-col gap-3">
          <Banner tone="info" title="Info" description="Something worth knowing." />
          <Banner tone="success" title="Success" description="It worked." />
          <Banner tone="warning" title="Warning" description="Check this before you go on." />
          <Banner tone="error" title="Error" description="Something went wrong." />
        </div>
      </Section>

      <Section title="Report charts">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-card border border-line bg-surface-raised p-4">
            <ColumnChart
              title="Sales by day"
              formatTick={(value) => `₦${value / 100}`}
              columns={[120000, 45000, 0, 98000, 150000, 60000, 30000].map((value, index) => ({
                key: String(index),
                label: `Nov ${index + 7}`,
                fullLabel: `Nov ${index + 7}, 2026`,
                value,
                valueText: `₦${(value / 100).toFixed(2)}`,
                detail: `${index + 2} orders`,
              }))}
            />
          </div>
          <div className="rounded-card border border-line bg-surface-raised p-4">
            <BarList
              label="By payment method"
              rows={[
                {
                  key: 'cash',
                  label: 'Cash',
                  value: 174000,
                  valueText: '₦1,740.00',
                  detail: '21 orders',
                },
                { key: 'bank', label: 'Bank transfer', value: 128350, valueText: '₦1,283.50' },
                { key: 'card', label: 'Card machine', value: 0, valueText: '₦0.00' },
              ]}
            />
          </div>
        </div>
      </Section>
    </div>
  )
}
