export type MessageDirection = 'inbound' | 'outbound';
export type SenderType = 'contact' | 'human_user' | 'ai_assistant' | 'system_campaign';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'template' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive';
export type ConsentStatus = 'opted_in' | 'opted_out' | 'pending';
export type ConversationStatus = 'open' | 'closed' | 'archived';
export type AiStatus = 'active' | 'paused_by_user' | 'disabled';
export type WhatsAppAccountStatus = 'connected' | 'disconnected' | 'error';
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'canceled';
export type CampaignRecipientStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed_optout';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppAccount {
  id: string;
  user_id: string;
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: WhatsAppAccountStatus;
  verify_token: string;
  error_message: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  phone_number: string;
  name: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
  notes: string | null;
  consent_status: ConsentStatus;
  consent_date: string | null;
  opt_out_date: string | null;
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  contact_id: string;
  whatsapp_account_id: string | null;
  status: ConversationStatus;
  ai_status: AiStatus;
  ai_paused_until: string | null;
  last_message_at: string;
  last_incoming_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  contact?: Contact;
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  contact_id: string;
  whatsapp_message_id: string | null;
  direction: MessageDirection;
  sender_type: SenderType;
  message_type: MessageType;
  content: string;
  template_name: string | null;
  template_data: Record<string, unknown> | null;
  media_url: string | null;
  status: MessageStatus;
  error_code: string | null;
  error_message: string | null;
  raw_payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MessageTemplate {
  id: string;
  user_id: string;
  whatsapp_account_id: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  body_text: string;
  header_type: string | null;
  footer_text: string | null;
  buttons: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  variable_count: number;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  whatsapp_account_id: string;
  name: string;
  template_id: string | null;
  template_variables: Record<string, string>;
  status: CampaignStatus;
  scheduled_at: string | null;
  target_tags: string[];
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  opted_out_count: number;
  created_at: string;
  updated_at: string;
  template?: MessageTemplate;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  contact_id: string;
  phone_number: string;
  status: CampaignRecipientStatus;
  whatsapp_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  contact?: Contact;
}

export interface AiSettings {
  id: string;
  user_id: string;
  is_enabled: boolean;
  assistant_name: string;
  system_prompt: string;
  auto_model_selection: boolean;
  selected_model: string;
  fallback_models: string[];
  temperature: number;
  max_tokens: number;
  language_preference: 'multilingual' | 'english' | 'hinglish' | 'hindi' | 'marathi';
  pause_duration_minutes: number;
  custom_api_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiConversationMemory {
  id: string;
  conversation_id: string;
  contact_id: string;
  user_id: string;
  summary: string | null;
  key_facts: string[];
  sentiment: string | null;
  last_interaction_at: string;
  created_at: string;
  updated_at: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  is_free: boolean;
}
