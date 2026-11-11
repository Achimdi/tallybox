import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { callFunction, callRpc } from '@/lib/api'

/**
 * Super-admin data. Reads go through database functions that check, live, that
 * the caller is the super-admin. Changes go through Edge Functions.
 */

const businessSchema = z.object({
  id: z.string(),
  name: z.string(),
  business_code: z.string(),
  status: z.enum(['active', 'suspended']),
  created_at: z.string(),
  owner_email: z.string().nullable(),
  staff_count: z.number(),
  last_activity_at: z.string().nullable(),
  suspended_at: z.string().nullable(),
  suspended_reason: z.string().nullable(),
})
export type AdminBusiness = z.infer<typeof businessSchema>

const activationCodeSchema = z.object({
  id: z.string(),
  owner_email: z.string(),
  note: z.string().nullable(),
  status: z.enum(['unused', 'used', 'revoked', 'expired']),
  created_at: z.string(),
  expires_at: z.string(),
  used_at: z.string().nullable(),
  used_by_business_name: z.string().nullable(),
})
export type AdminActivationCode = z.infer<typeof activationCodeSchema>

const countsSchema = z.object({
  businesses: z.number(),
  suspended: z.number(),
  staff: z.number(),
  unused_codes: z.number(),
})

const generatedCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  ownerEmail: z.string(),
  expiresAt: z.string(),
})
export type GeneratedCode = z.infer<typeof generatedCodeSchema>

const KEYS = {
  all: ['admin'] as const,
  businesses: ['admin', 'businesses'] as const,
  codes: ['admin', 'codes'] as const,
  counts: ['admin', 'counts'] as const,
}

export function useAdminBusinesses() {
  return useQuery({
    queryKey: KEYS.businesses,
    queryFn: () => callRpc('admin_list_businesses', {}, z.array(businessSchema)),
  })
}

export function useAdminActivationCodes() {
  return useQuery({
    queryKey: KEYS.codes,
    queryFn: () => callRpc('admin_list_activation_codes', {}, z.array(activationCodeSchema)),
  })
}

export function usePlatformCounts() {
  return useQuery({
    queryKey: KEYS.counts,
    queryFn: () => callRpc('admin_platform_counts', {}, countsSchema),
  })
}

export function useGenerateActivationCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { ownerEmail: string; note: string; expiresInDays: number }) =>
      callFunction('generate-activation-code', input, generatedCodeSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useRevokeActivationCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (codeId: string) =>
      callFunction('revoke-activation-code', { codeId }, z.object({ revoked: z.boolean() })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useSetBusinessStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { businessId: string; status: 'active' | 'suspended'; reason?: string }) =>
      callFunction('set-business-status', input, z.object({ status: z.string() })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEYS.all }),
  })
}
