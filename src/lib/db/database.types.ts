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
      curated_list_candidates: {
        Row: {
          cefr: string | null;
          context_sentence: string | null;
          created_at: string;
          dropped: string | null;
          frequency_rank: number | null;
          id: string;
          item_order: number | null;
          job_created: boolean;
          job_id: string;
          lemma: string | null;
          list_id: string;
          meaning_hint: string | null;
          note: string | null;
          occurrences: number;
          pos: string | null;
          position: number;
          rare: boolean;
          sense_confidence: number | null;
          sense_id: string | null;
          sense_method: string | null;
          spelling_from: string | null;
          stage: string;
          subtopic: string | null;
          surface: string;
          tags: string[];
          updated_at: string;
          warnings: NonNullable<Json>;
          word_id: string | null;
          word_job_id: string | null;
        };
        Insert: {
          cefr?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          dropped?: string | null;
          frequency_rank?: number | null;
          id?: string;
          item_order?: number | null;
          job_created?: boolean;
          job_id: string;
          lemma?: string | null;
          list_id: string;
          meaning_hint?: string | null;
          note?: string | null;
          occurrences?: number;
          pos?: string | null;
          position: number;
          rare?: boolean;
          sense_confidence?: number | null;
          sense_id?: string | null;
          sense_method?: string | null;
          spelling_from?: string | null;
          stage?: string;
          subtopic?: string | null;
          surface: string;
          tags?: string[];
          updated_at?: string;
          warnings?: NonNullable<Json>;
          word_id?: string | null;
          word_job_id?: string | null;
        };
        Update: {
          cefr?: string | null;
          context_sentence?: string | null;
          created_at?: string;
          dropped?: string | null;
          frequency_rank?: number | null;
          id?: string;
          item_order?: number | null;
          job_created?: boolean;
          job_id?: string;
          lemma?: string | null;
          list_id?: string;
          meaning_hint?: string | null;
          note?: string | null;
          occurrences?: number;
          pos?: string | null;
          position?: number;
          rare?: boolean;
          sense_confidence?: number | null;
          sense_id?: string | null;
          sense_method?: string | null;
          spelling_from?: string | null;
          stage?: string;
          subtopic?: string | null;
          surface?: string;
          tags?: string[];
          updated_at?: string;
          warnings?: NonNullable<Json>;
          word_id?: string | null;
          word_job_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "curated_list_candidates_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curated_list_candidates_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "curated_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curated_list_candidates_sense_id_fkey";
            columns: ["sense_id"];
            isOneToOne: false;
            referencedRelation: "word_senses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curated_list_candidates_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "words";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curated_list_candidates_word_job_id_fkey";
            columns: ["word_job_id"];
            isOneToOne: false;
            referencedRelation: "word_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      curated_list_items: {
        Row: {
          accepted: boolean;
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
          accepted?: boolean;
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
          accepted?: boolean;
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
      curated_list_release_items: {
        Row: {
          admin_note: string | null;
          context_sentence: string | null;
          item_order: number;
          list_id: string;
          sense_id: string;
          subtopic: string | null;
          version: number;
          warnings: NonNullable<Json>;
        };
        Insert: {
          admin_note?: string | null;
          context_sentence?: string | null;
          item_order: number;
          list_id: string;
          sense_id: string;
          subtopic?: string | null;
          version: number;
          warnings?: NonNullable<Json>;
        };
        Update: {
          admin_note?: string | null;
          context_sentence?: string | null;
          item_order?: number;
          list_id?: string;
          sense_id?: string;
          subtopic?: string | null;
          version?: number;
          warnings?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "curated_list_release_items_list_id_version_fkey";
            columns: ["list_id", "version"];
            isOneToOne: false;
            referencedRelation: "curated_list_releases";
            referencedColumns: ["list_id", "version"];
          },
          {
            foreignKeyName: "curated_list_release_items_sense_id_fkey";
            columns: ["sense_id"];
            isOneToOne: false;
            referencedRelation: "word_senses";
            referencedColumns: ["id"];
          },
        ];
      };
      curated_list_releases: {
        Row: {
          added_sense_ids: string[];
          list_id: string;
          published_at: string;
          published_by: string | null;
          removed_sense_ids: string[];
          version: number;
          word_count: number;
        };
        Insert: {
          added_sense_ids?: string[];
          list_id: string;
          published_at?: string;
          published_by?: string | null;
          removed_sense_ids?: string[];
          version: number;
          word_count: number;
        };
        Update: {
          added_sense_ids?: string[];
          list_id?: string;
          published_at?: string;
          published_by?: string | null;
          removed_sense_ids?: string[];
          version?: number;
          word_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "curated_list_releases_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "curated_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      curated_list_sources: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          id: string;
          item_count: number;
          kind: string;
          list_id: string;
          name: string | null;
        };
        Insert: {
          content: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_count?: number;
          kind: string;
          list_id: string;
          name?: string | null;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_count?: number;
          kind?: string;
          list_id?: string;
          name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "curated_list_sources_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "curated_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      curated_lists: {
        Row: {
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
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
          description?: string | null;
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
          description?: string | null;
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
          attempts: number;
          cost_usd: number;
          created_at: string;
          done: number;
          errors: NonNullable<Json>;
          finished_at: string | null;
          id: string;
          input_tokens: number;
          kind: string;
          list_id: string | null;
          locked_at: string | null;
          options: NonNullable<Json>;
          output_tokens: number;
          run_after: string;
          started_at: string | null;
          state: NonNullable<Json>;
          status: string;
          step: string;
          total: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          done?: number;
          errors?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          input_tokens?: number;
          kind: string;
          list_id?: string | null;
          locked_at?: string | null;
          options?: NonNullable<Json>;
          output_tokens?: number;
          run_after?: string;
          started_at?: string | null;
          state?: NonNullable<Json>;
          status?: string;
          step?: string;
          total?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          done?: number;
          errors?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          input_tokens?: number;
          kind?: string;
          list_id?: string | null;
          locked_at?: string | null;
          options?: NonNullable<Json>;
          output_tokens?: number;
          run_after?: string;
          started_at?: string | null;
          state?: NonNullable<Json>;
          status?: string;
          step?: string;
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
          source_list_version: number | null;
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
          source_list_version?: number | null;
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
          source_list_version?: number | null;
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
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_sent_at: string | null;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_sent_at?: string | null;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_sent_at?: string | null;
          p256dh?: string;
          user_agent?: string | null;
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
          cost_usd: number;
          created_at: string;
          finished_at: string | null;
          first_started_at: string | null;
          frequency_rank: number | null;
          id: string;
          input_tokens: number;
          language: string;
          last_error: string | null;
          lemma: string;
          locked_at: string | null;
          output_tokens: number;
          pos: string | null;
          run_after: string;
          source: string;
          status: string;
          updated_at: string;
          user_retries: number;
          word_id: string | null;
        };
        Insert: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          finished_at?: string | null;
          first_started_at?: string | null;
          frequency_rank?: number | null;
          id?: string;
          input_tokens?: number;
          language: string;
          last_error?: string | null;
          lemma: string;
          locked_at?: string | null;
          output_tokens?: number;
          pos?: string | null;
          run_after?: string;
          source?: string;
          status?: string;
          updated_at?: string;
          user_retries?: number;
          word_id?: string | null;
        };
        Update: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          finished_at?: string | null;
          first_started_at?: string | null;
          frequency_rank?: number | null;
          id?: string;
          input_tokens?: number;
          language?: string;
          last_error?: string | null;
          lemma?: string;
          locked_at?: string | null;
          output_tokens?: number;
          pos?: string | null;
          run_after?: string;
          source?: string;
          status?: string;
          updated_at?: string;
          user_retries?: number;
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
          content_updated_at: string | null;
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
          content_updated_at?: string | null;
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
          content_updated_at?: string | null;
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
      add_word_job_usage: {
        Args: {
          p_cost_usd: number;
          p_input_tokens: number;
          p_job_id: string;
          p_output_tokens: number;
        };
        Returns: undefined;
      };
      admin_accept_list_items: {
        Args: { p_accepted: boolean; p_item_ids: string[]; p_list_id: string };
        Returns: number;
      };
      admin_discard_list_draft: { Args: { p_list_id: string }; Returns: undefined };
      admin_list_overview: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          item_count: number;
          job_done: number;
          job_id: string;
          job_status: string;
          job_step: string;
          job_total: number;
          language: string;
          learner_count: number;
          source_count: number;
          status: string;
          target_cefr: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_stats: { Args: { p_list_id: string }; Returns: Json };
      admin_open_list_draft: { Args: { p_list_id: string }; Returns: undefined };
      admin_publish_list: { Args: { p_list_id: string }; Returns: number };
      admin_remove_list_item: {
        Args: { p_item_id: string; p_list_id: string };
        Returns: undefined;
      };
      admin_reorder_list_items: {
        Args: { p_item_ids: string[]; p_list_id: string };
        Returns: undefined;
      };
      admin_save_word: {
        Args: { p_details: Json; p_senses: Json; p_word: Json; p_word_id: string };
        Returns: undefined;
      };
      admin_set_item_sense: {
        Args: { p_item_id: string; p_list_id: string; p_sense_id: string };
        Returns: undefined;
      };
      claim_due_reminders: {
        Args: { p_now?: string };
        Returns: {
          locale: string;
          news: number;
          reviews: number;
          user_id: string;
        }[];
      };
      claim_list_job: { Args: Record<PropertyKey, never>; Returns: Json };
      claim_media_words: { Args: { p_include_images: boolean; p_limit: number }; Returns: Json };
      claim_word_jobs: { Args: { p_job_id?: string; p_limit?: number }; Returns: Json };
      complete_word_job: { Args: { p_job_id: string; p_word_id: string }; Returns: undefined };
      consume_usage: { Args: { p_kind: string; p_user_id: string }; Returns: Json };
      enqueue_admin_words: { Args: { p_items: Json; p_language: string }; Returns: Json };
      enqueue_bulk_words: { Args: { p_items: Json; p_language: string }; Returns: number };
      fail_list_job: { Args: { p_error: string; p_job_id: string }; Returns: string };
      fail_word_job: {
        Args: { p_error: string; p_job_id: string; p_retry_at?: string };
        Returns: undefined;
      };
      finish_list_analysis: { Args: { p_job_id: string; p_summary: Json }; Returns: number };
      kick_list_worker_now: { Args: Record<PropertyKey, never>; Returns: number };
      kick_word_worker_now: { Args: Record<PropertyKey, never>; Returns: number };
      library_lists: { Args: { p_list_id?: string }; Returns: Json };
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
      retry_list_analysis: { Args: { p_job_id: string }; Returns: undefined };
      retry_word_job: { Args: { p_job_id: string }; Returns: string };
      save_generated_word: {
        Args: { p_details: Json; p_job_id: string; p_senses: Json; p_word: Json };
        Returns: string;
      };
      save_list_candidates: {
        Args: { p_job_id: string; p_replace_raw?: boolean; p_rows: Json };
        Returns: number;
      };
      save_list_job: {
        Args: {
          p_cost_usd?: number;
          p_done: number;
          p_input_tokens?: number;
          p_job_id: string;
          p_keep_lock?: boolean;
          p_output_tokens?: number;
          p_state: Json;
          p_step: string;
          p_total: number;
          p_wait_seconds?: number;
        };
        Returns: undefined;
      };
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string; p_user_agent?: string };
        Returns: undefined;
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
      start_list_analysis: { Args: { p_list_id: string; p_options?: Json }; Returns: string };
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
