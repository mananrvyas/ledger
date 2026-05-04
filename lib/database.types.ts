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
      accounts: {
        Row: {
          available_balance: number | null
          created_at: string
          credit_limit: number | null
          currency: string
          current_balance: number | null
          id: string
          is_archived: boolean
          mask: string | null
          name: string
          official_name: string | null
          plaid_account_id: string
          plaid_item_id: string
          raw: Json | null
          subtype: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          current_balance?: number | null
          id?: string
          is_archived?: boolean
          mask?: string | null
          name: string
          official_name?: string | null
          plaid_account_id: string
          plaid_item_id: string
          raw?: Json | null
          subtype?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          current_balance?: number | null
          id?: string
          is_archived?: boolean
          mask?: string | null
          name?: string
          official_name?: string | null
          plaid_account_id?: string
          plaid_item_id?: string
          raw?: Json | null
          subtype?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_plaid_item_id_fkey"
            columns: ["plaid_item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      app_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rules: {
        Row: {
          category_name: string
          confidence: number
          created_at: string
          id: string
          last_applied_at: string | null
          merchant_pattern: string
          source: string
          times_applied: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_name: string
          confidence?: number
          created_at?: string
          id?: string
          last_applied_at?: string | null
          merchant_pattern: string
          source?: string
          times_applied?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_name?: string
          confidence?: number
          created_at?: string
          id?: string
          last_applied_at?: string | null
          merchant_pattern?: string
          source?: string
          times_applied?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plaid_items: {
        Row: {
          access_token_enc: string | null
          created_at: string
          cursor: string | null
          error_code: string | null
          error_message: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          last_synced_at: string | null
          last_webhook_at: string | null
          plaid_item_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          created_at?: string
          cursor?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          last_webhook_at?: string | null
          plaid_item_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          created_at?: string
          cursor?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          last_webhook_at?: string | null
          plaid_item_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plaid_webhooks: {
        Row: {
          error: string | null
          id: string
          item_uuid: string | null
          payload: Json
          plaid_item_id: string | null
          processed: boolean
          processed_at: string | null
          received_at: string
          user_id: string | null
          webhook_code: string
          webhook_type: string
        }
        Insert: {
          error?: string | null
          id?: string
          item_uuid?: string | null
          payload: Json
          plaid_item_id?: string | null
          processed?: boolean
          processed_at?: string | null
          received_at?: string
          user_id?: string | null
          webhook_code: string
          webhook_type: string
        }
        Update: {
          error?: string | null
          id?: string
          item_uuid?: string | null
          payload?: Json
          plaid_item_id?: string | null
          processed?: boolean
          processed_at?: string | null
          received_at?: string
          user_id?: string | null
          webhook_code?: string
          webhook_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_webhooks_item_uuid_fkey"
            columns: ["item_uuid"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_attachments: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          source: string
          storage_path: string
          transaction_id: string
          twilio_media_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source?: string
          storage_path: string
          transaction_id: string
          twilio_media_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source?: string
          storage_path?: string
          transaction_id?: string
          twilio_media_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          ai_category: string | null
          ai_confidence: number | null
          ai_reasoning: string | null
          amount: number
          authorized_date: string | null
          category_source: string | null
          created_at: string
          currency: string
          date: string
          deleted_at: string | null
          effective_amount: number | null
          excluded_from_stats: boolean
          id: string
          is_pending: boolean
          is_refund: boolean
          is_transfer: boolean
          last_notified_at: string | null
          last_user_edit_at: string | null
          merchant_logo_url: string | null
          merchant_name: string | null
          name: string | null
          notes: string | null
          notified_amount: number | null
          plaid_category: string | null
          plaid_category_detail: string | null
          plaid_confidence: string | null
          plaid_transaction_id: string | null
          raw: Json | null
          refund_pair_id: string | null
          split_note: string | null
          split_raw_input: string | null
          split_type: string
          split_value: number | null
          transfer_pair_id: string | null
          updated_at: string
          user_category: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          ai_category?: string | null
          ai_confidence?: number | null
          ai_reasoning?: string | null
          amount: number
          authorized_date?: string | null
          category_source?: string | null
          created_at?: string
          currency?: string
          date: string
          deleted_at?: string | null
          effective_amount?: number | null
          excluded_from_stats?: boolean
          id?: string
          is_pending?: boolean
          is_refund?: boolean
          is_transfer?: boolean
          last_notified_at?: string | null
          last_user_edit_at?: string | null
          merchant_logo_url?: string | null
          merchant_name?: string | null
          name?: string | null
          notes?: string | null
          notified_amount?: number | null
          plaid_category?: string | null
          plaid_category_detail?: string | null
          plaid_confidence?: string | null
          plaid_transaction_id?: string | null
          raw?: Json | null
          refund_pair_id?: string | null
          split_note?: string | null
          split_raw_input?: string | null
          split_type?: string
          split_value?: number | null
          transfer_pair_id?: string | null
          updated_at?: string
          user_category?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          ai_category?: string | null
          ai_confidence?: number | null
          ai_reasoning?: string | null
          amount?: number
          authorized_date?: string | null
          category_source?: string | null
          created_at?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          effective_amount?: number | null
          excluded_from_stats?: boolean
          id?: string
          is_pending?: boolean
          is_refund?: boolean
          is_transfer?: boolean
          last_notified_at?: string | null
          last_user_edit_at?: string | null
          merchant_logo_url?: string | null
          merchant_name?: string | null
          name?: string | null
          notes?: string | null
          notified_amount?: number | null
          plaid_category?: string | null
          plaid_category_detail?: string | null
          plaid_confidence?: string | null
          plaid_transaction_id?: string | null
          raw?: Json | null
          refund_pair_id?: string | null
          split_note?: string | null
          split_raw_input?: string | null
          split_type?: string
          split_value?: number | null
          transfer_pair_id?: string | null
          updated_at?: string
          user_category?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_refund_pair_id_fkey"
            columns: ["refund_pair_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_pair_id_fkey"
            columns: ["transfer_pair_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          error: string | null
          id: string
          in_reply_to_sid: string | null
          in_reply_to_wamid: string | null
          intent: string | null
          parsed_payload: Json | null
          provider_message_id: string | null
          raw: Json | null
          related_transaction_id: string | null
          status: string
          template_name: string | null
          twilio_message_sid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          in_reply_to_sid?: string | null
          in_reply_to_wamid?: string | null
          intent?: string | null
          parsed_payload?: Json | null
          provider_message_id?: string | null
          raw?: Json | null
          related_transaction_id?: string | null
          status?: string
          template_name?: string | null
          twilio_message_sid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          in_reply_to_sid?: string | null
          in_reply_to_wamid?: string | null
          intent?: string | null
          parsed_payload?: Json | null
          provider_message_id?: string | null
          raw?: Json | null
          related_transaction_id?: string | null
          status?: string
          template_name?: string | null
          twilio_message_sid?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_plaid_access_token: {
        Args: { p_item_id: string; p_passphrase: string }
        Returns: string
      }
      store_plaid_item: {
        Args: {
          p_access_token: string
          p_institution_id: string
          p_institution_name: string
          p_item_id: string
          p_passphrase: string
          p_user_id: string
        }
        Returns: {
          access_token_enc: string | null
          created_at: string
          cursor: string | null
          error_code: string | null
          error_message: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          last_synced_at: string | null
          last_webhook_at: string | null
          plaid_item_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "plaid_items"
          isOneToOne: true
          isSetofReturn: false
        }
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
    Enums: {},
  },
} as const
