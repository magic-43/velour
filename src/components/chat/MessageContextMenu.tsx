import React, { useEffect, useState, useMemo } from 'react';
import {
  CornerUpLeft,
  Copy,
  Pin,
  CornerUpRight,
  Trash2,
  CheckCircle2,
  Play,
  Plus,
  Search,
  X,
  Check,
  CheckCheck,
  Clock,
  Lock,
} from 'lucide-react';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import { parseStoryReply, type StoryReplyMetadata } from '../../lib/storyReplies';
import { parseVaultMediaMessage } from '../../lib/creatorVault';
import { getCleanMessagePreview } from '../../lib/messageUtils';
import StoryStatusIcon from './StoryStatusIcon';
import WhatsAppMediaGrid from './WhatsAppMediaGrid';
import { IOS_EMOJIS, getAppleEmojiUrl } from '../../data/iosEmojis';
import { triggerHaptic } from '../../lib/haptics';

interface ReactionEmojiItem {
  char: string;
  code: string;
  name: string;
}

// ── Quick reactions (Apple iOS Emojis) ─────────────────────────────────────────
const QUICK_REACTIONS: ReactionEmojiItem[] = [
  { char: '❤️', code: '2764-fe0f', name: 'Love' },
  { char: '👍', code: '1f44d', name: 'Thumbs Up' },
  { char: '🔥', code: '1f525', name: 'Fire' },
  { char: '😂', code: '1f602', name: 'Joy' },
  { char: '😮', code: '1f62e', name: 'Surprised' },
  { char: '😢', code: '1f622', name: 'Sad' },
  { char: '🙏', code: '1f64f', name: 'Pray' },
];

