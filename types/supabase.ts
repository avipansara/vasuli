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
    PostgrestVersion: "14.1"
  }
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
          recurring_occurrence_id: string | null
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
          recurring_occurrence_id?: string | null
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
          recurring_occurrence_id?: string | null
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
            foreignKeyName: "activities_recurring_occurrence_id_fkey"
            columns: ["recurring_occurrence_id"]
            isOneToOne: true
            referencedRelation: "expenses"
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
      analytics_deletion_retries: {
        Row: {
          attempt_count: number
          created_at: string
          distinct_id: string
          last_attempt_at: string
          last_error: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          distinct_id: string
          last_attempt_at?: string
          last_error?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          distinct_id?: string
          last_attempt_at?: string
          last_error?: string | null
        }
        Relationships: []
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
          created_at: string | null
          created_by: string
          currency: string
          date: string
          deleted_at: string | null
          deleted_by: string | null
          description: string
          effective_date: string | null
          group_id: string | null
          id: string
          image_url: string | null
          notes: string | null
          paid_by: string
          recurring_rule_id: string | null
          scheduled_for: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          created_by: string
          currency?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          effective_date?: string | null
          group_id?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          paid_by: string
          recurring_rule_id?: string | null
          scheduled_for?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          created_by?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          effective_date?: string | null
          group_id?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          paid_by?: string
          recurring_rule_id?: string | null
          scheduled_for?: string | null
          updated_at?: string | null
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
          {
            foreignKeyName: "expenses_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rule_shares"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "expenses_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_submissions: {
        Row: {
          app_version: string
          category: string
          created_at: string
          id: string
          message: string
          notified_at: string | null
          platform: string
          reply_email: string | null
          screenshot_base64: string | null
          screenshot_type: string | null
        }
        Insert: {
          app_version: string
          category: string
          created_at?: string
          id: string
          message: string
          notified_at?: string | null
          platform: string
          reply_email?: string | null
          screenshot_base64?: string | null
          screenshot_type?: string | null
        }
        Update: {
          app_version?: string
          category?: string
          created_at?: string
          id?: string
          message?: string
          notified_at?: string | null
          platform?: string
          reply_email?: string | null
          screenshot_base64?: string | null
          screenshot_type?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string | null
          friend_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          friend_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
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
          joined_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
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
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          updated_at?: string | null
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
          created_at: string | null
          expires_at: string | null
          id: string
          invitee_email: string
          invitee_name: string | null
          invitee_phone: string | null
          inviter_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invitee_email: string
          invitee_name?: string | null
          invitee_phone?: string | null
          inviter_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
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
      push_notification_events: {
        Row: {
          created_at: string
          event_type: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          subject_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          subject_id?: string
        }
        Relationships: []
      }
      push_notification_outbox: {
        Row: {
          actor_id: string
          attempts: number
          claimed_until: string | null
          created_at: string
          delivered_at: string | null
          event_type: string
          group_id: string | null
          id: string
          last_error: string | null
          recipient_id: string
          status: string
          subject_id: string
        }
        Insert: {
          actor_id: string
          attempts?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          event_type: string
          group_id?: string | null
          id?: string
          last_error?: string | null
          recipient_id: string
          status?: string
          subject_id: string
        }
        Update: {
          actor_id?: string
          attempts?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          group_id?: string | null
          id?: string
          last_error?: string | null
          recipient_id?: string
          status?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_outbox_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_outbox_event_type_subject_id_fkey"
            columns: ["event_type", "subject_id"]
            isOneToOne: false
            referencedRelation: "push_notification_events"
            referencedColumns: ["event_type", "subject_id"]
          },
          {
            foreignKeyName: "push_notification_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_receipt_checks: {
        Row: {
          checked_at: string | null
          claimed_until: string | null
          created_at: string
          error_code: string | null
          notification_type: string
          outcome: string | null
          receipt_id: string
          token_snapshot: string
          user_id: string
        }
        Insert: {
          checked_at?: string | null
          claimed_until?: string | null
          created_at?: string
          error_code?: string | null
          notification_type: string
          outcome?: string | null
          receipt_id: string
          token_snapshot: string
          user_id: string
        }
        Update: {
          checked_at?: string | null
          claimed_until?: string | null
          created_at?: string
          error_code?: string | null
          notification_type?: string
          outcome?: string | null
          receipt_id?: string
          token_snapshot?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_receipt_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_activity_outbox: {
        Row: {
          attempt_count: number
          claimed_until: string | null
          created_at: string
          delivered_at: string | null
          expense_id: string
          id: string
          last_error: string | null
          rule_id: string
          scheduled_for: string
        }
        Insert: {
          attempt_count?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          expense_id: string
          id?: string
          last_error?: string | null
          rule_id: string
          scheduled_for: string
        }
        Update: {
          attempt_count?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          expense_id?: string
          id?: string
          last_error?: string | null
          rule_id?: string
          scheduled_for?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_activity_outbox_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: true
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_activity_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rule_shares"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "recurring_expense_activity_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_occurrence_outbox: {
        Row: {
          attempt_count: number
          claimed_until: string | null
          created_at: string
          delivered_at: string | null
          delivery_status: string
          event_type: string
          expense_id: string
          id: string
          last_error: string | null
          payload: Json
          recipient_id: string
          rule_id: string
          scheduled_for: string
        }
        Insert: {
          attempt_count?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          event_type?: string
          expense_id: string
          id?: string
          last_error?: string | null
          payload: Json
          recipient_id: string
          rule_id: string
          scheduled_for: string
        }
        Update: {
          attempt_count?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          event_type?: string
          expense_id?: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient_id?: string
          rule_id?: string
          scheduled_for?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_occurrence_outbox_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_occurrence_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_occurrence_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rule_shares"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "recurring_expense_occurrence_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_rule_notification_outbox: {
        Row: {
          attempt_count: number
          claimed_until: string | null
          created_at: string
          delivered_at: string | null
          delivery_status: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          recipient_id: string
          rule_id: string
          rule_revision: number
        }
        Insert: {
          attempt_count?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload: Json
          recipient_id: string
          rule_id: string
          rule_revision: number
        }
        Update: {
          attempt_count?: number
          claimed_until?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient_id?: string
          rule_id?: string
          rule_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_rule_notification_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rule_notification_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rule_shares"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "recurring_expense_rule_notification_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_rule_participants: {
        Row: {
          created_at: string
          id: string
          percentage: number | null
          rule_id: string
          share_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          percentage?: number | null
          rule_id: string
          share_amount: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          percentage?: number | null
          rule_id?: string
          share_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_rule_participants_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rule_shares"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "recurring_expense_rule_participants_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rule_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_rules: {
        Row: {
          amount: number
          anchor_day: number
          cadence: string
          command_revision: number
          created_at: string
          currency: string
          description: string
          first_due_on: string
          group_id: string | null
          id: string
          last_due_on: string | null
          last_error: string | null
          last_error_at: string | null
          next_due_on: string | null
          owner_id: string | null
          paid_by: string | null
          paused_reason: string | null
          scope_type: string
          split_method: string
          split_type: string
          status: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          amount: number
          anchor_day: number
          cadence: string
          command_revision?: number
          created_at?: string
          currency: string
          description: string
          first_due_on: string
          group_id?: string | null
          id?: string
          last_due_on?: string | null
          last_error?: string | null
          last_error_at?: string | null
          next_due_on?: string | null
          owner_id?: string | null
          paid_by?: string | null
          paused_reason?: string | null
          scope_type: string
          split_method: string
          split_type: string
          status?: string
          time_zone: string
          updated_at?: string
        }
        Update: {
          amount?: number
          anchor_day?: number
          cadence?: string
          command_revision?: number
          created_at?: string
          currency?: string
          description?: string
          first_due_on?: string
          group_id?: string | null
          id?: string
          last_due_on?: string | null
          last_error?: string | null
          last_error_at?: string | null
          next_due_on?: string | null
          owner_id?: string | null
          paid_by?: string | null
          paused_reason?: string | null
          scope_type?: string
          split_method?: string
          split_type?: string
          status?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_paid_by_fkey"
            columns: ["paid_by"]
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
          created_at: string | null
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
          created_at?: string | null
          currency?: string
          date?: string
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
          created_at?: string | null
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
          created_at: string | null
          email: string | null
          email_verified: boolean | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          phone_verified: boolean | null
          push_token: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar?: string | null
          created_at?: string | null
          email?: string | null
          email_verified?: boolean | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          phone_verified?: boolean | null
          push_token?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar?: string | null
          created_at?: string | null
          email?: string | null
          email_verified?: boolean | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          phone_verified?: boolean | null
          push_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          attempts: number | null
          code: string
          created_at: string | null
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
          created_at?: string | null
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
          created_at?: string | null
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
      recurring_expense_rule_shares: {
        Row: {
          amount: number | null
          anchor_day: number | null
          cadence: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          first_due_on: string | null
          group_id: string | null
          last_due_on: string | null
          next_due_on: string | null
          paid_by: string | null
          paused_reason: string | null
          percentage: number | null
          rule_id: string | null
          scope_type: string | null
          share_amount: number | null
          split_method: string | null
          split_type: string | null
          status: string | null
          time_zone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_rule_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_due_recurring_expense_rules: {
        Args: { p_limit?: number }
        Returns: {
          expected_due_on: string
          rule_id: string
        }[]
      }
      claim_push_notifications: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          data: Json
          delivery_id: string
          event_type: string
          push_token: string
          title: string
        }[]
      }
      claim_push_receipts: {
        Args: { p_limit?: number }
        Returns: {
          receipt_id: string
          user_id: string
        }[]
      }
      claim_recurring_expense_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          amount: number
          attempt_count: number
          currency: string
          delivery_id: string
          description: string
          expense_id: string
          group_id: string
          group_name: string
          push_token: string
          recipient_id: string
          recipient_name: string
        }[]
      }
      claim_recurring_expense_rule_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          delivery_id: string
          event_type: string
          payload: Json
          push_token: string
          recipient_id: string
          rule_id: string
        }[]
      }
      cleanup_expired_codes: { Args: never; Returns: undefined }
      clear_unregistered_push_tokens: {
        Args: { p_tokens: string[] }
        Returns: undefined
      }
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
      consume_feedback_worker_wakeup: {
        Args: { p_wakeup_id: string }
        Returns: boolean
      }
      consume_push_wakeup: { Args: { p_wakeup_id: string }; Returns: string }
      consume_recurring_worker_wakeup: {
        Args: { p_wakeup_id: string }
        Returns: boolean
      }
      create_recurring_expense_rule: {
        Args: {
          p_confirm_duplicate?: boolean
          p_participants: Json
          p_rule: Json
        }
        Returns: Json
      }
      delete_account_data: {
        Args: { target_auth_user_id: string; target_email?: string }
        Returns: undefined
      }
      deliver_recurring_expense_activities: {
        Args: { p_limit?: number }
        Returns: number
      }
      edit_recurring_expense_rule: {
        Args: { p_participants: Json; p_rule: Json; p_rule_id: string }
        Returns: Json
      }
      finish_push_notification: {
        Args: {
          p_delivery_id: string
          p_error?: string
          p_receipt_id?: string
          p_status: string
          p_token?: string
        }
        Returns: undefined
      }
      finish_push_receipt: {
        Args: {
          p_error_code?: string
          p_outcome: string
          p_receipt_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      finish_recurring_expense_push_delivery: {
        Args: { p_delivery_id: string; p_error?: string; p_status: string }
        Returns: undefined
      }
      finish_recurring_expense_rule_notification: {
        Args: { p_delivery_id: string; p_error?: string; p_status: string }
        Returns: undefined
      }
      finish_recurring_push_with_receipt: {
        Args: {
          p_delivery_id: string
          p_error?: string
          p_kind: string
          p_receipt_id?: string
          p_status: string
          p_token?: string
        }
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
      get_recurring_expense_rule: { Args: { p_rule_id: string }; Returns: Json }
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
      list_recurring_expense_rules: { Args: never; Returns: Json }
      pause_recurring_expense_rule: {
        Args: { p_rule_id: string }
        Returns: Json
      }
      post_due_recurring_expenses: {
        Args: { p_expected_due_on: string; p_rule_id: string }
        Returns: Json
      }
      queued_expense_push_tokens: {
        Args: { p_expense_id: string; p_tokens: string[] }
        Returns: string[]
      }
      record_push_receipts: {
        Args: { p_tickets: Json; p_type: string }
        Returns: undefined
      }
      record_recurring_expense_worker_error: {
        Args: { p_error: string; p_expected_due_on: string; p_rule_id: string }
        Returns: undefined
      }
      reserve_feedback_submission: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      resume_recurring_expense_rule: {
        Args: { p_rule_id: string }
        Returns: Json
      }
      reverse_settlement_operation: {
        Args: { p_expected_balance: number; p_operation_id: string }
        Returns: Json
      }
      review_recurring_expense_date: {
        Args: { p_action: string; p_expected_due_on: string; p_rule_id: string }
        Returns: Json
      }
      soft_delete_expense: {
        Args: { p_expense_id: string; p_user_name: string }
        Returns: Json
      }
      stop_recurring_expense_rule: {
        Args: { p_rule_id: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
