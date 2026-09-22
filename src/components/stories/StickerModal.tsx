import { useState, useRef, useEffect } from 'react';
import {
  X,
  Search,
  Smile,
  MapPin,
  Music,
  HelpCircle,
  Camera,
  Image as ImageIcon,
  Clock as ClockIcon,
  RotateCcw,
  Star,
  Plus,
} from 'lucide-react';
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';

export interface StickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: { char: string; code?: string; url?: string }) => void;
  onSelectSticker: (sticker: {
    label: string;
    color?: string;
    bg?: string;
    iconType?: 'clock' | 'analog_clock' | 'location' | 'music' | 'question' | 'reaction' | 'add_yours' | 'badge' | 'doodle' | 'bubble';
    customImageUrl?: string;
    shapeType?: 'rect' | 'circle' | 'arrow' | 'callout';
    meta?: string;
  }) => void;
  onSelectShape: (shapeType: 'rect' | 'circle' | 'arrow' | 'callout') => void;
  onSelectPhotoSticker: (file: File, previewUrl: string) => void;
}

/* Page-fold sticker icon matching media_1789906286978.png */
function StickerSheetIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

/* Authentic Live Analog Clock Widget matching media_1789906286978.png row 1 */
export function MiniAnalogClock({ size = 36 }: { size?: number }) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours() % 12;
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const hourAngle = (hours + minutes / 60) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;
  const secondAngle = seconds * 6;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="drop-shadow-sm shrink-0">
      <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#e5e5e5" strokeWidth="3" />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
        <line
          key={deg}
          x1="50"
          y1="8"
          x2="50"
          y2={deg % 90 === 0 ? '16' : '12'}
          stroke={deg % 90 === 0 ? '#111111' : '#999999'}
          strokeWidth={deg % 90 === 0 ? '3.5' : '2'}
          strokeLinecap="round"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="24"
        stroke="#111111"
        strokeWidth="4.5"
        strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="16"
        stroke="#222222"
        strokeWidth="3"
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      <line
        x1="50"
        y1="54"
        x2="50"
        y2="14"
        stroke="#ef4444"
        strokeWidth="1.8"
        strokeLinecap="round"
        transform={`rotate(${secondAngle} 50 50)`}
      />
      <circle cx="50" cy="50" r="3.5" fill="#ef4444" />
    </svg>
  );
}

// Popular reaction meme stickers
const MEME_FAVORITES = [
  {
    id: 'fav-1',
    label: 'Clapping',
    customImageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'fav-2',
    label: 'Shocked',
    customImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'fav-3',
    label: 'Smiling',
    customImageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'fav-4',
    label: 'Laughing',
    customImageUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'fav-5',
    label: 'Thinking',
    customImageUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&auto=format&fit=crop&q=80',
  },
];

