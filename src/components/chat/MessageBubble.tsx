import { useRef, useState } from 'react';
import { Check, CheckCheck, Video, Camera, Lock, Clock, CornerUpLeft, MoreHorizontal, Play, Eye, Loader2, AlertCircle, FileText, ArrowDownToLine, Gift, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import type { MessageStatus } from '../../types';
import { parseStoryReply, type StoryReplyMetadata } from '../../lib/storyReplies';
import { parseVaultMediaMessage } from '../../lib/creatorVault';
import { getCleanMessagePreview, parseDocumentMessage, parseGiftMessage, stripHiddenComments } from '../../lib/messageUtils';
import StoryStatusIcon from './StoryStatusIcon';
import LockedAttachmentCard from './LockedAttachmentCard';
import UnlockReceiptCard from './UnlockReceiptCard';
import GiftReceiptCard from './GiftReceiptCard';
import MediaLightbox from './MediaLightbox';
import WhatsAppMediaGrid from './WhatsAppMediaGrid';
import { getAppleEmojiUrlByChar } from '../../data/iosEmojis';
import { triggerHaptic } from '../../lib/haptics';
import { parseUnlockRequestMessage } from '../../lib/unlockRequests';

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
  isUnlocked?: boolean;
  isPendingVerification?: boolean;
  onUnlocked?: () => void;
  onOpenMedia?: (url: string) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageBubble({
  message, isMine, isCreator, showAvatar, replyTarget,
  isRevealed, isSelectMode, isSelected, onToggleSelect,
  onDelete, onReveal, onReply, onOpenStory, onScrollToMessage,
  onOpenContextMenu, onReact, otherName, otherAvatar,
  isUnlocked = false, isPendingVerification = false, onUnlocked,
  onOpenMedia,
}: Props) {
  const { user } = useAuth();
  const isDeleted = message.is_deleted;
  const isVoiceNote = message.message_type === 'voice_note';
  const isAttachment = message.message_type === 'attachment';
  const storyReply = parseStoryReply(message.content);
  const vaultMedia = parseVaultMediaMessage(message.content);
  const docData = parseDocumentMessage(message.content);
  const giftData = parseGiftMessage(message.content);
  const unlockReq = parseUnlockRequestMessage(message.content);
  const isUnlockReq = unlockReq.isUnlockRequest || Boolean(message.content && (message.content.includes('<!--unlock-request:') || message.content.includes('"type":"unlock_request"')));

  // Invisible message types (confirmation signals, legacy comments, bot celebration messages)
  if (
    message.content?.includes('unlock_confirmed') ||
    message.content?.includes('unlock-confirmed') ||
    message.content?.includes('Payment verified! Unlocked')
  ) {
    return null;
  }

  // Unlock request receipt card is ONLY for the creator receiving it (hidden for fan)
  if (isUnlockReq && (!isCreator || isMine)) {
    return null;
  }

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
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.closest('img') ||
       target.closest('video') ||
       target.closest('button') ||
       target.closest('a') ||
       target.closest('[data-no-swipe]') ||
       target.closest('.no-swipe'))
    ) {
      touchStartX.current = 0;
      return;
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    triggeredAction.current = null;
    setTriggeredState(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!canSwipe || touchStartX.current === 0) return;
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
    <div className="relative">

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
          {/* Context menu on hover (desktop only — mobile uses swipe & long-press) */}
          <div
            className={`absolute top-0 hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity gap-1 z-10
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
          </div>

          <div
            className={`rounded-2xl break-words transition-all relative
              ${giftData.isGift
                ? 'p-0 overflow-hidden bg-transparent border-0 shadow-none'
                : (vaultMedia.isVaultMedia && vaultMedia.media) || unlockReq.isUnlockRequest
                ? `p-1 overflow-hidden max-w-[320px] sm:max-w-[340px] ${
                    isMine
                      ? 'bg-[#18181b] border border-white/10 text-paper rounded-br-sm'
                      : 'bg-[#18181b] border border-white/10 text-paper rounded-bl-sm'
                  }`
                : `px-3.5 pt-2 pb-1.5 text-[15px] sm:text-base leading-relaxed ${
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
              <div className="italic text-muted text-xs flex items-center justify-between gap-4 pr-14">
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
              </div>
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
                      <div className="flex items-center gap-2 pt-0.5 pr-14">
                        <span className="text-2xl leading-none select-none">{storyReply.meta.reactionEmoji}</span>
                        <span className="text-xs text-neutral-300">Reacted to story</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-paper text-[15px] sm:text-base leading-relaxed px-0.5 break-words">
                        {storyReply.replyText}
                        <TimestampSpacer isMine={isMine} />
                      </p>
                    )}
                  </div>
                ) : unlockReq.isUnlockRequest && unlockReq.request ? (
                  <div className="space-y-1">
                    <UnlockReceiptCard
                      message={message}
                      request={unlockReq.request}
                      isMine={isMine}
                      isCreator={isCreator}
                      currentUserId={user?.id}
                      onApproveSuccess={onUnlocked}
                    />
                  </div>
                ) : vaultMedia.isVaultMedia && vaultMedia.media ? (
                  vaultMedia.media.isLocked ? (
                    <div className="space-y-1">
                      <LockedAttachmentCard
                        media={vaultMedia.media}
                        isMine={isMine}
                        isCreator={isCreator}
                        currentUserId={user?.id}
                        creatorId={isMine ? user?.id : message.sender_id}
                        conversationId={message.conversation_id}
                        isUnlocked={isUnlocked}
                        isPendingVerification={isPendingVerification}
                        onUnlocked={onUnlocked}
                        onOpenMedia={onOpenMedia}
                        isSending={message.status === 'sending'}
                        senderName={senderDisplayName}
                        senderAvatar={senderAvatarUrl}
                        timestamp={bubbleTimestamp}
                      />
                      {vaultMedia.text && (
                        <p className="whitespace-pre-wrap text-paper text-[15px] sm:text-base leading-relaxed px-1.5 pt-1 pb-0.5 break-words">
                          {vaultMedia.text}
                          <TimestampSpacer isMine={isMine} />
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
                            const targetUrl = vaultMedia.media?.items?.[idx]?.mediaUrl;
                            if (onOpenMedia && targetUrl) {
                              onOpenMedia(targetUrl);
                            } else {
                              setFreeLightboxIndex(idx);
                              setFreeLightboxOpen(true);
                            }
                          }}
                        />
                      ) : (
                        /* Free single item */
                        <div
                          onClick={(e) => {
                            if (message.status === 'sending') return;
                            e.stopPropagation();
                            if (onOpenMedia && vaultMedia.media?.mediaUrl) {
                              onOpenMedia(vaultMedia.media.mediaUrl);
                            } else {
                              setFreeLightboxIndex(0);
                              setFreeLightboxOpen(true);
                            }
                          }}
                          data-no-swipe="true"
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
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-white/80 text-[0.62rem] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye size={11} />
                              <span>Expand</span>
                            </div>
                          )}
                        </div>
                      )}

                      {vaultMedia.text && (
                        <p className="whitespace-pre-wrap text-paper text-[15px] sm:text-base leading-relaxed px-1.5 pt-1.5 pb-0.5 break-words">
                          {vaultMedia.text}
                          <TimestampSpacer isMine={isMine} />
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
                ) : docData.isDocument && docData.document ? (
                  <div className="space-y-1.5 select-none min-w-[220px] max-w-[280px] sm:max-w-[320px]">
                    <a
                      href={docData.document.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={docData.document.name}
                      data-no-swipe="true"
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-black/25 hover:bg-black/40 border border-white/10 transition-all group active:scale-98 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/25">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-paper truncate group-hover:underline">
                          {docData.document.name}
                        </p>
                        <p className="text-[0.68rem] text-muted flex items-center gap-1.5 mt-0.5">
                          <span>{docData.document.size ? formatFileSize(docData.document.size) : 'Document'}</span>
                          <span>•</span>
                          <span className="uppercase text-paper/60 font-semibold">
                            {docData.document.name.split('.').pop() || 'FILE'}
                          </span>
                        </p>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-white/15 flex items-center justify-center text-muted group-hover:text-paper transition-colors shrink-0">
                        <ArrowDownToLine size={14} />
                      </div>
                    </a>
                    {docData.text && (
                      <p className="whitespace-pre-wrap text-paper text-[15px] sm:text-base leading-relaxed px-1 break-words">
                        {docData.text}
                        <TimestampSpacer isMine={isMine} />
                      </p>
                    )}
                  </div>
                ) : giftData.isGift ? (
                  <GiftReceiptCard
                    gift={giftData.gift}
                    rawContent={message.content}
                    isMine={isMine}
                    isCreator={isCreator}
                    senderName={senderDisplayName}
                    timestamp={bubbleTimestamp}
                    status={message.status}
                  />
                ) : isVoiceNote ? (
                  <div className="flex items-center gap-2 text-muted text-xs pr-14">
                    🎤 <span>Voice note</span>
                  </div>
                  ) : isAttachment ? (
                  <div className="flex items-center gap-2 text-muted text-xs pr-14">
                    📎 <span>Attachment</span>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap break-words">
                    {stripHiddenComments(message.content)}
                    <TimestampSpacer isMine={isMine} />
                  </span>
                )}
            </>
          )}

            {/* WhatsApp-style In-Bubble Timestamp & Read Receipt */}
            {!giftData.isGift && (
              <BubbleTimestamp
                createdAt={message.created_at}
                isMine={isMine}
                status={message.status}
                isMediaOverlay={Boolean(vaultMedia.isVaultMedia && vaultMedia.media && !vaultMedia.text && !vaultMedia.media.isLocked)}
              />
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

function ReadReceipt({ status, isOverlay = false }: { status: MessageStatus; isOverlay?: boolean }) {
  if (status === 'sending') {
    return <Clock size={11} className={`${isOverlay ? 'text-white/80' : 'text-paper/40'} shrink-0`} />;
  }
  if (status === 'failed') {
    return (
      <span title="Upload failed" className="inline-flex items-center shrink-0">
        <AlertCircle size={12} strokeWidth={2.4} className="text-red-400 shrink-0" />
      </span>
    );
  }
  if (status === 'read') {
    return <CheckCheck size={14} strokeWidth={2.4} className="text-gold shrink-0" />;
  }
  if (status === 'delivered') {
    return <CheckCheck size={14} strokeWidth={2.4} className={`${isOverlay ? 'text-white/80' : 'text-paper/40'} shrink-0`} />;
  }
  // 'sent'
  return <Check size={13} strokeWidth={2.4} className={`${isOverlay ? 'text-white/80' : 'text-paper/40'} shrink-0`} />;
}

function BubbleTimestamp({
  createdAt,
  isMine,
  status,
  isMediaOverlay = false,
}: {
  createdAt: string;
  isMine: boolean;
  status: MessageStatus;
  isMediaOverlay?: boolean;
}) {
  return (
    <span
      className={`absolute select-none inline-flex items-center gap-1 leading-none z-10 pointer-events-none ${
        isMediaOverlay
          ? 'right-2 bottom-2 px-1.5 py-0.5 rounded-full bg-black/65 backdrop-blur-sm text-white/90 text-[0.62rem] shadow-sm'
          : 'right-2.5 bottom-1.5 text-[0.65rem] text-paper/50'
      }`}
    >
      <span className="tabular-nums font-normal">{formatTime(createdAt)}</span>
      {isMine && <ReadReceipt status={status} isOverlay={isMediaOverlay} />}
    </span>
  );
}

function TimestampSpacer({ isMine }: { isMine: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block pointer-events-none select-none align-baseline ${
        isMine ? 'w-[54px] h-3.5' : 'w-[36px] h-3.5'
      }`}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
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
