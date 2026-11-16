import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { CreateOrderInput, OrderFilter, SaveHeldOrderInput } from '@/api/types'
import { ITEMS_KEY } from '@/features/items/api'

const KEYS = {
  mine: ['orders', 'mine'] as const,
  order: (id: string) => ['orders', 'one', id] as const,
  held: ['held'] as const,
}

export function useMyOrders() {
  const api = useApi()
  return useQuery({ queryKey: KEYS.mine, queryFn: () => api.orders.listMine() })
}

export function useOrder(orderId: string) {
  const api = useApi()
  return useQuery({ queryKey: KEYS.order(orderId), queryFn: () => api.orders.get(orderId) })
}

export function useHeldOrders() {
  const api = useApi()
  return useQuery({ queryKey: KEYS.held, queryFn: () => api.held.list() })
}

export function useCreateOrder() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrderInput) => api.orders.create(input),
    onSuccess: (order) => queryClient.setQueryData(KEYS.order(order.id), order),
    // Stock changed (or the order was refused because it had): refresh everything it touches.
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['supplies'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: KEYS.held }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}

export function useSaveHeldOrder() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveHeldOrderInput) => api.held.save(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEYS.held }),
  })
}

export function useDiscardHeldOrder() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (heldOrderId: string) => api.held.discard(heldOrderId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEYS.held }),
  })
}

const ORDER_PAGE_SIZE = 25

/** Owner: every order matching the filter, newest first, a page at a time. */
export function useOrderList(filter: Omit<OrderFilter, 'offset' | 'limit'>) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: ['orders', 'list', filter],
    // Keep showing the last results while a changed filter loads, instead of flashing a skeleton.
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      api.orders.list({ ...filter, offset: pageParam, limit: ORDER_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.rows.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })
}

export function useVoidOrder() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { orderId: string; reason: string }) => api.orders.void(input),
    onSuccess: (order) => queryClient.setQueryData(['orders', 'one', order.id], order),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['supplies'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  })
}
