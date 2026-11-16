import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  ChartColumnIncreasing,
  ChevronDown,
  Coffee,
  FlaskConical,
  KeyRound,
  Lock,
  Mail,
  PackageOpen,
  Pill,
  Receipt,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Store,
  Users,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useApi } from '@/api/context'
import { Logo } from '@/components/brand/Logo'
import { ButtonLink } from '@/components/Button'
import { buttonClasses } from '@/components/button-styles'
import { ResetDemoData } from '@/features/demo/ResetDemoData'
import { SUPPORT_EMAIL } from '@/lib/config'
import { APP_VERSION } from '@/lib/version'
import { LandingHeader, SECTIONS } from './LandingHeader'
import {
  ConfirmedCard,
  LowStockCard,
  PhonePreview,
  ReceiptPreview,
  SalesCard,
  SuppliesPreview,
} from './ProductPreview'

const FEATURES: readonly { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Zap,
    title: 'Fast selling',
    text: 'Tap items, adjust quantities, take the payment. Search and categories find anything in seconds.',
  },
  {
    icon: PackageOpen,
    title: 'Stock that counts itself',
    text: 'Every sale takes stock off automatically. Deliveries add it back. You always know what is on the shelf.',
  },
  {
    icon: BadgeCheck,
    title: 'Only paid orders count',
    text: 'An order is confirmed only after your staff tick “Payment received”. Waiting for a transfer? Hold the order.',
  },
  {
    icon: Receipt,
    title: 'Receipts your way',
    text: 'Share as a picture or PDF, send on WhatsApp, or print on A4 or a small receipt printer.',
  },
  {
    icon: ChartColumnIncreasing,
    title: 'Clear daily totals',
    text: "Today's sales, best sellers and payment methods at a glance, with reports for any week or month.",
  },
  {
    icon: Users,
    title: 'Staff accounts with limits',
    text: 'Staff take orders. Only you see totals, cost prices, reports and settings.',
  },
  {
    icon: Boxes,
    title: 'Shared supplies',
    text: 'Count stock by packaging: three drinks that share one stock of bottles are all counted correctly.',
  },
  {
    icon: Smartphone,
    title: 'Any phone, no app store',
    text: 'Open a link and start. Works on phones, tablets and laptops, and can be added to your home screen.',
  },
]

const STEPS: readonly { icon: LucideIcon; title: string; text: ReactNode }[] = [
  {
    icon: KeyRound,
    title: 'Get your activation code',
    text: (
      <>
        Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-primary underline">
          {SUPPORT_EMAIL}
        </a>
        . We send you a single-use code for your email address.
      </>
    ),
  },
  {
    icon: Store,
    title: 'Register and add your items',
    text: 'Choose your business name and code, then add what you sell with prices and how many you have.',
  },
  {
    icon: Users,
    title: 'Create staff accounts and sell',
    text: 'Give each person their own sign-in. Every sale updates your stock and your totals straight away.',
  },
]

const BUSINESSES: readonly { icon: LucideIcon; label: string }[] = [
  { icon: Pill, label: 'Pharmacies' },
  { icon: ShoppingBasket, label: 'Supermarkets' },
  { icon: UtensilsCrossed, label: 'Restaurants' },
  { icon: Coffee, label: 'Drinks and cafés' },
  { icon: Shirt, label: 'Boutiques' },
  { icon: Store, label: 'Corner shops' },
]

