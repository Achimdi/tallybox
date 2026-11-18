import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

interface NavProps {
  items: readonly NavItem[]
}

function NavEntry({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'group flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-caption font-medium',
          'transition-colors duration-150 md:min-h-16 md:flex-none',
          // The current page is shown by weight and a filled pill, not color alone.
          isActive ? 'font-bold text-primary' : 'text-ink-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-8 w-full max-w-14 items-center justify-center rounded-full transition-colors duration-150',
              isActive ? 'bg-teal-100' : 'group-hover:bg-surface-sunken',
            )}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.5 : 2} />
          </span>
          <span className="max-w-full truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Phone navigation: a bar fixed to the bottom of the screen. Hidden on larger screens. */
export function BottomNav({ items }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised pb-safe md:hidden"
    >
      <div className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <NavEntry key={item.to} item={item} />
        ))}
      </div>
    </nav>
  )
}

interface SideRailProps extends NavProps {
  /** Top of the rail, usually the logo. */
  header?: ReactNode
  /** Bottom of the rail, for example sign out. */
  footer?: ReactNode
}

/** Tablet and laptop navigation: a rail down the left side. Hidden on phones. */
export function SideRail({ items, header, footer }: SideRailProps) {
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-stretch gap-2 border-r border-line bg-surface-raised py-4 md:flex"
    >
      {header ? <div className="flex justify-center pb-2">{header}</div> : null}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <NavEntry key={item.to} item={item} />
        ))}
      </div>
      {footer ? <div className="flex flex-col items-stretch">{footer}</div> : null}
    </nav>
  )
}
