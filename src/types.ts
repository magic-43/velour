// Central application types for Velour v2

export type UserRole = 'fan' | 'creator' | 'admin';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  email: string | null;
  role: UserRole;
  is_banned: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface CreatorProfile {
  id: string;
  owner_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  category: string | null;
  tags: string[];
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  owner?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export type StoryAudienceType = 'all' | 'exclude' | 'include';

export interface AudienceSettings {
  type: StoryAudienceType;
  userIds: string[];
}

export interface Story {
  id: string;
  creator_profile_id: string;
  creator_id?: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: 'image' | 'video';
  caption: string | null;
  published_at: string;
  expires_at: string | null;
  view_count: number;
  audience_type?: StoryAudienceType;
  audience_user_ids?: string[];
  is_hd?: boolean;
}

export interface StoryWithCreator extends Story {
  creator_profile: CreatorProfile;
}

export interface TransitionSlide {
  id: string;
  kind: 'transition';
  title: string;
  description: string;
  eyebrow?: string;
}

export type FeedSlide = Story | TransitionSlide;

export interface ArchiveGroup {
  dateKey: string;
  label: string;
  items: Story[];
}

export interface HomeStorySession {
  creator: CreatorProfile;
  stories: Story[];
  archivedStories: Story[];
  archiveGroups: ArchiveGroup[];
  slides: FeedSlide[];
  unviewedCount?: number;
  firstUnviewedIndex?: number;
  isAllViewed?: boolean;
}

export interface CreatorStorySession {
  creator: CreatorProfile;
  stories: Story[];
}

export interface Conversation {
  id: string;
  fan_id: string;
  creator_profile_id: string;
  fan_unread: number;
  creator_unread: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  created_at: string;
}

// Conversation joined with both participant profiles
export interface ConversationWithParticipants extends Conversation {
  fan: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'last_seen_at'>;
  creator_profile: {
    id: string;
    owner_id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export type MessageType = 'text' | 'attachment' | 'voice_note' | 'system';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'fan' | 'creator';
  content: string | null;
  message_type: MessageType;
  reply_to_id: string | null;
  reactions: Record<string, string[]>; // emoji → user IDs
  is_deleted: boolean;
  deleted_at: string | null;
  edited_at: string | null;
  status: MessageStatus;
  read_at: string | null;
  created_at: string;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  sender_id: string;
  conversation_id: string;
  storage_path: string;
  public_url: string | null;
  thumbnail_url: string | null;
  mime_type: string;
  file_name: string | null;
  file_size: number | null;
  duration_secs: number | null;
  is_locked: boolean;
  unlock_price_usd: number | null;
  batch_id: string | null;
  created_at: string;
}

export interface AttachmentUnlock {
  id: string;
  attachment_id: string;
  fan_id: string;
  amount_usd: number;
  status: 'pending' | 'verified' | 'rejected';
  unlocked_at: string;
}

export interface UserBalance {
  user_id: string;
  total_earned: number;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'attachment_unlock' | 'stars_earned' | 'withdrawal_request';
  amount_usd: number;
  status: 'pending' | 'verified' | 'rejected';
  attachment_id: string | null;
  reference: string | null;
  description: string | null;
  created_at: string;
}

export interface AISidebarSession {
  id: string;
  creator_profile_id: string;
  conversation_id: string;
  messages: Array<{ role: 'user' | 'model'; content: string; timestamp: string }>;
  created_at: string;
  updated_at: string;
}

export type Creator = any;
export type WishlistItem = any;
