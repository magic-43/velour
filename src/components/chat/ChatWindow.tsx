import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { useMessages, type MessageWithSender } from '../../lib/hooks/useMessages';
import MessageBubble, { DateSeparator } from './MessageBubble';
import MessageInput from './MessageInput';
import HomeStoryFeed from '../stories/HomeStoryFeed';
import { supabase } from '../../lib/supabase';
import type { Story, CreatorProfile, HomeStorySession } from '../../types';
import type { StoryReplyMetadata } from '../../lib/storyReplies';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000; // 5 min
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'last seen unknown';
  if (isOnline(lastSeenAt)) return 'online';
  const d = new Date(lastSeenAt);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `last seen ${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `last seen ${diffHrs}h ago`;
  return `last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

// ─────────────────────────────────────────────────────────────────────────────

interface OtherParticipant {
  id?: string;
  name: string;
  username: string;
  avatar_url: string | null;
  last_seen_at: string | null;
}

interface Props {
  conversationId: string;
  other: OtherParticipant;
  onBack: () => void;
}

export default function ChatWindow({ conversationId, other, onBack }: Props) {
  const { user, isCreator } = useAuth();
  const navigate = useNavigate();
  const {
    messages, loading, hasMore, loadingMore, loadMore,
    sendMessage, deleteMessage, markRead,
  } = useMessages(conversationId);

  const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null);
  const [activeStoryFeed, setActiveStoryFeed] = useState<{
    sessions: HomeStorySession[];
    initialSlideIndex: number;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);

  const handleOpenStory = useCallback(async (meta: StoryReplyMetadata) => {
    const targetCreatorId = meta.creatorId || other.id || 'creator';
    const fallbackStory: Story = {
      id: meta.storyId || 'story-preview',
      creator_profile_id: targetCreatorId,
      media_url: meta.mediaUrl || '',
      thumbnail_url: meta.mediaUrl || null,
      media_type: meta.mediaType || 'image',
      caption: meta.caption || null,
      published_at: new Date().toISOString(),
      expires_at: null,
      view_count: 0,
    };

    let targetStory: Story = fallbackStory;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let creatorRaw: any = null;

    if (meta.storyId) {
      try {
        const { data: dbStory } = await supabase
          .from('stories')
          .select(`
            *,
            creator_profile:creator_profiles!creator_profile_id (
              id,
              owner_id,
              display_name,
              bio,
              avatar_url,
              cover_url,
              category,
              tags,
              is_verified,
              is_active,
              created_at,
              owner:profiles!owner_id (
                id,
                username,
                display_name,
                avatar_url
              )
            )
          `)
          .eq('id', meta.storyId)
          .maybeSingle();

        if (dbStory) {
          targetStory = {
            id: dbStory.id,
            creator_profile_id: dbStory.creator_profile_id,
            media_url: dbStory.media_url,
            thumbnail_url: dbStory.thumbnail_url,
            media_type: dbStory.media_type,
            caption: dbStory.caption,
            published_at: dbStory.published_at,
            expires_at: dbStory.expires_at,
            view_count: dbStory.view_count || 0,
            is_hd: Boolean(dbStory.is_hd),
          };
          creatorRaw = dbStory.creator_profile;
        }
      } catch (err) {
        console.warn('Could not fetch story row from DB:', err);
      }
    }

    const creator: CreatorProfile = {
      id: creatorRaw?.id || targetCreatorId,
      owner_id: creatorRaw?.owner_id || other.id || '',
      display_name: creatorRaw?.display_name || meta.creatorName || other.name || 'Creator',
      bio: creatorRaw?.bio || null,
      avatar_url: creatorRaw?.avatar_url || creatorRaw?.owner?.avatar_url || other.avatar_url || null,
      cover_url: creatorRaw?.cover_url || null,
      category: creatorRaw?.category || null,
      tags: creatorRaw?.tags || [],
      is_verified: Boolean(creatorRaw?.is_verified),
      is_active: true,
      created_at: creatorRaw?.created_at || new Date().toISOString(),
    };

    // Show exclusively the replied-to story
    const session: HomeStorySession = {
      creator,
      stories: [targetStory],
      archivedStories: [],
      archiveGroups: [],
      slides: [targetStory],
    };

    setActiveStoryFeed({
      sessions: [session],
      initialSlideIndex: 0,
    });
  }, [other]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loading]);

  // Maintain scroll position when loading older messages
  useEffect(() => {
    if (loadingMore && listRef.current) {
      prevScrollHeightRef.current = listRef.current.scrollHeight;
    } else if (!loadingMore && listRef.current && prevScrollHeightRef.current) {
      const diff = listRef.current.scrollHeight - prevScrollHeightRef.current;
      listRef.current.scrollTop = diff;
      prevScrollHeightRef.current = 0;
    }
  }, [loadingMore]);

  // Mark as read when window is focused
  useEffect(() => {
    const handler = () => markRead();
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [markRead]);

  const handleSend = useCallback(async (text: string) => {
    await sendMessage(text, replyTo?.id);
    setReplyTo(null);
  }, [sendMessage, replyTo]);

  const handleDelete = useCallback((id: string) => {
    deleteMessage(id);
  }, [deleteMessage]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    if (listRef.current.scrollTop < 60 && hasMore && !loadingMore) {
      loadMore();
    }
  }, [hasMore, loadingMore, loadMore]);

  // Group messages: determine if we show a date separator or avatar
  const renderMessages = () => {
    return messages.map((msg, i) => {
      const prev = messages[i - 1];
      const showDate = !prev || !isSameDay(prev.created_at, msg.created_at);
      const sameSenderAsPrev = prev && prev.sender_id === msg.sender_id && !showDate;
      const isMine = msg.sender_id === user?.id;

      return (
        <div key={msg.id}>
          {showDate && <DateSeparator date={msg.created_at} />}
          <div className="px-4">
            <MessageBubble
              message={msg}
              isMine={isMine}
              isCreator={isCreator}
              showAvatar={!sameSenderAsPrev}
              onDelete={handleDelete}
              onReveal={isCreator ? () => {/* Phase 10 */} : undefined}
              onReply={setReplyTo}
              onOpenStory={handleOpenStory}
            />
          </div>
        </div>
      );
    });
  };

  const online = isOnline(other.last_seen_at);

  return (
    <div className="flex flex-col h-full bg-ink">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-3 py-2.5 border-b border-border-subtle bg-ink/80 backdrop-blur">
        {/* Back button (always visible — on desktop goes back to /messages list) */}
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-ink-light transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-ink-light border border-border-subtle">
            {other.avatar_url ? (
              <img src={other.avatar_url} alt={other.name || 'User'} className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-gold text-sm font-serif">
                {(other.name || '?').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-ink" />
          )}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-paper text-sm truncate leading-tight">{other.name}</p>
          <p className="text-[0.62rem] text-muted truncate">
            {formatLastSeen(other.last_seen_at)}
          </p>
        </div>

        {/* Options menu placeholder */}
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-ink-light transition-colors">
          <MoreVertical size={18} />
        </button>
      </header>

      {/* ── Message list ────────────────────────────────────────────── */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden py-2 no-scrollbar"
      >
        {/* Load more spinner */}
        {(hasMore || loadingMore) && (
          <div className="flex justify-center py-4">
            {loadingMore
              ? <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              : <button
                  onClick={loadMore}
                  className="text-xs text-muted hover:text-gold transition-colors"
                >
                  Load earlier messages
                </button>
            }
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
            <div className="w-16 h-16 rounded-full border border-border-subtle bg-ink-light flex items-center justify-center mb-4">
              {other.avatar_url ? (
                <img src={other.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="font-serif text-xl text-gold">{(other.name || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <p className="font-semibold text-paper text-lg mb-1">{other.name || 'Conversation'}</p>
            <p className="text-muted text-sm">Start the conversation 👋</p>
          </div>
        ) : (
          renderMessages()
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ───────────────────────────────────────────────────── */}
      <MessageInput
        onSend={handleSend}
        replyTo={replyTo ? {
          senderName: replyTo.sender?.display_name ?? replyTo.sender?.username ?? 'User',
          content: replyTo.content ?? '',
        } : null}
        onCancelReply={() => setReplyTo(null)}
      />

      {/* ── Home Page Story Viewer (When tapping story reply in chat) ───── */}
      {activeStoryFeed && (
        <div className="fixed inset-0 z-[100] bg-ink overflow-hidden">
          <HomeStoryFeed
            sessions={activeStoryFeed.sessions}
            userId={user?.id}
            initialSessionIndex={0}
            initialSlideIndex={activeStoryFeed.initialSlideIndex}
            onClose={() => setActiveStoryFeed(null)}
            onMessage={() => setActiveStoryFeed(null)}
            onStoryViewed={async (storyId) => {
              try {
                await supabase.rpc('increment_story_view', { p_story_id: storyId });
              } catch {
                // Silently ignore view count errors
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
