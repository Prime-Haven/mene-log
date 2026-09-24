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
      ask_mene_conversations: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ask_mene_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ask_mene_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          role: string
          tenant_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_mene_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ask_mene_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_mene_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          branch_id: string | null
          designation: string
          id: string
          member_id: string | null
          method: Database["public"]["Enums"]["attendance_method"]
          position_id: string | null
          recorded_at: string
          scanned_by_user_id: string | null
          service_id: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          designation?: string
          id?: string
          member_id?: string | null
          method?: Database["public"]["Enums"]["attendance_method"]
          position_id?: string | null
          recorded_at?: string
          scanned_by_user_id?: string | null
          service_id: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          designation?: string
          id?: string
          member_id?: string | null
          method?: Database["public"]["Enums"]["attendance_method"]
          position_id?: string | null
          recorded_at?: string
          scanned_by_user_id?: string | null
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          branch_id: string | null
          created_at: string
          detail: Json | null
          id: string
          source_ip: string | null
          target: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          source_ip?: string | null
          target?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          source_ip?: string | null
          target?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: Json
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          recipient_count: number
          subject: string | null
          tenant_id: string
        }
        Insert: {
          audience?: Json
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          subject?: string | null
          tenant_id: string
        }
        Update: {
          audience?: Json
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      church_reviews: {
        Row: {
          author_name: string
          author_role: string | null
          created_at: string
          id: string
          quote: string
          rating: number
          reviewed_at: string | null
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          author_name: string
          author_role?: string | null
          created_at?: string
          id?: string
          quote: string
          rating: number
          reviewed_at?: string | null
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          author_name?: string
          author_role?: string | null
          created_at?: string
          id?: string
          quote?: string
          rating?: number
          reviewed_at?: string | null
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string | null
          id: string
          inserted_count: number
          row_count: number
          skipped_count: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          inserted_count?: number
          row_count?: number
          skipped_count?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          inserted_count?: number
          row_count?: number
          skipped_count?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leader_contact_logs: {
        Row: {
          created_at: string
          id: string
          leader_id: string
          member_id: string
          note: string | null
          outcome: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          leader_id: string
          member_id: string
          note?: string | null
          outcome: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          leader_id?: string
          member_id?: string
          note?: string | null
          outcome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leader_contact_logs_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "leader_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_contact_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_contact_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leader_profiles: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          leader_type_id: string | null
          location: string | null
          member_id: string | null
          phone: string | null
          photo_path: string | null
          status: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          leader_type_id?: string | null
          location?: string | null
          member_id?: string | null
          phone?: string | null
          photo_path?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          leader_type_id?: string | null
          location?: string | null
          member_id?: string | null
          phone?: string | null
          photo_path?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leader_profiles_leader_type_id_fkey"
            columns: ["leader_type_id"]
            isOneToOne: false
            referencedRelation: "leader_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leader_types: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leader_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_followups: {
        Row: {
          assigned_leader_id: string | null
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          next_contact_on: string | null
          note: string | null
          source: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_leader_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          next_contact_on?: string | null
          note?: string | null
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_leader_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string
          next_contact_on?: string | null
          note?: string | null
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_followups_assigned_leader_id_fkey"
            columns: ["assigned_leader_id"]
            isOneToOne: false
            referencedRelation: "leader_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_followups_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_followups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          branch_id: string | null
          created_at: string
          date_of_birth: string | null
          education_level: string | null
          email: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          import_batch_id: string | null
          invited_by_leader_id: string | null
          is_leader: boolean
          is_minor: boolean
          joined_on: string
          marital_status: string | null
          messaging_opt_out: boolean
          occupation: string | null
          phone: string | null
          position_id: string | null
          residential_area: string | null
          status: Database["public"]["Enums"]["member_status"]
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          education_level?: string | null
          email?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          import_batch_id?: string | null
          invited_by_leader_id?: string | null
          is_leader?: boolean
          is_minor?: boolean
          joined_on?: string
          marital_status?: string | null
          messaging_opt_out?: boolean
          occupation?: string | null
          phone?: string | null
          position_id?: string | null
          residential_area?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          education_level?: string | null
          email?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          import_batch_id?: string | null
          invited_by_leader_id?: string | null
          is_leader?: boolean
          is_minor?: boolean
          joined_on?: string
          marital_status?: string | null
          messaging_opt_out?: boolean
          occupation?: string | null
          phone?: string | null
          position_id?: string | null
          residential_area?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_invited_by_leader_fkey"
            columns: ["invited_by_leader_id"]
            isOneToOne: false
            referencedRelation: "leader_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attempts: number
          body: string
          broadcast_id: string | null
          channel: string
          created_at: string
          dedupe_key: string | null
          error: string | null
          id: string
          member_id: string | null
          provider_id: string | null
          recipient: string
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string | null
          tenant_id: string
          trigger: string
        }
        Insert: {
          attempts?: number
          body: string
          broadcast_id?: string | null
          channel: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          member_id?: string | null
          provider_id?: string | null
          recipient: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          trigger?: string
        }
        Update: {
          attempts?: number
          body?: string
          broadcast_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          member_id?: string | null
          provider_id?: string | null
          recipient?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_kobo: number
          channel: string | null
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          reference: string
          status: string
          tenant_id: string
          tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Insert: {
          amount_kobo: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          reference: string
          status?: string
          tenant_id: string
          tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Update: {
          amount_kobo?: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          reference?: string
          status?: string
          tenant_id?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_audit_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          detail: Json
          id: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          detail?: Json
          id?: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          detail?: Json
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          branch_id: string | null
          created_at: string
          group_name: string
          id: string
          level_id: string
          parent_id: string | null
          path: unknown
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          group_name: string
          id?: string
          level_id: string
          parent_id?: string | null
          path?: unknown
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          group_name?: string
          id?: string
          level_id?: string
          parent_id?: string | null
          path?: unknown
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "structure_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      qr_tokens: {
        Row: {
          issued_at: string
          kind: string
          member_id: string
          revoked_at: string | null
          tenant_id: string
          token_enc: string | null
          token_hash: string
        }
        Insert: {
          issued_at?: string
          kind?: string
          member_id: string
          revoked_at?: string | null
          tenant_id: string
          token_enc?: string | null
          token_hash: string
        }
        Update: {
          issued_at?: string
          kind?: string
          member_id?: string
          revoked_at?: string | null
          tenant_id?: string
          token_enc?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_tokens_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_open: boolean
          name: string
          service_date: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          name: string
          service_date: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          name?: string
          service_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      space_requests: {
        Row: {
          amount_cents: number
          applied_at: string | null
          created_at: string
          extra_slots: number
          id: string
          reference: string | null
          requested_by: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount_cents?: number
          applied_at?: string | null
          created_at?: string
          extra_slots: number
          id?: string
          reference?: string | null
          requested_by?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          applied_at?: string | null
          created_at?: string
          extra_slots?: number
          id?: string
          reference?: string | null
          requested_by?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      structure_levels: {
        Row: {
          created_at: string
          id: string
          name: string
          rank: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rank: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rank?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "structure_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          created_at: string
          payment_method: Database["public"]["Enums"]["pay_method"]
          paystack_customer_code: string | null
          pending_tier: Database["public"]["Enums"]["tenant_tier"] | null
          period_end: string
          period_start: string
          tenant_id: string
          tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          payment_method?: Database["public"]["Enums"]["pay_method"]
          paystack_customer_code?: string | null
          pending_tier?: Database["public"]["Enums"]["tenant_tier"] | null
          period_end?: string
          period_start?: string
          tenant_id: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          payment_method?: Database["public"]["Enums"]["pay_method"]
          paystack_customer_code?: string | null
          pending_tier?: Database["public"]["Enums"]["tenant_tier"] | null
          period_end?: string
          period_start?: string
          tenant_id?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_credentials: {
        Row: {
          created_at: string
          id: number
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: number
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: number
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      tenant_leader_access: {
        Row: {
          code: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_leader_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          position_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          position_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          position_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          absence_threshold: number
          admin_notes: string | null
          approval_status: string
          approved_at: string | null
          background_path: string | null
          brand_accent: string
          brand_primary: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          extra_member_slots: number
          group_vocabulary: string
          id: string
          logo_path: string | null
          name: string
          package_selected: string | null
          payment_reference: string | null
          quiet_hour_end: number
          quiet_hour_start: number
          reply_to_email: string | null
          require_mfa: boolean
          sms_sender_id: string | null
          status: Database["public"]["Enums"]["tenant_status"]
          subdomain: string
          submit_button_text: string
          tier: Database["public"]["Enums"]["tenant_tier"]
          trial_ends_at: string | null
          welcome_message: string | null
        }
        Insert: {
          absence_threshold?: number
          admin_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          background_path?: string | null
          brand_accent?: string
          brand_primary?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          extra_member_slots?: number
          group_vocabulary?: string
          id?: string
          logo_path?: string | null
          name: string
          package_selected?: string | null
          payment_reference?: string | null
          quiet_hour_end?: number
          quiet_hour_start?: number
          reply_to_email?: string | null
          require_mfa?: boolean
          sms_sender_id?: string | null
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain: string
          submit_button_text?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
          trial_ends_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          absence_threshold?: number
          admin_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          background_path?: string | null
          brand_accent?: string
          brand_primary?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          extra_member_slots?: number
          group_vocabulary?: string
          id?: string
          logo_path?: string | null
          name?: string
          package_selected?: string | null
          payment_reference?: string | null
          quiet_hour_end?: number
          quiet_hour_start?: number
          reply_to_email?: string | null
          require_mfa?: boolean
          sms_sender_id?: string | null
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain?: string
          submit_button_text?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
          trial_ends_at?: string | null
          welcome_message?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      absent_members: { Args: { p_tenant: string }; Returns: Json }
      anonymise_member: { Args: { p_member: string }; Returns: undefined }
      apply_space_purchase:
        | { Args: { p_reference: string }; Returns: undefined }
        | {
            Args: { p_amount?: number; p_reference: string }
            Returns: undefined
          }
      apply_successful_payment: {
        Args: {
          p_amount?: number
          p_channel?: string
          p_paid_at?: string
          p_reference: string
        }
        Returns: undefined
      }
      ask_mene_allow_request: { Args: { p_tenant: string }; Returns: boolean }
      ask_mene_context: { Args: { p_tenant: string }; Returns: Json }
      attendance_insights: {
        Args: { p_tenant: string; p_weeks: number }
        Returns: Json
      }
      attendance_register: {
        Args: { p_search?: string; p_service: string }
        Returns: Json
      }
      birthdays_this_month: {
        Args: { p_tenant: string }
        Returns: {
          date_of_birth: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      can_add_staff: { Args: { p_tenant: string }; Returns: boolean }
      can_read_member: {
        Args: { _branch: string; _position: string; _tenant: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _identifier: string
          _max: number
          _window_seconds: number
        }
        Returns: boolean
      }
      claim_pending_messages: {
        Args: { p_limit: number }
        Returns: {
          body: string
          brand_primary: string
          channel: string
          church_name: string
          id: string
          logo_path: string
          recipient: string
          reply_to: string
          sms_sender: string
          subject: string
          tenant_id: string
        }[]
      }
      complete_verified_onboarding: { Args: never; Returns: string }
      create_member: {
        Args: {
          p_area: string
          p_branch: string
          p_dob: string
          p_email: string
          p_full_name: string
          p_gender: Database["public"]["Enums"]["gender_type"]
          p_marital_status: string
          p_occupation: string
          p_phone: string
          p_tenant: string
        }
        Returns: string
      }
      delete_service: { Args: { p_service: string }; Returns: undefined }
      enqueue_message: {
        Args: {
          p_body: string
          p_broadcast?: string
          p_channel: string
          p_dedupe: string
          p_member: string
          p_recipient: string
          p_subject: string
          p_tenant: string
          p_trigger: string
        }
        Returns: string
      }
      get_all_member_qrs: { Args: { p_tenant: string }; Returns: Json }
      get_member_qr: { Args: { p_member: string }; Returns: Json }
      has_tenant_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _tenant: string
        }
        Returns: boolean
      }
      import_members_batch: {
        Args: {
          p_branch: string
          p_filename: string
          p_rows: Json
          p_tenant: string
        }
        Returns: Json
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_admin_account: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { _tenant: string }; Returns: boolean }
      is_tenant_member: { Args: { _tenant: string }; Returns: boolean }
      issue_qr_token: { Args: { p_member: string }; Returns: string }
      leader_dashboard: { Args: never; Returns: Json }
      leader_log_contact: {
        Args: { p_member: string; p_note: string; p_outcome: string }
        Returns: undefined
      }
      leader_my_qr: { Args: never; Returns: Json }
      leader_overview: { Args: never; Returns: Json }
      leader_scope_member_ids: { Args: { p_leader: string }; Returns: string[] }
      list_followups: { Args: { p_tenant: string }; Returns: Json }
      log_audit: {
        Args: {
          _action: string
          _actor?: string
          _detail?: Json
          _ip?: string
          _target?: string
          _tenant: string
        }
        Returns: undefined
      }
      log_member_export: {
        Args: { p_count: number; p_tenant: string }
        Returns: undefined
      }
      manual_attendance: {
        Args: { p_member: string; p_service: string }
        Returns: Json
      }
      mark_message_result: {
        Args: {
          p_error: string
          p_id: string
          p_ok: boolean
          p_provider_id: string
        }
        Returns: undefined
      }
      my_followups: { Args: never; Returns: Json }
      my_review_state: { Args: never; Returns: Json }
      normalize_phone_gh: { Args: { _phone: string }; Returns: string }
      platform_approve_church: {
        Args: { p_notes?: string; p_tenant: string }
        Returns: boolean
      }
      platform_create_tenant: {
        Args: {
          p_contact_email: string
          p_contact_phone: string
          p_name: string
          p_subdomain: string
          p_tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Returns: string
      }
      platform_grant_space: {
        Args: { p_slots: number; p_tenant: string }
        Returns: undefined
      }
      platform_overview: { Args: never; Returns: Json }
      platform_reject_church: {
        Args: { p_reason?: string; p_tenant: string }
        Returns: boolean
      }
      platform_reviews: {
        Args: never
        Returns: {
          author_name: string
          author_role: string
          church_name: string
          created_at: string
          id: string
          quote: string
          rating: number
          status: string
        }[]
      }
      platform_set_review_status: {
        Args: { p_review: string; p_status: string }
        Returns: undefined
      }
      platform_set_tenant_status: {
        Args: {
          p_status: Database["public"]["Enums"]["tenant_status"]
          p_tenant: string
        }
        Returns: undefined
      }
      platform_update_tenant: {
        Args: {
          p_contact_email: string
          p_contact_phone: string
          p_name: string
          p_status: Database["public"]["Enums"]["tenant_status"]
          p_subdomain: string
          p_tenant: string
          p_tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Returns: undefined
      }
      provision_tenant: {
        Args: {
          p_contact_email?: string
          p_contact_phone?: string
          p_name: string
          p_subdomain: string
          p_tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Returns: string
      }
      public_help_allow_request: {
        Args: { p_identifier: string }
        Returns: boolean
      }
      public_leader_options: {
        Args: { p_subdomain: string }
        Returns: {
          full_name: string
          id: string
          leader_type: string
        }[]
      }
      public_leader_types: {
        Args: { p_subdomain: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      public_open_services: {
        Args: { p_subdomain: string }
        Returns: {
          id: string
          name: string
          service_date: string
        }[]
      }
      public_platform_stats: { Args: never; Returns: Json }
      public_reviews: {
        Args: never
        Returns: {
          author_name: string
          author_role: string
          church_name: string
          id: string
          quote: string
          rating: number
        }[]
      }
      queue_broadcast: {
        Args: {
          p_body: string
          p_channel: string
          p_dry_run: boolean
          p_kind: string
          p_ref: string
          p_subject: string
          p_tenant: string
        }
        Returns: Json
      }
      record_delivery_event: {
        Args: { p_event: string; p_provider_id: string }
        Returns: undefined
      }
      register_leader: {
        Args: {
          p_code: string
          p_dob: string
          p_email: string
          p_full_name: string
          p_ip: string
          p_leader_type: string
          p_location: string
          p_phone: string
          p_photo_path: string
          p_subdomain: string
          p_user: string
        }
        Returns: Json
      }
      rename_service: {
        Args: { p_date: string; p_name: string; p_service: string }
        Returns: undefined
      }
      request_extra_space: {
        Args: {
          p_amount: number
          p_reference: string
          p_slots: number
          p_tenant: string
        }
        Returns: Json
      }
      resolve_audience: {
        Args: {
          p_channel: string
          p_kind: string
          p_ref: string
          p_tenant: string
        }
        Returns: {
          full_name: string
          member_id: string
          recipient: string
        }[]
      }
      resolve_scan: {
        Args: { p_service: string; p_token: string }
        Returns: Json
      }
      run_daily_automations: { Args: never; Returns: Json }
      self_checkin: {
        Args: {
          p_area?: string
          p_dob?: string
          p_email?: string
          p_full_name: string
          p_gender?: Database["public"]["Enums"]["gender_type"]
          p_ip?: string
          p_phone: string
          p_subdomain: string
        }
        Returns: Json
      }
      self_checkin_v2: {
        Args: {
          p_area: string
          p_dob: string
          p_email: string
          p_full_name: string
          p_gender: Database["public"]["Enums"]["gender_type"]
          p_ip: string
          p_marital_status: string
          p_occupation: string
          p_phone: string
          p_service: string
          p_subdomain: string
        }
        Returns: Json
      }
      self_checkin_v3: {
        Args: {
          p_area: string
          p_dob: string
          p_education: string
          p_email: string
          p_full_name: string
          p_gender: Database["public"]["Enums"]["gender_type"]
          p_ip: string
          p_leader: string
          p_marital_status: string
          p_occupation: string
          p_phone: string
          p_service: string
          p_subdomain: string
        }
        Returns: Json
      }
      set_leader_access_code: {
        Args: { p_code: string; p_tenant: string }
        Returns: string
      }
      set_manual_attendance: {
        Args: { p_members: string[]; p_present: boolean; p_service: string }
        Returns: Json
      }
      set_member_messaging: {
        Args: { p_member: string; p_opt_out: boolean }
        Returns: undefined
      }
      set_require_mfa: {
        Args: { p_required: boolean; p_tenant: string }
        Returns: undefined
      }
      subdomain_available: { Args: { p_subdomain: string }; Returns: boolean }
      submit_church_review: {
        Args: {
          p_author_name: string
          p_author_role: string
          p_quote: string
          p_rating: number
          p_tenant: string
        }
        Returns: Json
      }
      tenant_branding: { Args: { p_subdomain: string }; Returns: Json }
      tenant_can_write: { Args: { _tenant: string }; Returns: boolean }
      tenant_dashboard: { Args: { p_tenant: string }; Returns: Json }
      tenant_features: { Args: { _tenant: string }; Returns: Json }
      tenant_has_feature: {
        Args: { _feature: string; _tenant: string }
        Returns: boolean
      }
      tenant_limit: { Args: { _key: string; _tenant: string }; Returns: number }
      tenant_usage: { Args: { p_tenant: string }; Returns: Json }
      text2ltree: { Args: { "": string }; Returns: unknown }
      tier_entitlements: {
        Args: { p_tier: Database["public"]["Enums"]["tenant_tier"] }
        Returns: Json
      }
      update_messaging_settings: {
        Args: {
          p_absence: number
          p_quiet_end: number
          p_quiet_start: number
          p_reply_to: string
          p_sms_sender: string
          p_tenant: string
        }
        Returns: undefined
      }
      update_tenant_branding: {
        Args: {
          p_accent: string
          p_background_path: string
          p_button: string
          p_logo_path: string
          p_name: string
          p_primary: string
          p_tenant: string
          p_welcome: string
        }
        Returns: undefined
      }
      update_tenant_vocabulary: {
        Args: { p_tenant: string; p_vocabulary: string }
        Returns: undefined
      }
      upsert_followup: {
        Args: {
          p_leader: string
          p_member: string
          p_next: string
          p_note: string
          p_source?: string
          p_status: string
        }
        Returns: string
      }
      user_branch: { Args: { _tenant: string }; Returns: string }
      user_position_path: { Args: { _tenant: string }; Returns: unknown }
    }
    Enums: {
      account_status: "active" | "suspended"
      app_role:
        | "owner"
        | "church_admin"
        | "branch_admin"
        | "leader"
        | "usher"
        | "platform_admin"
      attendance_method: "scan" | "self_checkin" | "manual" | "corrected"
      gender_type: "male" | "female" | "other"
      member_status: "first_timer" | "active" | "archived" | "anonymised"
      pay_method: "card" | "momo"
      tenant_status: "active" | "grace" | "suspended" | "closed"
      tenant_tier: "free" | "basic" | "standard" | "premium"
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
  public: {
    Enums: {
      account_status: ["active", "suspended"],
      app_role: [
        "owner",
        "church_admin",
        "branch_admin",
        "leader",
        "usher",
        "platform_admin",
      ],
      attendance_method: ["scan", "self_checkin", "manual", "corrected"],
      gender_type: ["male", "female", "other"],
      member_status: ["first_timer", "active", "archived", "anonymised"],
      pay_method: ["card", "momo"],
      tenant_status: ["active", "grace", "suspended", "closed"],
      tenant_tier: ["free", "basic", "standard", "premium"],
    },
  },
} as const
