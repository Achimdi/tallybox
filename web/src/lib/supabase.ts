import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env, isSupabaseConfigured, looksLikeSecretKey } from './env'
import { AppError } from './errors'

/**
 * The one Supabase client for the browser.
 *
 * It uses the PUBLISHABLE key, which is public by design. What a signed-in
 * person can read is decided by Row Level Security in the database, and every
 * change goes through a server function. The browser never writes to tables.
 */

export type TallyboxClient = SupabaseClient<Database>

let client: TallyboxClient | undefined

export function getSupabase(): TallyboxClient {
  if (client) return client

  const { supabaseUrl, supabasePublishableKey } = env
  if (!isSupabaseConfigured || !supabaseUrl || !supabasePublishableKey) {
    throw new AppError('config_missing', {
      details: {
        reason: looksLikeSecretKey(supabasePublishableKey ?? '')
          ? 'secret_key_in_browser'
          : 'missing_env',
      },
    })
  }

  client = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return client
}
