import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { callFunction } from '@/lib/api'
import { fromDatabaseError, toAppError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'

export interface NewStaffInput {
  displayName: string
  username: string
  password: string
}

const createdStaffSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
})

export type CreatedStaff = z.infer<typeof createdStaffSchema>

/** Creates a staff account in the owner's business. Throws an AppError when refused. */
export function createStaff(input: NewStaffInput): Promise<CreatedStaff> {
  return callFunction('create-staff', { ...input }, createdStaffSchema)
}

/**
 * How many staff accounts the business has. A plain read: Row Level Security
 * limits it to the owner's own business.
 */
export function useStaffCount() {
  return useQuery({
    queryKey: ['staff', 'count'],
    queryFn: async () => {
      try {
        const { count, error } = await getSupabase()
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'staff')
        if (error) throw fromDatabaseError(error)
        return count ?? 0
      } catch (thrown) {
        throw toAppError(thrown)
      }
    },
  })
}