const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Do I need to install an app?',
    answer:
      'No. Tallybox opens in the web browser on any phone, tablet or laptop. You can add it to your home screen so it opens like an app.',
  },
  {
    question: 'Does Tallybox take payments from customers?',
    answer:
      'No. Your customers pay as they do today: cash, bank transfer or card machine. Your staff check the money has arrived, tick “Payment received”, and only then is the order confirmed.',
  },
  {
    question: 'Can my staff see my sales and profits?',
    answer:
      'No. Staff take orders and see their own orders for the day. Sales totals, cost prices, reports, the stock history and settings are only for you.',
  },
  {
    question: 'What if the internet goes down?',
    answer:
      'Tallybox needs the internet, so every sale is checked against the latest stock and two people can never sell the last item twice. When you are offline it tells you and waits.',
  },
  {
    question: 'Is my business data private?',
    answer:
      'Yes. Each business sees only its own data, and every change is recorded with who made it. Sales and stock records are never deleted.',
  },
  {
    question: 'How do I get started, and what does it cost?',
    answer: `Email ${SUPPORT_EMAIL} with your business name. We will send you an activation code and agree how long your access lasts.`,
  },
]

function SectionHeading({
  eyebrow,
  title,
  text,
  id,
}: {
  eyebrow: string
  title: string
  text?: string
  id: string
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
      <p className="text-label font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2
        id={id}
        className="text-[1.75rem] leading-tight font-bold tracking-tight text-ink sm:text-[2.25rem]"
      >
        {title}
      </h2>
      {text ? <p className="text-body-lg text-ink-muted">{text}</p> : null}
    </div>
  )
}