const EMOJI_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'smileys', label: 'Smileys' },
  { id: 'gestures', label: 'Gestures' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'party', label: 'Party' },
  { id: 'animals', label: 'Nature' },
  { id: 'objects', label: 'Objects' },
] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  message: MessageWithSender;
  targetRect: DOMRect;
  isMine: boolean;
  isCreator: boolean;
  currentUserId?: string;
  isPinned?: boolean;
  onReply?: () => void;
  onDelete?: () => void;
  onReact?: (emoji: string) => void;
  onOpenStory?: (meta: StoryReplyMetadata) => void;
  onPin?: () => void;
  onForward?: () => void;
  onSelect?: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageContextMenu({
  isOpen,
  onClose,
  message,
  targetRect,
  isMine,
  isCreator,
  currentUserId,
  isPinned,
  onReply,
  onDelete,
  onReact,
  onOpenStory,
  onPin,
  onForward,
  onSelect,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredEmojis = useMemo(() => {
    let list = IOS_EMOJIS;
    if (selectedCategory !== 'all') {
      list = list.filter((e) => e.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || e.char.includes(q)
      );
    }
    return list;
  }, [selectedCategory, searchQuery]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPicker) {
          setShowPicker(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showPicker, onClose]);

  if (!isOpen) return null;

  const isDeleted = message.is_deleted;
  const isVoiceNote = message.message_type === 'voice_note';
  const storyReply = parseStoryReply(message.content);
  const vaultMedia = parseVaultMediaMessage(message.content);
  const preview = getCleanMessagePreview(message.content, message.message_type, isDeleted);

  // Check current user's reaction
  const userReaction = Object.entries(message.reactions || {}).find(([, userIds]) =>
    currentUserId ? userIds.includes(currentUserId) : false
  )?.[0];

  // ── Coordinates and Clamping ───────────────────────────────────────────────
  const REACTION_BAR_HEIGHT = 46;
  const MENU_CARD_HEIGHT = isMine ? 250 : 210;
  const GAP = 8;
  const PADDING = 12;

  // Use the actual target bubble height
  const bubbleHeight = targetRect.height;
  let bubbleTop = targetRect.top;

  // 1. Keep reaction bar on screen (prevent clipping top)
  if (bubbleTop - REACTION_BAR_HEIGHT - GAP < PADDING) {
    bubbleTop = PADDING + REACTION_BAR_HEIGHT + GAP;
  }

  // 2. Keep menu card on screen (prevent clipping bottom)
  const totalStackHeight = bubbleHeight + GAP + MENU_CARD_HEIGHT;
  if (bubbleTop + totalStackHeight > window.innerHeight - PADDING) {
    bubbleTop = Math.max(
      PADDING + REACTION_BAR_HEIGHT + GAP,
      window.innerHeight - PADDING - totalStackHeight
    );
  }

  const reactionTop = bubbleTop - REACTION_BAR_HEIGHT - GAP;

  // Horizontal positions
  const bubbleLeft = targetRect.left;
  const bubbleWidth = targetRect.width;

  // Quick reaction capsule position & clamping (consistent 312px width)
  const capsuleWidth = 312;

  let reactionLeft = isMine
    ? targetRect.right - capsuleWidth
    : targetRect.left;
  reactionLeft = Math.max(12, Math.min(reactionLeft, window.innerWidth - capsuleWidth - 12));

  // Action menu width
  const menuWidth = 208;

  // Handlers
  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(preview.text || message.content);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleReactClick = (emoji: string) => {
    onReact?.(emoji);
    triggerHaptic('light');
    onClose();
  };

  const handlePinClick = () => {
    onPin?.();
    triggerHaptic('medium');
    onClose();
  };

  const handleForwardClick = () => {
    onForward?.();
    onClose();
  };

  const handleSelectClick = () => {
    onSelect?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] overflow-hidden select-none cursor-pointer animate-in fade-in duration-150"
      onClick={onClose}
      onTouchStart={(e) => {
        // Tapping backdrop directly closes menu on mobile instantly
        if (e.target === e.currentTarget || (e.target as HTMLElement).getAttribute('data-backdrop') === 'true') {
          onClose();
        }
      }}
    >
      {/* ── Background Dim + Blur ────────────────────────────────────── */}
      <div
        data-backdrop="true"
        className="absolute inset-0 bg-black/65 backdrop-blur-md transition-opacity duration-200 cursor-pointer pointer-events-auto"
        onClick={onClose}
      />

      {/* ── Floating Reaction Capsule (Above Bubble) ────────────────── */}
      <div
        style={{
          position: 'fixed',
          top: `${reactionTop}px`,
          left: `${reactionLeft}px`,
          maxWidth: 'calc(100vw - 24px)',
        }}
        onClick={(e) => e.stopPropagation()}
        className="z-[130] flex flex-col items-start cursor-default animate-in zoom-in-95 duration-150"
      >
        <div className="bg-[#242426]/95 backdrop-blur-2xl border border-white/10 rounded-full px-2 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center gap-1 sm:gap-1.5 transition-all">
          {QUICK_REACTIONS.map((item) => {
            const isSelected = userReaction === item.char;
            return (
              <button
                key={item.char}
                type="button"
                onClick={() => handleReactClick(item.char)}
                className={`p-1 rounded-full transition-transform hover:scale-125 active:scale-95 cursor-pointer flex items-center justify-center ${
                  isSelected ? 'bg-white/20 scale-110 shadow-sm ring-2 ring-gold/60' : 'hover:bg-white/10'
                }`}
                title={`React with ${item.name}`}
              >
                <img
                  src={getAppleEmojiUrl(item.code)}
                  alt={item.char}
                  className="w-6 h-6 sm:w-7 sm:h-7 object-contain pointer-events-none drop-shadow-sm select-none"
                  loading="eager"
                />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 ml-0.5 active:scale-90"
            title="More reactions"
          >
            <Plus size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* ── Reaction Picker Sheet / Popover (WhatsApp / iOS style) ───── */}
      {showPicker && (
        <div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setShowPicker(false);
          }}
        >
          {/* Backdrop overlay */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" />

          {/* Picker Dialog */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-[400px] h-[450px] max-h-[80vh] sm:max-h-[500px] bg-[#1c1c1f]/98 backdrop-blur-3xl border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200"
          >
            {/* Mobile Sheet Handle */}
            <div className="w-10 h-1 bg-white/25 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

            {/* Header: Title / Search + Close */}
            <div className="flex items-center gap-2 px-3.5 pt-2 pb-2.5 border-b border-white/10 shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search emoji..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-8.5 pr-7 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/35 focus:outline-none focus:border-gold/50 focus:bg-white/10 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Category tabs */}
            {!searchQuery && (
              <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto scrollbar-none shrink-0">
                {EMOJI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-gold/20 text-gold border border-gold/40'
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}

            {/* Grid of iOS emojis */}
            <div className="flex-1 overflow-y-auto p-3 overscroll-contain">
              {filteredEmojis.length === 0 ? (
                <div className="py-16 text-center text-white/40 text-xs">
                  No emojis found for "{searchQuery}"
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
                  {filteredEmojis.map((item) => {
                    const isSelected = userReaction === item.char;
                    return (
                      <button
                        key={item.char}
                        type="button"
                        onClick={() => {
                          handleReactClick(item.char);
                          setShowPicker(false);
                        }}
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-transform hover:scale-120 active:scale-95 cursor-pointer ${
                          isSelected
                            ? 'bg-white/20 ring-2 ring-gold/60 scale-105'
                            : 'hover:bg-white/10'
                        }`}
                        title={item.name}
                      >
                        <img
                          src={getAppleEmojiUrl(item.code)}
                          alt={item.name}
                          className="w-7 h-7 sm:w-8 sm:h-8 object-contain pointer-events-none drop-shadow-sm select-none"
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Focused Message Bubble + Action Card Stack ──────────────── */}
      <div
        style={{
          position: 'fixed',
          top: `${bubbleTop}px`,
          left: isMine ? 'auto' : `${bubbleLeft}px`,
          right: isMine ? `${Math.max(12, window.innerWidth - bubbleLeft - bubbleWidth)}px` : 'auto',
          width: `${Math.max(bubbleWidth, menuWidth)}px`,
          maxWidth: 'calc(100vw - 24px)',
        }}
        className={`z-[130] pointer-events-auto flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
      >
        {/* Focused Message Bubble Clone */}
        <div
          style={{ width: `${bubbleWidth}px` }}
          onClick={onClose}
          className="cursor-pointer animate-in zoom-in-[0.98] duration-150"
        >
          <div className="w-full flex flex-col">
            <div
              className={`rounded-2xl break-words transition-all shadow-2xl ${
                vaultMedia.isVaultMedia && vaultMedia.media
                  ? `p-1 overflow-hidden max-w-[320px] ${
                      isMine
                        ? 'bg-[#18181b] border border-gold/40 text-paper rounded-br-sm shadow-gold/10 ring-1 ring-gold/20'
                        : 'bg-[#18181b] border border-white/20 text-paper rounded-bl-sm ring-1 ring-white/10'
                    }`
                  : `px-3.5 py-2.5 text-sm leading-relaxed ${
                      isMine
                        ? 'bg-[#1a1a12] border border-gold/40 text-paper rounded-br-sm shadow-gold/10 ring-1 ring-gold/20'
                        : 'bg-[#222226] border border-white/20 text-paper rounded-bl-sm ring-1 ring-white/10'
                    }`
              } ${isDeleted ? 'opacity-60' : ''}`}
            >
              {/* Replied quote banner */}
              {message.reply_to && (
                <div
                  className={`mb-2 p-2 rounded-xl flex items-stretch gap-2.5 border ${
                    isMine ? 'bg-black/45 border-gold/20' : 'bg-black/35 border-white/10'
                  }`}
                >
                  <div className="w-1 rounded-full bg-gold shrink-0 self-stretch" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[0.72rem] font-semibold text-gold truncate block">
                      {message.reply_to.sender_id === currentUserId
                        ? 'You'
                        : message.reply_to.sender?.display_name || message.reply_to.sender?.username || 'User'}
                    </span>
                    <p className="text-[0.72rem] text-paper/80 truncate leading-tight mt-0.5">
                      {message.reply_to.content || 'Attachment'}
                    </p>
                  </div>
                </div>
              )}

              {/* Story reply body */}
              {storyReply.isStoryReply ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-black/40 border border-white/10">
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.7rem] font-medium text-gold flex items-center gap-1">
                        <StoryStatusIcon size={12} className="text-gold" />
                        <span>Story Reply</span>
                      </p>
                      <p className="text-xs text-muted truncate mt-0.5">
                        {storyReply.meta?.creatorName ? `Story by ${storyReply.meta.creatorName}` : 'View story'}
                      </p>
                    </div>
                    {storyReply.meta?.mediaUrl && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/15 bg-neutral-900">
                        {storyReply.meta.mediaType === 'video' ? (
                          <video src={storyReply.meta.mediaUrl} className="w-full h-full object-cover pointer-events-none" muted />
                        ) : (
                          <img src={storyReply.meta.mediaUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                  {storyReply.meta?.reactionEmoji ? (
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-2xl leading-none select-none">{storyReply.meta.reactionEmoji}</span>
                      <span className="text-xs text-neutral-300">Reacted to story</span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-paper text-sm leading-relaxed px-0.5">
                      {storyReply.replyText}
                    </p>
                  )}
                </div>
              ) : vaultMedia.isVaultMedia && vaultMedia.media ? (
                <div className="space-y-1">
                  {vaultMedia.media.items && vaultMedia.media.items.length > 1 && (!vaultMedia.media.isLocked || isMine) ? (
                    <div className="rounded-xl overflow-hidden pointer-events-none">
                      <WhatsAppMediaGrid items={vaultMedia.media.items} canViewFull={false} />
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden bg-black/40 border border-white/10 w-full relative">
                      <img
                        src={
                          vaultMedia.media.isLocked && !isMine
                            ? vaultMedia.media.blurredThumbnailUrl || vaultMedia.media.thumbnailUrl || vaultMedia.media.mediaUrl
                            : vaultMedia.media.thumbnailUrl || vaultMedia.media.mediaUrl
                        }
                        alt=""
                        className={`w-full max-h-[300px] object-cover rounded-xl ${
                          vaultMedia.media.isLocked && !isMine ? 'filter blur-[12px] scale-110' : ''
                        }`}
                      />
                      {vaultMedia.media.isLocked && (
                        <div className="p-2 bg-black/70 flex items-center justify-between text-xs relative z-10">
                          <span className="flex items-center gap-1 text-gold font-medium">
                            <Lock size={12} />
                            {vaultMedia.media.items && vaultMedia.media.items.length > 1
                              ? `Locked Bundle (${vaultMedia.media.items.length})`
                              : 'Paywall Locked'}
                          </span>
                          {vaultMedia.media.price && (
                            <span className="font-bold text-gold">${vaultMedia.media.price}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {vaultMedia.text && <p className="whitespace-pre-wrap text-paper text-sm px-1 py-0.5">{vaultMedia.text}</p>}
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{message.content}</span>
              )}
            </div>

            {/* Timestamp & read receipts */}
            <div className={`flex items-center gap-1 mt-0.5 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
              <span className="text-[0.6rem] text-muted">{formatTime(message.created_at)}</span>
              {isMine && (
                message.status === 'sending' ? (
                  <Clock size={11} className="text-muted shrink-0" />
                ) : message.status === 'read' ? (
                  <CheckCheck size={13} className="text-gold shrink-0" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck size={13} className="text-muted shrink-0" />
                ) : (
                  <Check size={12} className="text-muted shrink-0" />
                )
              )}
            </div>
          </div>
        </div>

        {/* ── Floating Action Card (Attached directly below the bubble with mt-2) ── */}
        <div
          style={{ width: `${menuWidth}px` }}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.6)] rounded-2xl py-1.5 px-1 flex flex-col cursor-default animate-in zoom-in-95 duration-150"
        >
          {/* 1. Reply */}
          {onReply && !isDeleted && message.status !== 'sending' && (
            <button
              type="button"
              onClick={() => {
                onReply();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-left transition-colors cursor-pointer group"
            >
              <CornerUpLeft size={16} strokeWidth={2.4} className="text-white/80 group-hover:text-white shrink-0" />
              <span className="text-sm font-normal text-white">Reply</span>
            </button>
          )}

          {/* 2. Copy */}
          {!isDeleted && message.content && !isVoiceNote && (
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-left transition-colors cursor-pointer group"
            >
              {copied ? (
                <Check size={16} strokeWidth={2.5} className="text-emerald-400 shrink-0" />
              ) : (
                <Copy size={16} strokeWidth={2} className="text-white/80 group-hover:text-white shrink-0" />
              )}
              <span className="text-sm font-normal text-white">
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
          )}

          {/* 3. Pin */}
          <button
            type="button"
            onClick={handlePinClick}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-left transition-colors cursor-pointer group"
          >
            <Pin size={16} strokeWidth={2} className={`shrink-0 ${isPinned ? 'text-gold' : 'text-white/80 group-hover:text-white'}`} />
            <span className="text-sm font-normal text-white">{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>

          {/* 4. Forward */}
          <button
            type="button"
            onClick={handleForwardClick}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-left transition-colors cursor-pointer group"
          >
            <CornerUpRight size={16} strokeWidth={2.4} className="text-white/80 group-hover:text-white shrink-0" />
            <span className="text-sm font-normal text-white">Forward</span>
          </button>

          {/* 5. View Attached Story */}
          {storyReply.isStoryReply && storyReply.meta && onOpenStory && (
            <button
              type="button"
              onClick={() => {
                onOpenStory(storyReply.meta!);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-left transition-colors cursor-pointer group"
            >
              <Play size={16} fill="currentColor" className="text-emerald-400 shrink-0" />
              <span className="text-sm font-normal text-white">View Story</span>
            </button>
          )}

          {/* 6. Delete (only for own messages) */}
          {isMine && !isDeleted && message.status !== 'sending' && onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-red-500/15 text-left transition-colors cursor-pointer group text-red-500"
            >
              <Trash2 size={16} strokeWidth={2} className="text-red-500 shrink-0" />
              <span className="text-sm font-normal text-red-500">Delete</span>
            </button>
          )}

          {/* Divider */}
          <div className="border-t border-white/10 my-1 mx-2" />

          {/* 7. Select */}
          <button
            type="button"
            onClick={handleSelectClick}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-left transition-colors cursor-pointer group"
          >
            <CheckCircle2 size={16} strokeWidth={2} className="text-white/80 group-hover:text-white shrink-0" />
            <span className="text-sm font-normal text-white">Select</span>
          </button>
        </div>
      </div>
    </div>
  );
}
