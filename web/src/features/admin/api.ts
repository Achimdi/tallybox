import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { BusinessStatus } from '@/domain/access'
import type { GenerateCodeInput } from '@/api/types'

/** Developer-portal data, all through the data layer. */

const KEYS = {
  all: ['admin'] as const,
  businesses: ['admin', 'businesses'] as const,
  business: (id: string) => ['admin', 'business', id] as const,
  counts: ['admin', 'counts'] as const,
  codes: ['admin', 'codes'] as const,
}

export function useAdminBusinesses() {
  const api = useApi()
  return useQuery({ queryKey: KEYS.businesses, queryFn: () => api.admin.listBusinesses() })
}

export function useAdminBusiness(businessId: string) {
  const api = useApi()
  return useQuery({
    queryKey: KEYS.business(businessId),
    queryFn: () => api.admin.getBusiness(businessId),
  })
}

export function usePlatformCounts() {
  const api = useApi()
  return useQuery({ queryKey: KEYS.counts, queryFn: () => api.admin.platformCounts() })
}

export function useAdminActivationCodes() {
  const api = useApi()
  return useQuery({ queryKey: KEYS.codes, queryFn: () => api.admin.listActivationCodes() })
}

/** Every change refreshes all developer data, which is small. */
function useAdminMutation<Input, Result>(run: (input: Input) => Promise<Result>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useSetBusinessStatus() {
  const api = useApi()
  return useAdminMutation(
    (input: { businessId: string; status: BusinessStatus; reason?: string }) =>
      api.admin.setBusinessStatus(input),
  )
}

export function useExtendAccess() {
  const api = useApi()
  return useAdminMutation((input: { businessId: string; days: number | null }) =>
    api.admin.extendAccess(input),
  )
}

export function useOwnerResetLink() {
  const api = useApi()
  return useMutation({
    mutationFn: (businessId: string) => api.admin.createOwnerResetLink(businessId),
  })
}

export function useGenerateActivationCode() {
  const api = useApi()
  return useAdminMutation((input: GenerateCodeInput) => api.admin.generateActivationCode(input))
}

export function useRevokeActivationCode() {
  const api = useApi()
  return useAdminMutation((codeId: string) => api.admin.revokeActivationCode(codeId))
}
