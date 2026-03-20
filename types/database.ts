export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      archives: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name?: string
          description?: string | null
        }
        Update: {
          name?: string
          description?: string | null
        }
      }
      layers: {
        Row: {
          id: string
          archive_id: string
          user_id: string
          name: string
          description: string | null
          color: string
          is_public: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          archive_id: string
          user_id: string
          name: string
          description?: string | null
          color?: string
          is_public?: boolean
          sort_order?: number
        }
        Update: {
          name?: string
          description?: string | null
          color?: string
          is_public?: boolean
          sort_order?: number
        }
      }
      photos: {
        Row: {
          id: string
          layer_id: string
          user_id: string
          storage_path: string
          filename: string
          title: string | null
          description: string | null
          lat: number | null
          lng: number | null
          taken_at: string | null
          is_public: boolean
          width: number | null
          height: number | null
          file_size: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          layer_id: string
          user_id: string
          storage_path: string
          filename: string
          title?: string | null
          description?: string | null
          lat?: number | null
          lng?: number | null
          taken_at?: string | null
          is_public?: boolean
          width?: number | null
          height?: number | null
          file_size?: number | null
        }
        Update: {
          layer_id?: string
          title?: string | null
          description?: string | null
          lat?: number | null
          lng?: number | null
          taken_at?: string | null
          is_public?: boolean
        }
      }
      map_view_settings: {
        Row: {
          id: string
          user_id: string
          center_lat: number
          center_lng: number
          zoom: number
          hidden_user_ids: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          center_lat?: number
          center_lng?: number
          zoom?: number
          hidden_user_ids?: string[]
        }
        Update: {
          center_lat?: number
          center_lng?: number
          zoom?: number
          hidden_user_ids?: string[]
        }
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Archive = Database['public']['Tables']['archives']['Row']
export type Layer = Database['public']['Tables']['layers']['Row']
export type Photo = Database['public']['Tables']['photos']['Row']
export type MapViewSettings = Database['public']['Tables']['map_view_settings']['Row']

export type PhotoWithLayer = Photo & {
  layers: Layer & {
    profiles: Profile
  }
}
