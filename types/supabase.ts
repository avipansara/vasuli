export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          avatar: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          avatar?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          avatar?: string | null
          created_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string
          description: string | null
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          user_id: string
          role: string
          joined_at: string
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          role?: string
          joined_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          role?: string
          joined_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          group_id: string | null
          description: string
          amount: number
          currency: string
          paid_by: string
          category: string | null
          date: string
          image_url: string | null
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          deleted_by: string | null
        }
        Insert: {
          id?: string
          group_id?: string | null
          description: string
          amount: number
          currency?: string
          paid_by: string
          category?: string | null
          date: string
          image_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Update: {
          id?: string
          group_id?: string | null
          description?: string
          amount?: number
          currency?: string
          paid_by?: string
          category?: string | null
          date?: string
          image_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Relationships: []
      }
      expense_splits: {
        Row: {
          id: string
          expense_id: string
          user_id: string
          amount: number
          split_type: string
          percentage: number | null
        }
        Insert: {
          id?: string
          expense_id: string
          user_id: string
          amount: number
          split_type?: string
          percentage?: number | null
        }
        Update: {
          id?: string
          expense_id?: string
          user_id?: string
          amount?: number
          split_type?: string
          percentage?: number | null
        }
        Relationships: []
      }
      settlements: {
        Row: {
          id: string
          group_id: string
          operation_id: string | null
          from_user_id: string
          to_user_id: string
          amount: number
          currency: string
          date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          operation_id?: string | null
          from_user_id: string
          to_user_id: string
          amount: number
          currency?: string
          date: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          operation_id?: string | null
          from_user_id?: string
          to_user_id?: string
          amount?: number
          currency?: string
          date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      settlement_operations: {
        Row: {
          id: string
          actor_user_id: string
          friend_user_id: string
          group_id: string | null
          mode: string
          currency: string
          expected_balance: number
          requested_payment_amount: number
          payment_intent_id: string
          status: string
          created_at: string
          reversed_at: string | null
        }
        Insert: {
          id?: string
          actor_user_id: string
          friend_user_id: string
          group_id?: string | null
          mode: string
          currency: string
          expected_balance: number
          requested_payment_amount: number
          payment_intent_id: string
          status?: string
          created_at?: string
          reversed_at?: string | null
        }
        Update: {
          id?: string
          actor_user_id?: string
          friend_user_id?: string
          group_id?: string | null
          mode?: string
          currency?: string
          expected_balance?: number
          requested_payment_amount?: number
          payment_intent_id?: string
          status?: string
          created_at?: string
          reversed_at?: string | null
        }
        Relationships: []
      }
      settlement_scope_transfers: {
        Row: {
          id: string
          operation_id: string
          group_id: string
          from_user_id: string
          to_user_id: string
          currency: string
          signed_group_balance_delta: number
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          operation_id: string
          group_id: string
          from_user_id: string
          to_user_id: string
          currency: string
          signed_group_balance_delta: number
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          operation_id?: string
          group_id?: string
          from_user_id?: string
          to_user_id?: string
          currency?: string
          signed_group_balance_delta?: number
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_combined_settlement: {
        Args: {
          p_payment_intent_id: string
          p_friend_id: string
          p_amount: number
          p_currency: string
          p_date: string
          p_expected_balance: number
          p_allocations: Json
        }
        Returns: Json
      }
      commit_settlement_operation: {
        Args: {
          p_payment_intent_id: string
          p_friend_id: string
          p_group_id: string | null
          p_mode: string
          p_amount: number
          p_currency: string
          p_date: string
          p_expected_balance: number
          p_allocations: Json
          p_transfers: Json
        }
        Returns: Json
      }
      get_friend_scope_transfers: {
        Args: {
          p_friend_id: string
        }
        Returns: {
          id: string
          operation_id: string
          group_id: string
          from_user_id: string
          to_user_id: string
          currency: string
          signed_group_balance_delta: number
          note: string | null
          created_at: string
        }[]
      }
      get_group_scope_transfers: {
        Args: {
          p_group_id: string
        }
        Returns: {
          id: string
          operation_id: string
          group_id: string
          from_user_id: string
          to_user_id: string
          currency: string
          signed_group_balance_delta: number
          note: string | null
          created_at: string
        }[]
      }
      commit_zero_net_settlement_operation: {
        Args: {
          p_payment_intent_id: string
          p_friend_id: string
          p_currency: string
          p_date: string
          p_expected_balance: number
          p_transfers: Json
        }
        Returns: Json
      }
      soft_delete_expense: {
        Args: {
          p_expense_id: string
          p_user_name: string
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
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
