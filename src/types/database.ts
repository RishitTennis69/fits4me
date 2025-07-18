export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          user_id: string;
          photo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          photo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          photo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      fit_analyses: {
        Row: {
          id: string;
          user_id: string;
          clothing_name: string;
          clothing_url: string;
          preferred_size: string;
          fit_score: number;
          recommendation: string;
          overlay_image: string | null;
          created_at: string;
          likes: number;
          comments: number;
          views: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          clothing_name: string;
          clothing_url: string;
          preferred_size: string;
          fit_score: number;
          recommendation: string;
          overlay_image?: string | null;
          created_at?: string;
          likes?: number;
          comments?: number;
          views?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          clothing_name?: string;
          clothing_url?: string;
          preferred_size?: string;
          fit_score?: number;
          recommendation?: string;
          overlay_image?: string | null;
          created_at?: string;
          likes?: number;
          comments?: number;
          views?: number;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
} 