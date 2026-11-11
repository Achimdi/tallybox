import { Search, X } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/cn'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  /** Read by screen readers. Not shown. */
  label: string
  placeholder?: string
  className?: string
}

export function SearchBar({
  value,
  onChange,
  label,
  placeholder = 'Search',
  className,
}: SearchBarProps) {
  const id = useId()
  return (
    <div role="search" className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted"
      />
      <input
        id={id}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'rounded-control border-line-control bg-surface-raised text-ink placeholder:text-ink-subtle',
          'min-h-12 w-full border pr-12 pl-12 transition-colors duration-150 hover:border-ink-muted',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-muted hover:text-ink"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      ) : null}
    </div>
  )
}
