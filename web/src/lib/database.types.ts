/**
 * Database types for the browser.
 *
 * WRITTEN BY HAND for now, to match supabase/migrations. Once a Supabase
 * project is linked, replace this file with the generated version:
 *
 *   npm run db:types
 *
 * Only what the browser may touch is listed: the tables it can read and the
 * functions it can call. Functions reserved for Edge Functions are left out
 * on purpose.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string
          name: string
          business_code: string
          status: string
          owner_id: string | null
          plan: string
          subscription_status: string
          trial_ends_at: string | null
          subscription_ends_at: string | null
          currency_code: string
          timezone: string
          address: string | null
          phone: string | null
          logo_path: string | null
          receipt_footer: string | null
          default_low_stock_level: number
          order_counter: number
          created_at: string
          suspended_at: string | null
          suspended_reason: string | null
        }
        // The browser never writes to tables.
        Insert: never
        Update: never
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          business_id: string
          role: string
          username: string | null
          display_name: string
          active: boolean
          created_at: string
          created_by: string | null
          last_login_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_session_state: {
        Args: { p_record_login?: boolean }
        Returns: Json
      }
      admin_list_businesses: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_list_activation_codes: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_platform_counts: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
