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
          p_allocations: Json
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
