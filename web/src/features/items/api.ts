import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { ItemInput } from '@/api/types'

export const ITEMS_KEY = ['items'] as const
const COSTS_KEY = ['items', 'costs'] as const

/**
 * The item list, kept in memory while selling. Refreshed when the screen
 * regains focus and after every change, so stock shown is close to live.
 * The server checks stock again when an order is confirmed.
 */
export function useItems() {
  const api = useApi()
  return useQuery({ queryKey: ITEMS_KEY, queryFn: () => api.items.list(), staleTime: 15_000 })
}

/** Owner only: cost prices by item id. */
export function useItemCosts() {
  const api = useApi()
  return useQuery({ queryKey: COSTS_KEY, queryFn: () => api.items.costs() })
}

/** Everything that depends on items: lists, costs, the ledger and the dashboard. */
export function useRefreshStock() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['supplies'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['stock-mode'] }),
    ])
}

/** Owner only: every change to how an item counts stock. */
export function useStockModeChanges(itemId: string) {
  const api = useApi()
  return useQuery({
    queryKey: ['stock-mode', itemId],
    queryFn: () => api.items.stockModeChanges(itemId),
  })
}

export function useUpsertItem() {
  const api = useApi()
  const refresh = useRefreshStock()
  return useMutation({
    mutationFn: (input: ItemInput) => api.items.upsert(input),
    onSettled: refresh,
  })
}

export function useSetItemArchived() {
  const api = useApi()
  const refresh = useRefreshStock()
  return useMutation({
    mutationFn: ({ itemId, archived }: { itemId: string; archived: boolean }) =>
      archived ? api.items.archive(itemId) : api.items.restore(itemId),
    onSettled: refresh,
  })
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
