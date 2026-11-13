import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { NewStaffInput } from '@/api/types'

const STAFF_KEY = ['staff'] as const

/** The owner's staff accounts. */
export function useStaffList() {
  const api = useApi()
  return useQuery({ queryKey: STAFF_KEY, queryFn: () => api.staff.list() })
}

export function useCreateStaff() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewStaffInput) => api.staff.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STAFF_KEY }),
  })
}
