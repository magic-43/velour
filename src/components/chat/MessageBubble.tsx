import { useRef, useState } from 'react';
import { Check, CheckCheck, Video, Camera, Lock, Clock, CornerUpLeft, MoreHorizontal, Play, Eye, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import type { MessageStatus } from '../../types';
import { parseStoryReply, type StoryReplyMetadata } from '../../lib/storyReplies';
import { parseVaultMediaMessage } from '../../lib/creatorVault';
import { getCleanMessagePreview } from '../../lib/messageUtils';
import StoryStatusIcon from './StoryStatusIcon';
import LockedAttachmentCard from './LockedAttachmentCard';
import MediaLightbox from './MediaLightbox';
import WhatsAppMediaGrid from './WhatsAppMediaGrid';
import { getAppleEmojiUrlByChar } from '../../data/iosEmojis';
import { triggerHaptic } from '../../lib/haptics';

// ── Swipe-to-reply constants ───────────────────────────────────────────────────
const SWIPE_THRESHOLD = 65;   // px — triggers reply action
const SWIPE_MAX      = 82;   // px — hard cap with resistance

export interface ReplyTargetData {
  id: string;
  content: string | null;
  message_type?: string;
  sender_id: string;
  is_deleted?: boolean;
  sender?: {
    id?: string;
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface Props {
  message: MessageWithSender;
  isMine: boolean;
  isCreator: boolean;               // viewer is a creator (can reveal deleted msgs)
  showAvatar: boolean;              // first in a group from this sender
  replyTarget?: ReplyTargetData | null;
  isRevealed?: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDelete: (id: string) => void;
  onReveal?: (id: string) => void;  // creator-only
  onReply?: (msg: MessageWithSender) => void;
  onOpenStory?: (meta: StoryReplyMetadata) => void;
  onScrollToMessage?: (messageId: string) => void;
  onOpenContextMenu?: (msg: MessageWithSender, rect: DOMRect) => void;
  onReact?: (messageId: string, emoji: string) => void;
  otherName?: string;
  otherAvatar?: string | null;
}

export default function MessageBubble({
  message, isMine, isCreator, showAvatar, replyTarget,
  isRevealed, isSelectMode, isSelected, onToggleSelect,
  onDelete, onReveal, onReply, onOpenStory, onScrollToMessage,
  onOpenContextMenu, onReact, otherName, otherAvatar,
}: Props) {
  const { user } = useAuth();
  const isDeleted = message.is_deleted;
  const isVoiceNote = message.message_type === 'voice_note';
  const isAttachment = message.message_type === 'attachment';
  const storyReply = parseStoryReply(message.content);
  const vaultMedia = parseVaultMediaMessage(message.content);

  const senderDisplayName = isMine
    ? 'You'
    : (message.sender?.display_name || message.sender?.username || otherName || 'User');
  const senderAvatarUrl = isMine
    ? (user?.user_metadata?.avatar_url || null)
    : (message.sender?.avatar_url || otherAvatar || null);
  const bubbleTimestamp = message.created_at
    ? new Date(message.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
    : undefined;

  const [freeLightboxOpen, setFreeLightboxOpen] = useState(false);
  const [freeLightboxIndex, setFreeLightboxIndex] = useState(0);

  // ── Swipe gestures: right to reply, left for options ───────────────────────
  // Direct DOM manipulation during the swipe ensures smooth 60fps tracking.
  const rowRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const replyIconRef = useRef<HTMLDivElement>(null);
  const optionsIconRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null); // null = undecided
  const triggeredAction = useRef<'reply' | 'options' | null>(null);
  const [triggeredState, setTriggeredState] = useState<'reply' | 'options' | null>(null);

  const canSwipe = !isDeleted && message.status !== 'sending' && !isSelectMode;

  const setSwipePos = (x: number, animate: boolean) => {
    if (!rowRef.current) return;
    const trans = animate ? 'transform 0.42s cubic-bezier(0.34,1.56,0.64,1)' : 'none';
    const iconTrans = animate ? 'opacity 0.25s, transform 0.42s cubic-bezier(0.34,1.56,0.64,1)' : 'none';

    rowRef.current.style.transition = trans;
    rowRef.current.style.transform = `translateX(${x}px)`;

    if (x > 0 && replyIconRef.current) {
      // Swiping right: reveal reply icon on left
      const progress = Math.min(x / SWIPE_THRESHOLD, 1);
      replyIconRef.current.style.transition = iconTrans;
      replyIconRef.current.style.opacity = String(progress);
      replyIconRef.current.style.transform = `translateY(-50%) scale(${0.4 + 0.6 * progress})`;

      if (optionsIconRef.current) {
        optionsIconRef.current.style.opacity = '0';
        optionsIconRef.current.style.transform = 'translateY(-50%) scale(0.4)';
      }
    } else if (x < 0 && optionsIconRef.current) {
      // Swiping left: reveal options icon on right
      const progress = Math.min(Math.abs(x) / SWIPE_THRESHOLD, 1);
      optionsIconRef.current.style.transition = iconTrans;
      optionsIconRef.current.style.opacity = String(progress);
      optionsIconRef.current.style.transform = `translateY(-50%) scale(${0.4 + 0.6 * progress})`;

      if (replyIconRef.current) {
        replyIconRef.current.style.opacity = '0';
        replyIconRef.current.style.transform = 'translateY(-50%) scale(0.4)';
      }
    } else {
      if (replyIconRef.current) {
        replyIconRef.current.style.transition = iconTrans;
        replyIconRef.current.style.opacity = '0';
        replyIconRef.current.style.transform = 'translateY(-50%) scale(0.4)';
      }
      if (optionsIconRef.current) {
        optionsIconRef.current.style.transition = iconTrans;
        optionsIconRef.current.style.opacity = '0';
        optionsIconRef.current.style.transform = 'translateY(-50%) scale(0.4)';
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canSwipe) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    triggeredAction.current = null;
    setTriggeredState(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!canSwipe) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Decide direction on first significant movement
    if (isHorizontal.current === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontal.current) return; // vertical scroll — ignore

    if (dx > 0) {
      // ── Swipe-right: Reply ────────────────────────────────────────────────
      if (!onReply) return;
      let x: number;
      if (dx <= SWIPE_THRESHOLD) {
        x = dx;
      } else {
        x = SWIPE_THRESHOLD + (dx - SWIPE_THRESHOLD) * 0.25;
        x = Math.min(x, SWIPE_MAX);
      }
      setSwipePos(x, false);

      if (dx >= SWIPE_THRESHOLD && triggeredAction.current !== 'reply') {
        triggeredAction.current = 'reply';
        setTriggeredState('reply');
        triggerHaptic('medium');
      } else if (dx < SWIPE_THRESHOLD && triggeredAction.current === 'reply') {
        triggeredAction.current = null;
        setTriggeredState(null);
      }
    } else if (dx < 0) {
      // ── Swipe-left: Options ──────────────────────────────────────────────
      const absDx = Math.abs(dx);
      let x: number;
      if (absDx <= SWIPE_THRESHOLD) {
        x = -absDx;
      } else {
        const rubber = SWIPE_THRESHOLD + (absDx - SWIPE_THRESHOLD) * 0.25;
        x = -Math.min(rubber, SWIPE_MAX);
      }
      setSwipePos(x, false);

      if (absDx >= SWIPE_THRESHOLD && triggeredAction.current !== 'options') {
        triggeredAction.current = 'options';
        setTriggeredState('options');
        triggerHaptic('medium');
      } else if (absDx < SWIPE_THRESHOLD && triggeredAction.current === 'options') {
        triggeredAction.current = null;
        setTriggeredState(null);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!canSwipe) return;
    setSwipePos(0, true); // spring back
    const action = triggeredAction.current;
    if (action === 'reply') {
      onReply?.(message);
    } else if (action === 'options') {
      // 1. Immediately reset transform so measurement isn't shifted by -65px
      if (rowRef.current) {
        rowRef.current.style.transition = 'none';
        rowRef.current.style.transform = 'none';
      }
      if (replyIconRef.current) replyIconRef.current.style.opacity = '0';
      if (optionsIconRef.current) optionsIconRef.current.style.opacity = '0';

      // 2. Measure the exact bubble element
      if (bubbleRef.current && onOpenContextMenu) {
        onOpenContextMenu(message, bubbleRef.current.getBoundingClientRect());
      }
    }
    triggeredAction.current = null;
    setTimeout(() => setTriggeredState(null), 420);
  };

  return (
    // Outer wrapper: stays fixed — the reply and options icons live here
    <div className="relative mb-0.5">

      {/* ── Reply icon — revealed as bubble slides right ───────────────── */}
      {onReply && !isSelectMode && (
        <div
          ref={replyIconRef}
          className="absolute left-2 z-0 pointer-events-none"
          style={{ top: '50%', transform: 'translateY(-50%) scale(0.4)', opacity: 0 }}
          aria-hidden
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-150
              ${triggeredState === 'reply' ? 'bg-gold text-ink' : 'bg-zinc-700/80 text-paper/70'}`}
          >
            <CornerUpLeft size={15} strokeWidth={2.5} />
          </div>
        </div>
      )}

      {/* ── Options icon — revealed as bubble slides left ───────────────── */}
      {!isSelectMode && (
        <div
          ref={optionsIconRef}
          className="absolute right-2 z-0 pointer-events-none"
          style={{ top: '50%', transform: 'translateY(-50%) scale(0.4)', opacity: 0 }}
          aria-hidden
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-150
              ${triggeredState === 'options' ? 'bg-gold text-ink' : 'bg-zinc-700/80 text-paper/70'}`}
          >
            <MoreHorizontal size={15} strokeWidth={2.5} />
          </div>
        </div>
      )}

      {/* ── Swipeable row ─────────────────────────────────────────────── */}
      <div
        ref={rowRef}
        className={`group flex items-end gap-2 touch-pan-y ${isMine ? 'flex-row-reverse' : 'flex-row'}
          ${isSelectMode ? 'cursor-pointer active:opacity-85' : ''}`}
        onClick={isSelectMode ? () => onToggleSelect?.(message.id) : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => {
          if (!canSwipe) return;
          e.preventDefault();
          if (bubbleRef.current && onOpenContextMenu) {
            onOpenContextMenu(message, bubbleRef.current.getBoundingClientRect());
          }
        }}
      >
        {/* Multi-select circular checkbox */}
        {isSelectMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(message.id);
            }}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 mb-1.5
              ${isSelected
                ? 'bg-gold border-gold text-ink shadow-sm'
                : 'border-white/40 hover:border-white/70 bg-black/40'}`}
          >
            {isSelected && <Check size={12} strokeWidth={3.5} />}
          </div>
        )}

        {/* Bubble */}
        <div
          ref={bubbleRef}
          className={`relative max-w-[75%] select-text
            ${isMine ? 'items-end' : 'items-start'} flex flex-col`}
        >
          {/* Context menu on hover (desktop) */}
          <div
            className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10
              ${isMine ? 'right-full mr-2' : 'left-full ml-2'}`}
          >
            {onReply && !isDeleted && message.status !== 'sending' && (
              <button
                onClick={() => onReply(message)}
                className="w-7 h-7 rounded-full bg-ink-light border border-border-subtle flex items-center justify-center text-muted hover:text-paper transition-colors"
                title="Reply"
              >
                <CornerUpLeft size={13} strokeWidth={2.2} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (bubbleRef.current && onOpenContextMenu) {
                  onOpenContextMenu(message, bubbleRef.current.getBoundingClientRect());
                }
              }}
              className="w-7 h-7 rounded-full bg-ink-light border border-border-subtle flex items-center justify-center text-muted hover:text-paper transition-colors"
              title="More options"
            >
              <MoreHorizontal size={13} strokeWidth={2.2} />
            </button>
            {isMine && !isDeleted && message.status !== 'sending' && (
              <button
                onClick={() => onDelete(message.id)}
                className="w-7 h-7 rounded-full bg-ink-light border border-border-subtle flex items-center justify-center text-muted hover:text-red-400 transition-colors"
                title="Delete"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            )}
          </div>

          <div
            className={`rounded-2xl break-words transition-all
              ${vaultMedia.isVaultMedia && vaultMedia.media
                ? `p-1 overflow-hidden max-w-[320px] ${
                    isMine
                      ? 'bg-[#18181b] border border-white/10 text-paper rounded-br-sm'
                      : 'bg-[#18181b] border border-white/10 text-paper rounded-bl-sm'
                  }`
                : `px-4 py-3 text-[15px] sm:text-base leading-relaxed ${
                    isMine
                      ? 'bg-[#1a1a12] border border-gold/20 text-paper rounded-br-sm'
                      : 'bg-ink-light border border-border-subtle text-paper rounded-bl-sm'
                  }`
              }
              ${isDeleted ? 'opacity-60' : ''}
              ${message.status === 'sending' ? 'opacity-70' : ''}`}
          >
            {/* Quoted replied message banner */}
            {replyTarget && (
              <QuotedReplyBanner
                replyTarget={replyTarget}
                isMine={isMine}
                currentUserId={user?.id}
                onScrollToMessage={onScrollToMessage}
              />
            )}

            {isDeleted && !isRevealed ? (
              <span className="italic text-muted text-xs flex items-center justify-between gap-2">
                <span>{isMine ? 'You deleted this message' : 'This message was deleted'}</span>
                {!isMine && isCreator && onReveal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReveal(message.id);
                    }}
                    className="ml-2 text-gold/80 hover:text-gold transition-colors not-italic font-medium text-xs cursor-pointer"
                  >
                    Reveal
                  </button>
                )}
              </span>
            ) : (
              <>
                {isDeleted && isRevealed && (
                  <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-gold/20 text-[0.68rem] text-gold font-medium">
                    <span className="flex items-center gap-1">
                      <span>⚠️ Deleted message</span>
                      <span className="text-muted font-normal">(Revealed)</span>
                    </span>
                    {onReveal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReveal(message.id);
                        }}
                        className="text-muted hover:text-paper text-[0.65rem] underline cursor-pointer"
                      >
                        Hide
                      </button>
                    )}
                  </div>
                )}
                {storyReply.isStoryReply ? (
                  <div className="flex flex-col gap-2 min-w-[200px] sm:min-w-[240px]">
                    {/* WhatsApp-Style Quoted Story Card */}
                    <div
                      onClick={() => {
                        if (storyReply.meta && onOpenStory) {
                          onOpenStory(storyReply.meta);
                        }
                      }}
                      className={`flex items-stretch justify-between gap-3 p-2 rounded-xl bg-black/45 border border-white/10 select-none transition-all ${
                        storyReply.meta ? 'cursor-pointer hover:bg-black/60 active:scale-[0.99]' : ''
                      }`}
                      title="Tap to view story"
                    >
                      {/* Left Accent Stripe + Info */}
                      <div className="flex items-stretch gap-2.5 min-w-0 flex-1 py-0.5">
                        <div className="w-1 rounded-full bg-gold shrink-0 self-stretch" />
                        <div className="flex flex-col justify-center min-w-0 overflow-hidden">
                          <span className="text-[0.72rem] font-semibold text-gold truncate">
                            {isMine ? 'You • Story' : `${storyReply.meta?.creatorName || 'Story'} • Story`}
                          </span>
                          <div className="flex items-center gap-1.5 text-neutral-300 text-[0.7rem] truncate mt-0.5">
                            {storyReply.meta?.mediaType === 'video' ? (
                              <>
                                <Video size={13} className="shrink-0 text-gold" />
                                <span className="truncate">{storyReply.meta?.caption || 'Video'}</span>
                              </>
                            ) : (
                              <>
                                <Camera size={13} className="shrink-0 text-gold" />
                                <span className="truncate">{storyReply.meta?.caption || 'Photo'}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Story Thumbnail */}
                      {storyReply.meta?.mediaUrl ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/15 bg-neutral-900 shadow-md">
                          {storyReply.meta?.mediaType === 'video' ? (
                            <video
                              src={storyReply.meta.mediaUrl}
                              className="w-full h-full object-cover pointer-events-none"
                              preload="metadata"
                              muted
                            />
                          ) : (
                            <img
                              src={storyReply.meta.mediaUrl}
                              alt="Story"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg shrink-0 border border-white/10 bg-white/5 flex items-center justify-center text-muted">
                          <StoryStatusIcon size={20} className="text-gold" />
                        </div>
                      )}
                    </div>

                    {/* User's Reply Text / Reaction */}
                    {storyReply.meta?.reactionEmoji ? (
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-2xl leading-none select-none">{storyReply.meta.reactionEmoji}</span>
                        <span className="text-xs text-neutral-300">Reacted to story</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-paper text-[15px] sm:text-base leading-relaxed px-0.5">
                        {storyReply.replyText}
                      </p>
                    )}
                  </div>
                ) : vaultMedia.isVaultMedia && vaultMedia.media ? (
                  vaultMedia.media.isLocked ? (
                    <div className="space-y-2">
                      <LockedAttachmentCard
                        media={vaultMedia.media}
                        isMine={isMine}
                        isCreator={isCreator}
                        currentUserId={user?.id}
                        isSending={message.status === 'sending'}
                        senderName={senderDisplayName}
                        senderAvatar={senderAvatarUrl}
                        timestamp={bubbleTimestamp}
                      />
                      {vaultMedia.text && (
                        <p className="whitespace-pre-wrap text-paper text-[15px] sm:text-base leading-relaxed px-0.5">
                          {vaultMedia.text}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Free media attachments (single or batch) */
                    <div className="space-y-2 select-none">
                      {vaultMedia.media.items && vaultMedia.media.items.length > 1 ? (
                        /* WhatsApp-style free batch gallery */
                        <WhatsAppMediaGrid
                          items={vaultMedia.media.items}
                          canViewFull={true}
                          isSending={message.status === 'sending'}
                          onItemClick={(idx) => {
                            if (message.status === 'sending') return;
                            setFreeLightboxIndex(idx);
                            setFreeLightboxOpen(true);
                          }}
                        />
                      ) : (
                        /* Free single item */
                        <div
                          onClick={(e) => {
                            if (message.status === 'sending') return;
                            e.stopPropagation();
                            setFreeLightboxIndex(0);
                            setFreeLightboxOpen(true);
                          }}
                          className="rounded-xl overflow-hidden w-full cursor-pointer group relative"
                        >
                          {vaultMedia.media.mediaType === 'video' ? (
                            <div className="relative">
                              <video
                                src={vaultMedia.media.thumbnailUrl || vaultMedia.media.mediaUrl}
                                poster={vaultMedia.media.thumbnailUrl || undefined}
                                className="w-full max-h-[300px] object-contain rounded-xl"
                              />
                              {message.status === 'sending' ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                                  <div className="w-12 h-12 rounded-full bg-black/80 border border-gold/40 flex items-center justify-center shadow-lg">
                                    <Loader2 size={24} className="animate-spin text-gold" />
                                  </div>
                                </div>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                                  <div className="w-12 h-12 rounded-full bg-black/70 backdrop-blur text-white flex items-center justify-center shadow-lg">
                                    <Play size={20} fill="currentColor" />
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="relative">
                              <img
                                src={vaultMedia.media.mediaUrl}
                                alt={vaultMedia.media.title || 'Media attachment'}
                                className="w-full max-h-[300px] object-cover rounded-xl transition-transform duration-300 group-hover:scale-102"
                              />
                              {message.status === 'sending' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px] rounded-xl">
                                  <div className="w-12 h-12 rounded-full bg-black/80 border border-gold/40 flex items-center justify-center shadow-lg">
                                    <Loader2 size={24} className="animate-spin text-gold" />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {!message.status && (
                            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-white/80 text-[0.62rem] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye size={11} />
                              <span>Expand</span>
                            </div>
                          )}
                        </div>
                      )}

                      {vaultMedia.text && (
                        <p className="whitespace-pre-wrap text-paper text-[15px] sm:text-base leading-relaxed px-0.5">
                          {vaultMedia.text}
                        </p>
                      )}

                      {/* Lightbox for free media */}
                      <MediaLightbox
                        isOpen={freeLightboxOpen}
                        onClose={() => setFreeLightboxOpen(false)}
                        items={
                          vaultMedia.media.items && vaultMedia.media.items.length > 0
                            ? vaultMedia.media.items.map((it) => ({
                                mediaUrl: it.mediaUrl,
                                mediaType: it.mediaType,
                                title: it.title,
                                caption: vaultMedia.text || it.title || null,
                                thumbnailUrl: it.thumbnailUrl || vaultMedia.media?.thumbnailUrl || null,
                                senderName: senderDisplayName,
                                senderAvatar: senderAvatarUrl,
                                timestamp: bubbleTimestamp,
                              }))
                            : [{
                                mediaUrl: vaultMedia.media.mediaUrl,
                                mediaType: vaultMedia.media.mediaType,
                                title: vaultMedia.media.title,
                                caption: vaultMedia.text || vaultMedia.media.title || null,
                                thumbnailUrl: vaultMedia.media?.thumbnailUrl || null,
                                senderName: senderDisplayName,
                                senderAvatar: senderAvatarUrl,
                                timestamp: bubbleTimestamp,
                              }]
                        }
                        initialIndex={freeLightboxIndex}
                        senderName={senderDisplayName}
                        senderAvatar={senderAvatarUrl}
                        timestamp={bubbleTimestamp}
                        caption={vaultMedia.text || null}
                        onReply={() => {
                          setFreeLightboxOpen(false);
                          onReply?.(message);
                        }}
                        onDelete={() => {
                          setFreeLightboxOpen(false);
                          onDelete(message.id);
                        }}
                        onReact={(emoji) => {
                          onReact?.(message.id, emoji);
                        }}
                      />
                    </div>
                  )
                ) : isVoiceNote ? (
                  <span className="flex items-center gap-2 text-muted text-xs">
                    🎤 <span>Voice note</span>
                  </span>
                ) : isAttachment ? (
                  <span className="flex items-center gap-2 text-muted text-xs">
                    📎 <span>Attachment</span>
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                )}
            </>
          )}
          </div>

          {/* Reaction badges on bubble */}
          {message.reactions && Object.keys(message.reactions).length > 0 && (
            <div className={`flex flex-wrap items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
              {Object.entries(message.reactions).map(([emoji, userIds]) => {
                if (!userIds || userIds.length === 0) return null;
                const hasReacted = user?.id ? userIds.includes(user.id) : false;
                const appleEmojiUrl = getAppleEmojiUrlByChar(emoji);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact?.(message.id, emoji);
                    }}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-all active:scale-90 cursor-pointer
                      ${hasReacted
                        ? 'bg-gold/20 border border-gold/40 text-gold shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10 text-paper/80'}`}
                    title={hasReacted ? 'You reacted (click to remove)' : 'Click to react'}
                  >
                    {appleEmojiUrl ? (
                      <img
                        src={appleEmojiUrl}
                        alt={emoji}
                        className="w-3.5 h-3.5 object-contain pointer-events-none select-none"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-xs leading-none">{emoji}</span>
                    )}
                    {userIds.length > 1 && (
                      <span className="text-[0.65rem] font-medium leading-none">{userIds.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Timestamp + read receipt */}
          <div className={`flex items-center gap-1 mt-0.5 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
            <span className="text-[0.6rem] text-muted">
              {formatTime(message.created_at)}
            </span>
            {isMine && (
              <ReadReceipt status={message.status} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Read receipt icon ─────────────────────────────────────────────────────────
// sending   → clock icon             (message not yet confirmed by server)
// sent      → single grey tick       (server confirmed, recipient not yet received)
// delivered → double grey ticks      (recipient's client received it)
// read      → double gold ticks      (recipient opened the conversation)

// ── Quoted replied message banner ──────────────────────────────────────────
function QuotedReplyBanner({
  replyTarget,
  isMine,
  currentUserId,
  onScrollToMessage,
}: {
  replyTarget: ReplyTargetData;
  isMine: boolean;
  currentUserId?: string;
  onScrollToMessage?: (id: string) => void;
}) {
  const clean = getCleanMessagePreview(
    replyTarget.content,
    replyTarget.message_type,
    replyTarget.is_deleted
  );

  const senderName = replyTarget.sender_id === currentUserId
    ? 'You'
    : (replyTarget.sender?.display_name || replyTarget.sender?.username || 'User');

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onScrollToMessage?.(replyTarget.id);
      }}
      className={`mb-2 p-2 rounded-xl flex items-stretch gap-2.5 transition-all select-none
        ${onScrollToMessage ? 'cursor-pointer active:scale-[0.99]' : ''}
        ${isMine
          ? 'bg-black/45 hover:bg-black/60 border border-gold/20'
          : 'bg-black/35 hover:bg-black/50 border border-white/10'}`}
      title={onScrollToMessage ? 'Tap to view original message' : undefined}
    >
      {/* Left accent bar */}
      <div className="w-1 rounded-full bg-gold shrink-0 self-stretch" />

      {/* Sender name + clean preview */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="text-[0.72rem] font-semibold text-gold truncate">
          {senderName}
        </span>
        <p className="text-[0.72rem] text-paper/80 truncate leading-tight mt-0.5">
          {clean.text}
        </p>
      </div>

      {/* Right thumbnail if replied-to message had media or story */}
      {clean.thumbnailUrl && (
        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-neutral-900 shadow-sm">
          {clean.mediaType === 'video' ? (
            <video
              src={clean.thumbnailUrl}
              className="w-full h-full object-cover pointer-events-none"
              muted
            />
          ) : (
            <img
              src={clean.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReadReceipt({ status }: { status: MessageStatus }) {
  if (status === 'sending') {
    return <Clock size={12} className="text-muted shrink-0" />;
  }
  if (status === 'read') {
    return <CheckCheck size={14} className="text-gold shrink-0" />;
  }
  if (status === 'delivered') {
    return <CheckCheck size={14} className="text-muted shrink-0" />;
  }
  // 'sent'
  return <Check size={13} className="text-muted shrink-0" />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Date separator — subtle, minimal floating date pill
export function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);

  let label: string;
  if (diffDays === 0) label = 'Today';
  else if (diffDays === 1) label = 'Yesterday';
  else if (diffDays < 7) label = d.toLocaleDateString([], { weekday: 'long' });
  else label = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });

  return (
    <div className="flex items-center justify-center my-3 select-none">
      <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] text-[0.66rem] font-normal text-muted/75 tracking-wide">
        {label}
      </span>
    </div>
  );
}
