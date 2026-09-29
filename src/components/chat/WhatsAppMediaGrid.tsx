import React from 'react';
import { Play, Lock, Clock, Loader2, Video } from 'lucide-react';

interface MediaItem {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnailUrl?: string | null;
  blurredThumbnailUrl?: string | null;
  title?: string;
  durationSecs?: number;
}

interface WhatsAppMediaGridProps {
  items: MediaItem[];
  canViewFull: boolean;
  isSending?: boolean;
  isPending?: boolean;
  onItemClick?: (index: number) => void;
}

function formatDuration(secs?: number): string {
  if (!secs || isNaN(secs)) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function WhatsAppMediaGrid({
  items,
  canViewFull,
  isSending = false,
  isPending = false,
  onItemClick,
}: WhatsAppMediaGridProps) {
  if (!items || items.length === 0) return null;

  // If 1 item, return single tile
  if (items.length === 1) {
    const item = items[0];
    const thumb = canViewFull
      ? (item.thumbnailUrl || item.mediaUrl)
      : (item.blurredThumbnailUrl || item.thumbnailUrl || item.mediaUrl);

    return (
      <div
        onClick={() => onItemClick?.(0)}
        className="relative w-full max-w-[320px] aspect-[4/5] max-h-[340px] rounded-xl overflow-hidden cursor-pointer group bg-black/40 select-none"
      >
        <img
          src={thumb}
          alt=""
          className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-102 ${
            !canViewFull ? 'filter blur-[14px] scale-110' : ''
          }`}
        />

        {/* Sending overlay */}
        {isSending && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-gold" />
          </div>
        )}

        {/* Locked overlay */}
        {!isSending && !canViewFull && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center">
            <div className="w-12 h-12 rounded-full bg-black/80 border border-gold/40 text-gold flex items-center justify-center shadow-xl mb-1.5 group-hover:scale-110 transition-transform">
              {isPending ? <Clock size={20} className="animate-spin" /> : <Lock size={20} />}
            </div>
            <span className="text-[11px] font-bold text-white/90 uppercase tracking-wider">
              {item.mediaType === 'video' ? 'Locked Video' : 'Locked Photo'}
            </span>
          </div>
        )}

        {/* Unlocked video badge */}
        {!isSending && canViewFull && item.mediaType === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/65 backdrop-blur text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play size={20} fill="currentColor" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2, 3, 4, 5+ items: WhatsApp Grid Layout
  const displayCount = Math.min(items.length, 4);
  const visibleItems = items.slice(0, displayCount);
  const remainingCount = items.length > 4 ? items.length - 3 : 0;

  return (
    <div className="w-full max-w-[320px] sm:max-w-[340px] rounded-2xl overflow-hidden bg-black/40 select-none">
      <div className="grid grid-cols-2 gap-1 p-0.5">
        {visibleItems.map((item, idx) => {
          const isLastTile = idx === 3 && remainingCount > 0;
          const thumb = canViewFull
            ? (item.thumbnailUrl || item.mediaUrl)
            : (item.blurredThumbnailUrl || item.thumbnailUrl || item.mediaUrl);

          // WhatsApp grid tile sizing rules:
          // If 2 items: 2 equal columns (col-span-1, aspect-[4/5])
          // If 3 items: Item 0 spans full width across top (col-span-2, aspect-[16/10]), items 1 & 2 are squares (col-span-1, aspect-square)
          // If 4+ items: 2x2 grid of equal squares (col-span-1, aspect-square)
          let tileClass = 'col-span-1 aspect-square';
          if (items.length === 2) {
            tileClass = 'col-span-1 aspect-[4/5]';
          } else if (items.length === 3 && idx === 0) {
            tileClass = 'col-span-2 aspect-[16/10]';
          }

          return (
            <div
              key={idx}
              onClick={() => onItemClick?.(idx)}
              className={`relative overflow-hidden cursor-pointer group bg-neutral-900 ${tileClass}`}
            >
              <img
                src={thumb}
                alt=""
                className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                  !canViewFull ? 'filter blur-[14px] scale-110' : ''
                }`}
              />

              {/* Video play badge when unlocked */}
              {!isSending && canViewFull && item.mediaType === 'video' && !isLastTile && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <Play size={14} fill="currentColor" />
                  </div>
                </div>
              )}

              {/* Video duration pill */}
              {canViewFull && item.mediaType === 'video' && item.durationSecs && !isLastTile && (
                <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] text-white font-medium flex items-center gap-1">
                  <Video size={10} />
                  <span>{formatDuration(item.durationSecs)}</span>
                </div>
              )}

              {/* Locked overlay */}
              {!isSending && !canViewFull && !isLastTile && (
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 text-center">
                  <div className="w-8 h-8 rounded-full bg-black/70 border border-gold/40 text-gold flex items-center justify-center shadow-lg mb-1 group-hover:scale-110 transition-transform">
                    {isPending ? <Clock size={14} className="animate-spin" /> : <Lock size={14} />}
                  </div>
                  <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">
                    {item.mediaType === 'video' ? 'Video' : 'Photo'}
                  </span>
                </div>
              )}

              {/* Sending spinner overlay */}
              {isSending && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin text-gold" />
                </div>
              )}

              {/* WhatsApp +N Count overlay on 4th tile when more than 4 items */}
              {isLastTile && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-white cursor-pointer group-hover:bg-black/60 transition-colors">
                  <span className="text-2xl sm:text-3xl font-bold font-sans tracking-tight">
                    +{remainingCount}
                  </span>
                  <span className="text-[10px] text-white/70 uppercase tracking-wider mt-0.5">
                    More
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
