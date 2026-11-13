import { env } from '@/lib/env'
import { createMockApi } from './mock/mockApi'
import { createSupabaseApi } from './supabase'
import type { TallyboxApi } from './types'

export type * from './types'

/** The data source for this build, chosen by VITE_DATA_SOURCE (mock until Phase 2). */
export function createApi(): TallyboxApi {
  return env.dataSource === 'supabase' ? createSupabaseApi() : createMockApi()
}
