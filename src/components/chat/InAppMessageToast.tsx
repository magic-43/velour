import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MessageSquare, ArrowRight } from 'lucide-react';

export interface InAppToastData {
  id: string;
  conversationId: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  content: string;
  timestamp?: string;
}

interface Props {
  toast: InAppToastData | null;
  onDismiss: () => void;
}

export default function InAppMessageToast({ toast, onDismiss }: Props) {
  const navigate = useNavigate();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!toast) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, 5500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, onDismiss]);

  if (!toast) return null;

  const handleClick = () => {
    onDismiss();
    navigate(`/messages/${toast.conversationId}`);
  };

  return (
    <div className="fixed top-3 left-3 right-3 md:left-auto md:right-5 md:top-5 z-50 max-w-md md:w-96 select-none pointer-events-auto animate-in fade-in slide-in-from-top-3 duration-300">
      <div
        onClick={handleClick}
        className="w-full bg-[#121215]/95 border border-gold/35 hover:border-gold/60 text-paper p-3 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.7)] backdrop-blur-xl flex items-center gap-3 cursor-pointer transition-all active:scale-[0.98] group"
      >
        {/* Sender Avatar */}
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-ink border border-gold/30">
            {toast.senderAvatarUrl ? (
              <img
                src={toast.senderAvatarUrl}
                alt={toast.senderName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-gold font-serif text-base font-semibold">
                {(toast.senderName || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-gold text-ink flex items-center justify-center shadow-sm">
            <MessageSquare size={8} strokeWidth={2.8} />
          </span>
        </div>

        {/* Content details */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-paper truncate group-hover:text-gold transition-colors">
              {toast.senderName}
            </p>
            <span className="text-[10px] text-gold font-medium shrink-0">
              Just now
            </span>
          </div>
          <p className="text-xs text-muted truncate mt-0.5 group-hover:text-paper/90 transition-colors">
            {toast.content}
          </p>
        </div>

        {/* Quick action button */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-gold bg-gold/10 hover:bg-gold/20 px-2 py-1 rounded-lg border border-gold/25 transition-colors">
            <span>Reply</span>
            <ArrowRight size={11} strokeWidth={2.5} />
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
