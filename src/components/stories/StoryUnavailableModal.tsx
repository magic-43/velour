import { useEffect } from 'react';
import { EyeOff, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  creatorName?: string | null;
}

export default function StoryUnavailableModal({ isOpen, onClose, creatorName }: Props) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#141416] border border-[#2a2723] p-6 shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

        {/* Close icon button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 text-muted hover:text-paper p-1 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center text-center pt-2">
          {/* Eye-off icon in dark circle */}
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-gold/80 mb-4 shadow-inner">
            <EyeOff size={24} strokeWidth={1.75} />
          </div>

          {/* Heading */}
          <h3 className="font-serif text-lg text-paper font-semibold tracking-wide">
            Story Unavailable
          </h3>

          {/* Description */}
          <p className="mt-2 text-xs text-muted leading-relaxed max-w-xs">
            {creatorName
              ? `This story by ${creatorName} is no longer available because it was deleted or has expired.`
              : 'This story is no longer available because it was deleted by the creator or has expired.'}
          </p>
        </div>

        {/* Action Button */}
        <div className="mt-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold text-xs font-semibold flex items-center justify-center transition-all cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