/** The public front page: what Tallybox is, who it's for, and how to start or sign in. */
export default function LandingPage() {
  const api = useApi()

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-4 py-3 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <LandingHeader />

      <main id="main" className="flex-1">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_80%_-10%,var(--color-primary-soft),transparent_70%),radial-gradient(40rem_24rem_at_-10%_110%,var(--color-warning-soft),transparent_70%)]"
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 md:pt-20 md:pb-24 lg:grid-cols-[1.05fr_1fr]">
            <div className="flex flex-col items-start gap-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1 text-label text-ink-muted shadow-soft">
                <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                For shops, pharmacies and restaurants
              </p>
              <h1
                id="hero-title"
                className="text-[2.5rem] leading-[1.08] font-bold tracking-tight text-ink sm:text-[3.25rem] lg:text-[3.75rem]"
              >
                Know your stock.
                <br />
                <span className="text-primary">Trust every sale.</span>
              </h1>
              <p className="max-w-xl text-body-lg text-ink-muted">
                Tallybox records every sale, takes it off your stock automatically, and gives you
                clean receipts and daily totals. On the phones you already have.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <ButtonLink
                  to="/register"
                  size="lg"
                  trailingIcon={<ArrowRight aria-hidden="true" className="size-5" />}
                >
                  Get started
                </ButtonLink>
                <a
                  href="#how-it-works"
                  className={buttonClasses({ variant: 'secondary', size: 'lg' })}
                >
                  See how it works
                </a>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-label text-ink-muted">
                {['No app store needed', 'Staff accounts in minutes', 'Receipts on WhatsApp'].map(
                  (point) => (
                    <li key={point} className="flex items-center gap-1.5">
                      <BadgeCheck aria-hidden="true" className="size-4 text-primary" />
                      {point}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-md py-6">
              <PhonePreview />
              <ConfirmedCard className="absolute top-2 -left-2 hidden animate-page-in sm:flex lg:-left-10" />
              <LowStockCard className="absolute -right-2 -bottom-2 hidden animate-page-in sm:flex lg:-right-10" />
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section aria-labelledby="who-its-for" className="border-y border-line bg-surface-raised">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
            <h2 id="who-its-for" className="text-center text-label font-semibold text-ink-muted">
              Made for businesses that sell over the counter
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {BUSINESSES.map((business) => (
                <li
                  key={business.label}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-surface-sunken px-3 py-3 text-label text-ink"
                >
                  <business.icon aria-hidden="true" className="size-5 text-primary" />
                  {business.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section
          aria-labelledby="features"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <SectionHeading
            id="features"
            eyebrow="Features"
            title="Everything the counter needs, nothing it doesn't"
            text="Built with shop owners for the way small businesses really sell: busy counters, cash and transfers, and staff who need to be quick."
          />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-5 shadow-soft transition-shadow hover:shadow-raised"
              >
                <span className="flex size-11 items-center justify-center rounded-control bg-primary-soft text-primary">
                  <feature.icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="text-title text-ink">{feature.title}</h3>
                <p className="text-body text-ink-muted">{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Spotlights */}
        <section aria-label="A closer look" className="bg-surface-raised">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-20 sm:px-6">
            <Spotlight
              eyebrow="Reports"
              title="See how the day went, in one look"
              text="Sales today against yesterday, how customers paid, what sold best and what is running low. Weekly and monthly reports with charts, a spreadsheet export and a one-page PDF to share."
              points={[
                'Best and slowest sellers',
                'Stock value at cost',
                'Voided orders kept apart',
              ]}
              visual={<SalesCard className="w-full max-w-sm" />}
            />
            <Spotlight
              reverse
              eyebrow="Shared supplies"
              title="Count by the bottle, not just the drink"
              text="If your drinks share the same bottles, Tallybox counts the bottles. Sell 10 Coke, 10 Fanta and 10 apple juice, and 30 bottles come off one shared stock. Items can count their own stock, shared supplies, both, or nothing at all."
              points={[
                'Several items, one supply',
                'Clear warnings before you run out',
                'Voids put supplies back',
              ]}
              visual={<SuppliesPreview className="w-full max-w-sm" />}
            />
            <Spotlight
              eyebrow="Receipts"
              title="A proper receipt for every paid order"
              text="With your logo, address and message. Share it to WhatsApp, save it as a PDF or picture, or print it. Voided orders are clearly marked VOID."
              points={[
                'WhatsApp in one tap',
                'A4, 80 mm and 58 mm printing',
                'Prices fixed at the time of sale',
              ]}
              visual={<ReceiptPreview className="rotate-1" />}
            />
          </div>
        </section>

        {/* How it works */}
        <section
          aria-labelledby="how-it-works"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <SectionHeading
            id="how-it-works"
            eyebrow="How it works"
            title="Up and running the same day"
            text="No hardware to buy and nothing to install."
          />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="relative flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-6 shadow-soft"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary text-label font-bold text-on-primary tabular-nums">
                    {index + 1}
                  </span>
                  <step.icon aria-hidden="true" className="size-5 text-primary" />
                </span>
                <h3 className="text-title text-ink">{step.title}</h3>
                <p className="text-body text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Trust */}
        <section aria-labelledby="trust-title" className="bg-grey-900 text-white">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr] md:items-center">
            <div className="flex flex-col gap-3">
              <Lock aria-hidden="true" className="size-8 text-teal-300" />
              <h2
                id="trust-title"
                className="text-[1.75rem] leading-tight font-bold tracking-tight"
              >
                Records you can rely on
              </h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                [
                  'Nothing disappears',
                  'Sales, voids and stock changes are kept for good, with who made each one.',
                ],
                [
                  'Your business only',
                  'Each business sees only its own data, checked by the database itself.',
                ],
                [
                  'Payments you checked',
                  'No order without “Payment received”. No surprises at closing time.',
                ],
                [
                  'Honest stock',
                  'Every quantity always adds up to its history of sales and deliveries.',
                ],
              ].map(([title, text]) => (
                <li
                  key={title}
                  className="flex flex-col gap-1 rounded-card border border-white/10 bg-white/5 p-5"
                >
                  <span className="text-body font-semibold">{title}</span>
                  <span className="text-label font-normal text-grey-300">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby="faq"
          className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <SectionHeading id="faq" eyebrow="Questions" title="Good to know" />
          <div className="mt-10 flex flex-col gap-3">
            {FAQ.map((entry) => (
              <details
                key={entry.question}
                className="group rounded-card border border-line bg-surface-raised shadow-soft"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-body font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {entry.question}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="px-5 pb-5 text-body text-ink-muted">{entry.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {api.demo ? (
          <section
            aria-labelledby="demo-title"
            className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6"
          >
            <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-control p-5">
              <p id="demo-title" className="flex items-center gap-2 text-label text-ink">
                <FlaskConical aria-hidden="true" className="size-4" />
                This is a demo
              </p>
              <p className="text-label font-normal text-ink-muted">
                Everything is made up and stays in this browser. The sign-in pages list demo
                accounts for the developer, owners and staff.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ResetDemoData />
                {import.meta.env.DEV ? (
                  <Link
                    to="/dev/gallery"
                    className="text-label font-semibold text-primary underline"
                  >
                    Design gallery
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* Call to action */}
        <section aria-labelledby="cta-title" className="px-4 pb-20 sm:px-6">
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 overflow-hidden rounded-[1.5rem] bg-primary px-6 py-14 text-center text-on-primary">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(30rem_16rem_at_50%_-20%,rgb(255_255_255/0.18),transparent_70%)]"
            />
            <h2
              id="cta-title"
              className="relative max-w-2xl text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]"
            >
              Ready to count on Tallybox?
            </h2>
            <p className="relative max-w-xl text-body-lg opacity-90">
              Ask for your activation code and have your shop selling with Tallybox today.
            </p>
            <div className="relative flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                to="/register"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-control bg-white px-6 text-body-lg font-semibold text-teal-700 transition-colors hover:bg-teal-50"
              >
                Get started
                <ArrowRight aria-hidden="true" className="size-5" />
              </Link>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Tallybox%20activation%20code`}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-control border border-white/40 px-6 text-body-lg font-semibold text-white transition-colors hover:bg-white/10"
              >
                <Mail aria-hidden="true" className="size-5" />
                Ask for a code
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface-raised pb-safe">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <Logo size="sm" />
            <p className="max-w-xs text-label font-normal text-ink-muted">
              Stock and sales for your business.
            </p>
          </div>
          <FooterColumn title="Product">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="hover:text-ink">
                {section.label}
              </a>
            ))}
          </FooterColumn>
          <FooterColumn title="Account">
            <Link to="/register" className="hover:text-ink">
              Register your business
            </Link>
            <Link to="/login/owner" className="hover:text-ink">
              Owner sign in
            </Link>
            <Link to="/login/staff" className="hover:text-ink">
              Staff sign in
            </Link>
          </FooterColumn>
          <FooterColumn title="Contact">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="break-all hover:text-ink">
              {SUPPORT_EMAIL}
            </a>
          </FooterColumn>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto w-full max-w-6xl px-4 py-5 text-caption text-ink-muted tabular-nums sm:px-6">
            © {new Date().getFullYear()} Tallybox · v{APP_VERSION}
          </p>
        </div>
      </footer>
    </div>
  )
}

function Spotlight({
  eyebrow,
  title,
  text,
  points,
  visual,
  reverse = false,
}: {
  eyebrow: string
  title: string
  text: string
  points: readonly string[]
  visual: ReactNode
  reverse?: boolean
}) {
  return (
    <article className="grid items-center gap-10 md:grid-cols-2">
      <div className={reverse ? 'md:order-2' : undefined}>
        <div className="flex flex-col gap-4">
          <p className="text-label font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
          <h3 className="text-[1.6rem] leading-tight font-bold tracking-tight text-ink sm:text-[2rem]">
            {title}
          </h3>
          <p className="text-body-lg text-ink-muted">{text}</p>
          <ul className="flex flex-col gap-2">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2 text-body text-ink">
                <BadgeCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-center rounded-[1.5rem] bg-surface-sunken p-6 sm:p-10">
        {visual}
      </div>
    </article>
  )
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label font-semibold text-ink">{title}</p>
      <div className="flex flex-col gap-2 text-label font-normal text-ink-muted [&>*]:inline-flex [&>*]:min-h-8 [&>*]:items-center">
        {children}
      </div>
    </div>
  )
}
