import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, Loader2, Film, Image as ImageIcon } from 'lucide-react';

interface DeleteStoryConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  mediaType?: 'image' | 'video';
  isDeleting?: boolean;
}

export default function DeleteStoryConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Story?',
  description = 'This story will be permanently removed from your active feed. This action cannot be undone.',
  thumbnailUrl,
  mediaType,
  isDeleting = false,
}: DeleteStoryConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => {
        if (!isDeleting) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#121214] border border-[#2a2723] p-6 shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Luxury Gold Highlight Line at Top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        <div className="flex flex-col items-center text-center">
          {/* Visual Indicator or Thumbnail Preview */}
          {thumbnailUrl ? (
            <div className="relative mb-4 w-20 h-28 rounded-xl overflow-hidden border border-gold/30 shadow-lg bg-ink shrink-0 group">
              <img
                src={thumbnailUrl}
                alt="Story thumbnail"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full bg-red-600/80 backdrop-blur-sm flex items-center justify-center text-white shadow">
                  <Trash2 size={13} />
                </div>
              </div>
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-medium text-white/90 uppercase tracking-wider flex items-center gap-1">
                {mediaType === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                <span>{mediaType === 'video' ? 'Video' : 'Photo'}</span>
              </div>
            </div>
          ) : (
            <div className="w-13 h-13 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4 shadow-inner">
              <AlertTriangle size={24} className="stroke-[1.75]" />
            </div>
          )}

          {/* Heading */}
          <h3 id="delete-dialog-title" className="font-serif text-lg text-paper font-semibold tracking-wide">
            {title}
          </h3>

          {/* Description */}
          <p className="mt-2 text-xs text-muted leading-relaxed max-w-xs">
            {description}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full py-2.5 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-semibold text-paper/85 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-red-950/50 cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={13} />
                <span>Delete</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
