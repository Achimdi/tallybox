import { createMockApi } from './mock/mockApi'
import { createSupabaseApi } from './supabase'
import type { TallyboxApi } from './types'

export type * from './types'

/**
 * The data source for this build, chosen by VITE_DATA_SOURCE (mock until Phase 2).
 *
 * Read straight from import.meta.env, which Vite replaces with a fixed value at
 * build time, so each build carries only the implementation it uses: the demo
 * build has no Supabase library, and a real build has no demo data.
 */
export function createApi(): TallyboxApi {
  return import.meta.env.VITE_DATA_SOURCE === 'supabase' ? createSupabaseApi() : createMockApi()
}
