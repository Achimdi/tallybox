import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { CreateOrderInput, SaveHeldOrderInput } from '@/api/types'
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
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: KEYS.held }),
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
