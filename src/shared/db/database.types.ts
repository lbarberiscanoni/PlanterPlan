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
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json
          project_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          payload?: Json
          project_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          email: string
          granted_at: string | null
          granted_by: string | null
          user_id: string
        }
        Insert: {
          email: string
          granted_at?: string | null
          granted_by?: string | null
          user_id: string
        }
        Update: {
          email?: string
          granted_at?: string | null
          granted_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ics_feed_tokens: {
        Row: {
          created_at: string
          id: string
          label: string | null
          last_accessed_at: string | null
          project_filter: string[] | null
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          last_accessed_at?: string | null
          project_filter?: string[] | null
          revoked_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          last_accessed_at?: string | null
          project_filter?: string[] | null
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ics_feed_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          provider_id: string | null
          sent_at: string
          user_id: string
        }
        Insert: {
          channel: string
          error?: string | null
          event_type: string
          id?: string
          payload?: Json
          provider_id?: string | null
          sent_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          provider_id?: string | null
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_assignment: boolean
          email_mentions: boolean
          email_overdue_digest: string
          push_assignment: boolean
          push_mentions: boolean
          push_overdue: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email_assignment?: boolean
          email_mentions?: boolean
          email_overdue_digest?: string
          push_assignment?: boolean
          push_mentions?: boolean
          push_overdue?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email_assignment?: boolean
          email_mentions?: boolean
          email_overdue_digest?: string
          push_assignment?: boolean
          push_mentions?: boolean
          push_overdue?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          project_id: string | null
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invites: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          project_id: string
          role: string
          token: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          project_id: string
          role: string
          token?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          project_id?: string
          role?: string
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          id: string
          joined_at: string | null
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          fts: unknown
          id: string
          metadata: Json | null
          project_id: string
          resource_id: string | null
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          project_id: string
          resource_id?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          project_id?: string
          resource_id?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_chunks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "task_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chunks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["resource_id"]
          },
          {
            foreignKeyName: "rag_chunks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chunks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chunks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          mentions: string[]
          parent_comment_id: string | null
          root_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          root_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          root_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      task_relationships: {
        Row: {
          created_at: string | null
          from_task_id: string | null
          id: string
          project_id: string | null
          to_task_id: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          from_task_id?: string | null
          id?: string
          project_id?: string | null
          to_task_id?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          from_task_id?: string | null
          id?: string
          project_id?: string | null
          to_task_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_relationships_from_task_id_fkey"
            columns: ["from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_from_task_id_fkey"
            columns: ["from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_from_task_id_fkey"
            columns: ["from_task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_to_task_id_fkey"
            columns: ["to_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_to_task_id_fkey"
            columns: ["to_task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_to_task_id_fkey"
            columns: ["to_task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      task_resources: {
        Row: {
          created_at: string
          id: string
          resource_text: string | null
          resource_type: Database["public"]["Enums"]["task_resource_type"]
          resource_url: string | null
          storage_bucket: string | null
          storage_path: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_text?: string | null
          resource_type: Database["public"]["Enums"]["task_resource_type"]
          resource_url?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_text?: string | null
          resource_type?: Database["public"]["Enums"]["task_resource_type"]
          resource_url?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_resources_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_resources_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_resources_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actions: string | null
          assignee_id: string | null
          cloned_from_task_id: string | null
          created_at: string | null
          creator: string | null
          days_from_start: number | null
          description: string | null
          due_date: string | null
          id: string
          is_complete: boolean | null
          is_locked: boolean | null
          is_premium: boolean | null
          location: string | null
          notes: string | null
          origin: string | null
          parent_project_id: string | null
          parent_task_id: string | null
          position: number | null
          prerequisite_phase_id: string | null
          primary_resource_id: string | null
          priority: string | null
          project_type: string | null
          purpose: string | null
          root_id: string | null
          settings: Json | null
          start_date: string | null
          status: string | null
          supervisor_email: string | null
          task_type: string | null
          template_version: number
          title: string
          updated_at: string | null
        }
        Insert: {
          actions?: string | null
          assignee_id?: string | null
          cloned_from_task_id?: string | null
          created_at?: string | null
          creator?: string | null
          days_from_start?: number | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_complete?: boolean | null
          is_locked?: boolean | null
          is_premium?: boolean | null
          location?: string | null
          notes?: string | null
          origin?: string | null
          parent_project_id?: string | null
          parent_task_id?: string | null
          position?: number | null
          prerequisite_phase_id?: string | null
          primary_resource_id?: string | null
          priority?: string | null
          project_type?: string | null
          purpose?: string | null
          root_id?: string | null
          settings?: Json | null
          start_date?: string | null
          status?: string | null
          supervisor_email?: string | null
          task_type?: string | null
          template_version?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          actions?: string | null
          assignee_id?: string | null
          cloned_from_task_id?: string | null
          created_at?: string | null
          creator?: string | null
          days_from_start?: number | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_complete?: boolean | null
          is_locked?: boolean | null
          is_premium?: boolean | null
          location?: string | null
          notes?: string | null
          origin?: string | null
          parent_project_id?: string | null
          parent_task_id?: string | null
          position?: number | null
          prerequisite_phase_id?: string | null
          primary_resource_id?: string | null
          priority?: string | null
          project_type?: string | null
          purpose?: string | null
          root_id?: string | null
          settings?: Json | null
          start_date?: string | null
          status?: string | null
          supervisor_email?: string | null
          task_type?: string | null
          template_version?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cloned_from_task_id_fkey"
            columns: ["cloned_from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cloned_from_task_id_fkey"
            columns: ["cloned_from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cloned_from_task_id_fkey"
            columns: ["cloned_from_task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_creator_fkey"
            columns: ["creator"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prerequisite_phase_id_fkey"
            columns: ["prerequisite_phase_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prerequisite_phase_id_fkey"
            columns: ["prerequisite_phase_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prerequisite_phase_id_fkey"
            columns: ["prerequisite_phase_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["primary_resource_id"]
            isOneToOne: false
            referencedRelation: "task_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["primary_resource_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["resource_id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      tasks_with_primary_resource: {
        Row: {
          actions: string | null
          assignee_id: string | null
          cloned_from_task_id: string | null
          created_at: string | null
          creator: string | null
          days_from_start: number | null
          description: string | null
          due_date: string | null
          id: string | null
          is_complete: boolean | null
          is_locked: boolean | null
          is_premium: boolean | null
          location: string | null
          notes: string | null
          origin: string | null
          parent_project_id: string | null
          parent_task_id: string | null
          position: number | null
          prerequisite_phase_id: string | null
          primary_resource_id: string | null
          priority: string | null
          project_type: string | null
          purpose: string | null
          resource_id: string | null
          resource_name: string | null
          resource_text: string | null
          resource_type: string | null
          resource_url: string | null
          root_id: string | null
          settings: Json | null
          start_date: string | null
          status: string | null
          storage_path: string | null
          supervisor_email: string | null
          task_type: string | null
          template_version: number | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cloned_from_task_id_fkey"
            columns: ["cloned_from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cloned_from_task_id_fkey"
            columns: ["cloned_from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cloned_from_task_id_fkey"
            columns: ["cloned_from_task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_creator_fkey"
            columns: ["creator"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prerequisite_phase_id_fkey"
            columns: ["prerequisite_phase_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prerequisite_phase_id_fkey"
            columns: ["prerequisite_phase_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prerequisite_phase_id_fkey"
            columns: ["prerequisite_phase_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["primary_resource_id"]
            isOneToOne: false
            referencedRelation: "task_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["primary_resource_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["resource_id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
      users_public: {
        Row: {
          email: string | null
          id: string | null
        }
        Insert: {
          email?: string | null
          id?: string | null
        }
        Update: {
          email?: string | null
          id?: string | null
        }
        Relationships: []
      }
      view_master_library: {
        Row: {
          actions: string | null
          created_at: string | null
          creator: string | null
          days_from_start: number | null
          description: string | null
          due_date: string | null
          id: string | null
          is_complete: boolean | null
          notes: string | null
          origin: string | null
          parent_task_id: string | null
          position: number | null
          primary_resource_id: string | null
          purpose: string | null
          resource_id: string | null
          root_id: string | null
          start_date: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          actions?: string | null
          created_at?: string | null
          creator?: string | null
          days_from_start?: number | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          is_complete?: boolean | null
          notes?: string | null
          origin?: string | null
          parent_task_id?: string | null
          position?: number | null
          primary_resource_id?: string | null
          purpose?: string | null
          resource_id?: string | null
          root_id?: string | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          actions?: string | null
          created_at?: string | null
          creator?: string | null
          days_from_start?: number | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          is_complete?: boolean | null
          notes?: string | null
          origin?: string | null
          parent_task_id?: string | null
          position?: number | null
          primary_resource_id?: string | null
          purpose?: string | null
          resource_id?: string | null
          root_id?: string | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_creator_fkey"
            columns: ["creator"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["primary_resource_id"]
            isOneToOne: false
            referencedRelation: "task_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "task_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["primary_resource_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["resource_id"]
          },
          {
            foreignKeyName: "tasks_primary_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["resource_id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_primary_resource"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "view_master_library"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_analytics_snapshot: { Args: never; Returns: Json }
      admin_list_users: {
        Args: { filter?: Json; p_limit?: number; p_offset?: number }
        Returns: {
          active_project_count: number
          completed_tasks_30d: number
          display_name: string
          email: string
          id: string
          is_admin: boolean
          last_sign_in_at: string
          overdue_task_count: number
        }[]
      }
      admin_recent_activity: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json
          project_id: string
        }[]
      }
      admin_search_root_tasks: {
        Args: { p_max_results?: number; p_origin?: string; p_query: string }
        Returns: {
          id: string
          origin: string
          title: string
        }[]
      }
      admin_search_users: {
        Args: { p_max_results?: number; p_query: string }
        Returns: {
          display_name: string
          email: string
          id: string
          last_sign_in_at: string
          project_count: number
        }[]
      }
      admin_set_user_admin_role: {
        Args: { p_make_admin: boolean; p_target_uid: string }
        Returns: undefined
      }
      admin_template_clones: {
        Args: { p_template_id: string }
        Returns: {
          cloned_from_template_version: number
          current_template_version: number
          project_id: string
          stale: boolean
          title: string
        }[]
      }
      admin_template_roots: {
        Args: never
        Returns: {
          id: string
          template_version: number
          title: string
          updated_at: string
        }[]
      }
      admin_user_detail: { Args: { p_uid: string }; Returns: Json }
      check_project_creatorship: {
        Args: { p_id: string; u_id: string }
        Returns: boolean
      }
      check_project_ownership_by_role: {
        Args: { p_id: string; u_id: string }
        Returns: boolean
      }
      clone_project_template: {
        Args: {
          p_description?: string
          p_due_date?: string
          p_new_origin: string
          p_new_parent_id: string
          p_start_date?: string
          p_template_id: string
          p_title?: string
          p_user_id: string
        }
        Returns: Json
      }
      derive_task_type: { Args: { p_parent_task_id: string }; Returns: string }
      get_invite_details: { Args: { p_token: string }; Returns: Json }
      get_task_root_id: { Args: { p_task_id: string }; Returns: string }
      get_user_id_by_email: { Args: { email: string }; Returns: string }
      has_permission: {
        Args: {
          p_project_id: string
          p_required_role?: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_project_role: {
        Args: { allowed_roles: string[]; pid: string; uid: string }
        Returns: boolean
      }
      initialize_default_project: {
        Args: { p_creator_id: string; p_project_id: string }
        Returns: Json
      }
      invite_user_to_project: {
        Args: { p_email: string; p_project_id: string; p_role: string }
        Returns: Json
      }
      is_active_member: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      list_task_comments_with_authors: {
        Args: { p_task_id: string; p_comment_id?: string | null }
        Returns: {
          author: Json | null
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          mentions: string[]
          parent_comment_id: string | null
          root_id: string
          task_id: string
          updated_at: string
        }[]
      }
      list_project_members_with_profiles: {
        Args: { p_project_id: string }
        Returns: {
          avatar_url: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          joined_at: string | null
          last_name: string | null
          project_id: string
          role: string
          user_id: string
        }[]
      }
      rag_get_project_context: {
        Args: { p_limit?: number; p_project_id: string }
        Returns: Json
      }
      resolve_user_handles: {
        Args: { p_handles: string[] }
        Returns: {
          handle: string
          user_id: string | null
        }[]
      }
      user_is_phase_lead: {
        Args: { target_task_id: string; uid: string }
        Returns: boolean
      }
    }
    Enums: {
      task_resource_type: "pdf" | "url" | "text"
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
      task_resource_type: ["pdf", "url", "text"],
    },
  },
} as const
