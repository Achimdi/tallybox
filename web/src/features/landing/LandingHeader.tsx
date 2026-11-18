import { ChevronDown, Menu, Store, UserRound, X } from 'lucide-react'
import { Dialog, DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/components/brand/Logo'
import { ButtonLink } from '@/components/Button'
import { buttonClasses } from '@/components/button-styles'
import { cn } from '@/lib/cn'

export const SECTIONS = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'who-its-for', label: "Who it's for" },
  { id: 'faq', label: 'Questions' },
] as const

const SIGN_IN = [
  {
    to: '/login/owner',
    label: 'Business owner',
    hint: 'Sign in with your email',
    icon: Store,
  },
  {
    to: '/login/staff',
    label: 'Staff',
    hint: 'Business code and username',
    icon: UserRound,
  },
] as const

/** The website's top bar: logo, section links, Sign in (owner or staff) and Get started. */
export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Link to="/" aria-label="Tallybox home" className="rounded-control">
          <Logo size="sm" />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex min-h-12 items-center rounded-control px-3 text-label text-ink-muted transition-colors hover:text-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={cn(buttonClasses({ variant: 'ghost' }), 'hidden gap-1 sm:inline-flex')}
            >
              Sign in
              <ChevronDown aria-hidden="true" className="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-40 w-72 rounded-card border border-line bg-surface-raised p-2 shadow-raised data-[state=open]:animate-pop-in"
              >
                <DropdownMenu.Label className="px-3 py-2 text-caption text-ink-muted">
                  Sign in as
                </DropdownMenu.Label>
                {SIGN_IN.map((option) => (
                  <DropdownMenu.Item key={option.to} asChild>
                    <Link
                      to={option.to}
                      className="flex min-h-14 items-center gap-3 rounded-control px-3 py-2 outline-none data-[highlighted]:bg-surface-sunken"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <option.icon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="flex flex-col">
                        <span className="text-label font-semibold text-ink">{option.label}</span>
                        <span className="text-caption text-ink-muted">{option.hint}</span>
                      </span>
                    </Link>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <ButtonLink to="/register" className="hidden sm:inline-flex">
            Get started
          </ButtonLink>

          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger
              aria-label="Open menu"
              className="inline-flex size-12 items-center justify-center rounded-control text-ink hover:bg-surface-sunken lg:hidden"
            >
              <Menu aria-hidden="true" className="size-6" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in" />
              <Dialog.Content className="fixed inset-x-0 top-0 z-50 flex max-h-dvh flex-col gap-6 overflow-y-auto rounded-b-card bg-surface-raised px-4 pt-3 pb-6 shadow-raised data-[state=open]:animate-fade-in">
                <div className="flex items-center justify-between">
                  <Dialog.Title asChild>
                    <span>
                      <Logo size="sm" />
                    </span>
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label="Close menu"
                    className="inline-flex size-12 items-center justify-center rounded-control text-ink hover:bg-surface-sunken"
                  >
                    <X aria-hidden="true" className="size-6" />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  Sections of the page and sign-in links
                </Dialog.Description>
                <nav aria-label="Sections" className="flex flex-col">
                  {SECTIONS.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-12 items-center border-b border-line text-body-lg font-semibold text-ink"
                    >
                      {section.label}
                    </a>
                  ))}
                </nav>
                <div className="flex flex-col gap-3">
                  <p className="text-label text-ink-muted">Sign in as</p>
                  <div className="grid grid-cols-2 gap-3">
                    {SIGN_IN.map((option) => (
                      <ButtonLink
                        key={option.to}
                        to={option.to}
                        variant="secondary"
                        leadingIcon={<option.icon aria-hidden="true" className="size-5" />}
                      >
                        {option.label === 'Business owner' ? 'Owner' : option.label}
                      </ButtonLink>
                    ))}
                  </div>
                  <ButtonLink to="/register" size="lg" fullWidth>
                    Get started
                  </ButtonLink>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  )
}
