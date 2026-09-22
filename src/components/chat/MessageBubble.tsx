import { Check, CheckCheck, Video, Camera, Lock } from 'lucide-react';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import type { MessageStatus } from '../../types';
import { parseStoryReply, type StoryReplyMetadata } from '../../lib/storyReplies';
import { parseVaultMediaMessage } from '../../lib/creatorVault';
import StoryStatusIcon from './StoryStatusIcon';

interface Props {
  message: MessageWithSender;
  isMine: boolean;
  isCreator: boolean;               // viewer is a creator (can reveal deleted msgs)
  showAvatar: boolean;              // first in a group from this sender
  onDelete: (id: string) => void;
  onReveal?: (id: string) => void;  // creator-only
  onReply?: (msg: MessageWithSender) => void;
  onOpenStory?: (meta: StoryReplyMetadata) => void;
}

export default function MessageBubble({
  message, isMine, isCreator, showAvatar, onDelete, onReveal, onReply, onOpenStory,
}: Props) {
  const isDeleted = message.is_deleted;
  const isVoiceNote = message.message_type === 'voice_note';
  const isAttachment = message.message_type === 'attachment';
  const storyReply = parseStoryReply(message.content);
  const vaultMedia = parseVaultMediaMessage(message.content);

  return (
    <div
      className={`group flex items-end gap-2 mb-0.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar — only for other person's first bubble in a group */}
      <div className="w-7 h-7 shrink-0">
        {!isMine && showAvatar && (
          <div className="w-7 h-7 rounded-full overflow-hidden bg-ink-light border border-border-subtle">
            {message.sender?.avatar_url ? (
              <img
                src={message.sender.avatar_url}
                alt={message.sender?.display_name ?? message.sender?.username ?? 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-gold text-xs font-serif">
                {(message.sender?.display_name ?? message.sender?.username ?? '?').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bubble */}
      <div
        className={`relative max-w-[75%] select-text
          ${isMine ? 'items-end' : 'items-start'} flex flex-col`}
      >
        {/* Context menu on hover */}
        <div
          className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10
            ${isMine ? 'right-full mr-2' : 'left-full ml-2'}`}
        >
          {onReply && !isDeleted && (
            <button
              onClick={() => onReply(message)}
              className="w-7 h-7 rounded-full bg-ink-light border border-border-subtle flex items-center justify-center text-muted hover:text-paper transition-colors"
              title="Reply"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            </button>
          )}
          {isMine && !isDeleted && (
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
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words
            ${isMine
              ? 'bg-[#1a1a12] border border-gold/20 text-paper rounded-br-sm'
              : 'bg-ink-light border border-border-subtle text-paper rounded-bl-sm'}
            ${isDeleted ? 'opacity-60' : ''}`}
        >
          {isDeleted ? (
            <span className="italic text-muted text-xs">
              {isMine ? 'You deleted this message' : 'This message was deleted'}
              {!isMine && isCreator && (
                <button
                  onClick={() => onReveal?.(message.id)}
                  className="ml-2 text-gold/70 hover:text-gold transition-colors not-italic font-medium"
                >
                  Reveal
                </button>
              )}
            </span>
          ) : isVoiceNote ? (
            <span className="flex items-center gap-2 text-muted text-xs">
              🎤 <span>Voice note</span>
            </span>
          ) : isAttachment ? (
            <span className="flex items-center gap-2 text-muted text-xs">
              📎 <span>Attachment</span>
            </span>
          ) : storyReply.isStoryReply ? (
            <div className="flex flex-col gap-2 min-w-[200px] sm:min-w-[240px]">
              {/* WhatsApp-Style Quoted Story Card (Image 2) */}
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
                    {storyReply.meta.mediaType === 'video' ? (
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
                <p className="whitespace-pre-wrap text-paper text-sm leading-relaxed px-0.5">
                  {storyReply.replyText}
                </p>
              )}
            </div>
          ) : vaultMedia.isVaultMedia && vaultMedia.media ? (
            <div className="space-y-2">
              <div className="rounded-xl overflow-hidden bg-black/40 border border-white/10 max-w-[280px]">
                {vaultMedia.media.mediaType === 'video' ? (
                  <video
                    src={vaultMedia.media.mediaUrl}
                    controls
                    className="w-full max-h-[300px] object-contain rounded-xl"
                  />
                ) : (
                  <img
                    src={vaultMedia.media.mediaUrl}
                    alt={vaultMedia.media.title || 'Media attachment'}
                    className="w-full max-h-[300px] object-cover rounded-xl"
                  />
                )}
                {vaultMedia.media.isLocked && (
                  <div className="p-2 bg-black/70 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-gold font-medium">
                      <Lock size={12} /> Paywall Locked
                    </span>
                    {vaultMedia.media.price && (
                      <span className="font-bold text-gold">${vaultMedia.media.price}</span>
                    )}
                  </div>
                )}
              </div>
              {vaultMedia.text && (
                <p className="whitespace-pre-wrap text-paper text-sm leading-relaxed px-0.5">
                  {vaultMedia.text}
                </p>
              )}
            </div>
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>

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
  );
}

// ── Read receipt icon ─────────────────────────────────────────────────────────

function ReadReceipt({ status }: { status: MessageStatus }) {
  if (status === 'read') {
    return <CheckCheck size={14} className="text-gold shrink-0" />;
  }
  if (status === 'delivered') {
    return <CheckCheck size={14} className="text-muted shrink-0" />;
  }
  return <Check size={13} className="text-muted shrink-0" />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Date separator — exported so ChatWindow can use it
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
    <div className="flex items-center gap-3 my-4 px-4">
      <div className="flex-1 h-px bg-border-subtle" />
      <span className="text-[0.62rem] text-muted uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex-1 h-px bg-border-subtle" />
    </div>
  );
}
