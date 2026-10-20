export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      cards: {
        Row: {
          created_at: string;
          difficulty: number;
          due: string;
          id: string;
          lapses: number;
          last_review: string | null;
          learning_steps: number;
          reps: number;
          scheduled_days: number;
          skill: string;
          stability: number;
          state: number;
          updated_at: string;
          user_id: string;
          user_word_id: string;
        };
        Insert: {
          created_at?: string;
          difficulty?: number;
          due?: string;
          id?: string;
          lapses?: number;
          last_review?: string | null;
          learning_steps?: number;
          reps?: number;
          scheduled_days?: number;
          skill: string;
          stability?: number;
          state?: number;
          updated_at?: string;
          user_id: string;
          user_word_id: string;
        };
        Update: {
          created_at?: string;
          difficulty?: number;
          due?: string;
          id?: string;
          lapses?: number;
          last_review?: string | null;
          learning_steps?: number;
          reps?: number;
          scheduled_days?: number;
          skill?: string;
          stability?: number;
          state?: number;
          updated_at?: string;
          user_id?: string;
          user_word_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cards_user_word_id_user_id_fkey";
            columns: ["user_word_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "user_words";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      curated_list_items: {
        Row: {
          admin_note: string | null;
          context_sentence: string | null;
          created_at: string;
          id: string;
          item_order: number;
          list_id: string;
          sense_id: string;
          subtopic: string | null;
          updated_at: string;
          warnings: NonNullable<Json>;
        };
        Insert: {
          admin_note?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          id?: string;
          item_order: number;
          list_id: string;
          sense_id: string;
          subtopic?: string | null;
          updated_at?: string;
          warnings?: NonNullable<Json>;
        };
        Update: {
          admin_note?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          id?: string;
          item_order?: number;
          list_id?: string;
          sense_id?: string;
          subtopic?: string | null;
          updated_at?: string;
          warnings?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "curated_list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "curated_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curated_list_items_sense_id_fkey";
            columns: ["sense_id"];
            isOneToOne: false;
            referencedRelation: "word_senses";
            referencedColumns: ["id"];
          },
        ];
      };
      curated_lists: {
        Row: {
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          language: string;
          published_at: string | null;
          purpose: string | null;
          status: string;
          suggested_days: number | null;
          target_cefr: string | null;
          title: string;
          topic: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          language: string;
          published_at?: string | null;
          purpose?: string | null;
          status?: string;
          suggested_days?: number | null;
          target_cefr?: string | null;
          title: string;
          topic?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          language?: string;
          published_at?: string | null;
          purpose?: string | null;
          status?: string;
          suggested_days?: number | null;
          target_cefr?: string | null;
          title?: string;
          topic?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          created_at: string;
          done: number;
          errors: NonNullable<Json>;
          id: string;
          kind: string;
          list_id: string | null;
          status: string;
          total: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          done?: number;
          errors?: NonNullable<Json>;
          id?: string;
          kind: string;
          list_id?: string | null;
          status?: string;
          total?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          done?: number;
          errors?: NonNullable<Json>;
          id?: string;
          kind?: string;
          list_id?: string | null;
          status?: string;
          total?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "curated_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      notebook_entries: {
        Row: {
          added_at: string;
          context_image_url: string | null;
          context_sentence: string | null;
          created_at: string;
          id: string;
          input_method: string;
          notebook_id: string;
          source: string | null;
          updated_at: string;
          user_id: string;
          user_word_id: string;
        };
        Insert: {
          added_at?: string;
          context_image_url?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          id?: string;
          input_method: string;
          notebook_id: string;
          source?: string | null;
          updated_at?: string;
          user_id: string;
          user_word_id: string;
        };
        Update: {
          added_at?: string;
          context_image_url?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          id?: string;
          input_method?: string;
          notebook_id?: string;
          source?: string | null;
          updated_at?: string;
          user_id?: string;
          user_word_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notebook_entries_notebook_id_user_id_fkey";
            columns: ["notebook_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "notebooks";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "notebook_entries_user_word_id_user_id_fkey";
            columns: ["user_word_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "user_words";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      notebooks: {
        Row: {
          cover_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_archived: boolean;
          language: string;
          name: string;
          source_list_id: string | null;
          tags: string[];
          target_date: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          language?: string;
          name: string;
          source_list_id?: string | null;
          tags?: string[];
          target_date?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          language?: string;
          name?: string;
          source_list_id?: string | null;
          tags?: string[];
          target_date?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notebooks_source_list_id_fkey";
            columns: ["source_list_id"];
            isOneToOne: false;
            referencedRelation: "curated_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      review_logs: {
        Row: {
          card_id: string;
          correct: boolean | null;
          created_at: string;
          elapsed_days: number;
          hint_level: number;
          id: string;
          is_extra: boolean;
          mode: string;
          pronunciation_score: number | null;
          rating: number;
          response_ms: number | null;
          reviewed_at: string;
          scheduled_days: number;
          state: number;
          user_id: string;
        };
        Insert: {
          card_id: string;
          correct?: boolean | null;
          created_at?: string;
          elapsed_days?: number;
          hint_level?: number;
          id?: string;
          is_extra?: boolean;
          mode: string;
          pronunciation_score?: number | null;
          rating: number;
          response_ms?: number | null;
          reviewed_at: string;
          scheduled_days?: number;
          state: number;
          user_id: string;
        };
        Update: {
          card_id?: string;
          correct?: boolean | null;
          created_at?: string;
          elapsed_days?: number;
          hint_level?: number;
          id?: string;
          is_extra?: boolean;
          mode?: string;
          pronunciation_score?: number | null;
          rating?: number;
          response_ms?: number | null;
          reviewed_at?: string;
          scheduled_days?: number;
          state?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_logs_card_id_user_id_fkey";
            columns: ["card_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      user_settings: {
        Row: {
          accent: string;
          cefr_level: string | null;
          created_at: string;
          daily_new_limit: number;
          daily_review_limit: number;
          desired_retention: number;
          fsrs_params: Json | null;
          goals: string[];
          onboarded_at: string | null;
          reminder_time: string | null;
          target_language: string;
          timezone: string;
          ui_locale: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accent?: string;
          cefr_level?: string | null;
          created_at?: string;
          daily_new_limit?: number;
          daily_review_limit?: number;
          desired_retention?: number;
          fsrs_params?: Json | null;
          goals?: string[];
          onboarded_at?: string | null;
          reminder_time?: string | null;
          target_language?: string;
          timezone?: string;
          ui_locale?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accent?: string;
          cefr_level?: string | null;
          created_at?: string;
          daily_new_limit?: number;
          daily_review_limit?: number;
          desired_retention?: number;
          fsrs_params?: Json | null;
          goals?: string[];
          onboarded_at?: string | null;
          reminder_time?: string | null;
          target_language?: string;
          timezone?: string;
          ui_locale?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_words: {
        Row: {
          added_at: string;
          created_at: string;
          custom_image_url: string | null;
          custom_meaning: string | null;
          custom_note: string | null;
          id: string;
          sense_id: string;
          status: string;
          updated_at: string;
          user_additions: NonNullable<Json>;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          created_at?: string;
          custom_image_url?: string | null;
          custom_meaning?: string | null;
          custom_note?: string | null;
          id?: string;
          sense_id: string;
          status?: string;
          updated_at?: string;
          user_additions?: NonNullable<Json>;
          user_id: string;
        };
        Update: {
          added_at?: string;
          created_at?: string;
          custom_image_url?: string | null;
          custom_meaning?: string | null;
          custom_note?: string | null;
          id?: string;
          sense_id?: string;
          status?: string;
          updated_at?: string;
          user_additions?: NonNullable<Json>;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_words_sense_id_fkey";
            columns: ["sense_id"];
            isOneToOne: false;
            referencedRelation: "word_senses";
            referencedColumns: ["id"];
          },
        ];
      };
      word_details: {
        Row: {
          antonyms: NonNullable<Json>;
          collocations: NonNullable<Json>;
          common_mistakes: NonNullable<Json>;
          created_at: string;
          examples: NonNullable<Json>;
          idioms: NonNullable<Json>;
          sense_id: string;
          synonyms: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          antonyms?: NonNullable<Json>;
          collocations?: NonNullable<Json>;
          common_mistakes?: NonNullable<Json>;
          created_at?: string;
          examples?: NonNullable<Json>;
          idioms?: NonNullable<Json>;
          sense_id: string;
          synonyms?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          antonyms?: NonNullable<Json>;
          collocations?: NonNullable<Json>;
          common_mistakes?: NonNullable<Json>;
          created_at?: string;
          examples?: NonNullable<Json>;
          idioms?: NonNullable<Json>;
          sense_id?: string;
          synonyms?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "word_details_sense_id_fkey";
            columns: ["sense_id"];
            isOneToOne: true;
            referencedRelation: "word_senses";
            referencedColumns: ["id"];
          },
        ];
      };
      word_senses: {
        Row: {
          created_at: string;
          definition_en: string;
          id: string;
          image_credit: Json | null;
          image_query: string | null;
          image_url: string | null;
          meaning_vi: string;
          sense_order: number;
          updated_at: string;
          word_id: string;
        };
        Insert: {
          created_at?: string;
          definition_en: string;
          id?: string;
          image_credit?: Json | null;
          image_query?: string | null;
          image_url?: string | null;
          meaning_vi: string;
          sense_order: number;
          updated_at?: string;
          word_id: string;
        };
        Update: {
          created_at?: string;
          definition_en?: string;
          id?: string;
          image_credit?: Json | null;
          image_query?: string | null;
          image_url?: string | null;
          meaning_vi?: string;
          sense_order?: number;
          updated_at?: string;
          word_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "word_senses_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "words";
            referencedColumns: ["id"];
          },
        ];
      };
      words: {
        Row: {
          audio_uk_url: string | null;
          audio_us_url: string | null;
          cefr: string | null;
          created_at: string;
          details: NonNullable<Json>;
          forms: NonNullable<Json>;
          frequency_rank: number | null;
          generated_by: string | null;
          id: string;
          ipa_uk: string | null;
          ipa_us: string | null;
          is_hidden: boolean;
          language: string;
          lemma: string;
          pos: string;
          register: string | null;
          reviewed: boolean;
          schema_version: number;
          updated_at: string;
        };
        Insert: {
          audio_uk_url?: string | null;
          audio_us_url?: string | null;
          cefr?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          forms?: NonNullable<Json>;
          frequency_rank?: number | null;
          generated_by?: string | null;
          id?: string;
          ipa_uk?: string | null;
          ipa_us?: string | null;
          is_hidden?: boolean;
          language: string;
          lemma: string;
          pos: string;
          register?: string | null;
          reviewed?: boolean;
          schema_version?: number;
          updated_at?: string;
        };
        Update: {
          audio_uk_url?: string | null;
          audio_us_url?: string | null;
          cefr?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          forms?: NonNullable<Json>;
          frequency_rank?: number | null;
          generated_by?: string | null;
          id?: string;
          ipa_uk?: string | null;
          ipa_us?: string | null;
          is_hidden?: boolean;
          language?: string;
          lemma?: string;
          pos?: string;
          register?: string | null;
          reviewed?: boolean;
          schema_version?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: "user" | "admin" | "teacher";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      user_role: ["user", "admin", "teacher"],
    },
  },
} as const;
