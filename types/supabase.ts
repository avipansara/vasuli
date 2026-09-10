export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      activities: {
        Row: {
          amount: number | null
          created_at: string
          description: string
          group_id: string | null
          group_name: string | null
          id: string
          metadata: Json | null
          target_id: string
          type: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description: string
          group_id?: string | null
          group_name?: string | null
          id?: string
          metadata?: Json | null
          target_id: string
          type: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string
          group_id?: string | null
          group_name?: string | null
          id?: string
          metadata?: Json | null
          target_id?: string
          type?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_releases: {
        Row: {
          channel: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          minimum_supported_version: string
          notes: Json
          platform: string
          published_at: string
          store_url: string
          title: string
          version: string
        }
        Insert: {
          channel?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          minimum_supported_version: string
          notes?: Json
          platform: string
          published_at?: string
          store_url: string
          title: string
          version: string
        }
        Update: {
          channel?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          minimum_supported_version?: string
          notes?: Json
          platform?: string
          published_at?: string
          store_url?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      expense_splits: {
        Row: {
          amount: number
          expense_id: string
          id: string
          percentage: number | null
          split_type: string
          user_id: string
        }
        Insert: {
          amount: number
          expense_id: string
          id?: string
          percentage?: number | null
          split_type?: string
          user_id: string
        }
        Update: {
          amount?: number
          expense_id?: string
          id?: string
          percentage?: number | null
          split_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string
          currency: string
          date: string
          deleted_at: string | null
          deleted_by: string | null
          description: string
          group_id: string | null
          id: string
          image_url: string | null
          notes: string | null
          paid_by: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by: string
          currency?: string
          date: string
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          group_id?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          paid_by: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          group_id?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          paid_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invitee_email: string
          invitee_name: string | null
          invitee_phone: string | null
          inviter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invitee_email: string
          invitee_name?: string | null
          invitee_phone?: string | null
          inviter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invitee_email?: string
          invitee_name?: string | null
          invitee_phone?: string | null
          inviter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_cancellations: {
        Row: {
          amount: number
          created_at: string
          currency: string
          group_id: string
          id: string
          is_reversal: boolean
          note: string | null
          operation_id: string
          signed_group_balance_delta: number
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          group_id: string
          id?: string
          is_reversal?: boolean
          note?: string | null
          operation_id: string
          signed_group_balance_delta: number
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          group_id?: string
          id?: string
          is_reversal?: boolean
          note?: string | null
          operation_id?: string
          signed_group_balance_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlement_cancellations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_cancellations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "settlement_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_commitments: {
        Row: {
          actor_user_id: string
          amount: number
          created_at: string
          currency: string
          date: string
          friend_user_id: string
          id: string
          payment_intent_id: string
        }
        Insert: {
          actor_user_id: string
          amount: number
          created_at?: string
          currency: string
          date: string
          friend_user_id: string
          id?: string
          payment_intent_id: string
        }
        Update: {
          actor_user_id?: string
          amount?: number
          created_at?: string
          currency?: string
          date?: string
          friend_user_id?: string
          id?: string
          payment_intent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_commitments_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_commitments_friend_user_id_fkey"
            columns: ["friend_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_operation_reversals: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          operation_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          operation_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_operation_reversals_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_operation_reversals_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "settlement_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_operations: {
        Row: {
          actor_user_id: string
          created_at: string
          currency: string
          expected_balance: number
          friend_user_id: string
          group_id: string | null
          id: string
          mode: string
          payment_intent_id: string
          request_fingerprint: string | null
          requested_payment_amount: number
          reversed_at: string | null
          status: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          currency: string
          expected_balance: number
          friend_user_id: string
          group_id?: string | null
          id?: string
          mode: string
          payment_intent_id: string
          request_fingerprint?: string | null
          requested_payment_amount: number
          reversed_at?: string | null
          status?: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          currency?: string
          expected_balance?: number
          friend_user_id?: string
          group_id?: string | null
          id?: string
          mode?: string
          payment_intent_id?: string
          request_fingerprint?: string | null
          requested_payment_amount?: number
          reversed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_operations_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_operations_friend_user_id_fkey"
            columns: ["friend_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_operations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_scope_transfers: {
        Row: {
          created_at: string
          currency: string
          from_user_id: string
          group_id: string
          id: string
          is_reversal: boolean
          note: string | null
          operation_id: string
          signed_group_balance_delta: number
          to_user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          from_user_id: string
          group_id: string
          id?: string
          is_reversal?: boolean
          note?: string | null
          operation_id: string
          signed_group_balance_delta: number
          to_user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          from_user_id?: string
          group_id?: string
          id?: string
          is_reversal?: boolean
          note?: string | null
          operation_id?: string
          signed_group_balance_delta?: number
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_scope_transfers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_scope_transfers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_scope_transfers_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "settlement_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_scope_transfers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount: number
          backfilled_transfer_id: string | null
          commitment_id: string | null
          created_at: string
          currency: string
          date: string
          from_user_id: string
          group_id: string | null
          id: string
          notes: string | null
          operation_id: string | null
          to_user_id: string
        }
        Insert: {
          amount: number
          backfilled_transfer_id?: string | null
          commitment_id?: string | null
          created_at?: string
          currency?: string
          date: string
          from_user_id: string
          group_id?: string | null
          id?: string
          notes?: string | null
          operation_id?: string | null
          to_user_id: string
        }
        Update: {
          amount?: number
          backfilled_transfer_id?: string | null
          commitment_id?: string | null
          created_at?: string
          currency?: string
          date?: string
          from_user_id?: string
          group_id?: string | null
          id?: string
          notes?: string | null
          operation_id?: string | null
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_backfilled_transfer_id_fkey"
            columns: ["backfilled_transfer_id"]
            isOneToOne: false
            referencedRelation: "settlement_scope_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "settlement_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "settlement_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          avatar: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          push_token: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          push_token?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          push_token?: string | null
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          attempts: number | null
          code: string
          created_at: string
          email: string | null
          expires_at: string
          id: string
          phone: string | null
          type: string
          used_at: string | null
          user_id: string | null
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          code: string
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          phone?: string | null
          type: string
          used_at?: string | null
          user_id?: string | null
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          code?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          phone?: string | null
          type?: string
          used_at?: string | null
          user_id?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_settlement_operation: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_cancellations?: Json
          p_currency: string
          p_date: string
          p_expected_balance: number
          p_friend_id: string
          p_group_id: string
          p_mode: string
          p_payment_intent_id: string
          p_transfers?: Json
        }
        Returns: Json
      }
      commit_zero_net_settlement_operation: {
        Args: {
          p_currency: string
          p_date: string
          p_expected_balance: number
          p_friend_id: string
          p_payment_intent_id: string
          p_transfers: Json
        }
        Returns: Json
      }
      delete_account_data: {
        Args: { target_auth_user_id: string; target_email?: string }
        Returns: undefined
      }
      get_friend_cancellations: {
        Args: { p_friend_id: string }
        Returns: {
          actor_user_id: string
          amount: number
          created_at: string
          currency: string
          friend_user_id: string
          group_id: string
          id: string
          is_reversal: boolean
          note: string
          operation_id: string
          signed_group_balance_delta: number
        }[]
      }
      get_friend_detail_read_model: {
        Args: { p_friend_id: string }
        Returns: Json
      }
      get_friend_home_relationships: {
        Args: never
        Returns: {
          avatar: string
          balance: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          phone: string
          push_token: string
          recent_expenses: Json
          relationship: Json
        }[]
      }
      get_friend_home_relationships_legacy: {
        Args: never
        Returns: {
          avatar: string
          balance: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          phone: string
          push_token: string
          recent_expenses: Json
          relationship: Json
        }[]
      }
      get_friend_home_summaries: {
        Args: never
        Returns: {
          avatar: string
          balance: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          phone: string
          push_token: string
          recent_expenses: Json
        }[]
      }
      get_friend_scope_transfers: {
        Args: { p_friend_id: string }
        Returns: {
          created_at: string
          currency: string
          from_user_id: string
          group_id: string
          id: string
          is_reversal: boolean
          note: string
          operation_id: string
          signed_group_balance_delta: number
          to_user_id: string
        }[]
      }
      get_friend_settlement_operations: {
        Args: { p_friend_id: string }
        Returns: {
          actor_user_id: string
          cancellations: Json
          created_at: string
          currency: string
          friend_user_id: string
          operation_id: string
          original_date: string
          original_from_user_id: string
          original_to_user_id: string
          requested_payment_amount: number
          reversed_at: string
          status: string
        }[]
      }
      get_group_cancellations: {
        Args: { p_group_id: string }
        Returns: {
          actor_user_id: string
          amount: number
          created_at: string
          currency: string
          friend_user_id: string
          group_id: string
          id: string
          is_reversal: boolean
          note: string
          operation_id: string
          signed_group_balance_delta: number
        }[]
      }
      get_group_pair_totals: {
        Args: { p_group_id: string }
        Returns: {
          amount: number
          currency: string
          direct_amount: number
          from_user_id: string
          group_amount: number
          to_user_id: string
          user_a: string
          user_b: string
        }[]
      }
      get_group_scope_transfers: {
        Args: { p_group_id: string }
        Returns: {
          created_at: string
          currency: string
          from_user_id: string
          group_id: string
          id: string
          is_reversal: boolean
          note: string
          operation_id: string
          signed_group_balance_delta: number
          to_user_id: string
        }[]
      }
      get_group_settlement_operations: {
        Args: { p_group_id: string }
        Returns: {
          cancellations: Json
          created_at: string
          currency: string
          group_id: string
          local_date: string
          local_from_user_id: string
          local_payment_amount: number
          local_to_user_id: string
          operation_id: string
          reversed_at: string
          status: string
        }[]
      }
      get_groups_home_summaries: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          image_url: string
          name: string
          updated_at: string
          your_balance: number
        }[]
      }
      get_user_activities: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          amount: number
          created_at: string
          description: string
          group_id: string
          group_name: string
          id: string
          metadata: string
          target_id: string
          type: string
          user_id: string
          user_name: string
        }[]
      }
      reverse_settlement_operation: {
        Args: { p_expected_balance: number; p_operation_id: string }
        Returns: Json
      }
      soft_delete_expense: {
        Args: { p_expense_id: string; p_user_name: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
