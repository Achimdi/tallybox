import { useMutation, useQuery } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { SupplyInput } from '@/api/types'
import { useRefreshStock } from '@/features/items/api'

export const SUPPLIES_KEY = ['supplies'] as const

/**
 * Shared supplies (bottles, caps…). Staff load them too, to know how many of
 * a supply-backed item can still be sold; they never see supply costs.
 */
export function useSupplies() {
  const api = useApi()
  return useQuery({ queryKey: SUPPLIES_KEY, queryFn: () => api.supplies.list(), staleTime: 15_000 })
}

/** Owner only: cost prices by supply id. */
export function useSupplyCosts() {
  const api = useApi()
  return useQuery({ queryKey: [...SUPPLIES_KEY, 'costs'], queryFn: () => api.supplies.costs() })
}

export function useUpsertSupply() {
  const api = useApi()
  const refresh = useRefreshStock()
  return useMutation({
    mutationFn: (input: SupplyInput) => api.supplies.upsert(input),
    onSettled: refresh,
  })
}

export function useSetSupplyArchived() {
  const api = useApi()
  const refresh = useRefreshStock()
  return useMutation({
    mutationFn: ({ supplyId, archived }: { supplyId: string; archived: boolean }) =>
      archived ? api.supplies.archive(supplyId) : api.supplies.restore(supplyId),
    onSettled: refresh,
  })
}
