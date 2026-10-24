
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "application_game_ids": {
                  Row: {
                    "application_id": string,"game_account_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"game_account_id": string
                  }
                  Update: {
                    "application_id"?: string,"game_account_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_game_ids_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "applicant_id": string,"created_at": string,"declined_at": string | null,"ended_at": string | null,"enthusiasm": number | null,"id": string,"matched_at": string | null,"mode": string | null,"platform": string | null,"platform_other": string | null,"recruitment_id": string,"skill": number | null,"usual_time_end": string | null,"usual_time_start": string | null,"voice_chat": string | null,"state": Database["public"]['Enums']["application_state"] | null
                  }
                  ComputedFields: "state"
                  Insert: {
                    "applicant_id": string,"created_at"?: string,"declined_at"?: string | null,"ended_at"?: string | null,"enthusiasm"?: number | null,"id"?: string,"matched_at"?: string | null,"mode"?: string | null,"platform"?: string | null,"platform_other"?: string | null,"recruitment_id": string,"skill"?: number | null,"usual_time_end"?: string | null,"usual_time_start"?: string | null,"voice_chat"?: string | null
                  }
                  Update: {
                    "applicant_id"?: string,"created_at"?: string,"declined_at"?: string | null,"ended_at"?: string | null,"enthusiasm"?: number | null,"id"?: string,"matched_at"?: string | null,"mode"?: string | null,"platform"?: string | null,"platform_other"?: string | null,"recruitment_id"?: string,"skill"?: number | null,"usual_time_end"?: string | null,"usual_time_start"?: string | null,"voice_chat"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_applicant_id_fkey"
      columns: ["applicant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_recruitment_id_fkey"
      columns: ["recruitment_id"]
isOneToOne: false
      referencedRelation: "recruitments"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "alternative_names": (string)[],"cover_image_id": string | null,"fetched_at": string,"first_release_date": string | null,"hide_cover": boolean,"id": number,"name": string,"platforms": (string)[],"popularity": number | null,"steam_app_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alternative_names"?: (string)[],"cover_image_id"?: string | null,"fetched_at"?: string,"first_release_date"?: string | null,"hide_cover"?: boolean,"id": number,"name": string,"platforms"?: (string)[],"popularity"?: number | null,"steam_app_id"?: number | null
                  }
                  Update: {
                    "alternative_names"?: (string)[],"cover_image_id"?: string | null,"fetched_at"?: string,"first_release_date"?: string | null,"hide_cover"?: boolean,"id"?: number,"name"?: string,"platforms"?: (string)[],"popularity"?: number | null,"steam_app_id"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"integration_api_budgets": {
                  Row: {
                    "next_at": string,"service": string
                  }
                  ComputedFields: never
                  Insert: {
                    "next_at"?: string,"service": string
                  }
                  Update: {
                    "next_at"?: string,"service"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_api_leases": {
                  Row: {
                    "expires_at": string,"id": string,"service": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at": string,"id"?: string,"service": string
                  }
                  Update: {
                    "expires_at"?: string,"id"?: string,"service"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_api_leases_service_fkey"
      columns: ["service"]
isOneToOne: false
      referencedRelation: "integration_api_budgets"
      referencedColumns: ["service"]
    }
                  ]
                },"integration_attempts": {
                  Row: {
                    "consumed_at": string | null,"created_at": string,"expires_at": string,"generation": string,"provider": string,"return_to": string,"session_id": string,"state_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_at"?: string | null,"created_at": string,"expires_at": string,"generation": string,"provider": string,"return_to": string,"session_id": string,"state_hash": string,"user_id": string
                  }
                  Update: {
                    "consumed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"generation"?: string,"provider"?: string,"return_to"?: string,"session_id"?: string,"state_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_link_guards": {
                  Row: {
                    "generation": string,"provider": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "generation"?: string,"provider": string,"user_id": string
                  }
                  Update: {
                    "generation"?: string,"provider"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_links": {
                  Row: {
                    "external_id": string,"id": string,"lease_until": string | null,"next_attempt_at": string | null,"provider": string,"revision": string,"snapshot": Json | null,"token_ciphertext": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "external_id": string,"id"?: string,"lease_until"?: string | null,"next_attempt_at"?: string | null,"provider": string,"revision"?: string,"snapshot"?: Json | null,"token_ciphertext"?: string | null,"user_id": string
                  }
                  Update: {
                    "external_id"?: string,"id"?: string,"lease_until"?: string | null,"next_attempt_at"?: string | null,"provider"?: string,"revision"?: string,"snapshot"?: Json | null,"token_ciphertext"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_login_attempts": {
                  Row: {
                    "expires_at": string,"payload": NonNullable<Json>,"state_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at": string,"payload": NonNullable<Json>,"state_hash": string
                  }
                  Update: {
                    "expires_at"?: string,"payload"?: NonNullable<Json>,"state_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_login_codes": {
                  Row: {
                    "challenge": string,"code_hash": string,"expires_at": string,"redirect_uri": string,"steam_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "challenge": string,"code_hash": string,"expires_at": string,"redirect_uri": string,"steam_id": string
                  }
                  Update: {
                    "challenge"?: string,"code_hash"?: string,"expires_at"?: string,"redirect_uri"?: string,"steam_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_login_tokens": {
                  Row: {
                    "expires_at": string,"steam_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at": string,"steam_id": string,"token_hash": string
                  }
                  Update: {
                    "expires_at"?: string,"steam_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_push_deliveries": {
                  Row: {
                    "accepted_at": string | null,"attempts": number,"device_id": string,"event": NonNullable<Json>,"event_id": string,"lease_until": string | null,"next_attempt_at": string,"revision": string,"status": string,"ticket_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"attempts"?: number,"device_id": string,"event": NonNullable<Json>,"event_id": string,"lease_until"?: string | null,"next_attempt_at"?: string,"revision"?: string,"status"?: string,"ticket_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"attempts"?: number,"device_id"?: string,"event"?: NonNullable<Json>,"event_id"?: string,"lease_until"?: string | null,"next_attempt_at"?: string,"revision"?: string,"status"?: string,"ticket_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_push_deliveries_device_id_fkey"
      columns: ["device_id"]
isOneToOne: false
      referencedRelation: "integration_push_devices"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_push_devices": {
                  Row: {
                    "id": string,"session_id": string,"token_ciphertext": string,"token_hash": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"session_id": string,"token_ciphertext": string,"token_hash": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"session_id"?: string,"token_ciphertext"?: string,"token_hash"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "application_id": string | null,"created_at": string,"id": number,"kind": Database["public"]['Enums']["notification_kind"],"read_at": string | null,"recruitment_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"created_at"?: string,"id"?: never,"kind": Database["public"]['Enums']["notification_kind"],"read_at"?: string | null,"recruitment_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "application_id"?: string | null,"created_at"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["notification_kind"],"read_at"?: string | null,"recruitment_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_recruitment_id_fkey"
      columns: ["recruitment_id"]
isOneToOne: false
      referencedRelation: "recruitments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "app_id": string | null,"created_at": string,"id": string,"nickname": string | null,"region": Database["public"]['Enums']["region"] | null,"updated_at": string,"usual_time_end": string | null,"usual_time_start": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "app_id"?: string | null,"created_at"?: string,"id": string,"nickname"?: string | null,"region"?: Database["public"]['Enums']["region"] | null,"updated_at"?: string,"usual_time_end"?: string | null,"usual_time_start"?: string | null
                  }
                  Update: {
                    "app_id"?: string | null,"created_at"?: string,"id"?: string,"nickname"?: string | null,"region"?: Database["public"]['Enums']["region"] | null,"updated_at"?: string,"usual_time_end"?: string | null,"usual_time_start"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recruitment_meetings": {
                  Row: {
                    "invite_url": string | null,"recruitment_id": string,"room_code": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "invite_url"?: string | null,"recruitment_id": string,"room_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "invite_url"?: string | null,"recruitment_id"?: string,"room_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recruitment_meetings_recruitment_id_fkey"
      columns: ["recruitment_id"]
isOneToOne: true
      referencedRelation: "recruitments"
      referencedColumns: ["id"]
    }
                  ]
                },"recruitments": {
                  Row: {
                    "cancelled_at": string | null,"capacity": number | null,"closed_manually_at": string | null,"created_at": string,"enthusiasm": number | null,"game_id": number,"id": string,"mode": string | null,"needs_participant_id": boolean,"owner_id": string,"platform": string | null,"platform_other": string | null,"play_ended_at": string | null,"play_started_at": string | null,"skill": number | null,"starts_at": string | null,"updated_at": string,"usual_time_end": string | null,"usual_time_start": string | null,"voice_chat": string | null,"matched_count": number | null,"status": Database["public"]['Enums']["recruitment_status"] | null
                  }
                  ComputedFields: "matched_count" | "status"
                  Insert: {
                    "cancelled_at"?: string | null,"capacity"?: number | null,"closed_manually_at"?: string | null,"created_at"?: string,"enthusiasm"?: number | null,"game_id": number,"id"?: string,"mode"?: string | null,"needs_participant_id": boolean,"owner_id": string,"platform"?: string | null,"platform_other"?: string | null,"play_ended_at"?: string | null,"play_started_at"?: string | null,"skill"?: number | null,"starts_at"?: string | null,"updated_at"?: string,"usual_time_end"?: string | null,"usual_time_start"?: string | null,"voice_chat"?: string | null
                  }
                  Update: {
                    "cancelled_at"?: string | null,"capacity"?: number | null,"closed_manually_at"?: string | null,"created_at"?: string,"enthusiasm"?: number | null,"game_id"?: number,"id"?: string,"mode"?: string | null,"needs_participant_id"?: boolean,"owner_id"?: string,"platform"?: string | null,"platform_other"?: string | null,"play_ended_at"?: string | null,"play_started_at"?: string | null,"skill"?: number | null,"starts_at"?: string | null,"updated_at"?: string,"usual_time_end"?: string | null,"usual_time_start"?: string | null,"voice_chat"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recruitments_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recruitments_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_to_recruitment":
{ Args: { "p_enthusiasm"?: number,"p_game_account_id"?: string,"p_mode"?: string,"p_op_id": string,"p_platform"?: string,"p_platform_other"?: string,"p_recruitment_id": string,"p_skill"?: number,"p_usual_time_end"?: string,"p_usual_time_start"?: string,"p_voice_chat"?: string }; Returns: Json
                           },
"approve_application":
{ Args: { "p_application_id": string,"p_op_id": string }; Returns: Json
                           },
"change_recruitment":
{ Args: { "p_action": string,"p_op_id": string,"p_recruitment_id": string }; Returns: Json
                           },
"integration_begin_link":
{ Args: { "p_created": string,"p_expires": string,"p_provider": string,"p_return": string,"p_session": string,"p_state": string,"p_user": string }; Returns: undefined
                           },
"integration_claim_igdb":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"integration_finish_link":
{ Args: { "p_ciphertext": string,"p_external": string,"p_provider": string,"p_session": string,"p_state": string,"p_user": string }; Returns: boolean
                           },
"integration_login_consume_attempt":
{ Args: { "p_hash": string,"p_now": string }; Returns: Json
                           },
"integration_login_consume_code":
{ Args: { "p_challenge": string,"p_hash": string,"p_now": string,"p_redirect": string }; Returns: Json
                           },
"integration_unlink":
{ Args: { "p_provider": string,"p_user": string }; Returns: undefined
                           },
"matched_count":
{ Args: { "r": Omit<Database["public"]['Tables']["recruitments"]['Row'], Database["public"]['Tables']["recruitments"]['ComputedFields']> }; Returns: number
                           },
"publish_recruitment":
{ Args: { "p_capacity"?: number,"p_enthusiasm"?: number,"p_game_id": number,"p_invite_url"?: string,"p_mode"?: string,"p_needs_participant_id": boolean,"p_op_id": string,"p_platform"?: string,"p_platform_other"?: string,"p_room_code"?: string,"p_skill"?: number,"p_starts_at"?: string,"p_usual_time_end"?: string,"p_usual_time_start"?: string,"p_voice_chat"?: string }; Returns: Json
                           },
"recruitments_for_game":
{ Args: { "p_first"?: string,"p_game_id": number }; Returns: {
              "cancelled_at": string | null,
"capacity": number | null,
"closed_manually_at": string | null,
"created_at": string,
"enthusiasm": number | null,
"game_id": number,
"id": string,
"mode": string | null,
"needs_participant_id": boolean,
"owner_id": string,
"platform": string | null,
"platform_other": string | null,
"play_ended_at": string | null,
"play_started_at": string | null,
"skill": number | null,
"starts_at": string | null,
"updated_at": string,
"usual_time_end": string | null,
"usual_time_start": string | null,
"voice_chat": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "recruitments"
        isOneToOne: false
        isSetofReturn: true
      } },
"state":
{ Args: { "a": Omit<Database["public"]['Tables']["applications"]['Row'], Database["public"]['Tables']["applications"]['ComputedFields']> }; Returns: Database["public"]['Enums']["application_state"]
                           },
"status":
{ Args: { "r": Omit<Database["public"]['Tables']["recruitments"]['Row'], Database["public"]['Tables']["recruitments"]['ComputedFields']> }; Returns: Database["public"]['Enums']["recruitment_status"]
                           },
"update_meeting":
{ Args: { "p_invite_url"?: string,"p_op_id": string,"p_recruitment_id": string,"p_room_code"?: string }; Returns: Json
                           }
          }
          Enums: {
            "application_state": "待っている"|"成立"|"終了"|"辞退"|"開催中止"|"遊び終了","notification_kind": "参加希望が届いた"|"承認された","recruitment_status": "出ている"|"追加受付中"|"満員で終了"|"手動で終了"|"締め切りで終了"|"開催中止"|"遊び終了","region": "北海道・東北"|"関東"|"甲信越"|"北陸"|"東海"|"近畿"|"中国"|"四国"|"九州・沖縄"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "application_state": ["待っている", "成立", "終了", "辞退", "開催中止", "遊び終了"],"notification_kind": ["参加希望が届いた", "承認された"],"recruitment_status": ["出ている", "追加受付中", "満員で終了", "手動で終了", "締め切りで終了", "開催中止", "遊び終了"],"region": ["北海道・東北", "関東", "甲信越", "北陸", "東海", "近畿", "中国", "四国", "九州・沖縄"]
          }
        }
} as const
