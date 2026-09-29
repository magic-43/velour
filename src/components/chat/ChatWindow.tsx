import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Pin, X, Check, Copy, CornerUpRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { useMessages, type MessageWithSender } from '../../lib/hooks/useMessages';
import { useTypingIndicator } from '../../lib/hooks/useTypingIndicator';
import MessageBubble, { DateSeparator } from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import MessageContextMenu from './MessageContextMenu';
import HomeStoryFeed from '../stories/HomeStoryFeed';
import { supabase } from '../../lib/supabase';
import type { Story, CreatorProfile, HomeStorySession } from '../../types';
import { StoryReplyMetadata } from '../../lib/storyReplies';
import { getCleanMessagePreview } from '../../lib/messageUtils';
import { useBackHandler } from '../../lib/backButtonRegistry';

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
    sendMessage, sendMediaMessage, deleteMessage, toggleReaction, markRead,
  } = useMessages(conversationId);

  const { otherIsTyping, sendTyping } = useTypingIndicator(conversationId);

  const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null);
  const [contextMenuData, setContextMenuData] = useState<{
    message: MessageWithSender;
    rect: DOMRect;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [revealedMessageIds, setRevealedMessageIds] = useState<Set<string>>(new Set());
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`velour_pinned_msg_${conversationId}`);
    } catch {
      return null;
    }
  });
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // Sync pinned message and reset temporary states when conversationId changes
  useEffect(() => {
    try {
      setPinnedMessageId(localStorage.getItem(`velour_pinned_msg_${conversationId}`));
    } catch {
      setPinnedMessageId(null);
    }
    setIsSelectMode(false);
    setSelectedMessageIds(new Set());
    setRevealedMessageIds(new Set());
  }, [conversationId]);

  const showToast = useCallback((text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const [activeStoryFeed, setActiveStoryFeed] = useState<{
    sessions: HomeStorySession[];
    initialSlideIndex: number;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);

  const handleOpenStory = useCallback(async (meta: StoryReplyMetadata) => {
    const targetCreatorId = meta.creatorId || other.id || 'creator';

    let dbStory: any = null;
    let creatorRaw: any = null;

    if (meta.storyId) {
      try {
        const { data } = await supabase
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

        dbStory = data;
        creatorRaw = data?.creator_profile;
      } catch (err) {
        console.warn('Could not query story existence:', err);
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

    // If story was deleted from DB or has expired:
    const isUnavailable =
      !dbStory || (dbStory.expires_at && new Date(dbStory.expires_at).getTime() < Date.now());

    const targetStory: Story = isUnavailable
      ? {
          id: meta.storyId || 'unavailable-story',
          creator_profile_id: targetCreatorId,
          media_url: '',
          thumbnail_url: null,
          media_type: 'image',
          caption: null,
          published_at: new Date().toISOString(),
          expires_at: null,
          view_count: 0,
          is_unavailable: true,
        }
      : {
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

    // Open full story viewer with the single story slide (or unavailable black screen)
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

  // Auto-scroll to bottom on new messages (intelligent tracking so tab switch does not force scroll)
  const prevMessagesCountRef = useRef(messages.length);
  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      if (!initialScrollDoneRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
        initialScrollDoneRef.current = true;
      } else if (messages.length > prevMessagesCountRef.current && !loadingMore) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages.length, loading, loadingMore]);

  // Auto-scroll when other participant starts typing so the indicator is in full view
  useEffect(() => {
    if (otherIsTyping) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [otherIsTyping]);

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
    sendTyping(false); // clear "typing..." indicator on the other side immediately
    const targetReply = replyTo;
    setReplyTo(null);
    await sendMessage(text, targetReply);
  }, [sendMessage, replyTo, sendTyping]);

  const handleDelete = useCallback((id: string) => {
    deleteMessage(id);
  }, [deleteMessage]);

  const handleToggleReveal = useCallback((id: string) => {
    setRevealedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleTogglePin = useCallback((id: string) => {
    setPinnedMessageId((prev) => {
      const next = prev === id ? null : id;
      try {
        if (next) {
          localStorage.setItem(`velour_pinned_msg_${conversationId}`, next);
        } else {
          localStorage.removeItem(`velour_pinned_msg_${conversationId}`);
        }
      } catch {}
      showToast(next ? 'Message pinned' : 'Message unpinned');
      return next;
    });
  }, [conversationId, showToast]);

  const handleEnterSelectMode = useCallback((initialId: string) => {
    setIsSelectMode(true);
    setSelectedMessageIds(new Set([initialId]));
  }, []);

  const handleExitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  // Android hardware back button handlers for chat overlays and modes
  useBackHandler(() => {
    setActiveStoryFeed(null);
    return true;
  }, activeStoryFeed !== null, 120);

  useBackHandler(() => {
    setContextMenuData(null);
    return true;
  }, contextMenuData !== null, 110);

  useBackHandler(() => {
    handleExitSelectMode();
    return true;
  }, isSelectMode, 100);

  useBackHandler(() => {
    setReplyTo(null);
    return true;
  }, replyTo !== null, 90);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedMessageIds((prev) => {
      if (prev.size === messages.length) {
        return new Set();
      }
      return new Set(messages.map((m) => m.id));
    });
  }, [messages]);

  const handleBulkCopy = useCallback(() => {
    const selectedMsgs = messages.filter((m) => selectedMessageIds.has(m.id));
    if (selectedMsgs.length === 0) return;
    const text = selectedMsgs
      .map((m) => {
        const sender = m.sender_id === user?.id ? 'You' : (other.name || 'User');
        const preview = getCleanMessagePreview(m.content, m.message_type, m.is_deleted);
        return `${sender}: ${preview.text || ''}`;
      })
      .filter(Boolean)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    showToast(`Copied ${selectedMsgs.length} message${selectedMsgs.length > 1 ? 's' : ''}`);
    handleExitSelectMode();
  }, [messages, selectedMessageIds, user?.id, other.name, showToast, handleExitSelectMode]);

  const handleBulkForward = useCallback(() => {
    const selectedMsgs = messages.filter((m) => selectedMessageIds.has(m.id));
    if (selectedMsgs.length === 0) return;
    const text = selectedMsgs
      .map((m) => getCleanMessagePreview(m.content, m.message_type, m.is_deleted).text)
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast(`Copied ${selectedMsgs.length} message${selectedMsgs.length > 1 ? 's' : ''} to forward`);
    handleExitSelectMode();
  }, [messages, selectedMessageIds, showToast, handleExitSelectMode]);

  const handleBulkDelete = useCallback(() => {
    const myDeletableMsgs = messages.filter(
      (m) => selectedMessageIds.has(m.id) && m.sender_id === user?.id && !m.is_deleted
    );
    if (myDeletableMsgs.length === 0) {
      showToast('You can only delete your own messages');
      return;
    }
    for (const msg of myDeletableMsgs) {
      deleteMessage(msg.id);
    }
    showToast(`Deleted ${myDeletableMsgs.length} message${myDeletableMsgs.length > 1 ? 's' : ''}`);
    handleExitSelectMode();
  }, [messages, selectedMessageIds, user?.id, deleteMessage, showToast, handleExitSelectMode]);

  const pinnedMessage = pinnedMessageId
    ? messages.find((m) => m.id === pinnedMessageId)
    : null;

  const handleScrollToMessage = useCallback((targetId: string) => {
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('reply-highlight');
      setTimeout(() => {
        el.classList.remove('reply-highlight');
      }, 1500);
    }
  }, []);

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

      // Find the replied-to message either directly or from the loaded messages
      const replyTarget = msg.reply_to || (msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null);

      return (
        <div key={msg.id} id={`msg-${msg.id}`}>
          {showDate && <DateSeparator date={msg.created_at} />}
          <div className="px-4">
            <MessageBubble
              message={msg}
              isMine={isMine}
              isCreator={isCreator}
              showAvatar={!sameSenderAsPrev}
              replyTarget={replyTarget}
              isRevealed={revealedMessageIds.has(msg.id)}
              isSelectMode={isSelectMode}
              isSelected={selectedMessageIds.has(msg.id)}
              onToggleSelect={handleToggleSelect}
              onDelete={handleDelete}
              onReveal={isCreator ? handleToggleReveal : undefined}
              onReply={setReplyTo}
              onOpenStory={handleOpenStory}
              onScrollToMessage={handleScrollToMessage}
              onOpenContextMenu={(targetMsg, rect) => setContextMenuData({ message: targetMsg, rect })}
              onReact={toggleReaction}
              otherName={other.name || other.username}
              otherAvatar={other.avatar_url}
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
      {isSelectMode ? (
        <header className="sticky top-0 z-30 flex items-center justify-between px-3.5 py-3 border-b border-border-subtle bg-ink/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={handleExitSelectMode}
              className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-ink-light transition-colors cursor-pointer"
              title="Cancel selection"
            >
              <X size={22} />
            </button>
            <span className="font-semibold text-paper text-base">
              {selectedMessageIds.size} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs font-semibold text-gold hover:text-gold-light px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-colors cursor-pointer"
            >
              {selectedMessageIds.size === messages.length && messages.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleExitSelectMode}
              className="text-xs font-semibold text-paper hover:text-gold px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-30 flex items-center gap-3.5 px-3.5 py-2.5 border-b border-border-subtle bg-ink/95 backdrop-blur-md">
          {/* Back button (always visible — on desktop goes back to /messages list) */}
          <button
            onClick={onBack}
            className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-ink-light transition-colors shrink-0 cursor-pointer"
            aria-label="Back to conversations"
          >
            <ArrowLeft size={22} />
          </button>

          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-light border border-border-subtle">
              {other.avatar_url ? (
                <img src={other.avatar_url} alt={other.name || 'User'} className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-gold text-base font-serif font-bold">
                  {(other.name || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {online && (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-ink" />
            )}
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-paper text-base truncate leading-tight">{other.name}</p>
            <p className="text-xs text-muted truncate mt-0.5">
              {otherIsTyping ? (
                <span className="text-gold font-medium animate-pulse">typing…</span>
              ) : (
                formatLastSeen(other.last_seen_at)
              )}
            </p>
          </div>


        </header>
      )}

      {/* ── Sticky Pinned Message Bar ────────────────────────────── */}
      {pinnedMessage && !isSelectMode && (
        <div
          onClick={() => handleScrollToMessage(pinnedMessage.id)}
          className="sticky top-[61px] z-20 bg-ink-light/95 backdrop-blur border-b border-border-subtle/80 px-3.5 py-2 flex items-center justify-between gap-3 cursor-pointer hover:bg-ink-light transition-colors group"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-1 h-7 rounded-full bg-gold shrink-0" />
            <Pin size={14} className="text-gold shrink-0 rotate-45" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold text-gold uppercase tracking-wider leading-none">
                Pinned message
              </p>
              <p className="text-xs text-paper/90 truncate mt-0.5">
                {pinnedMessage.is_deleted
                  ? 'Deleted message'
                  : getCleanMessagePreview(pinnedMessage.content, pinnedMessage.message_type).text || 'Attachment'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePin(pinnedMessage.id);
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 transition-colors shrink-0"
            title="Unpin message"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Message list ────────────────────────────────────────────── */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden py-2 no-scrollbar flex flex-col"
      >
        {/* Load more spinner */}
        {(hasMore || loadingMore) && (
          <div className="flex justify-center py-4 shrink-0">
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

        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-16 my-auto">
            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="my-auto flex flex-col items-center justify-center py-12 text-center px-6">
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

        {/* Typing indicator */}
        {otherIsTyping && (
          <TypingIndicator
            name={(other.name || 'User').split(' ')[0]}
            avatarUrl={other.avatar_url}
          />
        )}

        <div ref={bottomRef} data-chat-bottom="true" className="h-px shrink-0" />
      </div>

      {/* ── Input or Multi-Select Actions ─────────────────────────── */}
      {isSelectMode ? (
        <div className="border-t border-border-subtle bg-ink-light/95 backdrop-blur p-3 safe-bottom animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-around max-w-md mx-auto">
            <button
              type="button"
              disabled={selectedMessageIds.size === 0}
              onClick={handleBulkCopy}
              className="flex flex-col items-center gap-1 text-muted hover:text-paper disabled:opacity-40 disabled:pointer-events-none transition-colors group p-2 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center text-paper transition-colors">
                <Copy size={18} />
              </div>
              <span className="text-[0.68rem] font-medium">Copy</span>
            </button>

            <button
              type="button"
              disabled={selectedMessageIds.size === 0}
              onClick={handleBulkForward}
              className="flex flex-col items-center gap-1 text-muted hover:text-paper disabled:opacity-40 disabled:pointer-events-none transition-colors group p-2 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center text-paper transition-colors">
                <CornerUpRight size={18} />
              </div>
              <span className="text-[0.68rem] font-medium">Forward</span>
            </button>

            <button
              type="button"
              disabled={selectedMessageIds.size === 0}
              onClick={handleBulkDelete}
              className="flex flex-col items-center gap-1 text-muted hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none transition-colors group p-2 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-red-500/10 group-hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors">
                <Trash2 size={18} />
              </div>
              <span className="text-[0.68rem] font-medium">Delete</span>
            </button>

            <button
              type="button"
              onClick={handleExitSelectMode}
              className="flex flex-col items-center gap-1 text-muted hover:text-paper transition-colors group p-2 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center text-paper transition-colors">
                <X size={18} />
              </div>
              <span className="text-[0.68rem] font-medium">Cancel</span>
            </button>
          </div>
        </div>
      ) : (
        <MessageInput
          onSend={handleSend}
          onSendMedia={(optimisticContent, uploadFn) => {
            sendMediaMessage(optimisticContent, uploadFn, replyTo);
            setReplyTo(null);
          }}
          onTyping={sendTyping}
          replyTo={replyTo ? {
            senderName: replyTo.sender_id === user?.id
              ? 'You'
              : (replyTo.sender?.display_name ?? replyTo.sender?.username ?? 'User'),
            content: replyTo.content ?? '',
            messageType: replyTo.message_type,
          } : null}
          onCancelReply={() => setReplyTo(null)}
        />
      )}

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

      {/* ── Contextual Message Focus Menu (Telegram/iOS style) ─────── */}
      {contextMenuData && (
        <MessageContextMenu
          isOpen={Boolean(contextMenuData)}
          onClose={() => setContextMenuData(null)}
          message={contextMenuData.message}
          targetRect={contextMenuData.rect}
          isMine={contextMenuData.message.sender_id === user?.id}
          isCreator={isCreator}
          currentUserId={user?.id}
          isPinned={pinnedMessageId === contextMenuData.message.id}
          onReply={() => setReplyTo(contextMenuData.message)}
          onDelete={() => handleDelete(contextMenuData.message.id)}
          onReact={(emoji) => toggleReaction(contextMenuData.message.id, emoji)}
          onOpenStory={handleOpenStory}
          onPin={() => handleTogglePin(contextMenuData.message.id)}
          onForward={() => {
            const preview = getCleanMessagePreview(contextMenuData.message.content, contextMenuData.message.message_type, contextMenuData.message.is_deleted);
            if (preview.text) {
              navigator.clipboard.writeText(preview.text);
              showToast('Copied to forward');
            }
          }}
          onSelect={() => handleEnterSelectMode(contextMenuData.message.id)}
        />
      )}

      {/* Subtle notification toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[140] px-4 py-2 rounded-full bg-zinc-800/90 text-white text-xs shadow-xl backdrop-blur-md border border-white/10 animate-in fade-in zoom-in-95 duration-150">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
