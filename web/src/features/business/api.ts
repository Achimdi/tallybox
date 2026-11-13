import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { BusinessSettingsInput } from '@/api/types'
import { useSession } from '@/features/auth/session'

export function useDashboard() {
  const api = useApi()
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api.reports.dashboard() })
}

export function useBusinessSettings() {
  const api = useApi()
  return useQuery({ queryKey: ['business'], queryFn: () => api.business.get() })
}

export function useUpdateBusinessSettings() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { refresh } = useSession()
  return useMutation({
    mutationFn: (input: BusinessSettingsInput) => api.business.update(input),
    onSuccess: async (settings) => {
      queryClient.setQueryData(['business'], settings)
      // Name, currency and timezone are shown everywhere: ask for the session again.
      await refresh()
      await queryClient.invalidateQueries()
    },
  })
}
