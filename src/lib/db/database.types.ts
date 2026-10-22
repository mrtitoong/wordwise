export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audio_clips: {
        Row: {
          chars: number;
          created_at: string;
          created_by: string | null;
          kind: string;
          path: string;
          voice: string;
        };
        Insert: {
          chars: number;
          created_at?: string;
          created_by?: string | null;
          kind: string;
          path: string;
          voice: string;
        };
        Update: {
          chars?: number;
          created_at?: string;
          created_by?: string | null;
          kind?: string;
          path?: string;
          voice?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          created_at: string;
          deleted_at: string | null;
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
          deleted_at?: string | null;
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
          deleted_at?: string | null;
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
      content_reports: {
        Row: {
          created_at: string;
          id: string;
          layer: string;
          note: string | null;
          reason: string;
          sense_id: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          word_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          layer: string;
          note?: string | null;
          reason: string;
          sense_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          word_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          layer?: string;
          note?: string | null;
          reason?: string;
          sense_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          word_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_reports_sense_id_fkey";
            columns: ["sense_id"];
            isOneToOne: false;
            referencedRelation: "word_senses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "words";
            referencedColumns: ["id"];
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
      llm_call_logs: {
        Row: {
          attempt: number;
          created_at: string;
          duration_ms: number;
          error: string | null;
          id: string;
          input_tokens: number | null;
          is_fallback: boolean;
          model: string;
          outcome: string;
          output_tokens: number | null;
          provider: string;
          task: string;
        };
        Insert: {
          attempt?: number;
          created_at?: string;
          duration_ms: number;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          is_fallback?: boolean;
          model: string;
          outcome: string;
          output_tokens?: number | null;
          provider: string;
          task: string;
        };
        Update: {
          attempt?: number;
          created_at?: string;
          duration_ms?: number;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          is_fallback?: boolean;
          model?: string;
          outcome?: string;
          output_tokens?: number | null;
          provider?: string;
          task?: string;
        };
        Relationships: [];
      };
      notebook_entries: {
        Row: {
          added_at: string;
          context_image_url: string | null;
          context_sentence: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          input_method: string;
          notebook_id: string;
          source: string | null;
          tags: string[];
          updated_at: string;
          user_id: string;
          user_word_id: string;
        };
        Insert: {
          added_at?: string;
          context_image_url?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          input_method: string;
          notebook_id: string;
          source?: string | null;
          tags?: string[];
          updated_at?: string;
          user_id: string;
          user_word_id: string;
        };
        Update: {
          added_at?: string;
          context_image_url?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          input_method?: string;
          notebook_id?: string;
          source?: string | null;
          tags?: string[];
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
          deleted_at: string | null;
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
          deleted_at?: string | null;
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
          deleted_at?: string | null;
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
          plan: string;
          plan_updated_at: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          plan?: string;
          plan_updated_at?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          plan?: string;
          plan_updated_at?: string | null;
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
      usage_events: {
        Row: {
          created_at: string;
          id: number;
          kind: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          kind: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          kind?: string;
          user_id?: string;
        };
        Relationships: [];
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
          multi_accent: boolean;
          onboarded_at: string | null;
          practice_speaking: boolean;
          practice_spelling: boolean;
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
          multi_accent?: boolean;
          onboarded_at?: string | null;
          practice_speaking?: boolean;
          practice_spelling?: boolean;
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
          multi_accent?: boolean;
          onboarded_at?: string | null;
          practice_speaking?: boolean;
          practice_spelling?: boolean;
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
          deleted_at: string | null;
          id: string;
          introduced_at: string | null;
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
          deleted_at?: string | null;
          id?: string;
          introduced_at?: string | null;
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
          deleted_at?: string | null;
          id?: string;
          introduced_at?: string | null;
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
      word_job_requests: {
        Row: {
          added_at: string | null;
          context_image_url: string | null;
          context_sentence: string | null;
          created_at: string;
          input_method: string | null;
          job_id: string;
          notebook_id: string | null;
          tags: string[];
          user_id: string;
          user_note: string | null;
        };
        Insert: {
          added_at?: string | null;
          context_image_url?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          input_method?: string | null;
          job_id: string;
          notebook_id?: string | null;
          tags?: string[];
          user_id: string;
          user_note?: string | null;
        };
        Update: {
          added_at?: string | null;
          context_image_url?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          input_method?: string | null;
          job_id?: string;
          notebook_id?: string | null;
          tags?: string[];
          user_id?: string;
          user_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "word_job_requests_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "word_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      word_jobs: {
        Row: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          first_started_at: string | null;
          frequency_rank: number | null;
          id: string;
          language: string;
          last_error: string | null;
          lemma: string;
          locked_at: string | null;
          pos: string | null;
          run_after: string;
          source: string;
          status: string;
          updated_at: string;
          word_id: string | null;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          finished_at?: string | null;
          first_started_at?: string | null;
          frequency_rank?: number | null;
          id?: string;
          language: string;
          last_error?: string | null;
          lemma: string;
          locked_at?: string | null;
          pos?: string | null;
          run_after?: string;
          source?: string;
          status?: string;
          updated_at?: string;
          word_id?: string | null;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          finished_at?: string | null;
          first_started_at?: string | null;
          frequency_rank?: number | null;
          id?: string;
          language?: string;
          last_error?: string | null;
          lemma?: string;
          locked_at?: string | null;
          pos?: string | null;
          run_after?: string;
          source?: string;
          status?: string;
          updated_at?: string;
          word_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "word_jobs_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "words";
            referencedColumns: ["id"];
          },
        ];
      };
      word_senses: {
        Row: {
          created_at: string;
          definition_en: string;
          id: string;
          image_checked_at: string | null;
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
          image_checked_at?: string | null;
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
          image_checked_at?: string | null;
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
          media_locked_at: string | null;
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
          media_locked_at?: string | null;
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
          media_locked_at?: string | null;
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
      claim_media_words: { Args: { p_include_images: boolean; p_limit: number }; Returns: Json };
      claim_word_jobs: { Args: { p_job_id?: string; p_limit?: number }; Returns: Json };
      complete_word_job: { Args: { p_job_id: string; p_word_id: string }; Returns: undefined };
      consume_usage: { Args: { p_kind: string; p_user_id: string }; Returns: Json };
      enqueue_bulk_words: { Args: { p_items: Json; p_language: string }; Returns: number };
      fail_word_job: {
        Args: { p_error: string; p_job_id: string; p_retry_at?: string };
        Returns: undefined;
      };
      request_word_job: {
        Args: {
          p_context_image_url?: string;
          p_context_sentence?: string;
          p_input_method?: string;
          p_language: string;
          p_lemma: string;
          p_note?: string;
          p_notebook_id?: string;
          p_pos?: string;
          p_tags?: string[];
          p_user_id: string;
        };
        Returns: Json;
      };
      save_generated_word: {
        Args: { p_details: Json; p_job_id: string; p_senses: Json; p_word: Json };
        Returns: string;
      };
      search_by_meaning: {
        Args: { p_language?: string; p_limit?: number; p_query: string };
        Returns: Json;
      };
      search_words: {
        Args: { p_language?: string; p_limit?: number; p_prefix: string };
        Returns: Json;
      };
      sentence_audio_quota: { Args: { p_user_id: string }; Returns: Json };
      suggest_spellings: { Args: { p_language?: string; p_terms: string[] }; Returns: Json };
      verify_worker_secret: { Args: { p_secret: string }; Returns: boolean };
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
