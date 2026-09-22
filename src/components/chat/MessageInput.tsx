import { useRef, useState, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import { Send, Mic, Smile, Plus, Grid3x3, Film, Upload } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import EmojiKeyboardDrawer from './EmojiKeyboardDrawer';
import VaultMediaPickerModal from './VaultMediaPickerModal';
import { useAuth } from '../../lib/AuthContext';
import { encodeVaultMediaMessage, uploadVaultMedia, type VaultItem } from '../../lib/creatorVault';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  replyTo?: { senderName: string; content: string } | null;
  onCancelReply?: () => void;
}

export default function MessageInput({ onSend, disabled, replyTo, onCancelReply }: Props) {
  const { isCreator, profile } = useAuth();
  const [value, setValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDeviceFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    try {
      const item = await uploadVaultMedia(file, profile.id);
      onSend(encodeVaultMediaMessage('', {
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        title: item.title,
        durationSecs: item.durationSecs,
      }));
    } catch (err) {
      console.error('Device upload failed:', err);
      alert('Failed to upload file.');
    } finally {
      e.target.value = '';
      setShowAttachmentMenu(false);
    }
  };

  const handleVaultSelect = (item: VaultItem, price?: number, messageText?: string) => {
    onSend(encodeVaultMediaMessage(messageText || '', {
      mediaUrl: item.mediaUrl,
      mediaType: item.mediaType,
      title: item.title,
      price,
      isLocked: Boolean(price && price > 0),
      durationSecs: item.durationSecs,
    }));
  };

  const handlePlusClick = () => {
    if (isCreator) {
      setShowAttachmentMenu((prev) => !prev);
    } else {
      fileInputRef.current?.click();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [value]);

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    setValue((prev) => prev + emojiData.emoji);
    textareaRef.current?.focus();
  };

  const handleBackspace = () => {
    setValue((prev) => Array.from(prev).slice(0, -1).join(''));
    textareaRef.current?.focus();
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="relative border-t border-border-subtle/50 bg-[#141416] select-none safe-area-bottom">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-start gap-2 pt-2 px-3 pl-4 border-l-2 border-gold/60 mx-3 mt-2 bg-white/5 rounded-r-xl py-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gold font-medium truncate">{replyTo.senderName}</p>
            <p className="text-xs text-muted truncate">{replyTo.content}</p>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              className="text-muted hover:text-paper transition-colors shrink-0 p-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      )}

      {/* Capsule Input Row (Styled matching reference Image 3) */}
      <div className="px-3 py-2 sm:py-2.5">
        <div className="w-full min-h-[48px] rounded-full bg-[#242426] border border-white/5 focus-within:border-gold/40 px-4 py-1.5 flex items-center gap-2.5 transition-all shadow-lg">
          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-white text-sm sm:text-base placeholder:text-neutral-400 focus:outline-none resize-none no-scrollbar leading-snug py-1.5 max-h-[120px]"
          />

          {/* Right Action Icons: Mic, Emoji, Plus/Send */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Voice / Mic button */}
            <button
              type="button"
              className="text-neutral-400 hover:text-white transition-colors cursor-pointer p-1"
              title="Voice message"
              disabled={disabled}
            >
              <Mic size={20} />
            </button>

            {/* Emoji toggle button (Image 4 keypad icon when open) */}
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className={`transition-colors cursor-pointer p-1 ${
                showEmojiPicker ? 'text-gold' : 'text-neutral-400 hover:text-white'
              }`}
              title={showEmojiPicker ? 'Switch to keyboard' : 'Open emojis'}
              disabled={disabled}
            >
              {showEmojiPicker ? (
                <Grid3x3 size={20} />
              ) : (
                <Smile size={20} />
              )}
            </button>

            {/* Plus / Send button */}
            {hasText ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled}
                className="w-8 h-8 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center font-bold shrink-0 shadow-lg active:scale-95 transition-all cursor-pointer"
                title="Send message"
              >
                <Send size={15} className="translate-x-[1px]" strokeWidth={2.4} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePlusClick}
                className="w-8 h-8 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center font-bold shrink-0 shadow active:scale-95 transition-all cursor-pointer"
                title="Add attachment"
                disabled={disabled}
              >
                <Plus size={18} strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for device uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDeviceFileSelect}
        accept="video/*,image/*"
        className="hidden"
      />

      {/* Creator Attachment Menu Popup */}
      {showAttachmentMenu && (
        <div className="absolute right-4 bottom-16 z-30 bg-[#1c1c1f] border border-white/10 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 min-w-[175px] animate-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => {
              setShowAttachmentMenu(false);
              setShowVaultPicker(true);
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-paper hover:bg-white/10 rounded-xl transition-colors text-left"
          >
            <Film size={14} className="text-gold" />
            <span>Choose from Library</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAttachmentMenu(false);
              fileInputRef.current?.click();
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-muted hover:text-paper hover:bg-white/10 rounded-xl transition-colors text-left"
          >
            <Upload size={14} />
            <span>Upload from device</span>
          </button>
        </div>
      )}

      {/* Vault Media Picker Modal */}
      <VaultMediaPickerModal
        isOpen={showVaultPicker}
        onClose={() => setShowVaultPicker(false)}
        onSelect={handleVaultSelect}
      />

      {/* Sub-Input Emoji Layer (Image 4) - Rendered directly below the input area */}
      {showEmojiPicker && (
        <EmojiKeyboardDrawer
          onEmojiSelect={handleEmojiSelect}
          onBackspace={handleBackspace}
          height={320}
        />
      )}
    </div>
  );
}
