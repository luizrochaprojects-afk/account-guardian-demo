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
      account_stage_history: {
        Row: {
          account_id: string
          arr_at_entry: number | null
          changed_by: string | null
          created_at: string
          duration_hours: number | null
          entered_at: string
          exited_at: string | null
          from_phase: Database["public"]["Enums"]["pipeline_phase"] | null
          from_stage: Database["public"]["Enums"]["pipeline_stage"] | null
          id: string
          metadata: Json
          organization_id: string
          source: string
          source_event_id: string | null
          to_phase: Database["public"]["Enums"]["pipeline_phase"] | null
          to_stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Insert: {
          account_id: string
          arr_at_entry?: number | null
          changed_by?: string | null
          created_at?: string
          duration_hours?: number | null
          entered_at: string
          exited_at?: string | null
          from_phase?: Database["public"]["Enums"]["pipeline_phase"] | null
          from_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          id?: string
          metadata?: Json
          organization_id: string
          source?: string
          source_event_id?: string | null
          to_phase?: Database["public"]["Enums"]["pipeline_phase"] | null
          to_stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Update: {
          account_id?: string
          arr_at_entry?: number | null
          changed_by?: string | null
          created_at?: string
          duration_hours?: number | null
          entered_at?: string
          exited_at?: string | null
          from_phase?: Database["public"]["Enums"]["pipeline_phase"] | null
          from_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          id?: string
          metadata?: Json
          organization_id?: string
          source?: string
          source_event_id?: string | null
          to_phase?: Database["public"]["Enums"]["pipeline_phase"] | null
          to_stage?: Database["public"]["Enums"]["pipeline_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "account_stage_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_stage_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_stage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_stage_history_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          arr: number
          channels: string[]
          churn_reason: Database["public"]["Enums"]["churn_reason"] | null
          close_date_slips: number
          code_prefix: string
          created_at: string
          customer_risk_reason: string | null
          customer_since: string | null
          customer_stage_pin_reason: string | null
          customer_stage_pinned_at: string | null
          customer_stage_pinned_by: string | null
          delivery_owner_id: string | null
          disqualify_reason:
            | Database["public"]["Enums"]["disqualify_reason"]
            | null
          expected_close_date: string | null
          first_usage_at: string | null
          first_engaged_at: string | null
          first_impact_at: string | null
          first_meeting_at: string | null
          first_worked_at: string | null
          forecast_close_date: string | null
          founder_approved_at: string | null
          founder_approved_by: string | null
          founder_confidence:
            | Database["public"]["Enums"]["founder_confidence"]
            | null
          golive_at: string | null
          health_score: number
          id: string
          incumbent_captured_at: string | null
          incumbent_cycle: Database["public"]["Enums"]["incumbent_cycle"]
          incumbent_evidence: string | null
          incumbent_last_renewal: string | null
          incumbent_source:
            | Database["public"]["Enums"]["incumbent_source"]
            | null
          incumbent_vendor: string | null
          incumbent_window_disabled_reason: string | null
          incumbent_window_snoozed_until: string | null
          industry: string | null
          last_activity_at: string | null
          last_contact: string | null
          loss_reason_category:
            | Database["public"]["Enums"]["loss_reason_category"]
            | null
          loss_reason_detail: string | null
          lost_from_stage: Database["public"]["Enums"]["pipeline_stage"] | null
          main_issue: string | null
          mrr: number
          name: string
          next_step: string | null
          next_step_due: string | null
          next_step_task_id: string | null
          organization_id: string
          pipeline_phase: Database["public"]["Enums"]["pipeline_phase"] | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"] | null
          plan: string | null
          qualification_checklist: Json
          reactivated_at: string | null
          region: string | null
          revenue_owner_id: string | null
          revisit_at: string | null
          risk_notes: string | null
          segment: string | null
          source: string | null
          success_promise: string | null
          tags: string[]
          trend: string
          updated_at: string
        }
        Insert: {
          arr?: number
          channels?: string[]
          churn_reason?: Database["public"]["Enums"]["churn_reason"] | null
          close_date_slips?: number
          code_prefix?: string
          created_at?: string
          customer_risk_reason?: string | null
          customer_since?: string | null
          customer_stage_pin_reason?: string | null
          customer_stage_pinned_at?: string | null
          customer_stage_pinned_by?: string | null
          delivery_owner_id?: string | null
          disqualify_reason?:
            | Database["public"]["Enums"]["disqualify_reason"]
            | null
          expected_close_date?: string | null
          first_usage_at?: string | null
          first_engaged_at?: string | null
          first_impact_at?: string | null
          first_meeting_at?: string | null
          first_worked_at?: string | null
          forecast_close_date?: string | null
          founder_approved_at?: string | null
          founder_approved_by?: string | null
          founder_confidence?:
            | Database["public"]["Enums"]["founder_confidence"]
            | null
          golive_at?: string | null
          health_score?: number
          id?: string
          incumbent_captured_at?: string | null
          incumbent_cycle?: Database["public"]["Enums"]["incumbent_cycle"]
          incumbent_evidence?: string | null
          incumbent_last_renewal?: string | null
          incumbent_source?:
            | Database["public"]["Enums"]["incumbent_source"]
            | null
          incumbent_vendor?: string | null
          incumbent_window_disabled_reason?: string | null
          incumbent_window_snoozed_until?: string | null
          industry?: string | null
          last_activity_at?: string | null
          last_contact?: string | null
          loss_reason_category?:
            | Database["public"]["Enums"]["loss_reason_category"]
            | null
          loss_reason_detail?: string | null
          lost_from_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          main_issue?: string | null
          mrr?: number
          name: string
          next_step?: string | null
          next_step_due?: string | null
          next_step_task_id?: string | null
          organization_id: string
          pipeline_phase?: Database["public"]["Enums"]["pipeline_phase"] | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          plan?: string | null
          qualification_checklist?: Json
          reactivated_at?: string | null
          region?: string | null
          revenue_owner_id?: string | null
          revisit_at?: string | null
          risk_notes?: string | null
          segment?: string | null
          source?: string | null
          success_promise?: string | null
          tags?: string[]
          trend?: string
          updated_at?: string
        }
        Update: {
          arr?: number
          channels?: string[]
          churn_reason?: Database["public"]["Enums"]["churn_reason"] | null
          close_date_slips?: number
          code_prefix?: string
          created_at?: string
          customer_risk_reason?: string | null
          customer_since?: string | null
          customer_stage_pin_reason?: string | null
          customer_stage_pinned_at?: string | null
          customer_stage_pinned_by?: string | null
          delivery_owner_id?: string | null
          disqualify_reason?:
            | Database["public"]["Enums"]["disqualify_reason"]
            | null
          expected_close_date?: string | null
          first_usage_at?: string | null
          first_engaged_at?: string | null
          first_impact_at?: string | null
          first_meeting_at?: string | null
          first_worked_at?: string | null
          forecast_close_date?: string | null
          founder_approved_at?: string | null
          founder_approved_by?: string | null
          founder_confidence?:
            | Database["public"]["Enums"]["founder_confidence"]
            | null
          golive_at?: string | null
          health_score?: number
          id?: string
          incumbent_captured_at?: string | null
          incumbent_cycle?: Database["public"]["Enums"]["incumbent_cycle"]
          incumbent_evidence?: string | null
          incumbent_last_renewal?: string | null
          incumbent_source?:
            | Database["public"]["Enums"]["incumbent_source"]
            | null
          incumbent_vendor?: string | null
          incumbent_window_disabled_reason?: string | null
          incumbent_window_snoozed_until?: string | null
          industry?: string | null
          last_activity_at?: string | null
          last_contact?: string | null
          loss_reason_category?:
            | Database["public"]["Enums"]["loss_reason_category"]
            | null
          loss_reason_detail?: string | null
          lost_from_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          main_issue?: string | null
          mrr?: number
          name?: string
          next_step?: string | null
          next_step_due?: string | null
          next_step_task_id?: string | null
          organization_id?: string
          pipeline_phase?: Database["public"]["Enums"]["pipeline_phase"] | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          plan?: string | null
          qualification_checklist?: Json
          reactivated_at?: string | null
          region?: string | null
          revenue_owner_id?: string | null
          revisit_at?: string | null
          risk_notes?: string | null
          segment?: string | null
          source?: string | null
          success_promise?: string | null
          tags?: string[]
          trend?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_next_step_task_id_fkey"
            columns: ["next_step_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          account_id: string | null
          activity_type: Database["public"]["Enums"]["activity_type"]
          channel: Database["public"]["Enums"]["activity_channel"]
          contact_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["activity_direction"]
          external_id: string | null
          id: string
          meaningful_engagement: boolean | null
          notes: string | null
          occurred_at: string
          organization_id: string
          outcome: Database["public"]["Enums"]["activity_outcome"] | null
          owner_id: string | null
          source: Database["public"]["Enums"]["activity_source"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          activity_type: Database["public"]["Enums"]["activity_type"]
          channel: Database["public"]["Enums"]["activity_channel"]
          contact_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["activity_direction"]
          external_id?: string | null
          id?: string
          meaningful_engagement?: boolean | null
          notes?: string | null
          occurred_at?: string
          organization_id: string
          outcome?: Database["public"]["Enums"]["activity_outcome"] | null
          owner_id?: string | null
          source?: Database["public"]["Enums"]["activity_source"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          activity_type?: Database["public"]["Enums"]["activity_type"]
          channel?: Database["public"]["Enums"]["activity_channel"]
          contact_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["activity_direction"]
          external_id?: string | null
          id?: string
          meaningful_engagement?: boolean | null
          notes?: string | null
          occurred_at?: string
          organization_id?: string
          outcome?: Database["public"]["Enums"]["activity_outcome"] | null
          owner_id?: string | null
          source?: Database["public"]["Enums"]["activity_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_audit_log: {
        Row: {
          account_id: string | null
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["profile_role"] | null
          actor_type: string
          created_at: string
          id: string
          meeting_ingest_id: string | null
          organization_id: string
          payload: Json
          suggestion_id: string | null
          was_founder_action: boolean
        }
        Insert: {
          account_id?: string | null
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["profile_role"] | null
          actor_type: string
          created_at?: string
          id?: string
          meeting_ingest_id?: string | null
          organization_id: string
          payload?: Json
          suggestion_id?: string | null
          was_founder_action?: boolean
        }
        Update: {
          account_id?: string | null
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["profile_role"] | null
          actor_type?: string
          created_at?: string
          id?: string
          meeting_ingest_id?: string | null
          organization_id?: string
          payload?: Json
          suggestion_id?: string | null
          was_founder_action?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_audit_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "agent_audit_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_audit_log_meeting_ingest_id_fkey"
            columns: ["meeting_ingest_id"]
            isOneToOne: false
            referencedRelation: "meeting_ingests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_audit_log_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "agent_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_settings: {
        Row: {
          confidence_threshold: number
          cost_capped_at: string | null
          created_at: string
          enabled: boolean
          folder_ids: Json
          last_poll_at: string | null
          llm_model: string
          monthly_cost_cap_usd: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          confidence_threshold?: number
          cost_capped_at?: string | null
          created_at?: string
          enabled?: boolean
          folder_ids?: Json
          last_poll_at?: string | null
          llm_model?: string
          monthly_cost_cap_usd?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          confidence_threshold?: number
          cost_capped_at?: string | null
          created_at?: string
          enabled?: boolean
          folder_ids?: Json
          last_poll_at?: string | null
          llm_model?: string
          monthly_cost_cap_usd?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_suggestions: {
        Row: {
          account_id: string | null
          approved_at: string | null
          approved_by: string | null
          confidence_score: number | null
          created_at: string
          expires_at: string | null
          id: string
          meeting_ingest_id: string | null
          organization_id: string
          payload: Json
          reject_reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          resulting_record_id: string | null
          source: string
          source_excerpts: Json
          status: string
          suggested_account_name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          meeting_ingest_id?: string | null
          organization_id: string
          payload: Json
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          resulting_record_id?: string | null
          source?: string
          source_excerpts?: Json
          status?: string
          suggested_account_name?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          meeting_ingest_id?: string | null
          organization_id?: string
          payload?: Json
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          resulting_record_id?: string | null
          source?: string
          source_excerpts?: Json
          status?: string
          suggested_account_name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_suggestions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "agent_suggestions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestions_meeting_ingest_id_fkey"
            columns: ["meeting_ingest_id"]
            isOneToOne: false
            referencedRelation: "meeting_ingests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          contact_type: string
          created_at: string
          deal_engagement: string
          department: string | null
          email: string | null
          engagement_level: string
          id: string
          last_interaction: string | null
          linkedin_url: string | null
          name: string
          organization_id: string
          phone: string | null
          role: string | null
          role_in_deal: string
          updated_at: string
        }
        Insert: {
          account_id: string
          contact_type?: string
          created_at?: string
          deal_engagement?: string
          department?: string | null
          email?: string | null
          engagement_level?: string
          id?: string
          last_interaction?: string | null
          linkedin_url?: string | null
          name: string
          organization_id: string
          phone?: string | null
          role?: string | null
          role_in_deal?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          contact_type?: string
          created_at?: string
          deal_engagement?: string
          department?: string | null
          email?: string | null
          engagement_level?: string
          id?: string
          last_interaction?: string | null
          linkedin_url?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          role?: string | null
          role_in_deal?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_properties: {
        Row: {
          created_at: string
          default_value: Json | null
          description: string | null
          entity_type: string
          id: string
          is_required: boolean
          is_system: boolean
          key: string
          label: string
          option_labels: Json | null
          options: Json
          organization_id: string
          position: number
          show_in_create: boolean
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: Json | null
          description?: string | null
          entity_type: string
          id?: string
          is_required?: boolean
          is_system?: boolean
          key: string
          label: string
          option_labels?: Json | null
          options?: Json
          organization_id: string
          position?: number
          show_in_create?: boolean
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: Json | null
          description?: string | null
          entity_type?: string
          id?: string
          is_required?: boolean
          is_system?: boolean
          key?: string
          label?: string
          option_labels?: Json | null
          options?: Json
          organization_id?: string
          position?: number
          show_in_create?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_property_values: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          property_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          property_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          property_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_property_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_property_values_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "custom_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_views: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_type: string
          filters: Json
          id: string
          is_favorite: boolean
          name: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type: string
          filters?: Json
          id?: string
          is_favorite?: boolean
          name: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: string
          filters?: Json
          id?: string
          is_favorite?: boolean
          name?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_requests: {
        Row: {
          account_id: string
          body: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          focus: string[]
          id: string
          is_important: boolean
          organization_id: string
          project_id: string | null
          source: string | null
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          body?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          focus?: string[]
          id?: string
          is_important?: boolean
          organization_id: string
          project_id?: string | null
          source?: string | null
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          body?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          focus?: string[]
          id?: string
          is_important?: boolean
          organization_id?: string
          project_id?: string | null
          source?: string | null
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_notes: {
        Row: {
          account_id: string
          agent_confidence: number | null
          agent_model: string | null
          budget_signal: string | null
          contact_id: string | null
          context: string | null
          created_at: string
          created_by: string | null
          current_competitor: string | null
          current_stack: string | null
          current_workflow: string | null
          decision_maker: string | null
          fit_thesis: string | null
          founder_present: boolean
          generated_by: Database["public"]["Enums"]["discovery_generated_by"]
          id: string
          meeting_event_id: string | null
          meeting_ingest_id: string | null
          next_steps: string | null
          objections: string[]
          organization_id: string
          primary_pain: string | null
          prospect_language: string[]
          risk_thesis: string | null
          source_transcript_excerpt: Json
          updated_at: string
          what_caught_attention: string | null
          what_confused: string | null
        }
        Insert: {
          account_id: string
          agent_confidence?: number | null
          agent_model?: string | null
          budget_signal?: string | null
          contact_id?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          current_competitor?: string | null
          current_stack?: string | null
          current_workflow?: string | null
          decision_maker?: string | null
          fit_thesis?: string | null
          founder_present?: boolean
          generated_by?: Database["public"]["Enums"]["discovery_generated_by"]
          id?: string
          meeting_event_id?: string | null
          meeting_ingest_id?: string | null
          next_steps?: string | null
          objections?: string[]
          organization_id: string
          primary_pain?: string | null
          prospect_language?: string[]
          risk_thesis?: string | null
          source_transcript_excerpt?: Json
          updated_at?: string
          what_caught_attention?: string | null
          what_confused?: string | null
        }
        Update: {
          account_id?: string
          agent_confidence?: number | null
          agent_model?: string | null
          budget_signal?: string | null
          contact_id?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          current_competitor?: string | null
          current_stack?: string | null
          current_workflow?: string | null
          decision_maker?: string | null
          fit_thesis?: string | null
          founder_present?: boolean
          generated_by?: Database["public"]["Enums"]["discovery_generated_by"]
          id?: string
          meeting_event_id?: string | null
          meeting_ingest_id?: string | null
          next_steps?: string | null
          objections?: string[]
          organization_id?: string
          primary_pain?: string | null
          prospect_language?: string[]
          risk_thesis?: string | null
          source_transcript_excerpt?: Json
          updated_at?: string
          what_caught_attention?: string | null
          what_confused?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovery_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "discovery_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_notes_meeting_event_id_fkey"
            columns: ["meeting_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_notes_meeting_ingest_id_fkey"
            columns: ["meeting_ingest_id"]
            isOneToOne: false
            referencedRelation: "meeting_ingests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_contacts: {
        Row: {
          contact_id: string
          created_at: string
          event_id: string
          id: string
          organization_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          event_id: string
          id?: string
          organization_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          event_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_contacts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          account_id: string | null
          channel: string | null
          completed_at: string | null
          created_at: string
          date: string | null
          direction: string
          group_label: string | null
          id: string
          organization_id: string
          scheduled_at: string | null
          sentiment: string | null
          summary: string | null
          time: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          channel?: string | null
          completed_at?: string | null
          created_at?: string
          date?: string | null
          direction?: string
          group_label?: string | null
          id?: string
          organization_id: string
          scheduled_at?: string | null
          sentiment?: string | null
          summary?: string | null
          time?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          channel?: string | null
          completed_at?: string | null
          created_at?: string
          date?: string | null
          direction?: string
          group_label?: string | null
          id?: string
          organization_id?: string
          scheduled_at?: string | null
          sentiment?: string | null
          summary?: string | null
          time?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      health_metric_profiles: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_metric_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      health_metrics: {
        Row: {
          boolean_healthy_value: boolean
          concerning: Json
          created_at: string
          healthy: Json
          icon: string
          id: string
          name: string
          organization_id: string
          poor: Json
          position: number
          profile_id: string | null
          source: string
          type: string
          updated_at: string
          weight: number
        }
        Insert: {
          boolean_healthy_value?: boolean
          concerning?: Json
          created_at?: string
          healthy?: Json
          icon?: string
          id?: string
          name: string
          organization_id: string
          poor?: Json
          position?: number
          profile_id?: string | null
          source?: string
          type?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          boolean_healthy_value?: boolean
          concerning?: Json
          created_at?: string
          healthy?: Json
          icon?: string
          id?: string
          name?: string
          organization_id?: string
          poor?: Json
          position?: number
          profile_id?: string | null
          source?: string
          type?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_metrics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "health_metric_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_profile_stages: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          profile_id: string
          stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          profile_id: string
          stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          profile_id?: string
          stage?: Database["public"]["Enums"]["pipeline_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "health_profile_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_profile_stages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "health_metric_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_score_logs: {
        Row: {
          account_id: string
          created_at: string
          id: string
          logged_at: string
          metrics_snapshot: Json | null
          observation: string | null
          organization_id: string
          profile_id: string | null
          profile_name: string | null
          scores: Json
          total_score: number
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          logged_at?: string
          metrics_snapshot?: Json | null
          observation?: string | null
          organization_id: string
          profile_id?: string | null
          profile_name?: string | null
          scores: Json
          total_score: number
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          logged_at?: string
          metrics_snapshot?: Json | null
          observation?: string | null
          organization_id?: string
          profile_id?: string | null
          profile_name?: string | null
          scores?: Json
          total_score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_score_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "health_metric_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_templates: {
        Row: {
          body_template: string | null
          created_at: string
          created_by: string | null
          default_assigned_role: string | null
          default_labels: string[] | null
          default_priority: string | null
          default_status: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          body_template?: string | null
          created_at?: string
          created_by?: string | null
          default_assigned_role?: string | null
          default_labels?: string[] | null
          default_priority?: string | null
          default_status?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          body_template?: string | null
          created_at?: string
          created_by?: string | null
          default_assigned_role?: string | null
          default_labels?: string[] | null
          default_priority?: string | null
          default_status?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_ingests: {
        Row: {
          created_at: string
          extraction_attempts: number
          extraction_error: string | null
          folder_id: string | null
          folder_name: string | null
          source_doc_id: string
          id: string
          meeting_date: string | null
          next_retry_at: string | null
          organization_id: string
          participants: Json
          produces_discovery_note_id: string | null
          produces_qualification_update_id: string | null
          prompt_version: string | null
          raw_payload: Json | null
          status: string
          summary_text: string | null
          title: string | null
          tokens_used: number | null
          transcript_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          extraction_attempts?: number
          extraction_error?: string | null
          folder_id?: string | null
          folder_name?: string | null
          source_doc_id: string
          id?: string
          meeting_date?: string | null
          next_retry_at?: string | null
          organization_id: string
          participants?: Json
          produces_discovery_note_id?: string | null
          produces_qualification_update_id?: string | null
          prompt_version?: string | null
          raw_payload?: Json | null
          status?: string
          summary_text?: string | null
          title?: string | null
          tokens_used?: number | null
          transcript_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          extraction_attempts?: number
          extraction_error?: string | null
          folder_id?: string | null
          folder_name?: string | null
          source_doc_id?: string
          id?: string
          meeting_date?: string | null
          next_retry_at?: string | null
          organization_id?: string
          participants?: Json
          produces_discovery_note_id?: string | null
          produces_qualification_update_id?: string | null
          prompt_version?: string | null
          raw_payload?: Json | null
          status?: string
          summary_text?: string | null
          title?: string | null
          tokens_used?: number | null
          transcript_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_ingests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_ingests_produces_discovery_note_id_fkey"
            columns: ["produces_discovery_note_id"]
            isOneToOne: false
            referencedRelation: "discovery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_ingests_produces_qualification_update_id_fkey"
            columns: ["produces_qualification_update_id"]
            isOneToOne: false
            referencedRelation: "agent_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          position: number
          project_id: string
          target_date: string | null
          title: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          project_id: string
          target_date?: string | null
          title: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          project_id?: string
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          account_id: string | null
          author: string | null
          body: string
          category: string
          contact_id: string | null
          content: Json
          created_at: string
          created_by_agent: boolean
          id: string
          organization_id: string
          participants: string[]
          project_id: string | null
          source_suggestion_id: string | null
          tags: string[]
          task_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          author?: string | null
          body?: string
          category?: string
          contact_id?: string | null
          content?: Json
          created_at?: string
          created_by_agent?: boolean
          id?: string
          organization_id: string
          participants?: string[]
          project_id?: string | null
          source_suggestion_id?: string | null
          tags?: string[]
          task_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          author?: string | null
          body?: string
          category?: string
          contact_id?: string | null
          content?: Json
          created_at?: string
          created_by_agent?: boolean
          id?: string
          organization_id?: string
          participants?: string[]
          project_id?: string | null
          source_suggestion_id?: string | null
          tags?: string[]
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_source_suggestion_id_fkey"
            columns: ["source_suggestion_id"]
            isOneToOne: false
            referencedRelation: "agent_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          created_at: string
          currency_code: string
          currency_symbol: string
          customer_contraction_threshold_pct: number
          customer_coverage_alert_weeks: number
          customer_dormant_weeks: number
          customer_expansion_threshold_pct: number
          customer_gone_dark_days: number
          customer_ramp_days: number
          hygiene_stale_days: number
          incumbent_lead_days: number
          organization_id: string
          revenue_goal_anchor_month: string
          revenue_mom_goal_pct: number
          updated_at: string
          weekly_discovery_target: number
        }
        Insert: {
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          customer_contraction_threshold_pct?: number
          customer_coverage_alert_weeks?: number
          customer_dormant_weeks?: number
          customer_expansion_threshold_pct?: number
          customer_gone_dark_days?: number
          customer_ramp_days?: number
          hygiene_stale_days?: number
          incumbent_lead_days?: number
          organization_id: string
          revenue_goal_anchor_month?: string
          revenue_mom_goal_pct?: number
          updated_at?: string
          weekly_discovery_target?: number
        }
        Update: {
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          customer_contraction_threshold_pct?: number
          customer_coverage_alert_weeks?: number
          customer_dormant_weeks?: number
          customer_expansion_threshold_pct?: number
          customer_gone_dark_days?: number
          customer_ramp_days?: number
          hygiene_stale_days?: number
          incumbent_lead_days?: number
          organization_id?: string
          revenue_goal_anchor_month?: string
          revenue_mom_goal_pct?: number
          updated_at?: string
          weekly_discovery_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed: boolean
          organization_id: string | null
          role: Database["public"]["Enums"]["profile_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          organization_id?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          organization_id?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_id: string | null
          category: string | null
          code: string
          code_number: number
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          owner: string | null
          started_at: string | null
          status: string
          target_end_at: string | null
          template_origin: string | null
          template_origin_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          category?: string | null
          code?: string
          code_number?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          owner?: string | null
          started_at?: string | null
          status?: string
          target_end_at?: string | null
          template_origin?: string | null
          template_origin_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          category?: string | null
          code?: string
          code_number?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          owner?: string | null
          started_at?: string | null
          status?: string
          target_end_at?: string | null
          template_origin?: string | null
          template_origin_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_deal_coverage"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_rules: {
        Row: {
          created_at: string
          duration_hours: number | null
          id: string
          is_removal: boolean
          name: string
          organization_id: string
          position: number
          priority_filter: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_hours?: number | null
          id?: string
          is_removal?: boolean
          name?: string
          organization_id: string
          position?: number
          priority_filter?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_hours?: number | null
          id?: string
          is_removal?: boolean
          name?: string
          organization_id?: string
          position?: number
          priority_filter?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_documents: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          icon: string | null
          icon_color: string | null
          id: string
          organization_id: string
          task_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          icon_color?: string | null
          id?: string
          organization_id: string
          task_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          icon_color?: string | null
          id?: string
          organization_id?: string
          task_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_relations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          relation_type: string
          source_task_id: string
          target_task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          relation_type?: string
          source_task_id: string
          target_task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          relation_type?: string
          source_task_id?: string
          target_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_relations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relations_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relations_target_task_id_fkey"
            columns: ["target_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          account_id: string | null
          assign_to: string | null
          assigned_role: string | null
          blocked_by: string | null
          blocking: string | null
          category: string | null
          code: string | null
          code_number: number | null
          created_at: string
          created_by_agent: boolean
          due_date: string | null
          due_label: string | null
          id: string
          is_done: boolean
          milestone_id: string | null
          name: string
          objective: string | null
          organization_id: string
          parent_id: string | null
          position: number
          priority: string | null
          sla_deadline: string | null
          sla_duration_hours: number | null
          sla_started_at: string | null
          source_suggestion_id: string | null
          status: string
          success_criteria: string[]
          tags: string[]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          assign_to?: string | null
          assigned_role?: string | null
          blocked_by?: string | null
          blocking?: string | null
          category?: string | null
          code?: string | null
          code_number?: number | null
          created_at?: string
          created_by_agent?: boolean
          due_date?: string | null
          due_label?: string | null
          id?: string
          is_done?: boolean
          milestone_id?: string | null
          name: string
          objective?: string | null
          organization_id: string
          parent_id?: string | null
          position?: number
          priority?: string | null
          sla_deadline?: string | null
          sla_duration_hours?: number | null
          sla_started_at?: string | null
          source_suggestion_id?: string | null
          status?: string
          success_criteria?: string[]
          tags?: string[]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          assign_to?: string | null
          assigned_role?: string | null
          blocked_by?: string | null
          blocking?: string | null
          category?: string | null
          code?: string | null
          code_number?: number | null
          created_at?: string
          created_by_agent?: boolean
          due_date?: string | null
          due_label?: string | null
          id?: string
          is_done?: boolean
          milestone_id?: string | null
          name?: string
          objective?: string | null
          organization_id?: string
          parent_id?: string | null
          position?: number
          priority?: string | null
          sla_deadline?: string | null
          sla_duration_hours?: number | null
          sla_started_at?: string | null
          source_suggestion_id?: string | null
          status?: string
          success_criteria?: string[]
          tags?: string[]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_suggestion_id_fkey"
            columns: ["source_suggestion_id"]
            isOneToOne: false
            referencedRelation: "agent_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "issue_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_deal_coverage: {
        Row: {
          account_id: string | null
          champion_engaged: boolean | null
          decision_maker_engaged: boolean | null
          engaged_contacts_count: number | null
          multi_threaded: boolean | null
          organization_id: string | null
          pipeline_phase: Database["public"]["Enums"]["pipeline_phase"] | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      dashboard_loss_reasons: {
        Args: { _org_id: string; _since?: string }
        Returns: {
          account_count: number
          loss_reason_category: Database["public"]["Enums"]["loss_reason_category"]
          lost_from_stage: Database["public"]["Enums"]["pipeline_stage"]
        }[]
      }
      dashboard_north_star_counts: {
        Args: { _org_id: string; _since?: string }
        Returns: {
          accounts_worked: number
          active_customer_count: number
          discovery_call_count: number
          qualified_opp_count: number
          signoff_count: number
          working_count: number
        }[]
      }
      get_user_org_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["profile_role"]
      }
      transition_stage: {
        Args: {
          p_account_id: string
          p_metadata?: Json
          p_new_stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Returns: Json
      }
    }
    Enums: {
      activity_channel:
        | "email"
        | "call"
        | "meeting"
        | "linkedin"
        | "whatsapp"
        | "sms"
        | "other"
      activity_direction: "inbound" | "outbound" | "internal"
      activity_outcome:
        | "positive"
        | "neutral"
        | "negative"
        | "no_response"
        | "bounced"
        | "unsubscribed"
      activity_source:
        | "manual"
        | "meeting_notes"
        | "gmail"
        | "calendar"
        | "slack"
        | "import"
        | "agent"
        | "other"
      activity_type:
        | "outreach"
        | "reply"
        | "meeting_booked"
        | "meeting_held"
        | "no_show"
        | "demo"
        | "follow_up"
        | "note"
        | "task"
        | "other"
      churn_reason:
        | "price"
        | "low_usage"
        | "poor_results"
        | "missing_features"
        | "switched_competitor"
        | "lost_champion"
        | "budget_cut"
        | "compliance"
      discovery_generated_by:
        | "human"
        | "agent_extracted"
        | "agent_extracted_human_edited"
      disqualify_reason:
        | "no_fit"
        | "no_budget"
        | "no_volume"
        | "wrong_channel"
        | "no_response"
        | "bad_timing"
        | "competitor_locked"
        | "no_internal_owner"
      founder_confidence: "low" | "medium" | "high"
      incumbent_cycle: "annual" | "biennial" | "monthly" | "unknown"
      incumbent_source: "human" | "agent" | "import"
      loss_reason_category:
        | "no_budget"
        | "no_volume"
        | "bad_timing"
        | "current_stack_sufficient"
        | "misunderstood_proposal"
        | "wrong_channel"
        | "integration_too_heavy"
        | "no_internal_owner"
        | "decision_maker_disengaged"
        | "competitor_blocks"
        | "compliance_risk"
        | "we_declined_no_fit"
      pipeline_phase: "sdr" | "sales" | "onboarding" | "customer"
      pipeline_stage:
        | "target"
        | "working"
        | "paused"
        | "disqualified"
        | "discovery_call"
        | "qualified_opportunity"
        | "business_case"
        | "sign_off"
        | "closed_lost"
        | "closed_won"
        | "setup"
        | "pilot_running"
        | "pilot_review"
        | "adoption"
        | "ramping"
        | "steady"
        | "expanding"
        | "at_risk"
        | "churned"
      profile_role: "member" | "founder"
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