export default function StickerModal({
  isOpen,
  onClose,
  onSelectEmoji,
  onSelectSticker,
  onSelectShape,
  onSelectPhotoSticker,
}: StickerModalProps) {
  // Toggle between Emojis (🙂) and Stickers (📄)
  const [activeTab, setActiveTab] = useState<'sticker' | 'emoji'>('sticker');
  const [currentTime, setCurrentTime] = useState('12:16');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Keep live time updated for digital clock pill
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 20000);
    return () => clearInterval(interval);
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    onSelectPhotoSticker(file, previewUrl);
    onClose();
  };

  const [hasMountedOnce, setHasMountedOnce] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHasMountedOnce(true);
    }
  }, [isOpen]);

  if (!hasMountedOnce && !isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 bg-black/75 backdrop-blur-md select-none transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      {/* Hidden File Input for Custom Photo Sticker */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* Modal Container: Slide-Up Bottom Sheet on Mobile, Centered Floating Dialog on Desktop */}
      <div
        className="w-full sm:max-w-[430px] h-[85vh] sm:h-[640px] max-h-[85vh] rounded-t-[32px] sm:rounded-[32px] bg-[#19191d] border-t sm:border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Bar */}
        <div className="w-full pt-2.5 pb-1 flex items-center justify-center shrink-0 sm:hidden">
          <div className="w-10 h-1 bg-white/30 rounded-full" />
        </div>

        {/* Top Header Row matching media_1789906286978.png */}
        <div className="px-4 py-2 flex items-center justify-between shrink-0 border-b border-white/5">
          {/* Left: Search Toggle Button */}
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              searchOpen ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
            title="Search"
          >
            <Search size={18} />
          </button>

          {/* Center: Segmented Toggle Pill (🙂 Emojis | 📄 Stickers) */}
          <div className="flex items-center p-1 rounded-full bg-white/10 border border-white/5 gap-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('emoji')}
              className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                activeTab === 'emoji'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'text-white/50 hover:text-white'
              }`}
              title="Apple iOS Emojis"
            >
              <Smile size={18} />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sticker')}
              className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                activeTab === 'sticker'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'text-white/50 hover:text-white'
              }`}
              title="Stickers"
            >
              <StickerSheetIcon size={18} />
            </button>
          </div>

          {/* Right: Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar Slide-Down (Optional) */}
        {searchOpen && activeTab === 'sticker' && (
          <div className="px-4 py-2 border-b border-white/5 bg-black/20 animate-in fade-in slide-in-from-top-1">
            <div className="relative w-full">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search widgets & stickers..."
                className="w-full h-8 pl-9 pr-3 rounded-full bg-white/10 text-xs text-white placeholder-white/40 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Content View 1: Full Authentic Apple iOS Emoji Picker */}
        {activeTab === 'emoji' ? (
          <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden bg-[#18181b]">
            <EmojiPicker
              emojiStyle={EmojiStyle.APPLE}
              theme={Theme.DARK}
              width="100%"
              height="100%"
              lazyLoadEmojis={true}
              searchPlaceHolder="Search all iOS emojis..."
              previewConfig={{ showPreview: false }}
              skinTonesDisabled={false}
              onEmojiClick={(emojiData: EmojiClickData) => {
                onSelectEmoji({
                  char: emojiData.emoji,
                  code: emojiData.unified,
                  url:
                    emojiData.imageUrl ||
                    `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${emojiData.unified}.png`,
                });
                onClose();
              }}
            />
          </div>
        ) : (
          /* Content View 2: Stickers View (Exact replication of media_1789906286978.png) */
          <div className="flex-1 w-full min-h-0 flex flex-col overflow-y-auto scrollbar-none pb-4">
            {/* Top Interactive Widgets Area matching reference layout */}
            <div className="p-4 flex flex-col items-center gap-3">
              {/* Row 1: [📷 Add yours] [12:16] [🕐] */}
              <div className="w-full flex items-center justify-center gap-2.5">
                {/* [📷 Add yours] */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'Add yours',
                      iconType: 'add_yours',
                      color: '#059669',
                    });
                    onClose();
                  }}
                  className="px-4 py-2 rounded-2xl bg-white hover:bg-neutral-100 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Camera size={18} className="text-emerald-600" />
                  <span>Add yours</span>
                </button>

                {/* [12:16] Digital Clock Pill */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: currentTime,
                      iconType: 'clock',
                    });
                    onClose();
                  }}
                  className="px-4 py-2 rounded-2xl bg-white hover:bg-neutral-100 text-black font-mono font-black text-base sm:text-lg tracking-tight shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <span>{currentTime}</span>
                </button>

                {/* [🕐] Analog Clock Circular Widget */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: currentTime,
                      iconType: 'analog_clock',
                    });
                    onClose();
                  }}
                  className="w-10 h-10 rounded-full bg-white hover:bg-neutral-100 flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer border border-black/5"
                  title="Analog Clock"
                >
                  <MiniAnalogClock size={36} />
                </button>
              </div>

              {/* Row 2: [📍 Location] [🖼️ Photo] */}
              <div className="w-full flex items-center justify-center gap-2.5">
                {/* [📍 Location] */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'Location',
                      iconType: 'location',
                      color: '#059669',
                    });
                    onClose();
                  }}
                  className="px-5 py-2 rounded-2xl bg-white hover:bg-neutral-100 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <MapPin size={17} className="text-emerald-600 fill-emerald-600/20" />
                  <span>Location</span>
                </button>

                {/* [🖼️ Photo Cutout Uploader] */}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="px-5 py-2 rounded-2xl bg-white hover:bg-neutral-100 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Upload custom photo sticker"
                >
                  <ImageIcon size={17} className="text-emerald-600" />
                  <span>Photo</span>
                </button>
              </div>

              {/* Row 3: [🎵 Music] [❔ Question] */}
              <div className="w-full flex items-center justify-center gap-2.5">
                {/* [🎵 Music] */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'Music',
                      iconType: 'music',
                      color: '#059669',
                    });
                    onClose();
                  }}
                  className="px-5 py-2 rounded-2xl bg-white hover:bg-neutral-100 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Music size={17} className="text-emerald-600" />
                  <span>Music</span>
                </button>

                {/* [❔ Question] */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'Question',
                      iconType: 'question',
                      color: '#059669',
                    });
                    onClose();
                  }}
                  className="px-5 py-2 rounded-2xl bg-white hover:bg-neutral-100 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <HelpCircle size={17} className="text-emerald-600" />
                  <span>Question</span>
                </button>
              </div>

              {/* Row 4 (Centered): [😃 Reaction] */}
              <div className="w-full flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'Reaction',
                      iconType: 'reaction',
                      color: '#059669',
                    });
                    onClose();
                  }}
                  className="px-5 py-2 rounded-2xl bg-white hover:bg-neutral-100 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Smile size={17} className="text-emerald-600" />
                  <span>Reaction</span>
                </button>
              </div>
            </div>

            {/* Section 1: Recent (matching media_1789906286978.png) */}
            <div className="w-full px-4 pt-2">
              <div className="text-white/50 text-[11px] font-bold uppercase tracking-wider mb-2.5">
                Recent
              </div>

              <div className="grid grid-cols-5 gap-3 items-center justify-items-center">
                {/* 1. Azaw naw text sticker */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({ label: 'Azaw naw', bg: '#ffffff', color: '#000000' });
                    onClose();
                  }}
                  className="w-14 h-14 bg-white/95 rounded-xl border border-white/20 p-1 flex flex-col items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                >
                  <span className="text-[10px] font-black text-black leading-tight text-center">
                    Azaw naw
                  </span>
                </button>

                {/* 2. Orange Curved Arrow (matching screenshot) */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'arrow-orange',
                      iconType: 'doodle',
                      color: '#f97316',
                    });
                    onClose();
                  }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title="Orange Curved Arrow"
                >
                  <svg viewBox="0 0 100 100" className="w-11 h-11 filter drop-shadow-md">
                    <path
                      d="M75 80 C 70 45, 50 25, 25 35 M 25 35 L 42 22 M 25 35 L 35 52"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* 3. Cyan Upward Arrow (matching screenshot) */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'arrow-cyan',
                      iconType: 'doodle',
                      color: '#06b6d4',
                    });
                    onClose();
                  }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title="Cyan Up Arrow"
                >
                  <svg viewBox="0 0 100 100" className="w-11 h-11 filter drop-shadow-md">
                    <path
                      d="M50 85 L 50 20 M 50 20 L 32 38 M 50 20 L 68 38"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* 4. White Speech Callout Bubble (matching screenshot) */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectShape('callout');
                    onClose();
                  }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title="Speech Bubble"
                >
                  <svg viewBox="0 0 120 70" className="w-12 h-7 filter drop-shadow-md">
                    <path
                      d="M 15 10 H 105 A 15 15 0 0 1 120 25 V 45 A 15 15 0 0 1 105 60 H 35 L 18 68 L 22 60 H 15 A 15 15 0 0 1 0 45 V 25 A 15 15 0 0 1 15 10 Z"
                      fill="#ffffff"
                    />
                  </svg>
                </button>

                {/* 5. White Cloud Thought Bubble (matching screenshot) */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'thought-cloud',
                      iconType: 'bubble',
                    });
                    onClose();
                  }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title="Thought Bubble"
                >
                  <svg viewBox="0 0 120 80" className="w-12 h-8 filter drop-shadow-md">
                    <circle cx="40" cy="40" r="22" fill="#ffffff" />
                    <circle cx="65" cy="32" r="26" fill="#ffffff" />
                    <circle cx="90" cy="42" r="20" fill="#ffffff" />
                    <circle cx="78" cy="55" r="18" fill="#ffffff" />
                    <circle cx="50" cy="56" r="18" fill="#ffffff" />
                    <circle cx="28" cy="70" r="6" fill="#ffffff" />
                    <circle cx="20" cy="76" r="3.5" fill="#ffffff" />
                  </svg>
                </button>

                {/* 6. Red Curved Arrow (matching screenshot) */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'arrow-red',
                      iconType: 'doodle',
                      color: '#ef4444',
                    });
                    onClose();
                  }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title="Red Curved Arrow"
                >
                  <svg viewBox="0 0 100 100" className="w-11 h-11 filter drop-shadow-md">
                    <path
                      d="M20 70 C 40 40, 65 40, 80 55 M 80 55 L 68 42 M 80 55 L 65 68"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* 7. Gold Slanted Arrow (matching screenshot) */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({
                      label: 'arrow-gold',
                      iconType: 'doodle',
                      color: '#c9a96e',
                    });
                    onClose();
                  }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title="Gold Slanted Arrow"
                >
                  <svg viewBox="0 0 100 100" className="w-11 h-11 filter drop-shadow-md">
                    <path
                      d="M25 75 L 75 25 M 75 25 L 55 26 M 75 25 L 74 45"
                      fill="none"
                      stroke="#c9a96e"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* 8. "Life is a plantain" text card */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({ label: 'Life is a plantain', bg: '#ffffff', color: '#000000' });
                    onClose();
                  }}
                  className="w-14 h-14 bg-white rounded-xl border border-white/20 p-1 flex flex-col items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                >
                  <span className="text-[9px] font-black text-black text-center leading-tight">
                    Life is a plantain
                  </span>
                </button>

                {/* 9. Velour Gold VIP Badge */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({ label: 'VIP ONLY', bg: '#090909', color: '#c9a96e' });
                    onClose();
                  }}
                  className="w-14 h-14 bg-black border border-gold/50 rounded-xl p-1 flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                >
                  <span className="text-[9px] font-black text-gold uppercase tracking-wider text-center">
                    VIP ONLY
                  </span>
                </button>

                {/* 10. EXCLUSIVE Badge */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectSticker({ label: 'EXCLUSIVE', bg: '#090909', color: '#e0c08a' });
                    onClose();
                  }}
                  className="w-14 h-14 bg-black border border-gold/50 rounded-xl p-1 flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                >
                  <span className="text-[8px] font-black text-gold uppercase tracking-wider text-center">
                    EXCLUSIVE
                  </span>
                </button>
              </div>
            </div>

            {/* Section 2: Favorites (matching media_1789906286978.png) */}
            <div className="w-full px-4 pt-4">
              <div className="text-white/50 text-[11px] font-bold uppercase tracking-wider mb-2.5">
                Favorites
              </div>

              <div className="grid grid-cols-5 gap-3 items-center justify-items-center">
                {MEME_FAVORITES.map((meme) => (
                  <button
                    key={meme.id}
                    type="button"
                    onClick={() => {
                      onSelectSticker({
                        label: meme.label,
                        customImageUrl: meme.customImageUrl,
                      });
                      onClose();
                    }}
                    className="w-14 h-14 rounded-xl overflow-hidden border border-white/15 bg-black/40 hover:scale-110 active:scale-95 transition-transform shadow-md cursor-pointer group"
                    title={meme.label}
                  >
                    <img
                      src={meme.customImageUrl}
                      alt={meme.label}
                      className="w-full h-full object-cover group-hover:opacity-90"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sticky Bottom Category Dock (matching media_1789906286978.png) */}
        <div className="w-full shrink-0 h-12 bg-[#121215] border-t border-white/5 px-4 flex items-center justify-between text-white/50">
          {/* 1. Mini Analog Clock (Recent) */}
          <button
            type="button"
            onClick={() => setActiveTab('sticker')}
            className={`p-1.5 rounded-lg transition-colors ${
              activeTab === 'sticker' ? 'text-white' : 'hover:text-white'
            }`}
            title="Recent"
          >
            <ClockIcon size={19} />
          </button>

          {/* 2. History Icon */}
          <button
            type="button"
            onClick={() => setActiveTab('sticker')}
            className="p-1.5 rounded-lg hover:text-white transition-colors"
            title="History"
          >
            <RotateCcw size={18} />
          </button>

          {/* 3. Star (Favorites) */}
          <button
            type="button"
            onClick={() => setActiveTab('sticker')}
            className="p-1.5 rounded-lg hover:text-white transition-colors"
            title="Favorites"
          >
            <Star size={18} />
          </button>

          {/* 4. Smiley Emojis Shortcut */}
          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`p-1.5 rounded-lg transition-colors ${
              activeTab === 'emoji' ? 'text-gold' : 'hover:text-white'
            }`}
            title="All Apple Emojis"
          >
            <Smile size={19} />
          </button>

          {/* 5. Plus Add Custom Sticker */}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="p-1.5 rounded-lg text-gold hover:text-gold-light hover:bg-white/5 transition-colors"
            title="Add Custom Sticker from Photo"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
