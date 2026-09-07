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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action_type: string
          admin_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          target_user_id: string | null
          target_user_id_2: string | null
        }
        Insert: {
          action_type: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_user_id?: string | null
          target_user_id_2?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_user_id?: string | null
          target_user_id_2?: string | null
        }
        Relationships: []
      }
      ads: {
        Row: {
          about: string
          budget_per_day: number | null
          business_name: string | null
          campaign_ends_at: string | null
          campaign_started_at: string | null
          clicks: number
          contact_email: string | null
          contact_phone: string | null
          contact_phone_country: string | null
          created_at: string
          created_by: string | null
          duration_days: number | null
          estimated_impressions_max: number | null
          estimated_impressions_min: number | null
          id: string
          image_url: string
          impressions: number
          is_active: boolean
          link: string | null
          link_as: string | null
          media_type: string
          name: string
          placement: string
          stripe_payment_intent_id: string | null
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_genders: string[]
          total_budget: number | null
          video_url: string | null
        }
        Insert: {
          about: string
          budget_per_day?: number | null
          business_name?: string | null
          campaign_ends_at?: string | null
          campaign_started_at?: string | null
          clicks?: number
          contact_email?: string | null
          contact_phone?: string | null
          contact_phone_country?: string | null
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          estimated_impressions_max?: number | null
          estimated_impressions_min?: number | null
          id?: string
          image_url: string
          impressions?: number
          is_active?: boolean
          link?: string | null
          link_as?: string | null
          media_type?: string
          name: string
          placement?: string
          stripe_payment_intent_id?: string | null
          target_age_max?: number | null
          target_age_min?: number | null
          target_countries?: string[] | null
          target_genders?: string[]
          total_budget?: number | null
          video_url?: string | null
        }
        Update: {
          about?: string
          budget_per_day?: number | null
          business_name?: string | null
          campaign_ends_at?: string | null
          campaign_started_at?: string | null
          clicks?: number
          contact_email?: string | null
          contact_phone?: string | null
          contact_phone_country?: string | null
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          estimated_impressions_max?: number | null
          estimated_impressions_min?: number | null
          id?: string
          image_url?: string
          impressions?: number
          is_active?: boolean
          link?: string | null
          link_as?: string | null
          media_type?: string
          name?: string
          placement?: string
          stripe_payment_intent_id?: string | null
          target_age_max?: number | null
          target_age_min?: number | null
          target_countries?: string[] | null
          target_genders?: string[]
          total_budget?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advertiser_profiles: {
        Row: {
          business_name: string
          card_brand: string | null
          card_last4: string | null
          contact_email: string
          contact_phone: string
          contact_phone_country: string
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          terms_accepted_at: string
          updated_at: string
        }
        Insert: {
          business_name: string
          card_brand?: string | null
          card_last4?: string | null
          contact_email: string
          contact_phone: string
          contact_phone_country: string
          created_at?: string
          id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          terms_accepted_at?: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          card_brand?: string | null
          card_last4?: string | null
          contact_email?: string
          contact_phone?: string
          contact_phone_country?: string
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          terms_accepted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertiser_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertiser_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      app_update_config: {
        Row: {
          android_version: string | null
          app_store_url: string | null
          created_at: string
          current_version: string
          id: string
          ios_version: string | null
          is_enabled: boolean
          play_store_url: string | null
          target_platform: string
          universal_link: string | null
          update_message: string | null
          updated_at: string
        }
        Insert: {
          android_version?: string | null
          app_store_url?: string | null
          created_at?: string
          current_version?: string
          id?: string
          ios_version?: string | null
          is_enabled?: boolean
          play_store_url?: string | null
          target_platform?: string
          universal_link?: string | null
          update_message?: string | null
          updated_at?: string
        }
        Update: {
          android_version?: string | null
          app_store_url?: string | null
          created_at?: string
          current_version?: string
          id?: string
          ios_version?: string | null
          is_enabled?: boolean
          play_store_url?: string | null
          target_platform?: string
          universal_link?: string | null
          update_message?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_campaigns: {
        Row: {
          admin_id: string | null
          created_at: string | null
          failed_sends: number | null
          id: string
          message: string
          notification_type: string | null
          save_to_profile: boolean
          status: string | null
          successful_sends: number | null
          target_countries: string[] | null
          title: string
          total_recipients: number | null
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          failed_sends?: number | null
          id?: string
          message: string
          notification_type?: string | null
          save_to_profile?: boolean
          status?: string | null
          successful_sends?: number | null
          target_countries?: string[] | null
          title: string
          total_recipients?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          failed_sends?: number | null
          id?: string
          message?: string
          notification_type?: string | null
          save_to_profile?: boolean
          status?: string | null
          successful_sends?: number | null
          target_countries?: string[] | null
          title?: string
          total_recipients?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_campaigns_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          processing_started_at: string | null
          profile_deleted_at: string | null
          profile_read_at: string | null
          retry_count: number | null
          sent_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          processing_started_at?: string | null
          profile_deleted_at?: string | null
          profile_read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          processing_started_at?: string | null
          profile_deleted_at?: string | null
          profile_read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "broadcast_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          deleted_for: string[] | null
          id: string
          is_read: boolean | null
          match_id: string
          message: string
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          created_at?: string
          deleted_for?: string[] | null
          id?: string
          is_read?: boolean | null
          match_id: string
          message: string
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          created_at?: string
          deleted_for?: string[] | null
          id?: string
          is_read?: boolean | null
          match_id?: string
          message?: string
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_active_stats: {
        Row: {
          active_count: number
          created_at: string | null
          id: string
          stat_date: string
          updated_at: string | null
        }
        Insert: {
          active_count?: number
          created_at?: string | null
          id?: string
          stat_date: string
          updated_at?: string | null
        }
        Update: {
          active_count?: number
          created_at?: string | null
          id?: string
          stat_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      deleted_account_emails: {
        Row: {
          country_code: string | null
          deleted_at: string
          email: string
          former_user_id: string
          id: string
        }
        Insert: {
          country_code?: string | null
          deleted_at?: string
          email: string
          former_user_id: string
          id?: string
        }
        Update: {
          country_code?: string | null
          deleted_at?: string
          email?: string
          former_user_id?: string
          id?: string
        }
        Relationships: []
      }
      discover_feed_events: {
        Row: {
          created_at: string
          direction: string | null
          event_type: string
          id: string
          liker_id: string
          liker_last_active_days: number | null
          mechanism: string
          position_in_deck: number | null
          resulted_in_match: boolean | null
          viewer_id: string
        }
        Insert: {
          created_at?: string
          direction?: string | null
          event_type: string
          id?: string
          liker_id: string
          liker_last_active_days?: number | null
          mechanism: string
          position_in_deck?: number | null
          resulted_in_match?: boolean | null
          viewer_id: string
        }
        Update: {
          created_at?: string
          direction?: string | null
          event_type?: string
          id?: string
          liker_id?: string
          liker_last_active_days?: number | null
          mechanism?: string
          position_in_deck?: number | null
          resulted_in_match?: boolean | null
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discover_feed_events_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discover_feed_events_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_account_usage: {
        Row: {
          account_email: string
          send_date: string
          sent_count: number
        }
        Insert: {
          account_email: string
          send_date: string
          sent_count?: number
        }
        Update: {
          account_email?: string
          send_date?: string
          sent_count?: number
        }
        Relationships: []
      }
      email_broadcast_history: {
        Row: {
          admin_id: string | null
          created_at: string | null
          error_details: Json | null
          failed_sends: number
          id: string
          message: string
          recipient_count: number
          recipient_filter: string | null
          status: string
          subject: string
          successful_sends: number
          target_countries: string[] | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          error_details?: Json | null
          failed_sends?: number
          id?: string
          message: string
          recipient_count?: number
          recipient_filter?: string | null
          status?: string
          subject: string
          successful_sends?: number
          target_countries?: string[] | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          error_details?: Json | null
          failed_sends?: number
          id?: string
          message?: string
          recipient_count?: number
          recipient_filter?: string | null
          status?: string
          subject?: string
          successful_sends?: number
          target_countries?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "email_broadcast_history_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_queue: {
        Row: {
          attempt_count: number
          broadcast_id: string
          created_at: string | null
          error: string | null
          id: string
          recipient: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          broadcast_id: string
          created_at?: string | null
          error?: string | null
          id?: string
          recipient: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          broadcast_id?: string
          created_at?: string | null
          error?: string | null
          id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_queue_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "email_broadcast_history"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppression_list: {
        Row: {
          broadcast_id: string | null
          created_at: string
          email: string
          last_error: string | null
          reason: string
        }
        Insert: {
          broadcast_id?: string | null
          created_at?: string
          email: string
          last_error?: string | null
          reason: string
        }
        Update: {
          broadcast_id?: string | null
          created_at?: string
          email?: string
          last_error?: string | null
          reason?: string
        }
        Relationships: []
      }
      enabled_countries: {
        Row: {
          country_code: string
          country_name: string
          created_at: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          country_code: string
          country_name: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          country_code?: string
          country_name?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      influencer_commissions: {
        Row: {
          commission_amount: number
          commission_percentage: number
          created_at: string | null
          deduction_number: number
          id: string
          payment_amount: number
          payment_id: string
          promo_code_id: string
          user_id: string | null
        }
        Insert: {
          commission_amount: number
          commission_percentage: number
          created_at?: string | null
          deduction_number?: number
          id?: string
          payment_amount: number
          payment_id: string
          promo_code_id: string
          user_id?: string | null
        }
        Update: {
          commission_amount?: number
          commission_percentage?: number
          created_at?: string | null
          deduction_number?: number
          id?: string
          payment_amount?: number
          payment_id?: string
          promo_code_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "influencer_commissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influencer_commissions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influencer_commissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_secrets: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          id: string
          liked_id: string
          liker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          liked_id: string
          liker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          liked_id?: string
          liker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          dormancy_check_asked_at: string | null
          first_message_at: string | null
          id: string
          last_msg_at: string | null
          user1_heading_somewhere: boolean | null
          user1_id: string
          user1_unread_count: number | null
          user2_heading_somewhere: boolean | null
          user2_id: string
          user2_unread_count: number | null
        }
        Insert: {
          created_at?: string
          dormancy_check_asked_at?: string | null
          first_message_at?: string | null
          id?: string
          last_msg_at?: string | null
          user1_heading_somewhere?: boolean | null
          user1_id: string
          user1_unread_count?: number | null
          user2_heading_somewhere?: boolean | null
          user2_id: string
          user2_unread_count?: number | null
        }
        Update: {
          created_at?: string
          dormancy_check_asked_at?: string | null
          first_message_at?: string | null
          id?: string
          last_msg_at?: string | null
          user1_heading_somewhere?: boolean | null
          user1_id?: string
          user1_unread_count?: number | null
          user2_heading_somewhere?: boolean | null
          user2_id?: string
          user2_unread_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          related_user_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          related_user_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          related_user_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passes: {
        Row: {
          id: string
          passed_at: string | null
          passed_id: string | null
          passer_id: string | null
        }
        Insert: {
          id?: string
          passed_at?: string | null
          passed_id?: string | null
          passer_id?: string | null
        }
        Update: {
          id?: string
          passed_at?: string | null
          passed_id?: string | null
          passer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passes_passed_id_fkey"
            columns: ["passed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_passer_id_fkey"
            columns: ["passer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_config: {
        Row: {
          country_prices: Json | null
          created_at: string
          currency: string
          default_international_currency: string | null
          default_international_price: number | null
          enabled_countries: Json | null
          id: string
          payment_methods: Json
          paystack_plan_code: string | null
          premium_price: number
          premium_price_monthly: number | null
          updated_at: string
        }
        Insert: {
          country_prices?: Json | null
          created_at?: string
          currency?: string
          default_international_currency?: string | null
          default_international_price?: number | null
          enabled_countries?: Json | null
          id?: string
          payment_methods?: Json
          paystack_plan_code?: string | null
          premium_price?: number
          premium_price_monthly?: number | null
          updated_at?: string
        }
        Update: {
          country_prices?: Json | null
          created_at?: string
          currency?: string
          default_international_currency?: string | null
          default_international_price?: number | null
          enabled_countries?: Json | null
          id?: string
          payment_methods?: Json
          paystack_plan_code?: string | null
          premium_price?: number
          premium_price_monthly?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          processed_at: string | null
          processed_by: string | null
          promo_code_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          promo_code_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          promo_code_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      paystack_authorizations: {
        Row: {
          authorization_code: string
          bank: string | null
          brand: string | null
          card_type: string | null
          channel: string | null
          created_at: string
          default_amount: number
          default_currency: string
          email: string | null
          exp_month: number | null
          exp_year: number | null
          id: string
          last4: string | null
          reusable: boolean | null
          signature: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          authorization_code: string
          bank?: string | null
          brand?: string | null
          card_type?: string | null
          channel?: string | null
          created_at?: string
          default_amount: number
          default_currency: string
          email?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          last4?: string | null
          reusable?: boolean | null
          signature?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          authorization_code?: string
          bank?: string | null
          brand?: string | null
          card_type?: string | null
          channel?: string | null
          created_at?: string
          default_amount?: number
          default_currency?: string
          email?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          last4?: string | null
          reusable?: boolean | null
          signature?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paystack_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paystack_charge_attempts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          gateway_response: string | null
          id: string
          paystack_response: Json | null
          reference: string
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          gateway_response?: string | null
          id?: string
          paystack_response?: Json | null
          reference: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          gateway_response?: string | null
          id?: string
          paystack_response?: Json | null
          reference?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paystack_charge_attempts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paystack_charge_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_users_history: {
        Row: {
          created_at: string
          first_premium_at: string
          id: string
          last_premium_at: string
          total_subscription_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          first_premium_at?: string
          id?: string
          last_premium_at?: string
          total_subscription_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          first_premium_at?: string
          id?: string
          last_premium_at?: string
          total_subscription_count?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string | null
          communication_style: string[] | null
          family_plans: string | null
          height_cm: number | null
          languages: string[] | null
          love_style: string[] | null
          pets: string[] | null
          social_media: string | null
          adinkra_symbols: string[] | null
          bio: string | null
          city: string | null
          country: string
          country_code: string | null
          created_at: string | null
          date_of_birth: string
          distance_preference: number | null
          drinking: string | null
          education_level: string | null
          email: string
          exercise_level: string | null
          face_descriptor: string | null
          favorites: Json
          first_name: string
          fun_fact: string | null
          gender: string | null
          id: string
          industry: string | null
          interests: string[] | null
          introvert_extrovert: number | null
          is_admin: boolean | null
          is_archived: boolean | null
          is_custom_city: boolean | null
          is_verified: boolean
          last_googled: string | null
          last_login_at: string | null
          last_name: string
          latitude: number | null
          like_me_cooldown_until: string | null
          login_count: number | null
          longitude: number | null
          max_age: number | null
          max_distance: number | null
          messy_organized: number | null
          min_age: number | null
          occupation: string | null
          perfect_first_date: string | null
          preference: string
          preferred_language: string | null
          profile_completion: number
          promo_code_used: string | null
          relationship_intent: string | null
          sleeping_schedule: string | null
          smoking: string | null
          spontaneous_planner: number | null
          terms_accepted: boolean | null
          terms_accepted_at: string | null
          total_swipe_count: number
          unlocked_countries: string[] | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          account_status?: string | null
          communication_style?: string[] | null
          family_plans?: string | null
          height_cm?: number | null
          languages?: string[] | null
          love_style?: string[] | null
          pets?: string[] | null
          social_media?: string | null
          adinkra_symbols?: string[] | null
          bio?: string | null
          city?: string | null
          country: string
          country_code?: string | null
          created_at?: string | null
          date_of_birth: string
          distance_preference?: number | null
          drinking?: string | null
          education_level?: string | null
          email: string
          exercise_level?: string | null
          face_descriptor?: string | null
          favorites?: Json
          first_name: string
          fun_fact?: string | null
          gender?: string | null
          id: string
          industry?: string | null
          interests?: string[] | null
          introvert_extrovert?: number | null
          is_admin?: boolean | null
          is_archived?: boolean | null
          is_custom_city?: boolean | null
          is_verified?: boolean
          last_googled?: string | null
          last_login_at?: string | null
          last_name: string
          latitude?: number | null
          like_me_cooldown_until?: string | null
          login_count?: number | null
          longitude?: number | null
          max_age?: number | null
          max_distance?: number | null
          messy_organized?: number | null
          min_age?: number | null
          occupation?: string | null
          perfect_first_date?: string | null
          preference: string
          preferred_language?: string | null
          profile_completion?: number
          promo_code_used?: string | null
          relationship_intent?: string | null
          sleeping_schedule?: string | null
          smoking?: string | null
          spontaneous_planner?: number | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          total_swipe_count?: number
          unlocked_countries?: string[] | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          account_status?: string | null
          communication_style?: string[] | null
          family_plans?: string | null
          height_cm?: number | null
          languages?: string[] | null
          love_style?: string[] | null
          pets?: string[] | null
          social_media?: string | null
          adinkra_symbols?: string[] | null
          bio?: string | null
          city?: string | null
          country?: string
          country_code?: string | null
          created_at?: string | null
          date_of_birth?: string
          distance_preference?: number | null
          drinking?: string | null
          education_level?: string | null
          email?: string
          exercise_level?: string | null
          face_descriptor?: string | null
          favorites?: Json
          first_name?: string
          fun_fact?: string | null
          gender?: string | null
          id?: string
          industry?: string | null
          interests?: string[] | null
          introvert_extrovert?: number | null
          is_admin?: boolean | null
          is_archived?: boolean | null
          is_custom_city?: boolean | null
          is_verified?: boolean
          last_googled?: string | null
          last_login_at?: string | null
          last_name?: string
          latitude?: number | null
          like_me_cooldown_until?: string | null
          login_count?: number | null
          longitude?: number | null
          max_age?: number | null
          max_distance?: number | null
          messy_organized?: number | null
          min_age?: number | null
          occupation?: string | null
          perfect_first_date?: string | null
          preference?: string
          preferred_language?: string | null
          profile_completion?: number
          promo_code_used?: string | null
          relationship_intent?: string | null
          sleeping_schedule?: string | null
          smoking?: string | null
          spontaneous_planner?: number | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          total_swipe_count?: number
          unlocked_countries?: string[] | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          commission_duration: number | null
          commission_enabled: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          owner_name: string
          password_hash: string | null
          percentage_cut: number
          show_demographics_enabled: boolean
          show_leads_enabled: boolean
          show_subscribers_enabled: boolean
          status: string | null
          terms_accepted_at: string | null
          total_commission_earned: number | null
          total_paid_subscribers: number | null
          total_signups: number | null
          updated_at: string
        }
        Insert: {
          code: string
          commission_duration?: number | null
          commission_enabled?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          owner_name: string
          password_hash?: string | null
          percentage_cut?: number
          show_demographics_enabled?: boolean
          show_leads_enabled?: boolean
          show_subscribers_enabled?: boolean
          status?: string | null
          terms_accepted_at?: string | null
          total_commission_earned?: number | null
          total_paid_subscribers?: number | null
          total_signups?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          commission_duration?: number | null
          commission_enabled?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          owner_name?: string
          password_hash?: string | null
          percentage_cut?: number
          show_demographics_enabled?: boolean
          show_leads_enabled?: boolean
          show_subscribers_enabled?: boolean
          status?: string | null
          terms_accepted_at?: string | null
          total_commission_earned?: number | null
          total_paid_subscribers?: number | null
          total_signups?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      redirects: {
        Row: {
          android_url: string | null
          clicks: number | null
          created_at: string | null
          created_by: string | null
          id: string
          ios_url: string | null
          last_clicked_at: string | null
          updated_at: string | null
          web_url: string
        }
        Insert: {
          android_url?: string | null
          clicks?: number | null
          created_at?: string | null
          created_by?: string | null
          id: string
          ios_url?: string | null
          last_clicked_at?: string | null
          updated_at?: string | null
          web_url: string
        }
        Update: {
          android_url?: string | null
          clicks?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          ios_url?: string | null
          last_clicked_at?: string | null
          updated_at?: string | null
          web_url?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          promo_code_id: string
          user_deleted_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          promo_code_id: string
          user_deleted_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          promo_code_id?: string
          user_deleted_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reported_chats: {
        Row: {
          admin_id: string | null
          admin_notes: string | null
          chat_id: string
          created_at: string | null
          description: string | null
          id: string
          reason: string | null
          reported_user_id: string | null
          reporter_id: string | null
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          admin_id?: string | null
          admin_notes?: string | null
          chat_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          reported_user_id?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          admin_id?: string | null
          admin_notes?: string | null
          chat_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          reported_user_id?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reported_chats_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_chats_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_chats_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reported_images: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          image_url: string
          reason: string | null
          reported_at: string
          reported_user_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          image_url: string
          reason?: string | null
          reported_at?: string
          reported_user_id: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          image_url?: string
          reason?: string | null
          reported_at?: string
          reported_user_id?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_broadcast_history: {
        Row: {
          error_message: string | null
          failed_sends: number | null
          id: string
          scheduled_broadcast_id: string
          sent_at: string | null
          successful_sends: number | null
          total_recipients: number | null
        }
        Insert: {
          error_message?: string | null
          failed_sends?: number | null
          id?: string
          scheduled_broadcast_id: string
          sent_at?: string | null
          successful_sends?: number | null
          total_recipients?: number | null
        }
        Update: {
          error_message?: string | null
          failed_sends?: number | null
          id?: string
          scheduled_broadcast_id?: string
          sent_at?: string | null
          successful_sends?: number | null
          total_recipients?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_broadcast_history_scheduled_broadcast_id_fkey"
            columns: ["scheduled_broadcast_id"]
            isOneToOne: false
            referencedRelation: "scheduled_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_broadcasts: {
        Row: {
          admin_id: string
          channel: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          message: string
          next_send_at: string | null
          repeat_type: string
          specific_day: string | null
          target_countries: string[] | null
          time_to_send: string
          title: string
          total_sends: number | null
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          channel?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          message: string
          next_send_at?: string | null
          repeat_type: string
          specific_day?: string | null
          target_countries?: string[] | null
          time_to_send: string
          title: string
          total_sends?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          channel?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          message?: string
          next_send_at?: string | null
          repeat_type?: string
          specific_day?: string | null
          target_countries?: string[] | null
          time_to_send?: string
          title?: string
          total_sends?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          payment_method: string | null
          promo_code_id: string | null
          subscription_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method?: string | null
          promo_code_id?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method?: string | null
          promo_code_id?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string
          features: Json | null
          id: string
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          currency?: string
          features?: Json | null
          id?: string
          name: string
          price: number
        }
        Update: {
          created_at?: string
          currency?: string
          features?: Json | null
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      user_images: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          face_similarity: number | null
          flagged_content: string[] | null
          id: string
          image_order: number
          image_url: string
          is_approved: boolean | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_labels: Json | null
          moderation_notes: string | null
          moderation_reason: string | null
          moderation_status: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          face_similarity?: number | null
          flagged_content?: string[] | null
          id?: string
          image_order: number
          image_url: string
          is_approved?: boolean | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_labels?: Json | null
          moderation_notes?: string | null
          moderation_reason?: string | null
          moderation_status?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          face_similarity?: number | null
          flagged_content?: string[] | null
          id?: string
          image_order?: number
          image_url?: string
          is_approved?: boolean | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_labels?: Json | null
          moderation_notes?: string | null
          moderation_reason?: string | null
          moderation_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_moderated_by"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_referral_deductions: {
        Row: {
          created_at: string | null
          deductions_used: number | null
          id: string
          promo_code_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deductions_used?: number | null
          id?: string
          promo_code_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deductions_used?: number | null
          id?: string
          promo_code_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_referral_deductions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_referral_deductions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stats_history: {
        Row: {
          id: string
          stat_type: string
          stat_value: number
          updated_at: string
        }
        Insert: {
          id?: string
          stat_type: string
          stat_value?: number
          updated_at?: string
        }
        Update: {
          id?: string
          stat_type?: string
          stat_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          auto_renew: boolean | null
          country: string | null
          created_at: string
          expires_at: string | null
          flutterwave_transaction_id: string | null
          id: string
          next_billing_date: string | null
          original_transaction_id: string | null
          payment_attempts: number | null
          payment_method: string | null
          plan_name: string
          provider_transaction_id: string | null
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          country?: string | null
          created_at?: string
          expires_at?: string | null
          flutterwave_transaction_id?: string | null
          id?: string
          next_billing_date?: string | null
          original_transaction_id?: string | null
          payment_attempts?: number | null
          payment_method?: string | null
          plan_name: string
          provider_transaction_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          country?: string | null
          created_at?: string
          expires_at?: string | null
          flutterwave_transaction_id?: string | null
          id?: string
          next_billing_date?: string | null
          original_transaction_id?: string | null
          payment_attempts?: number | null
          payment_method?: string | null
          plan_name?: string
          provider_transaction_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_name_fkey"
            columns: ["plan_name"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_usage: {
        Row: {
          created_at: string
          date: string
          id: string
          reverse_dislikes_used: number
          swipes_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          reverse_dislikes_used?: number
          swipes_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          reverse_dislikes_used?: number
          swipes_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      web_ratings: {
        Row: {
          created_at: string
          id: number
          platform: string
          rating_value: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          platform?: string
          rating_value: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          platform?: string
          rating_value?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_influencer_terms: {
        Args: { p_code: string; p_password: string }
        Returns: Json
      }
      admin_cancel_premium_subscription: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      admin_create_match: {
        Args: { p_user1_id: string; p_user2_id: string }
        Returns: Json
      }
      admin_force_expire_subscriptions: {
        Args: never
        Returns: {
          expired_count: number
          message: string
        }[]
      }
      admin_get_current_premium_users_count: { Args: never; Returns: number }
      admin_get_premium_status_for_users: {
        Args: { target_user_ids: string[] }
        Returns: {
          is_premium: boolean
          user_id: string
        }[]
      }
      admin_get_promo_setup_link: {
        Args: { p_promo_code_id: string }
        Returns: Json
      }
      admin_get_user_premium_status: {
        Args: { target_user_id: string }
        Returns: {
          expires_at: string
          is_premium: boolean
          plan_name: string
          status: string
        }[]
      }
      admin_set_influencer_password: {
        Args: { p_new_password: string; p_promo_code_id: string }
        Returns: Json
      }
      admin_set_premium_subscription: {
        Args: { months_count: number; target_user_id: string }
        Returns: boolean
      }
      admin_update_account_status: {
        Args: { new_status: string; target_user_id: string }
        Returns: undefined
      }
      approve_image: {
        Args: { admin_notes?: string; image_id: string }
        Returns: boolean
      }
      auto_archive_inactive_users: { Args: never; Returns: undefined }
      calculate_distance: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      cancel_user_subscription: { Args: never; Returns: undefined }
      check_and_dissolve_expired_matches: {
        Args: never
        Returns: {
          dissolved_count: number
          notified_count: number
        }[]
      }
      claim_broadcast_recipients: {
        Args: {
          p_batch_size: number
          p_campaign_id: string
          p_max_retries: number
        }
        Returns: {
          id: string
          retry_count: number
          user_id: string
        }[]
      }
      cleanup_incomplete_users: { Args: never; Returns: undefined }
      clear_face_review: {
        Args: { admin_notes?: string; image_id: string }
        Returns: boolean
      }
      create_admin_user: {
        Args: {
          admin_email: string
          admin_name: string
          admin_password: string
        }
        Returns: Json
      }
      delete_match_with_chats: {
        Args: { match_id_param: string }
        Returns: undefined
      }
      delete_my_profile_broadcast_message: {
        Args: { p_recipient_id: string }
        Returns: boolean
      }
      delete_old_messages: { Args: never; Returns: undefined }
      delete_user_and_data: {
        Args: { user_id_to_delete: string }
        Returns: undefined
      }
      find_matches_by_location:
        | {
            Args: { max_distance_km?: number; user_id: string }
            Returns: {
              city: string
              country_code: string
              distance_km: number
              profile_id: string
            }[]
          }
        | {
            Args: { max_distance_km?: number; user_id: string }
            Returns: {
              city: string
              country_code: string
              distance_km: number
              profile_id: string
            }[]
          }
      get_active_users_for_date: {
        Args: { target_date: string }
        Returns: number
      }
      get_admin_stats: { Args: never; Returns: Json }
      get_all_time_premium_count: { Args: never; Returns: number }
      get_app_stats: { Args: never; Returns: Json }
      get_current_subscription_status: {
        Args: { p_user_id: string }
        Returns: {
          expires_at: string
          is_active: boolean
          plan_name: string
          status: string
        }[]
      }
      get_enabled_countries: {
        Args: never
        Returns: {
          country_code: string
          country_name: string
        }[]
      }
      get_influencer_full_stats: {
        Args: { p_promo_code_id: string }
        Returns: Json
      }
      get_influencer_lead_demographics: {
        Args: { p_code: string; p_password: string }
        Returns: Json
      }
      get_influencer_referred_users: {
        Args: { p_code: string; p_password: string }
        Returns: Json
      }
      get_influencer_stats_usd: {
        Args: { p_promo_code_id: string }
        Returns: Json
      }
      get_my_profile_broadcast_messages: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          campaign_id: string
          created_at: string
          message: string
          profile_read_at: string
          recipient_id: string
          sent_at: string
          title: string
        }[]
      }
      get_my_profile_broadcast_unread_count: { Args: never; Returns: number }
      get_random_discover_profiles: {
        Args: {
          p_allowed_genders: string[]
          p_allowed_ids?: string[]
          p_archived: boolean
          p_country_codes: string[]
          p_excluded_ids?: string[]
          p_lat?: number
          p_limit?: number
          p_lon?: number
          p_radius_degrees?: number
        }
        Returns: {
          account_status: string | null
          adinkra_symbols: string[] | null
          bio: string | null
          city: string | null
          country: string
          country_code: string | null
          created_at: string | null
          date_of_birth: string
          distance_preference: number | null
          drinking: string | null
          education_level: string | null
          email: string
          exercise_level: string | null
          face_descriptor: string | null
          favorites: Json
          first_name: string
          fun_fact: string | null
          gender: string | null
          id: string
          industry: string | null
          interests: string[] | null
          introvert_extrovert: number | null
          is_admin: boolean | null
          is_archived: boolean | null
          is_custom_city: boolean | null
          is_verified: boolean
          last_googled: string | null
          last_login_at: string | null
          last_name: string
          latitude: number | null
          like_me_cooldown_until: string | null
          login_count: number | null
          longitude: number | null
          max_age: number | null
          max_distance: number | null
          messy_organized: number | null
          min_age: number | null
          occupation: string | null
          perfect_first_date: string | null
          preference: string
          preferred_language: string | null
          profile_completion: number
          promo_code_used: string | null
          relationship_intent: string | null
          sleeping_schedule: string | null
          smoking: string | null
          spontaneous_planner: number | null
          terms_accepted: boolean | null
          terms_accepted_at: string | null
          total_swipe_count: number
          unlocked_countries: string[] | null
          updated_at: string | null
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_subscription: {
        Args: { user_id_param: string }
        Returns: {
          auto_renew: boolean
          expires_at: string
          features: Json
          next_billing_date: string
          plan_name: string
          status: string
        }[]
      }
      handle_payment_failure: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: boolean
      }
      handle_subscription_expiry: { Args: never; Returns: undefined }
      handle_subscription_payment: {
        Args: {
          p_amount: number
          p_currency?: string
          p_transaction_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      increment_ad_click: { Args: { ad_id: string }; Returns: undefined }
      increment_ad_impression: { Args: { ad_id: string }; Returns: undefined }
      increment_email_account_usage: {
        Args: { p_account_email: string; p_amount?: number }
        Returns: number
      }
      increment_redirect_clicks:
        | {
            Args: { redirect_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.increment_redirect_clicks(redirect_id => text), public.increment_redirect_clicks(redirect_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { redirect_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.increment_redirect_clicks(redirect_id => text), public.increment_redirect_clicks(redirect_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      increment_swipe_count: {
        Args: { user_id_param: string }
        Returns: number
      }
      increment_unread_count: {
        Args: { field_name: string; match_id_input: string }
        Returns: undefined
      }
      influencer_login: {
        Args: { code_input: string; password_input: string }
        Returns: Json
      }
      like_and_usage_batched: {
        Args: {
          liked_id_param: string
          liker_id_param: string
          premium_param?: boolean
        }
        Returns: Json
      }
      mark_my_profile_broadcast_message_read: {
        Args: { p_recipient_id: string }
        Returns: boolean
      }
      mark_my_profile_broadcasts_read: { Args: never; Returns: number }
      pass_and_usage_batched: {
        Args: {
          passed_id_param: string
          passer_id_param: string
          premium_param: boolean
        }
        Returns: Json
      }
      process_referral_commission: {
        Args: {
          p_payment_amount: number
          p_payment_id: string
          p_user_id: string
        }
        Returns: Json
      }
      record_daily_active_count: { Args: never; Returns: undefined }
      record_premium_subscription: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      reject_image: {
        Args: { admin_notes?: string; image_id: string }
        Returns: boolean
      }
      release_stale_broadcast_recipients: {
        Args: { p_stale_after: string }
        Returns: number
      }
      remove_email_suppression: {
        Args: { target_email: string }
        Returns: boolean
      }
      request_influencer_payout: {
        Args: { p_amount_ghs: number; p_code: string; p_password: string }
        Returns: Json
      }
      set_influencer_password: {
        Args: {
          p_new_password: string
          p_promo_code_id: string
          p_token: string
        }
        Returns: Json
      }
      test_subscription_info: { Args: { user_id_param: string }; Returns: Json }
      update_user_usage: {
        Args: {
          increment_by?: number
          usage_type: string
          user_id_param: string
        }
        Returns: Json
      }
      validate_promo_code: { Args: { code_input: string }; Returns: Json }
      validate_promo_code_setup_link: {
        Args: { p_promo_code_id: string; p_token: string }
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
  public: {
    Enums: {},
  },
} as const
