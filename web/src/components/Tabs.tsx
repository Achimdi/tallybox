import { Tabs as RadixTabs } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabDefinition<Value extends string> {
  value: Value
  label: string
  count?: number
  content: ReactNode
}

interface TabsProps<Value extends string> {
  /** For screen readers: what the tabs switch between. */
  label: string
  tabs: readonly TabDefinition<Value>[]
  value: Value
  onChange: (value: Value) => void
  className?: string
}

/**
 * Switches between views on one screen, like Today and Held. Arrow keys move
 * between tabs, as screen-reader users expect.
 */
export function Tabs<Value extends string>({
  label,
  tabs,
  value,
  onChange,
  className,
}: TabsProps<Value>) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={(next) => onChange(next as Value)}
      className={cn('flex flex-col gap-4', className)}
    >
      <RadixTabs.List
        aria-label={label}
        className="flex gap-1 rounded-control border border-line bg-surface-sunken p-1"
      >
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[0.6rem] px-3 text-label text-ink-muted transition-colors duration-150',
              'hover:text-ink data-[state=active]:bg-surface-raised data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-soft',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="rounded-full bg-line px-1.5 text-caption font-semibold text-ink tabular-nums">
                {tab.count}
              </span>
            ) : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content key={tab.value} value={tab.value} className="outline-none">
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  )
}
