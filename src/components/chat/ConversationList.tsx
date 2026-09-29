import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Check, CheckCheck, Lock, Camera, Video } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useConversations } from '../../lib/hooks/useConversations';
import { useIsOtherTyping } from '../../lib/hooks/useIsOtherTyping';
import { parseConversationPreview } from '../../lib/messageUtils';
import StoryStatusIcon from './StoryStatusIcon';
import type { ConversationWithParticipants } from '../../types';

function formatMessageTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ConversationList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const { conversations, loading, getOtherParticipant, getUnread } = useConversations();

  // Active conversation id from URL
  const activeId = location.pathname.startsWith('/messages/')
    ? location.pathname.split('/messages/')[1]
    : null;

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => {
      const other = getOtherParticipant(c);
      const name = (other?.name || '').toLowerCase();
      const username = (other?.username || '').toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [conversations, search, getOtherParticipant]);

  // Active (online) users strip — people last seen < 5 min
  const activeUsers = useMemo(() => {
    return conversations
      .map(c => ({ ...getOtherParticipant(c), convId: c.id }))
      .filter(p => isOnline(p.last_seen_at))
      .slice(0, 12);
  }, [conversations, getOtherParticipant]);

  const openConversation = (conv: ConversationWithParticipants) => {
    navigate(`/messages/${conv.id}`);
  };

  return (
    <div className="w-full md:w-[320px] lg:w-[400px] border-r border-border-subtle flex flex-col h-full pb-20 md:pb-0 shrink-0 overflow-hidden">
      {/* Sticky header — search + active users */}
      <div className="sticky top-0 bg-ink/95 backdrop-blur z-10 border-b border-border-subtle px-4 md:px-5 py-3 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full bg-[#1c1c1e] text-white rounded-xl py-2 pl-10 pr-9 text-sm focus:outline-none placeholder-zinc-500 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Active users row */}
        {activeUsers.length > 0 && (
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted mb-2">Active now</p>
            <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-1">
              {activeUsers.map(u => (
                <button
                  key={u.convId}
                  onClick={() => navigate(`/messages/${u.convId}`)}
                  className="shrink-0 w-[68px] text-center"
                >
                  <div className="relative mx-auto w-14 h-14 rounded-full border border-gold/40 p-[2px] bg-black/30">
                    <div className="w-full h-full rounded-full overflow-hidden bg-ink-light">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center text-gold font-serif text-lg">
                            {(u.name || '?').charAt(0).toUpperCase()}
                          </span>
                      }
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-ink" />
                  </div>
                  <p className="mt-1 text-[0.62rem] text-muted truncate">{(u.name || 'User').split(' ')[0]}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2.5 space-y-0.5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-muted text-sm">
              {search ? 'No conversations match your search.' : 'No conversations yet.'}
            </p>
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              user={user}
              getOtherParticipant={getOtherParticipant}
              getUnread={getUnread}
              onOpen={openConversation}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── ConversationRow ───────────────────────────────────────────────────────────
// Extracted so useIsOtherTyping can be called as a hook per row.

interface RowProps {
  conv: ConversationWithParticipants;
  isActive: boolean;
  user: { id: string } | null;
  getOtherParticipant: (conv: ConversationWithParticipants) => {
    id: string; name: string; username: string; avatar_url: string | null; last_seen_at: string | null;
  };
  getUnread: (conv: ConversationWithParticipants) => number;
  onOpen: (conv: ConversationWithParticipants) => void;
}

function parseReactionPreview(text: string | null): { isReaction: boolean; emoji?: string; detail?: string } {
  if (!text) return { isReaction: false };
  const match = text.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}❤️🔥👍👎🥰👏😄🎉😮😢💯🤔🙏👀✨⚡🤩]+)\s+Reacted to:(.*)$/u);
  if (match) {
    return {
      isReaction: true,
      emoji: match[1],
      detail: match[2].trim(),
    };
  }
  return { isReaction: false };
}

function ConversationRow({ conv, isActive, user, getOtherParticipant, getUnread, onOpen }: RowProps) {
  const other = getOtherParticipant(conv);
  const unread = getUnread(conv);
  const isFromMe = conv.last_message_sender_id === user?.id;
  const preview = parseConversationPreview(conv.last_message_preview);
  const otherIsTyping = useIsOtherTyping(conv.id);

  return (
    <button
      onClick={() => onOpen(conv)}
      className={`w-full text-left flex items-center gap-3 p-2.5 transition-colors rounded-xl border border-transparent
        ${isActive ? 'bg-ink-light border-border-subtle' : 'hover:bg-ink-light/40'}`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-ink border border-border-subtle">
          {other?.avatar_url
            ? <img src={other.avatar_url} alt={other.name || 'User'} className="w-full h-full object-cover" />
            : <span className="w-full h-full flex items-center justify-center text-gold font-serif text-lg">
                {(other?.name || '?').charAt(0).toUpperCase()}
              </span>
          }
        </div>
        {isOnline(other.last_seen_at) && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-ink" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="flex justify-between items-center mb-0.5">
          <p className="text-[0.9rem] font-medium text-paper truncate">{other?.name || 'User'}</p>
          <p className="text-[0.62rem] text-muted shrink-0 ml-1">
            {formatMessageTime(conv.last_message_at)}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Preview — replaced by typing dots when other person is typing */}
          <div className={`text-[0.75rem] truncate flex-1 flex items-center gap-1.5 min-w-0 ${
            otherIsTyping ? 'text-gold' : unread > 0 ? 'text-paper font-medium' : isActive ? 'text-gold' : 'text-muted'
          }`}>
            {otherIsTyping ? (
              <TypingDots />
            ) : preview.type === 'reaction' ? (
              <span className="flex items-center gap-1.5 truncate">
                <span className="text-sm shrink-0 leading-none">{preview.badge}</span>
                <span className="text-gold font-medium shrink-0">
                  {isFromMe ? 'You reacted' : 'Reacted'}
                </span>
                {preview.detail && (
                  <span className="truncate text-paper/70 font-normal">{preview.detail}</span>
                )}
              </span>
            ) : preview.type === 'locked' ? (
              <span className="flex items-center gap-1.5 truncate">
                {isFromMe && <span className="text-muted shrink-0">You: </span>}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gold/20 text-gold border border-gold/40 text-[0.66rem] font-bold shrink-0">
                  <Lock size={10} className="shrink-0 text-gold" strokeWidth={2.4} />
                  <span>{preview.badge}</span>
                </span>
                <span className="truncate text-paper/90 font-medium">
                  {preview.text}
                </span>
                {preview.detail && (
                  <span className="truncate text-muted text-xs font-normal">
                    • {preview.detail}
                  </span>
                )}
              </span>
            ) : preview.type === 'media' ? (
              <span className="flex items-center gap-1.5 truncate">
                {isFromMe && <span className="text-muted shrink-0">You: </span>}
                {preview.mediaType === 'video' ? (
                  <Video size={13} className="text-gold shrink-0" />
                ) : (
                  <Camera size={13} className="text-gold shrink-0" />
                )}
                <span className="truncate text-paper/85">{preview.text}</span>
              </span>
            ) : preview.type === 'story' ? (
              <>
                {isFromMe && <span className="text-muted shrink-0">You: </span>}
                <StoryStatusIcon size={13} className="text-emerald-400 shrink-0 inline" />
                <span className="truncate">{preview.text}</span>
              </>
            ) : (
              <>
                {isFromMe && <span className="text-muted shrink-0">You: </span>}
                <span className="truncate">{preview.text}</span>
              </>
            )}
          </div>

          {/* Read receipt — hidden while the other person is typing */}
          {!otherIsTyping && isFromMe && conv.last_message_preview && (
            <ReadReceiptMini
              isRead={
                conv.fan_id === user?.id
                  ? (conv.creator_unread ?? 0) === 0
                  : (conv.fan_unread ?? 0) === 0
              }
            />
          )}

          {/* Unread badge / reaction indicator */}
          {unread > 0 && preview.type === 'reaction' ? (
            <span className="shrink-0 flex items-center gap-1 px-1.5 h-5 rounded-full bg-gold/20 border border-gold/40 text-gold text-[0.68rem] font-bold">
              <span>{preview.badge}</span>
              <span>{unread}</span>
            </span>
          ) : unread > 0 && preview.type === 'locked' && !isFromMe ? (
            <span className="shrink-0 flex items-center gap-1 px-1.5 h-5 rounded-full bg-gold text-ink text-[0.65rem] font-bold shadow-md shadow-gold/20">
              <Lock size={10} strokeWidth={2.6} />
              <span>{unread}</span>
            </span>
          ) : unread > 0 ? (
            <span className="shrink-0 min-w-5 h-5 px-1 rounded-full bg-gold text-ink text-[0.6rem] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// Three tiny bouncing dots shown in place of the message preview
function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1 h-1 rounded-full bg-gold"
          style={{ animation: `typing-bounce 1.2s ease-in-out infinite`, animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

// Mini read receipt for the conversation list row.
// isRead=true  → other person has read it  → gold double-tick ✓✓
// isRead=false → sent/delivered, not yet read → grey single tick ✓
function ReadReceiptMini({ isRead }: { isRead: boolean }) {
  return isRead
    ? <CheckCheck size={12} className="text-gold shrink-0" />
    : <Check size={12} className="text-muted shrink-0" />;
}
