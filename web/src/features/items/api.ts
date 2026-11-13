import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/api/context'

export const ITEMS_KEY = ['items'] as const

/**
 * The item list, kept in memory while selling. Refreshed when the screen
 * regains focus and after every order, so stock shown is close to live.
 * The server checks stock again when an order is confirmed.
 */
export function useItems() {
  const api = useApi()
  return useQuery({ queryKey: ITEMS_KEY, queryFn: () => api.items.list(), staleTime: 15_000 })
}

/** Category names in use, sorted, for filter chips. */
export function categoriesOf(items: readonly { category: string | null }[]): string[] {
  return [
    ...new Set(items.map((item) => item.category).filter((value): value is string => !!value)),
  ].sort((a, b) => a.localeCompare(b))
}

export function matchesSearch(name: string, search: string): boolean {
  const needle = search.trim().toLowerCase()
  return needle === '' || name.toLowerCase().includes(needle)
}
