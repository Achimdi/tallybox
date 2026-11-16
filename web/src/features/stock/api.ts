import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { AdjustInput, MovementFilter, RestockInput } from '@/api/types'
import { ITEMS_KEY } from '@/features/items/api'

const PAGE_SIZE = 25

/** The stock ledger, newest first, a page at a time. */
export function useMovements(filter: Omit<MovementFilter, 'offset' | 'limit'>) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: ['stock', 'movements', filter],
    queryFn: ({ pageParam }) =>
      api.stock.movements({ ...filter, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.rows.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })
}

function useAfterStockChange() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['supplies'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
}

export function useRestock() {
  const api = useApi()
  const refresh = useAfterStockChange()
  return useMutation({
    mutationFn: (input: RestockInput) => api.stock.restock(input),
    onSettled: refresh,
  })
}

export function useAdjustStock() {
  const api = useApi()
  const refresh = useAfterStockChange()
  return useMutation({
    mutationFn: (input: AdjustInput) => api.stock.adjust(input),
    onSettled: refresh,
  })
}
