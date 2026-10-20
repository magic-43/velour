import { useRef, useState, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import { Send, Smile, Plus, Grid3x3, Film, Upload, Image as ImageIcon, Camera, FileText, Lock, Gift, X, Loader2, ChevronLeft } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import EmojiKeyboardDrawer from './EmojiKeyboardDrawer';
import VaultMediaPickerModal from './VaultMediaPickerModal';
import ChatMediaEditorModal, { type ChatMediaSendData } from './ChatMediaEditorModal';
import SendGiftModal from './SendGiftModal';
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
  recipientName?: string;
  recipientId?: string;
  recipientAvatar?: string | null;
  conversationId?: string;
}

export default function MessageInput({
  onSend,
  onSendMedia,
  onTyping,
  disabled,
  replyTo,
  onCancelReply,
  recipientName,
  recipientId,
  recipientAvatar,
  conversationId,
}: Props) {
  const { isCreator, profile } = useAuth();
  const [value, setValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [mediaSourcePrompt, setMediaSourcePrompt] = useState<'photos' | 'locked' | null>(null);
  const [targetIsLocked, setTargetIsLocked] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [selectedEditorFiles, setSelectedEditorFiles] = useState<File[]>([]);
  const [selectedEditorVaultItems, setSelectedEditorVaultItems] = useState<VaultItem[]>([]);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss attachment drawer or emoji picker when user taps anywhere outside the chat input container
  useEffect(() => {
    if (!showAttachmentMenu && !showEmojiPicker) return;
    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowAttachmentMenu(false);
        setMediaSourcePrompt(null);
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('touchstart', handleDocumentClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('touchstart', handleDocumentClick);
    };
  }, [showAttachmentMenu, showEmojiPicker]);

  // Android hardware back button handlers for chat input sheets and modals
  useBackHandler(() => {
    setShowEditorModal(false);
    setSelectedEditorFiles([]);
    setSelectedEditorVaultItems([]);
    setTargetIsLocked(false);
    return true;
  }, showEditorModal, 120);

  useBackHandler(() => {
    setMediaSourcePrompt(null);
    return true;
  }, Boolean(mediaSourcePrompt), 116);

  useBackHandler(() => {
    setShowVaultPicker(false);
    return true;
  }, showVaultPicker, 115);

  useBackHandler(() => {
    setShowGiftModal(false);
    return true;
  }, showGiftModal, 114);

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
    setSelectedEditorVaultItems([]);
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

    // 1. Build optimistic media payload immediately using local preview URLs (no raw filenames)
    const optimisticItems = data.items.map((it) => ({
      mediaUrl: it.previewUrl,
      mediaType: it.mediaType,
      thumbnailUrl: it.thumbnailUrl || it.previewUrl,
      blurredThumbnailUrl: it.thumbnailUrl || it.previewUrl,
      durationSecs: it.durationSecs,
    }));

    const firstOptItem = optimisticItems[0];
    const optimisticContent = encodeVaultMediaMessage(data.caption || '', {
      mediaUrl: firstOptItem.mediaUrl,
      mediaType: firstOptItem.mediaType,
      thumbnailUrl: firstOptItem.thumbnailUrl,
      blurredThumbnailUrl: firstOptItem.blurredThumbnailUrl,
      price: finalPrice,
      isLocked: data.isLocked,
      durationSecs: firstOptItem.durationSecs,
      batchId,
      items: optimisticItems,
    });

    // 2. Define background upload worker that returns confirmed DB content
    const creatorId = profile?.id || 'creator';
    const uploadFn = async (): Promise<string | null> => {
      try {
        const uploadedItems: Array<{
          mediaUrl: string;
          mediaType: 'image' | 'video';
          thumbnailUrl?: string | null;
          blurredThumbnailUrl?: string | null;
          durationSecs?: number;
        }> = [];

        for (const item of data.items) {
          // If media already exists in Cloudflare R2 from Vault and has no canvas overlay edits:
          if (item.existingMediaUrl && !item.bakedBlob) {
            const persistentThumbUrl: string | null = item.thumbnailUrl || item.existingMediaUrl;
            let blurredThumbUrl: string | null = null;
            if (data.isLocked) {
              try {
                blurredThumbUrl = await generateBlurredThumbnail(item.existingMediaUrl);
              } catch (blurErr) {
                console.warn('Could not generate blurred thumbnail:', blurErr);
                blurredThumbUrl = persistentThumbUrl;
              }
            }

            uploadedItems.push({
              mediaUrl: item.existingMediaUrl,
              mediaType: item.mediaType,
              thumbnailUrl: persistentThumbUrl,
              blurredThumbnailUrl: blurredThumbUrl ?? persistentThumbUrl,
              durationSecs: item.durationSecs,
            });
            continue;
          }

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

          // Upload main media — do not pass filename as title
          const vaultItem = await uploadVaultMedia(
            fileToUpload,
            creatorId,
            undefined,
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
            durationSecs: vaultItem.durationSecs,
          });
        }

        const firstItem = uploadedItems[0];
        return encodeVaultMediaMessage(data.caption || '', {
          mediaUrl: firstItem.mediaUrl,
          mediaType: firstItem.mediaType,
          thumbnailUrl: firstItem.thumbnailUrl,
          blurredThumbnailUrl: firstItem.blurredThumbnailUrl,
          price: finalPrice,
          isLocked: data.isLocked,
          durationSecs: firstItem.durationSecs,
          batchId,
          items: uploadedItems.map((it) => ({
            mediaUrl: it.mediaUrl,
            mediaType: it.mediaType,
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

  const handleVaultSelect = (items: VaultItem[]) => {
    if (!items || items.length === 0) return;
    setSelectedEditorFiles([]);
    setSelectedEditorVaultItems(items);
    setShowVaultPicker(false);
    setShowEditorModal(true);
  };

  const handleDocumentSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setShowAttachmentMenu(false);
    setIsUploadingDoc(true);

    try {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `chat_documents/${Date.now()}_${cleanFileName}`;
      const publicUrl = await uploadPublicFile(file, storageKey, { skipCompression: true });

      const docPayload = JSON.stringify({
        name: file.name,
        url: publicUrl,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      });

      const captionPrefix = value.trim() ? `${value.trim()}\n` : '';
      const messageContent = `${captionPrefix}<!--document-attachment:${docPayload}-->`;
      onSend(messageContent);
      setValue('');
    } catch (err: any) {
      console.error('Document upload failed:', err);
      alert('Failed to upload document. Please try again.');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handlePlusClick = () => {
    setShowEmojiPicker(false);
    if (showAttachmentMenu) {
      setShowAttachmentMenu(false);
      setMediaSourcePrompt(null);
    } else {
      textareaRef.current?.blur();
      setMediaSourcePrompt(null);
      setShowAttachmentMenu(true);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
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
    <div ref={containerRef} className="relative border-t border-border-subtle/50 bg-[#141416] select-none pb-[env(safe-area-inset-bottom,0px)] shrink-0">
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

      {/* Input Row matching WhatsApp multiline layout */}
      <div className="px-3 py-2 sm:py-2.5">
        <div
          onClick={() => {
            if (showAttachmentMenu) {
              setShowAttachmentMenu(false);
              setMediaSourcePrompt(null);
            }
          }}
          className="w-full min-h-[48px] rounded-[24px] bg-[#242426] border border-white/5 focus-within:border-gold/40 px-3.5 sm:px-4 py-1.5 flex items-end gap-2.5 transition-all shadow-lg"
        >
          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={value}
            onFocus={() => {
              setShowAttachmentMenu(false);
              setMediaSourcePrompt(null);
              setShowEmojiPicker(false);
            }}
            onClick={() => {
              if (showAttachmentMenu || showEmojiPicker) {
                setShowAttachmentMenu(false);
                setMediaSourcePrompt(null);
                setShowEmojiPicker(false);
              }
            }}
            onChange={(e) => {
              setValue(e.target.value);
              onTyping?.(e.target.value.length > 0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-white text-sm sm:text-base placeholder:text-neutral-400 focus:outline-none resize-none overflow-y-auto no-scrollbar leading-snug py-2 max-h-[140px]"
          />

          {/* Right Action Icons: Plus/Send (pinned to bottom right when multiline) */}
          <div className="flex items-center gap-1.5 shrink-0 self-end pb-1">
            {/* Plus / Send button */}
            {hasText ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled}
                className="w-8 h-8 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center font-bold shrink-0 shadow-lg active:scale-95 transition-all cursor-pointer mb-0.5"
                title="Send message"
              >
                <Send size={15} className="translate-x-[0.5px]" strokeWidth={2.4} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePlusClick}
                className="w-8 h-8 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center font-bold shrink-0 shadow active:scale-95 transition-all cursor-pointer mb-0.5"
                title="Add attachment"
                disabled={disabled}
              >
                <Plus size={18} strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for device photo/video uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDeviceFileSelect}
        accept="video/*,image/*"
        multiple
        className="hidden"
      />

      {/* Hidden file input for camera capture */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleDeviceFileSelect}
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
      />

      {/* Hidden file input for documents */}
      <input
        type="file"
        ref={docInputRef}
        onChange={handleDocumentSelect}
        accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,.rar,application/*"
        className="hidden"
      />

      {/* ── Mobile Sub-Input Attachment Drawer (Rendered directly BELOW input area, matching media reference) ── */}
      {showAttachmentMenu && (
        <div className="md:hidden border-t border-white/10 bg-[#18191e] rounded-t-[28px] px-4 pt-5 pb-6 animate-in slide-in-from-bottom duration-200 select-none shadow-2xl">
          {mediaSourcePrompt ? (
            /* Sub-view when Photos or Locked is selected */
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between px-1 pb-2 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setMediaSourcePrompt(null)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gold hover:text-gold-light transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
                <span className="text-xs font-semibold text-paper">
                  {mediaSourcePrompt === 'locked' ? 'Locked Attachment' : 'Photos & Videos'}
                </span>
                <div className="w-10" />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const isLock = mediaSourcePrompt === 'locked';
                    setTargetIsLocked(isLock);
                    setShowAttachmentMenu(false);
                    setMediaSourcePrompt(null);
                    fileInputRef.current?.click();
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-[#24262f] hover:bg-[#2c2f3a] border border-white/5 transition-all text-center group cursor-pointer active:scale-95"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center border border-blue-500/25 group-hover:scale-105 transition-transform">
                    <Upload size={22} />
                  </div>
                  <div>
                    <p className="font-semibold text-paper text-xs">Device</p>
                    <p className="text-[0.65rem] text-muted mt-0.5">Camera Roll</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const isLock = mediaSourcePrompt === 'locked';
                    setTargetIsLocked(isLock);
                    setShowAttachmentMenu(false);
                    setMediaSourcePrompt(null);
                    setShowVaultPicker(true);
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-[#24262f] hover:bg-[#2c2f3a] border border-white/5 transition-all text-center group cursor-pointer active:scale-95"
                >
                  <div className="w-12 h-12 rounded-full bg-gold/15 text-gold flex items-center justify-center border border-gold/25 group-hover:scale-105 transition-transform">
                    <Film size={22} />
                  </div>
                  <div>
                    <p className="font-semibold text-gold text-xs">Velour Gallery</p>
                    <p className="text-[0.65rem] text-muted mt-0.5">Vault Items</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* Main 4 options grid matching screenshot */
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              {/* 1. Photos */}
              <button
                type="button"
                onClick={() => setMediaSourcePrompt('photos')}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-[#2a2d36] group-hover:bg-[#353945] flex items-center justify-center text-[#3b82f6] shadow-md group-active:scale-95 transition-all">
                  <ImageIcon size={26} strokeWidth={2.2} />
                </div>
                <span className="text-xs text-paper/90 font-medium mt-2">Photos</span>
              </button>

              {/* 2. Camera */}
              <button
                type="button"
                onClick={() => {
                  setShowAttachmentMenu(false);
                  setTargetIsLocked(false);
                  cameraInputRef.current?.click();
                }}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-[#2a2d36] group-hover:bg-[#353945] flex items-center justify-center text-white shadow-md group-active:scale-95 transition-all">
                  <Camera size={26} strokeWidth={2.2} />
                </div>
                <span className="text-xs text-paper/90 font-medium mt-2">Camera</span>
              </button>

              {/* 3. Documents */}
              <button
                type="button"
                onClick={() => {
                  setShowAttachmentMenu(false);
                  docInputRef.current?.click();
                }}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-[#2a2d36] group-hover:bg-[#353945] flex items-center justify-center text-[#06b6d4] shadow-md group-active:scale-95 transition-all">
                  <FileText size={26} strokeWidth={2.2} />
                </div>
                <span className="text-xs text-paper/90 font-medium mt-2">Document</span>
              </button>

              {/* 4. Creator: Locked Attachment | Fan: Gifts */}
              {isCreator ? (
                <button
                  type="button"
                  onClick={() => {
                    setMediaSourcePrompt('locked');
                  }}
                  className="flex flex-col items-center group cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-full bg-[#2a2d36] group-hover:bg-[#353945] border border-gold/40 flex items-center justify-center text-gold shadow-md group-active:scale-95 transition-all">
                    <Lock size={24} strokeWidth={2.2} />
                  </div>
                  <span className="text-xs text-paper/90 font-medium mt-2">Locked</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachmentMenu(false);
                    setShowGiftModal(true);
                  }}
                  className="flex flex-col items-center group cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-full bg-[#2a2d36] group-hover:bg-[#353945] border border-pink-500/40 flex items-center justify-center text-pink-400 shadow-md group-active:scale-95 transition-all">
                    <Gift size={24} strokeWidth={2.2} />
                  </div>
                  <span className="text-xs text-paper/90 font-medium mt-2">Gifts</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Desktop Floating Menu (matches media_1792403665042_d4f188d5.png) */}
      {showAttachmentMenu && (
        <>
          <div
            className="hidden md:block fixed inset-0 z-20"
            onClick={() => {
              setShowAttachmentMenu(false);
              setMediaSourcePrompt(null);
            }}
          />
          <div className="hidden md:flex absolute right-4 bottom-14 z-30 bg-[#18191d] border border-white/10 rounded-2xl p-1.5 shadow-2xl flex-col gap-1 min-w-[210px] animate-in slide-in-from-bottom-2 duration-150">
            {/* 1. Photos */}
            <button
              type="button"
              onClick={() => {
                setShowAttachmentMenu(false);
                setMediaSourcePrompt('photos');
              }}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-paper text-sm font-medium transition-colors text-left w-full cursor-pointer"
            >
              <ImageIcon size={18} className="text-[#3b82f6]" />
              <span>Photos &amp; videos</span>
            </button>

            {/* 2. Camera */}
            <button
              type="button"
              onClick={() => {
                setShowAttachmentMenu(false);
                setTargetIsLocked(false);
                cameraInputRef.current?.click();
              }}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-paper text-sm font-medium transition-colors text-left w-full cursor-pointer"
            >
              <Camera size={18} className="text-[#ec4899]" />
              <span>Camera</span>
            </button>

            {/* 3. Documents */}
            <button
              type="button"
              onClick={() => {
                setShowAttachmentMenu(false);
                docInputRef.current?.click();
              }}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/10 text-paper text-sm font-medium transition-colors text-left w-full cursor-pointer"
            >
              <FileText size={18} className="text-[#06b6d4]" />
              <span>Document</span>
            </button>

            {/* 4. Creator: Locked Attachment | Fan: Gifts */}
            {isCreator ? (
              <button
                type="button"
                onClick={() => {
                  setShowAttachmentMenu(false);
                  setMediaSourcePrompt('locked');
                }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-gold/10 text-gold text-sm font-medium transition-colors text-left w-full cursor-pointer"
              >
                <Lock size={18} className="text-gold" />
                <span>Locked Attachment</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowAttachmentMenu(false);
                  setShowGiftModal(true);
                }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-pink-500/10 text-pink-400 text-sm font-medium transition-colors text-left w-full cursor-pointer"
              >
                <Gift size={18} className="text-pink-400" />
                <span>Gifts</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Desktop Media Source Picker Dialog (Upload vs Velour Gallery) */}
      {mediaSourcePrompt && (
        <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setMediaSourcePrompt(null)}
          />
          <div className="relative z-10 w-full max-w-sm bg-[#1c1d22] border border-white/10 rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div>
                <h3 className="font-semibold text-paper text-base">
                  {mediaSourcePrompt === 'locked' ? 'Locked Attachment' : 'Photos & Videos'}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {mediaSourcePrompt === 'locked'
                    ? 'Select media to lock behind paywall'
                    : 'Choose where to select media from'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMediaSourcePrompt(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  const isLock = mediaSourcePrompt === 'locked';
                  setTargetIsLocked(isLock);
                  setMediaSourcePrompt(null);
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group cursor-pointer active:scale-98"
              >
                <div className="w-11 h-11 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/25 group-hover:scale-105 transition-transform">
                  <Upload size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-paper text-sm">Upload from Device</p>
                  <p className="text-xs text-muted truncate">Choose photos or videos from your computer</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  const isLock = mediaSourcePrompt === 'locked';
                  setTargetIsLocked(isLock);
                  setMediaSourcePrompt(null);
                  setShowVaultPicker(true);
                }}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group cursor-pointer active:scale-98"
              >
                <div className="w-11 h-11 rounded-full bg-gold/15 text-gold flex items-center justify-center shrink-0 border border-gold/25 group-hover:scale-105 transition-transform">
                  <Film size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gold text-sm">Velour Gallery</p>
                  <p className="text-xs text-muted truncate">Select from your saved Velour Vault</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Uploading Toast */}
      {isUploadingDoc && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-ink-light/95 border border-gold/30 backdrop-blur-md px-4 py-2.5 rounded-full text-xs font-medium text-gold shadow-2xl flex items-center gap-2 animate-in fade-in duration-150">
          <Loader2 size={15} className="animate-spin text-gold" />
          <span>Uploading document…</span>
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
          initialVaultItems={selectedEditorVaultItems}
          initialIsLocked={targetIsLocked}
          isCreator={Boolean(isCreator)}
          onClose={() => {
            setShowEditorModal(false);
            setSelectedEditorFiles([]);
            setSelectedEditorVaultItems([]);
            setTargetIsLocked(false);
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

      {/* Gift Modal for Fans (Mobile Full-Screen Bottom Sheet & Desktop Pop-up) */}
      {showGiftModal && (
        <SendGiftModal
          isOpen={showGiftModal}
          onClose={() => setShowGiftModal(false)}
          recipientName={recipientName}
          recipientId={recipientId}
          recipientAvatar={recipientAvatar}
          conversationId={conversationId}
          onSendGift={(msg) => onSend(msg)}
        />
      )}
    </div>
  );
}
