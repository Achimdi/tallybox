export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      activation_codes: {
        Row: {
          access_days: number | null
          code_hash: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          note: string | null
          owner_email: string
          revoked_at: string | null
          status: string
          used_at: string | null
          used_by_business_id: string | null
        }
        Insert: {
          access_days?: number | null
          code_hash: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          note?: string | null
          owner_email: string
          revoked_at?: string | null
          status?: string
          used_at?: string | null
          used_by_business_id?: string | null
        }
        Update: {
          access_days?: number | null
          code_hash?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          owner_email?: string
          revoked_at?: string | null
          status?: string
          used_at?: string | null
          used_by_business_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'activation_codes_used_by_business_id_fkey'
            columns: ['used_by_business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          business_code: string
          created_at: string
          currency_code: string
          default_low_stock_level: number
          id: string
          logo_path: string | null
          name: string
          order_counter: number
          owner_id: string | null
          phone: string | null
          plan: string
          receipt_footer: string | null
          status: string
          subscription_ends_at: string | null
          subscription_status: string
          suspended_at: string | null
          suspended_reason: string | null
          timezone: string
          trial_ends_at: string | null
        }
        Insert: {
          address?: string | null
          business_code: string
          created_at?: string
          currency_code?: string
          default_low_stock_level?: number
          id?: string
          logo_path?: string | null
          name: string
          order_counter?: number
          owner_id?: string | null
          phone?: string | null
          plan?: string
          receipt_footer?: string | null
          status?: string
          subscription_ends_at?: string | null
          subscription_status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          timezone?: string
          trial_ends_at?: string | null
        }
        Update: {
          address?: string | null
          business_code?: string
          created_at?: string
          currency_code?: string
          default_low_stock_level?: number
          id?: string
          logo_path?: string | null
          name?: string
          order_counter?: number
          owner_id?: string | null
          phone?: string | null
          plan?: string
          receipt_footer?: string | null
          status?: string
          subscription_ends_at?: string | null
          subscription_status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          timezone?: string
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      daily_summaries: {
        Row: {
          business_id: string
          by_payment_method: Json
          date_key: string
          order_count: number
          total_sales: number
          voided_count: number
          voided_total: number
        }
        Insert: {
          business_id: string
          by_payment_method?: Json
          date_key: string
          order_count?: number
          total_sales?: number
          voided_count?: number
          voided_total?: number
        }
        Update: {
          business_id?: string
          by_payment_method?: Json
          date_key?: string
          order_count?: number
          total_sales?: number
          voided_count?: number
          voided_total?: number
        }
        Relationships: [
          {
            foreignKeyName: 'daily_summaries_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      held_order_lines: {
        Row: {
          business_id: string
          held_order_id: string
          item_id: string
          line_no: number
          qty: number
        }
        Insert: {
          business_id: string
          held_order_id: string
          item_id: string
          line_no: number
          qty: number
        }
        Update: {
          business_id?: string
          held_order_id?: string
          item_id?: string
          line_no?: number
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: 'held_order_lines_held_order_id_business_id_fkey'
            columns: ['held_order_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'held_orders'
            referencedColumns: ['id', 'business_id']
          },
          {
            foreignKeyName: 'held_order_lines_item_id_business_id_fkey'
            columns: ['item_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
      held_orders: {
        Row: {
          business_id: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          note: string | null
          staff_id: string | null
          staff_name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          note?: string | null
          staff_id?: string | null
          staff_name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          note?: string | null
          staff_id?: string | null
          staff_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'held_orders_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      item_costs: {
        Row: {
          business_id: string
          cost_price: number
          item_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_price: number
          item_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_price?: number
          item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'item_costs_item_id_business_id_fkey'
            columns: ['item_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
      item_supplies: {
        Row: {
          business_id: string
          item_id: string
          supply_id: string
          units_per_sale: number
        }
        Insert: {
          business_id: string
          item_id: string
          supply_id: string
          units_per_sale: number
        }
        Update: {
          business_id?: string
          item_id?: string
          supply_id?: string
          units_per_sale?: number
        }
        Relationships: [
          {
            foreignKeyName: 'item_supplies_item_id_business_id_fkey'
            columns: ['item_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id', 'business_id']
          },
          {
            foreignKeyName: 'item_supplies_supply_id_business_id_fkey'
            columns: ['supply_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'supplies'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
      items: {
        Row: {
          active: boolean
          business_id: string
          category: string | null
          created_at: string
          id: string
          low_stock_level: number
          name: string
          name_lower: string | null
          price: number
          quantity: number
          tracks_own_stock: boolean
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          category?: string | null
          created_at?: string
          id?: string
          low_stock_level?: number
          name: string
          name_lower?: string | null
          price: number
          quantity?: number
          tracks_own_stock?: boolean
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          category?: string | null
          created_at?: string
          id?: string
          low_stock_level?: number
          name?: string
          name_lower?: string | null
          price?: number
          quantity?: number
          tracks_own_stock?: boolean
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'items_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      order_lines: {
        Row: {
          business_id: string
          id: string
          item_id: string
          line_no: number
          line_total: number
          name: string
          order_id: string
          qty: number
          unit_price: number
        }
        Insert: {
          business_id: string
          id?: string
          item_id: string
          line_no: number
          line_total: number
          name: string
          order_id: string
          qty: number
          unit_price: number
        }
        Update: {
          business_id?: string
          id?: string
          item_id?: string
          line_no?: number
          line_total?: number
          name?: string
          order_id?: string
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: 'order_lines_item_id_business_id_fkey'
            columns: ['item_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id', 'business_id']
          },
          {
            foreignKeyName: 'order_lines_order_id_business_id_fkey'
            columns: ['order_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
      orders: {
        Row: {
          business_id: string
          client_order_id: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          date_key: string
          id: string
          note: string | null
          order_number: number
          payment_confirmed_at: string
          payment_confirmed_by: string | null
          payment_confirmed_by_name: string
          payment_method: string
          payment_reference: string | null
          staff_id: string | null
          staff_name: string
          status: string
          total: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_name: string | null
        }
        Insert: {
          business_id: string
          client_order_id: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          date_key: string
          id?: string
          note?: string | null
          order_number: number
          payment_confirmed_at: string
          payment_confirmed_by?: string | null
          payment_confirmed_by_name: string
          payment_method: string
          payment_reference?: string | null
          staff_id?: string | null
          staff_name: string
          status?: string
          total: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
        }
        Update: {
          business_id?: string
          client_order_id?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          date_key?: string
          id?: string
          note?: string | null
          order_number?: number
          payment_confirmed_at?: string
          payment_confirmed_by?: string | null
          payment_confirmed_by_name?: string
          payment_method?: string
          payment_reference?: string | null
          staff_id?: string | null
          staff_name?: string
          status?: string
          total?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'orders_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          last_login_at: string | null
          role: string
          username: string | null
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          created_by?: string | null
          display_name: string
          id: string
          last_login_at?: string | null
          role: string
          username?: string | null
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          last_login_at?: string | null
          role?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      restocks: {
        Row: {
          business_id: string
          client_id: string
          created_at: string
          created_by: string | null
          created_by_name: string
          id: string
          note: string | null
          received_on: string
          supplier: string | null
        }
        Insert: {
          business_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          created_by_name: string
          id?: string
          note?: string | null
          received_on: string
          supplier?: string | null
        }
        Update: {
          business_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          note?: string | null
          received_on?: string
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'restocks_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      stock_mode_changes: {
        Row: {
          after: Json
          before: Json
          business_id: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string
          id: string
          item_id: string
        }
        Insert: {
          after: Json
          before: Json
          business_id: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name: string
          id?: string
          item_id: string
        }
        Update: {
          after?: Json
          before?: Json
          business_id?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'stock_mode_changes_item_id_business_id_fkey'
            columns: ['item_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
      stock_movements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          created_by_name: string
          date_key: string
          delta: number
          id: string
          item_id: string | null
          item_name: string
          note: string | null
          order_id: string | null
          quantity_after: number
          quantity_before: number
          reason: string | null
          restock_id: string | null
          source_item_id: string | null
          source_item_name: string | null
          supplier: string | null
          supply_id: string | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          created_by_name: string
          date_key: string
          delta: number
          id?: string
          item_id?: string | null
          item_name: string
          note?: string | null
          order_id?: string | null
          quantity_after: number
          quantity_before: number
          reason?: string | null
          restock_id?: string | null
          source_item_id?: string | null
          source_item_name?: string | null
          supplier?: string | null
          supply_id?: string | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          date_key?: string
          delta?: number
          id?: string
          item_id?: string | null
          item_name?: string
          note?: string | null
          order_id?: string | null
          quantity_after?: number
          quantity_before?: number
          reason?: string | null
          restock_id?: string | null
          source_item_id?: string | null
          source_item_name?: string | null
          supplier?: string | null
          supply_id?: string | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'stock_movements_item_id_business_id_fkey'
            columns: ['item_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id', 'business_id']
          },
          {
            foreignKeyName: 'stock_movements_order_fk'
            columns: ['order_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id', 'business_id']
          },
          {
            foreignKeyName: 'stock_movements_restock_id_business_id_fkey'
            columns: ['restock_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'restocks'
            referencedColumns: ['id', 'business_id']
          },
          {
            foreignKeyName: 'stock_movements_supply_fk'
            columns: ['supply_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'supplies'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
      supplies: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          id: string
          low_stock_level: number
          name: string
          name_lower: string | null
          quantity: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          id?: string
          low_stock_level?: number
          name: string
          name_lower?: string | null
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          id?: string
          low_stock_level?: number
          name?: string
          name_lower?: string | null
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'supplies_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      supply_costs: {
        Row: {
          business_id: string
          cost_price: number
          supply_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_price: number
          supply_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_price?: number
          supply_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'supply_costs_supply_id_business_id_fkey'
            columns: ['supply_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'supplies'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_counted_quantity: number
          p_expected_quantity: number
          p_item_id: string
          p_note: string
          p_reason: string
          p_supply_id: string
        }
        Returns: number
      }
      admin_extend_access: {
        Args: { p_actor_id: string; p_business_id: string; p_days: number }
        Returns: string
      }
      admin_generate_activation_code: {
        Args: {
          p_access_days?: number
          p_actor_id: string
          p_expires_in_days?: number
          p_note?: string
          p_owner_email: string
        }
        Returns: {
          access_days: number
          code: string
          expires_at: string
          id: string
          owner_email: string
        }[]
      }
      admin_get_business: { Args: { p_business_id: string }; Returns: Json }
      admin_list_activation_codes: {
        Args: never
        Returns: {
          access_days: number
          created_at: string
          expires_at: string
          id: string
          note: string
          owner_email: string
          status: string
          used_at: string
          used_by_business_name: string
        }[]
      }
      admin_list_businesses: {
        Args: never
        Returns: {
          access_ends_at: string
          access_filter: string
          business_code: string
          created_at: string
          id: string
          last_activity_at: string
          name: string
          owner_email: string
          owner_name: string
          staff_count: number
          status: string
          suspended_at: string
          suspended_reason: string
        }[]
      }
      admin_owner_email: {
        Args: { p_actor_id: string; p_business_id: string }
        Returns: string
      }
      admin_platform_counts: { Args: never; Returns: Json }
      admin_revoke_activation_code: {
        Args: { p_actor_id: string; p_code_id: string }
        Returns: undefined
      }
      admin_set_business_status: {
        Args: {
          p_actor_id: string
          p_business_id: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      archive_item: { Args: { p_item_id: string }; Returns: undefined }
      archive_supply: { Args: { p_supply_id: string }; Returns: undefined }
      business_code_available: { Args: { p_code: string }; Returns: boolean }
      create_order: {
        Args: {
          p_client_order_id: string
          p_customer_name: string
          p_customer_phone: string
          p_held_order_id?: string
          p_lines: Json
          p_note: string
          p_payment_confirmed: boolean
          p_payment_method: string
          p_payment_reference: string
        }
        Returns: string
      }
      create_staff_profile: {
        Args: {
          p_display_name: string
          p_owner_id: string
          p_staff_user_id: string
          p_username: string
        }
        Returns: string
      }
      discard_held_order: {
        Args: { p_held_order_id: string }
        Returns: undefined
      }
      get_actor: { Args: { p_user_id: string }; Returns: Json }
      get_session_state: { Args: { p_record_login?: boolean }; Returns: Json }
      owner_dashboard: { Args: never; Returns: Json }
      owner_precheck: { Args: { p_owner_id: string }; Returns: string }
      rate_limit_hit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      record_restock: {
        Args: {
          p_client_id: string
          p_lines: Json
          p_note: string
          p_received_on: string
          p_supplier: string
        }
        Returns: string
      }
      register_business: {
        Args: {
          p_activation_code: string
          p_business_code: string
          p_business_id: string
          p_business_name: string
          p_owner_email: string
          p_owner_id: string
          p_owner_name: string
          p_phone: string
          p_timezone: string
        }
        Returns: string
      }
      restore_item: { Args: { p_item_id: string }; Returns: undefined }
      restore_supply: { Args: { p_supply_id: string }; Returns: undefined }
      sales_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      save_held_order: {
        Args: {
          p_customer_name: string
          p_customer_phone: string
          p_held_order_id: string
          p_lines: Json
          p_note: string
        }
        Returns: string
      }
      set_business_logo: {
        Args: { p_logo_path: string; p_owner_id: string }
        Returns: string
      }
      set_staff_active: {
        Args: { p_active: boolean; p_staff_id: string }
        Returns: undefined
      }
      staff_precheck: {
        Args: { p_owner_id: string; p_username: string }
        Returns: Json
      }
      staff_reset_precheck: {
        Args: { p_owner_id: string; p_staff_id: string }
        Returns: undefined
      }
      update_business_settings: {
        Args: {
          p_address: string
          p_currency_code: string
          p_default_low_stock_level: number
          p_name: string
          p_phone: string
          p_receipt_footer: string
          p_timezone: string
        }
        Returns: undefined
      }
      upsert_item: {
        Args: {
          p_category: string
          p_cost_price: number
          p_item_id: string
          p_low_stock_level: number
          p_name: string
          p_opening_quantity?: number
          p_price: number
          p_supplies?: Json
          p_tracks_own_stock?: boolean
          p_unit: string
        }
        Returns: string
      }
      upsert_supply: {
        Args: {
          p_cost_price: number
          p_low_stock_level: number
          p_name: string
          p_opening_quantity?: number
          p_supply_id: string
          p_unit: string
        }
        Returns: string
      }
      validate_activation_code: {
        Args: { p_code: string; p_email: string }
        Returns: string
      }
      void_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
