import { useRef, useState, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import { Send, Mic, Smile, Plus, Grid3x3, Film, Upload } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import EmojiKeyboardDrawer from './EmojiKeyboardDrawer';
import VaultMediaPickerModal from './VaultMediaPickerModal';
import ChatMediaEditorModal, { type ChatMediaSendData } from './ChatMediaEditorModal';
import { useAuth } from '../../lib/AuthContext';
import { encodeVaultMediaMessage, uploadVaultMedia, generateBlurredThumbnail, type VaultItem } from '../../lib/creatorVault';
import { uploadPublicFile } from '../../lib/r2';
import { getCleanMessagePreview } from '../../lib/messageUtils';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface Props {
  onSend: (text: string) => void;
  onSendMedia?: (optimisticContent: string, uploadFn: () => Promise<string | null>) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  replyTo?: {
    senderName: string;
    content: string;
    messageType?: string;
    thumbnailUrl?: string | null;
  } | null;
  onCancelReply?: () => void;
}

export default function MessageInput({ onSend, onSendMedia, onTyping, disabled, replyTo, onCancelReply }: Props) {
  const { isCreator, profile } = useAuth();
  const [value, setValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [selectedEditorFiles, setSelectedEditorFiles] = useState<File[]>([]);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Android hardware back button handlers for chat input sheets and modals
  useBackHandler(() => {
    setShowEditorModal(false);
    return true;
  }, showEditorModal, 120);

  useBackHandler(() => {
    setShowVaultPicker(false);
    return true;
  }, showVaultPicker, 115);

  useBackHandler(() => {
    setShowEmojiPicker(false);
    return true;
  }, showEmojiPicker, 110);

  useBackHandler(() => {
    setShowAttachmentMenu(false);
    return true;
  }, showAttachmentMenu, 105);

  const handleDeviceFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSelectedEditorFiles(files);
    setShowEditorModal(true);
    e.target.value = '';
    setShowAttachmentMenu(false);
  };

  const handleEditorSend = (data: ChatMediaSendData) => {
    if (data.items.length === 0) return;

    const batchId =
      data.items.length > 1
        ? `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        : data.batchId;
    const finalPrice = data.isLocked ? Math.max(5, data.price ?? 25) : undefined;

    // 1. Build optimistic media payload immediately using local preview URLs
    const optimisticItems = data.items.map((it) => ({
      mediaUrl: it.previewUrl,
      mediaType: it.mediaType,
      title: it.caption,
      thumbnailUrl: it.thumbnailUrl || it.previewUrl,
      blurredThumbnailUrl: it.thumbnailUrl || it.previewUrl,
    }));

    const firstOptItem = optimisticItems[0];
    const optimisticContent = encodeVaultMediaMessage(data.caption || '', {
      mediaUrl: firstOptItem.mediaUrl,
      mediaType: firstOptItem.mediaType,
      title: firstOptItem.title,
      thumbnailUrl: firstOptItem.thumbnailUrl,
      blurredThumbnailUrl: firstOptItem.blurredThumbnailUrl,
      price: finalPrice,
      isLocked: data.isLocked,
      batchId,
      items: optimisticItems,
    });

    // 2. Define background upload worker that returns the confirmed DB content
    const creatorId = profile?.id || 'creator';
    const uploadFn = async (): Promise<string | null> => {
      try {
        const uploadedItems: Array<{
          mediaUrl: string;
          mediaType: 'image' | 'video';
          thumbnailUrl?: string | null;
          blurredThumbnailUrl?: string | null;
          title?: string;
          durationSecs?: number;
        }> = [];

        for (const item of data.items) {
          let fileToUpload: File;

          if (item.mediaType === 'image' && item.bakedBlob) {
            fileToUpload = new File(
              [item.bakedBlob],
              `chat_img_${Date.now()}.webp`,
              { type: 'image/webp' }
            );
          } else {
            fileToUpload = item.file;
          }

          // Upload main media
          const vaultItem = await uploadVaultMedia(
            fileToUpload,
            creatorId,
            item.caption || fileToUpload.name,
            finalPrice
          );

          // Upload video thumbnail to get a persistent URL
          let persistentThumbUrl: string | null = vaultItem.thumbnailUrl ?? null;
          if (item.mediaType === 'video' && item.thumbnailFile) {
            try {
              const thumbKey = `vault/${creatorId}/thumb_${Date.now()}.jpg`;
              persistentThumbUrl = await uploadPublicFile(item.thumbnailFile, thumbKey);
            } catch (thumbErr) {
              console.warn('Could not upload video thumbnail:', thumbErr);
            }
          }

          // Generate blurred thumbnail for locked content
          let blurredThumbUrl: string | null = null;
          if (data.isLocked) {
            try {
              const sourceForBlur =
                item.mediaType === 'image' && item.bakedBlob
                  ? item.bakedBlob
                  : persistentThumbUrl || vaultItem.mediaUrl;
              blurredThumbUrl = await generateBlurredThumbnail(sourceForBlur);
            } catch (blurErr) {
              console.warn('Could not generate blurred thumbnail:', blurErr);
              blurredThumbUrl = persistentThumbUrl;
            }
          }

          uploadedItems.push({
            mediaUrl: vaultItem.mediaUrl,
            mediaType: item.mediaType,
            thumbnailUrl: persistentThumbUrl,
            blurredThumbnailUrl: blurredThumbUrl ?? persistentThumbUrl,
            title: item.caption || vaultItem.title,
            durationSecs: vaultItem.durationSecs,
          });
        }

        const firstItem = uploadedItems[0];
        return encodeVaultMediaMessage(data.caption || '', {
          mediaUrl: firstItem.mediaUrl,
          mediaType: firstItem.mediaType,
          title: firstItem.title,
          thumbnailUrl: firstItem.thumbnailUrl,
          blurredThumbnailUrl: firstItem.blurredThumbnailUrl,
          price: finalPrice,
          isLocked: data.isLocked,
          durationSecs: firstItem.durationSecs,
          batchId,
          items: uploadedItems.map((it) => ({
            mediaUrl: it.mediaUrl,
            mediaType: it.mediaType,
            title: it.title,
            thumbnailUrl: it.thumbnailUrl,
            blurredThumbnailUrl: it.blurredThumbnailUrl,
            durationSecs: it.durationSecs,
          })),
        });
      } catch (err) {
        console.error('Background media upload failed:', err);
        return null;
      }
    };

    if (onSendMedia) {
      onSendMedia(optimisticContent, uploadFn);
    } else {
      uploadFn().then((finalContent) => {
        if (finalContent) onSend(finalContent);
      });
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

  const cleanReply = replyTo
    ? getCleanMessagePreview(replyTo.content, replyTo.messageType)
    : null;
  const replyThumbnail = replyTo?.thumbnailUrl || cleanReply?.thumbnailUrl;

  return (
    <div className="relative border-t border-border-subtle/50 bg-[#141416] select-none safe-area-bottom">
      {/* Reply preview */}
      {replyTo && cleanReply && (
        <div className="flex items-center gap-3 px-3 py-2 border-l-2 border-gold mx-3 mt-2 bg-white/5 rounded-r-xl">
          <div className="flex-1 min-w-0">
            <p className="text-[0.72rem] text-gold font-semibold truncate">{replyTo.senderName}</p>
            <p className="text-xs text-paper/80 truncate mt-0.5">{cleanReply.text}</p>
          </div>
          {replyThumbnail && (
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-neutral-900">
              <img src={replyThumbnail} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              className="text-muted hover:text-paper transition-colors shrink-0 p-1 rounded-full hover:bg-white/10"
              aria-label="Cancel reply"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
            onChange={(e) => {
              setValue(e.target.value);
              onTyping?.(e.target.value.length > 0);
            }}
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
        multiple
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

      {/* Story Canvas Media Editor Modal for Chat Attachments */}
      {showEditorModal && (
        <ChatMediaEditorModal
          isOpen={showEditorModal}
          initialFiles={selectedEditorFiles}
          isCreator={Boolean(isCreator)}
          onClose={() => {
            setShowEditorModal(false);
            setSelectedEditorFiles([]);
          }}
          onSend={handleEditorSend}
        />
      )}

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
