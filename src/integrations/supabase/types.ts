export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
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
        Relationships: []
      }
      chats: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          match_id: string
          message: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          match_id: string
          message: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          match_id?: string
          message?: string
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
            foreignKeyName: "chats_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          last_msg_at: string | null
          user1_id: string
          user1_unread_count: number | null
          user2_id: string
          user2_unread_count: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_msg_at?: string | null
          user1_id: string
          user1_unread_count?: number | null
          user2_id: string
          user2_unread_count?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          last_msg_at?: string | null
          user1_id?: string
          user1_unread_count?: number | null
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
          created_at: string
          id: string
          payment_methods: Json
          premium_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_methods?: Json
          premium_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_methods?: Json
          premium_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string | null
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
          first_name: string
          fun_fact: string | null
          gender: string | null
          id: string
          industry: string | null
          interests: string[] | null
          introvert_extrovert: number | null
          is_admin: boolean | null
          is_custom_city: boolean | null
          last_googled: string | null
          last_name: string
          latitude: number | null
          like_me_cooldown_until: string | null
          longitude: number | null
          max_distance: number | null
          messy_organized: number | null
          occupation: string | null
          perfect_first_date: string | null
          preference: string
          relationship_intent: string | null
          sleeping_schedule: string | null
          smoking: string | null
          spontaneous_planner: number | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          account_status?: string | null
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
          first_name: string
          fun_fact?: string | null
          gender?: string | null
          id: string
          industry?: string | null
          interests?: string[] | null
          introvert_extrovert?: number | null
          is_admin?: boolean | null
          is_custom_city?: boolean | null
          last_googled?: string | null
          last_name: string
          latitude?: number | null
          like_me_cooldown_until?: string | null
          longitude?: number | null
          max_distance?: number | null
          messy_organized?: number | null
          occupation?: string | null
          perfect_first_date?: string | null
          preference: string
          relationship_intent?: string | null
          sleeping_schedule?: string | null
          smoking?: string | null
          spontaneous_planner?: number | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          account_status?: string | null
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
          first_name?: string
          fun_fact?: string | null
          gender?: string | null
          id?: string
          industry?: string | null
          interests?: string[] | null
          introvert_extrovert?: number | null
          is_admin?: boolean | null
          is_custom_city?: boolean | null
          last_googled?: string | null
          last_name?: string
          latitude?: number | null
          like_me_cooldown_until?: string | null
          longitude?: number | null
          max_distance?: number | null
          messy_organized?: number | null
          occupation?: string | null
          perfect_first_date?: string | null
          preference?: string
          relationship_intent?: string | null
          sleeping_schedule?: string | null
          smoking?: string | null
          spontaneous_planner?: number | null
          updated_at?: string | null
          zip_code?: string | null
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
          flagged_content: string[] | null
          id: string
          image_order: number
          image_url: string
          is_approved: boolean | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          flagged_content?: string[] | null
          id?: string
          image_order: number
          image_url: string
          is_approved?: boolean | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          flagged_content?: string[] | null
          id?: string
          image_order?: number
          image_url?: string
          is_approved?: boolean | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
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
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          flutterwave_transaction_id: string | null
          id: string
          plan_name: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          flutterwave_transaction_id?: string | null
          id?: string
          plan_name: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          flutterwave_transaction_id?: string | null
          id?: string
          plan_name?: string
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
            isOneToOne: false
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_match: {
        Args: { user1_id: string; user2_id: string }
        Returns: undefined
      }
      admin_update_account_status: {
        Args: { target_user_id: string; new_status: string }
        Returns: undefined
      }
      approve_image: {
        Args: { image_id: string; admin_notes?: string }
        Returns: boolean
      }
      calculate_distance: {
        Args: { lat1: number; lon1: number; lat2: number; lon2: number }
        Returns: number
      }
      create_admin_user: {
        Args: {
          admin_email: string
          admin_password: string
          admin_name: string
        }
        Returns: Json
      }
      delete_old_messages: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      delete_user_and_data: {
        Args: { user_id_to_delete: string }
        Returns: undefined
      }
      find_matches_by_location: {
        Args: { user_id: string; max_distance_km?: number }
        Returns: {
          profile_id: string
          distance_km: number
          city: string
          country_code: string
        }[]
      }
      get_app_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_user_subscription: {
        Args: { user_id_param: string }
        Returns: Json
      }
      increment_unread_count: {
        Args: { match_id_input: string; field_name: string }
        Returns: undefined
      }
      reject_image: {
        Args: { image_id: string; admin_notes?: string }
        Returns: boolean
      }
      update_user_usage: {
        Args: {
          user_id_param: string
          usage_type: string
          increment_by?: number
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
