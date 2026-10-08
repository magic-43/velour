import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Check,
  Smile,
  Loader2,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import StoryCanvasEditor, { type StoryMediaItem } from '../stories/StoryCanvasEditor';
import { captureVideoThumbnail } from '../../lib/videoThumbnail';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';

// Raw unprocessed item passed to parent for background upload
export interface ChatMediaSendItem {
  file: File;
  previewUrl: string;
  thumbnailUrl?: string;
  thumbnailFile?: File;           // captured thumbnail for videos
  bakedBlob?: Blob;               // pre-baked image blob with overlays applied
  caption?: string;
  mediaType: 'image' | 'video';
}

export interface ChatMediaSendData {
  items: ChatMediaSendItem[];
  isLocked: boolean;
  price?: number;
  caption?: string;
  batchId?: string;
}

interface ChatMediaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: File[];
  isCreator: boolean;
  // Receives raw file data — editor closes immediately, upload runs in parent
  onSend: (data: ChatMediaSendData) => void;
}

const PRESET_PRICES = [10, 25, 50, 100];
const CAPTION_EMOJIS = ['✨', '🔥', '👑', '🥂', '🍾', '🖤', '🤍', '💎', '💋', '🌹', '⚡', '🍸', '🌙', '🎉', '👏', '😍'];

function WhatsAppSendIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export default function ChatMediaEditorModal({
  isOpen,
  onClose,
  initialFiles,
  isCreator,
  onSend,
}: ChatMediaEditorModalProps) {
  const { profile } = useAuth();
  const [mediaQueue, setMediaQueue] = useState<StoryMediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockPrice, setLockPrice] = useState<number>(25);
  const [customPriceInput, setCustomPriceInput] = useState<string>('25');
  const [showLockPopover, setShowLockPopover] = useState(false);
  const [caption, setCaption] = useState('');
  const [showCaptionEmojiPicker, setShowCaptionEmojiPicker] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isOverlayEditing, setIsOverlayEditing] = useState(false);
  const [baking, setBaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android hardware back button handlers
  useBackHandler(() => {
    setShowLockPopover(false);
    return true;
  }, showLockPopover && isOpen, 130);

  useBackHandler(() => {
    setShowCaptionEmojiPicker(false);
    return true;
  }, showCaptionEmojiPicker && isOpen, 125);

  useBackHandler(() => {
    setIsCropping(false);
    setIsOverlayEditing(false);
    return true;
  }, (isCropping || isOverlayEditing) && isOpen, 120);

  useBackHandler(() => {
    onClose();
    return true;
  }, isOpen, 115);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appendInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize queue when opened with initialFiles
  useEffect(() => {
    if (!isOpen) {
      setMediaQueue([]);
      setActiveIndex(0);
      setIsLocked(false);
      setShowLockPopover(false);
      setCaption('');
      setError(null);
      return;
    }

    if (initialFiles && initialFiles.length > 0) {
      loadFilesIntoQueue(initialFiles, false);
    } else {
      // Prompt user to pick files if none provided
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialFiles]);

  const loadFilesIntoQueue = async (files: File[], append = false) => {
    setError(null);
    const validItems: StoryMediaItem[] = [];

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isImage && !isVideo) continue;

      if (file.size > 80 * 1024 * 1024) {
        setError('Files must be under 80MB.');
        continue;
      }

      let thumbnailFile: File | undefined;
      let thumbnailUrl: string | undefined;

      if (isVideo) {
        try {
          thumbnailFile = await captureVideoThumbnail(file);
          thumbnailUrl = URL.createObjectURL(thumbnailFile);
        } catch (thumbErr) {
          console.warn('Could not extract video thumbnail:', thumbErr);
        }
      }

      validItems.push({
        id: `chat-media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        mediaType: isVideo ? 'video' : 'image',
        caption: '',
        rotation: 0,
        overlays: [],
        thumbnailFile,
        thumbnailUrl,
      });
    }

    if (validItems.length === 0) return;

    if (append) {
      setMediaQueue((prev) => [...prev, ...validItems]);
    } else {
      setMediaQueue(validItems);
      setActiveIndex(0);
    }
  };

  const handleAppendFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      loadFilesIntoQueue(files, true);
    }
    e.target.value = '';
  };

  const handleRemoveItem = (index: number) => {
    if (mediaQueue.length <= 1) {
      onClose();
      return;
    }
    const itemToRemove = mediaQueue[index];
    URL.revokeObjectURL(itemToRemove.previewUrl);
    if (itemToRemove.thumbnailUrl) URL.revokeObjectURL(itemToRemove.thumbnailUrl);

    const nextQueue = mediaQueue.filter((_, i) => i !== index);
    setMediaQueue(nextQueue);
    setActiveIndex((prev) => Math.min(prev, nextQueue.length - 1));
  };

  // Bake image overlays, drawings, and crops onto a clean exportable blob
  const bakeImageToBlob = async (item: StoryMediaItem): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetWidth = img.naturalWidth;
        const targetHeight = img.naturalHeight;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) return reject(new Error('Canvas context error'));

        // Handle rotation
        ctx.save();
        if (item.rotation) {
          ctx.translate(targetWidth / 2, targetHeight / 2);
          ctx.rotate((item.rotation * Math.PI) / 180);
          ctx.translate(-targetWidth / 2, -targetHeight / 2);
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        ctx.restore();

        // Draw doodle drawing if exists
        if (item.drawingDataUrl) {
          const drawImg = new Image();
          drawImg.onload = () => {
            ctx.drawImage(drawImg, 0, 0, targetWidth, targetHeight);
            renderOverlaysAndExport();
          };
          drawImg.onerror = () => renderOverlaysAndExport();
          drawImg.src = item.drawingDataUrl;
        } else {
          renderOverlaysAndExport();
        }

        function renderOverlaysAndExport() {
          if (!ctx) return reject(new Error('Canvas context error'));
          // Render overlays (text, emojis, stickers)
          for (const overlay of item.overlays) {
            ctx.save();
            const posX = (overlay.x / 100) * targetWidth;
            const posY = (overlay.y / 100) * targetHeight;
            ctx.translate(posX, posY);
            if (overlay.rotation) ctx.rotate((overlay.rotation * Math.PI) / 180);
            if (overlay.scale) ctx.scale(overlay.scale, overlay.scale);

            if (overlay.type === 'text' && overlay.content) {
              const fontSize = Math.max(24, Math.round(targetWidth * 0.055));
              ctx.font = `600 ${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = overlay.color || '#ffffff';
              ctx.shadowColor = 'rgba(0,0,0,0.8)';
              ctx.shadowBlur = 8;
              ctx.fillText(overlay.content, 0, 0);
            } else if (overlay.type === 'emoji' && overlay.content) {
              const emojiSize = Math.max(32, Math.round(targetWidth * 0.08));
              ctx.font = `${emojiSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(overlay.content, 0, 0);
            }
            ctx.restore();
          }

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Export blob failed'));
            },
            'image/webp',
            0.88
          );
        }
      };
      img.onerror = () => reject(new Error('Image failed to load for baking'));
      img.src = item.previewUrl;
    });
  };

  const handleSend = async () => {
    if (mediaQueue.length === 0 || baking) return;
    setBaking(true);
    setError(null);

    try {
      const batchId =
        mediaQueue.length > 1
          ? `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          : undefined;

      const finalPrice = isLocked ? Math.max(5, lockPrice) : undefined;
      const sendItems: ChatMediaSendItem[] = [];

      // Bake images (fast, in-browser canvas) before dismissing
      for (let i = 0; i < mediaQueue.length; i++) {
        const item = mediaQueue[i];
        if (item.mediaType === 'image') {
          const bakedBlob = await bakeImageToBlob(item);
          const bakedUrl = URL.createObjectURL(bakedBlob);
          sendItems.push({
            file: item.file,
            previewUrl: bakedUrl,
            thumbnailUrl: bakedUrl,
            bakedBlob,
            caption: item.caption,
            mediaType: 'image',
          });
        } else {
          sendItems.push({
            file: item.file,
            previewUrl: item.previewUrl,
            thumbnailUrl: item.thumbnailUrl,
            thumbnailFile: item.thumbnailFile,
            caption: item.caption,
            mediaType: 'video',
          });
        }
      }

      // 1. Close editor immediately — user sees conversation
      onClose();

      // 2. Trigger background upload in parent (non-blocking)
      onSend({
        items: sendItems,
        isLocked,
        price: finalPrice,
        caption: caption.trim() || undefined,
        batchId,
      });
    } catch (err) {
      console.error('Failed to prepare media:', err);
      setError((err as Error).message || 'Failed to prepare attachments.');
      setBaking(false);
    }
  };

  if (!isOpen) return null;

  const currentItem = mediaQueue[activeIndex];

  const chatRoot = typeof document !== 'undefined' ? document.getElementById('chat-window-root') : null;
  const portalTarget = chatRoot || (typeof document !== 'undefined' ? document.body : null);
  if (!portalTarget) return null;

  const modalContent = (
    <div className="fixed md:absolute inset-0 z-[110] h-[100dvh] md:h-full w-full bg-ink text-paper flex flex-col overflow-hidden animate-in fade-in duration-150 font-sans">
      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) loadFilesIntoQueue(files, false);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={appendInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleAppendFileSelection}
        className="hidden"
      />

      {/* Top Header: Close Button when no media is selected */}
      {mediaQueue.length === 0 && (
        <div
          className="absolute top-0 left-0 z-40 p-4 sm:p-5"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top, 1.25rem))' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={baking}
            className="text-muted hover:text-paper transition-colors p-1 cursor-pointer"
            title="Exit"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Main Studio Area */}
      {mediaQueue.length > 0 && currentItem ? (
        <div className="flex-1 w-full min-h-0 relative flex flex-col overflow-hidden bg-ink">
          {/* Top Bar + Media Canvas */}
          <div className="flex-1 w-full min-h-0 relative flex flex-col overflow-hidden">
            <StoryCanvasEditor
              key={currentItem.id}
              item={currentItem}
              onChange={(updated) => {
                setMediaQueue((prev) =>
                  prev.map((it, idx) => (idx === activeIndex ? { ...it, ...updated } : it))
                );
              }}
              onDownload={() => {}}
              onClose={onClose}
              onCropModeChange={setIsCropping}
              onOverlayEditingChange={setIsOverlayEditing}
              isLockable={isCreator}
              isLocked={isLocked}
              lockPrice={lockPrice}
              onToggleLock={() => setShowLockPopover((prev) => !prev)}
            />
          </div>

          {/* Bottom Controls Area (Floating Carousel + Caption + 2-Item Bottom Bar) */}
          {!isCropping && !isOverlayEditing && (
            <div className="absolute bottom-0 inset-x-0 z-30 flex flex-col animate-fade-in bg-gradient-to-t from-ink via-ink/85 to-transparent pt-8 pointer-events-none">
              {/* 1. Floating Multi-Media Carousel (Above Caption Bar) */}
              {mediaQueue.length > 1 && (
                <div className="w-full flex items-center justify-center px-4 pb-2.5 pointer-events-auto">
                  <div className="flex items-center gap-2.5 overflow-x-auto max-w-[92vw] md:max-w-full px-4 py-1 scrollbar-none">
                    {/* Thumbnails in Queue */}
                    {mediaQueue.map((queueItem, index) => (
                      <div
                        key={queueItem.id}
                        onClick={() => {
                          setActiveIndex(index);
                          setIsCropping(false);
                        }}
                        className={`group relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 cursor-pointer transition-all ${
                          index === activeIndex
                            ? 'border-2 border-white shadow-lg scale-105'
                            : 'opacity-60 hover:opacity-100 border border-white/20'
                        }`}
                      >
                        {queueItem.mediaType === 'image' || queueItem.thumbnailUrl ? (
                          <img
                            src={queueItem.thumbnailUrl || queueItem.previewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={queueItem.previewUrl}
                            className="w-full h-full object-cover"
                          />
                        )}

                        {/* Video indicator badge */}
                        {queueItem.mediaType === 'video' && (
                          <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white pointer-events-none z-[4] shadow-sm">
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </span>
                        )}

                        {/* Trash Delete Box: only appears on the active image */}
                        {index === activeIndex && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(index);
                            }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-[1px] text-white hover:text-red-400 hover:bg-black/75 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
                            title="Delete active item"
                            aria-label="Delete active item"
                          >
                            <Trash2 size={19} strokeWidth={2.2} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Floating Pill Caption Input (Matching Reference Screenshot Image 3) */}
              <div className="w-full flex justify-center px-4 pb-2.5 pointer-events-auto">
                <div className="relative flex items-center bg-[#18181b]/95 backdrop-blur-md border border-white/10 rounded-full px-3 sm:px-4 py-2 sm:py-2.5 w-full max-w-md sm:max-w-xl shadow-2xl transition-all focus-within:border-gold/60 focus-within:ring-1 focus-within:ring-gold/50">
                  {/* Left: Square [+] Icon to append media directly from caption bar */}
                  <button
                    type="button"
                    onClick={() => appendInputRef.current?.click()}
                    disabled={baking}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-paper/80 hover:text-gold transition-colors shrink-0 mr-1 cursor-pointer"
                    title="Add more photos or videos"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="4" />
                      <path d="M8 12h8" />
                      <path d="M12 8v8" />
                    </svg>
                  </button>

                  <input
                    type="text"
                    value={currentItem.caption || caption}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCaption(val);
                      setMediaQueue((prev) =>
                        prev.map((it, idx) => (idx === activeIndex ? { ...it, caption: val } : it))
                      );
                    }}
                    placeholder={isLocked ? `Add caption (locked for $${lockPrice})...` : 'Add a caption...'}
                    maxLength={180}
                    disabled={baking}
                    className="w-full bg-transparent text-[15px] text-paper placeholder-muted/80 focus:outline-none pr-3"
                  />


                </div>
              </div>

              {/* 3. Clean 2-Item Bottom Bar (Lock Pill on Left, Gold Send Button on Right) */}
              <div
                className="w-full shrink-0 px-4 sm:px-6 py-2 sm:py-3 flex items-center justify-between z-30 pointer-events-auto"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
              >
                {/* Left: Paywall Lock Pill (Matches Status Pill in Story Modal) */}
                {isCreator ? (
                  <button
                    type="button"
                    onClick={() => setShowLockPopover((prev) => !prev)}
                    disabled={baking}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors shrink-0 bg-[#18181b]/80 shadow-md cursor-pointer ${
                      isLocked
                        ? 'border-gold text-gold bg-gold/15 hover:bg-gold/20'
                        : 'border-gold/60 hover:border-gold text-gold hover:bg-gold/10'
                    }`}
                    title="Paywall Lock & Price"
                  >
                    {isLocked ? (
                      <Lock size={16} className="text-gold shrink-0" />
                    ) : (
                      <Unlock size={16} className="text-gold/70 shrink-0" />
                    )}
                    <span className="font-medium text-xs sm:text-sm tracking-tight truncate max-w-[180px] sm:max-w-none">
                      {isLocked ? `$${lockPrice}` : 'Free'}
                    </span>
                  </button>
                ) : (
                  <div />
                )}

                {/* Right: Circular Gold Send CTA Button */}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={baking || mediaQueue.length === 0}
                  className="w-12 h-12 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 shrink-0 cursor-pointer"
                  title="Send attachment"
                >
                  {baking ? (
                    <Loader2 size={22} className="animate-spin text-ink" />
                  ) : (
                    <WhatsAppSendIcon size={20} className="translate-x-[1.5px] -translate-y-[0.5px]" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Lock Popover (Anchored cleanly above the bottom-left Lock pill) */}
          {showLockPopover && (
            <div
              className="absolute bottom-20 left-4 sm:left-6 z-50 w-72 sm:w-80 bg-[#1a1a1c]/98 backdrop-blur-2xl border border-gold/40 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.85)] animate-in zoom-in-95 duration-150 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                <div className="flex items-center gap-2 text-gold font-medium text-sm">
                  <Lock size={15} />
                  <span>Paywall Lock</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLockPopover(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 mb-3 border border-white/5">
                <span className="text-xs text-paper font-medium">Require Unlock</span>
                <button
                  type="button"
                  onClick={() => setIsLocked(!isLocked)}
                  className={`w-12 h-6.5 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
                    isLocked ? 'bg-gold justify-end' : 'bg-white/20 justify-start'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-white shadow-md" />
                </button>
              </div>

              {isLocked && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <label className="text-[0.72rem] uppercase tracking-wider text-muted font-semibold block">
                    Unlock Price (USD / Stars)
                  </label>

                  {/* Preset price buttons */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {PRESET_PRICES.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setLockPrice(preset);
                          setCustomPriceInput(String(preset));
                        }}
                        className={`py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          lockPrice === preset
                            ? 'border-gold bg-gold/20 text-gold'
                            : 'border-white/10 text-paper/80 hover:border-white/30'
                        }`}
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>

                  {/* Custom input */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                      <DollarSign size={14} />
                    </div>
                    <input
                      type="number"
                      min={5}
                      max={1000}
                      value={customPriceInput}
                      onChange={(e) => {
                        setCustomPriceInput(e.target.value);
                        const parsed = parseInt(e.target.value, 10);
                        if (!isNaN(parsed) && parsed >= 5) {
                          setLockPrice(parsed);
                        }
                      }}
                      placeholder="Custom price"
                      className="w-full pl-8 pr-3 py-2 bg-black/50 border border-white/15 rounded-xl text-paper text-sm focus:outline-none focus:border-gold"
                    />
                  </div>

                  <p className="text-[0.68rem] text-muted leading-relaxed">
                    {mediaQueue.length > 1
                      ? `Fans unlock all ${mediaQueue.length} files in this batch for $${lockPrice}.`
                      : `Fans unlock this photo/video for $${lockPrice}.`}
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowLockPopover(false)}
                    className="w-full py-2 bg-gold hover:bg-gold-light text-ink font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>Set Lock (${lockPrice})</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error toast (baking failure) */}
          {error && (
            <div className="absolute top-16 inset-x-4 z-40 max-w-xs mx-auto text-center text-xs pt-1 pointer-events-none">
              <div className="px-4 py-2 rounded-xl bg-red-500/90 text-white shadow-2xl backdrop-blur-md flex items-center justify-center gap-1">
                <AlertCircle size={13} /> {error}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  return createPortal(modalContent, portalTarget);
}
