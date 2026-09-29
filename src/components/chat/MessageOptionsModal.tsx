import { useState } from 'react';
import {
  CornerUpLeft,
  Copy,
  Check,
  Trash2,
  Play,
  Clock,
  CheckCheck,
  X,
} from 'lucide-react';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import { parseStoryReply } from '../../lib/storyReplies';
import { getCleanMessagePreview } from '../../lib/messageUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  message: MessageWithSender;
  isMine: boolean;
  isCreator: boolean;
  onReply?: () => void;
  onDelete?: () => void;
  onOpenStory?: () => void;
}

function formatFullTime(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} at ${timeStr}`;
}

export default function MessageOptionsModal({
  isOpen,
  onClose,
  message,
  isMine,
  isCreator,
  onReply,
  onDelete,
  onOpenStory,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isDeleted = message.is_deleted;
  const storyReply = parseStoryReply(message.content);
  const preview = getCleanMessagePreview(message.content, message.message_type);

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(preview.text || message.content);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 900);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const senderName = isMine
    ? 'You'
    : (message.sender?.display_name ?? message.sender?.username ?? 'User');

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-[#18181b] border-t sm:border border-white/10 p-4 sm:p-5 shadow-2xl relative max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Message snippet preview header */}
        <div className="flex items-center gap-3 p-3 bg-white/[0.04] rounded-xl border border-white/5 mb-3 shrink-0">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-ink-light border border-border-subtle shrink-0 flex items-center justify-center text-gold font-serif text-xs">
            {message.sender?.avatar_url ? (
              <img src={message.sender.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              senderName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gold truncate">{senderName}</p>
            <p className="text-xs text-paper/80 truncate mt-0.5">
              {isDeleted ? (
                <span className="italic text-muted">This message was deleted</span>
              ) : (
                preview.text || message.content || 'Attachment'
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-paper p-1 rounded-full hover:bg-white/10 transition-colors shrink-0"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions List */}
        <div className="space-y-1 overflow-y-auto no-scrollbar py-1">
          {/* 1. Reply */}
          {onReply && !isDeleted && message.status !== 'sending' && (
            <button
              onClick={() => {
                onReply();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 text-left transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-gold/10 text-gold flex items-center justify-center shrink-0 group-hover:bg-gold group-hover:text-ink transition-colors">
                <CornerUpLeft size={16} strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-paper">Reply</p>
                <p className="text-[0.68rem] text-muted">Quote this message in your reply</p>
              </div>
            </button>
          )}

          {/* 2. Copy Text */}
          {!isDeleted && message.content && message.message_type !== 'voice_note' && (
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 text-left transition-colors cursor-pointer group"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-muted group-hover:text-paper'
              }`}>
                {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-paper">
                  {copied ? 'Copied to clipboard!' : 'Copy Text'}
                </p>
                <p className="text-[0.68rem] text-muted">Copy message content</p>
              </div>
            </button>
          )}

          {/* 3. View Attached Story */}
          {storyReply.isStoryReply && onOpenStory && (
            <button
              onClick={() => {
                onOpenStory();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 text-left transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-ink transition-colors">
                <Play size={16} fill="currentColor" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-paper">View Story</p>
                <p className="text-[0.68rem] text-muted">Open the replied story</p>
              </div>
            </button>
          )}

          {/* 4. Timestamp & Status Info */}
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left bg-white/[0.02]">
            <div className="w-8 h-8 rounded-full bg-white/5 text-muted flex items-center justify-center shrink-0">
              <Clock size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted">
                Sent: <span className="text-paper/90 font-medium">{formatFullTime(message.created_at)}</span>
              </p>
              {message.read_at && (
                <p className="text-[0.68rem] text-gold flex items-center gap-1 mt-0.5">
                  <CheckCheck size={12} />
                  Read {formatFullTime(message.read_at)}
                </p>
              )}
            </div>
          </div>

          {/* 5. Delete (Only own messages) */}
          {isMine && !isDeleted && message.status !== 'sending' && onDelete && (
            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-red-500/10 text-left transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 group-hover:bg-red-500 group-hover:text-white transition-colors">
                <Trash2 size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-400">Delete Message</p>
                <p className="text-[0.68rem] text-muted">Remove this message</p>
              </div>
            </button>
          )}
        </div>

        {/* Close Button */}
        <div className="pt-3 border-t border-white/5 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-paper text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
