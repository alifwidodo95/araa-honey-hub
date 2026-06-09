export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      dandang_balance: {
        Row: {
          avg_cost_per_kg: number
          honey_type: string
          id: number
          kg_remaining: number
          updated_at: string
        }
        Insert: {
          avg_cost_per_kg?: number
          honey_type: string
          id?: number
          kg_remaining?: number
          updated_at?: string
        }
        Update: {
          avg_cost_per_kg?: number
          honey_type?: string
          id?: number
          kg_remaining?: number
          updated_at?: string
        }
        Relationships: []
      }
      dandang_transfers: {
        Row: {
          cost_per_kg: number
          created_at: string
          created_by: string | null
          id: string
          jerigen_opened: number
          kg_added: number
          lot_id: string
        }
        Insert: {
          cost_per_kg: number
          created_at?: string
          created_by?: string | null
          id?: string
          jerigen_opened: number
          kg_added: number
          lot_id: string
        }
        Update: {
          cost_per_kg?: number
          created_at?: string
          created_by?: string | null
          id?: string
          jerigen_opened?: number
          kg_added?: number
          lot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dandang_transfers_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "raw_material_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses_business: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category_biz"]
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          occurred_on: string
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["expense_category_biz"]
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          occurred_on?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category_biz"]
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          occurred_on?: string
        }
        Relationships: []
      }
      expenses_personal: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          note: string | null
          occurred_on: string
          owner_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string
          owner_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string
          owner_id?: string | null
        }
        Relationships: []
      }
      lumpsum_postings: {
        Row: {
          amount: number
          id: string
          period_month: string
          posted_at: string
          rule_id: string
        }
        Insert: {
          amount: number
          id?: string
          period_month: string
          posted_at?: string
          rule_id: string
        }
        Update: {
          amount?: number
          id?: string
          period_month?: string
          posted_at?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lumpsum_postings_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "lumpsum_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      lumpsum_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          monthly_amount: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          monthly_amount: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          monthly_amount?: number
        }
        Relationships: []
      }
      marketplace_fees: {
        Row: {
          channel: Database["public"]["Enums"]["sales_channel"]
          fee_percent: number
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["sales_channel"]
          fee_percent?: number
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["sales_channel"]
          fee_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cogs_line: number
          honey_kg_used: number
          honey_type: string | null
          id: string
          line_total: number
          order_id: string
          qty: number
          size_id: string
          unit_price: number
        }
        Insert: {
          cogs_line?: number
          honey_kg_used: number
          honey_type?: string | null
          id?: string
          line_total: number
          order_id: string
          qty: number
          size_id: string
          unit_price: number
        }
        Update: {
          cogs_line?: number
          honey_kg_used?: number
          honey_type?: string | null
          id?: string
          line_total?: number
          order_id?: string
          qty?: number
          size_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_received: number | null
          channel: Database["public"]["Enums"]["sales_channel"]
          cogs_total: number
          created_at: string
          created_by: string | null
          customer_name: string | null
          customer_note: string | null
          customer_phone: string | null
          honey_kg_used: number
          id: string
          marketplace_fee: number
          net_revenue: number
          reseller_tier_id: string | null
          resi_shared_via_wa: boolean | null
          shipping_fee: number
          subtotal_gross: number
          tracking_number: string | null
          wa_share_error: string | null
        }
        Insert: {
          amount_received?: number | null
          channel: Database["public"]["Enums"]["sales_channel"]
          cogs_total?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          honey_kg_used?: number
          id?: string
          marketplace_fee?: number
          net_revenue?: number
          reseller_tier_id?: string | null
          resi_shared_via_wa?: boolean | null
          shipping_fee?: number
          subtotal_gross?: number
          tracking_number?: string | null
          wa_share_error?: string | null
        }
        Update: {
          amount_received?: number | null
          channel?: Database["public"]["Enums"]["sales_channel"]
          cogs_total?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          honey_kg_used?: number
          id?: string
          marketplace_fee?: number
          net_revenue?: number
          reseller_tier_id?: string | null
          resi_shared_via_wa?: boolean | null
          shipping_fee?: number
          subtotal_gross?: number
          tracking_number?: string | null
          wa_share_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_reseller_tier_id_fkey"
            columns: ["reseller_tier_id"]
            isOneToOne: false
            referencedRelation: "reseller_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_2fa: {
        Row: {
          enabled: boolean
          last_verified_at: string | null
          otp_expires_at: string | null
          otp_hash: string | null
          user_id: string
        }
        Insert: {
          enabled?: boolean
          last_verified_at?: string | null
          otp_expires_at?: string | null
          otp_hash?: string | null
          user_id: string
        }
        Update: {
          enabled?: boolean
          last_verified_at?: string | null
          otp_expires_at?: string | null
          otp_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      packaging_items: {
        Row: {
          active: boolean
          avg_cost: number
          created_at: string
          current_stock: number
          id: string
          name: string
          size_id: string | null
          type: Database["public"]["Enums"]["packaging_type"]
          unit: string
        }
        Insert: {
          active?: boolean
          avg_cost?: number
          created_at?: string
          current_stock?: number
          id?: string
          name: string
          size_id?: string | null
          type: Database["public"]["Enums"]["packaging_type"]
          unit?: string
        }
        Update: {
          active?: boolean
          avg_cost?: number
          created_at?: string
          current_stock?: number
          id?: string
          name?: string
          size_id?: string | null
          type?: Database["public"]["Enums"]["packaging_type"]
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_items_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          purchased_at: string
          qty: number
          total_price: number
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          purchased_at?: string
          qty: number
          total_price: number
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          purchased_at?: string
          qty?: number
          total_price?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packaging_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "packaging_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          active: boolean
          id: string
          name: string
          sort_order: number
          weight_grams: number
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          sort_order?: number
          weight_grams: number
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          sort_order?: number
          weight_grams?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_material_lots: {
        Row: {
          created_at: string
          created_by: string | null
          grams_per_jerigen: number | null
          honey_type: string | null
          id: string
          jerigen_qty: number
          jerigen_remaining: number
          kg_per_jerigen: number
          notes: string | null
          price_total: number
          received_at: string
          supplier: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grams_per_jerigen?: number | null
          honey_type?: string | null
          id?: string
          jerigen_qty: number
          jerigen_remaining: number
          kg_per_jerigen?: number
          notes?: string | null
          price_total: number
          received_at?: string
          supplier?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grams_per_jerigen?: number | null
          honey_type?: string | null
          id?: string
          jerigen_qty?: number
          jerigen_remaining?: number
          kg_per_jerigen?: number
          notes?: string | null
          price_total?: number
          received_at?: string
          supplier?: string | null
        }
        Relationships: []
      }
      reseller_prices: {
        Row: {
          price: number
          size_id: string
          tier_id: string
        }
        Insert: {
          price?: number
          size_id: string
          tier_id: string
        }
        Update: {
          price?: number
          size_id?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_prices_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "reseller_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_tiers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      retail_prices: {
        Row: {
          price: number
          size_id: string
          updated_at: string
        }
        Insert: {
          price?: number
          size_id: string
          updated_at?: string
        }
        Update: {
          price?: number
          size_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retail_prices_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: true
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_order:
        | {
            Args: {
              _channel: Database["public"]["Enums"]["sales_channel"]
              _customer_note: string
              _items: Json
              _shipping_fee: number
              _tier_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _amount_received?: number
              _channel: Database["public"]["Enums"]["sales_channel"]
              _customer_name?: string
              _customer_note: string
              _customer_phone?: string
              _items: Json
              _shipping_fee: number
              _tier_id: string
              _tracking_number?: string
            }
            Returns: string
          }
      current_role_label: { Args: never; Returns: string }
      delete_dandang_transfer: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      open_jerigen: {
        Args: { _jerigen: number; _lot_id: string }
        Returns: undefined
      }
      record_packaging_purchase: {
        Args: {
          _date: string
          _item_id: string
          _note: string
          _qty: number
          _total: number
        }
        Returns: string
      }
      run_monthly_lumpsum: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "owner" | "staff"
      expense_category_biz:
        | "meta_ads"
        | "gaji"
        | "lumpsum"
        | "packaging_purchase"
        | "other"
      packaging_type:
        | "botol"
        | "stiker"
        | "segel"
        | "bubblewrap"
        | "lakban"
        | "kardus"
      sales_channel: "shopee" | "tiktok" | "whatsapp" | "reseller" | "offline"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff"],
      expense_category_biz: [
        "meta_ads",
        "gaji",
        "lumpsum",
        "packaging_purchase",
        "other",
      ],
      packaging_type: [
        "botol",
        "stiker",
        "segel",
        "bubblewrap",
        "lakban",
        "kardus",
      ],
      sales_channel: ["shopee", "tiktok", "whatsapp", "reseller", "offline"],
    },
  },
} as const
