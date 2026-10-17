import { useState, useEffect } from 'react';
import { X, Film, Video, Camera, Play, Send } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { getVaultItems, type VaultItem } from '../../lib/creatorVault';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface VaultMediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (items: VaultItem[], caption?: string) => void;
}

export default function VaultMediaPickerModal({
  isOpen,
  onClose,
  onSelect,
}: VaultMediaPickerModalProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<VaultItem[]>([]);
  const [caption, setCaption] = useState<string>('');

  // Android hardware back button handlers
  useBackHandler(() => {
    if (selectedItems.length > 0) {
      setSelectedItems([]);
      return true;
    }
    onClose();
    return true;
  }, isOpen, 120);

  useEffect(() => {
    if (!profile || !isOpen) return;
    const list = getVaultItems(profile.id);
    setItems(list);
    setSelectedItems([]);
    setCaption('');
  }, [profile, isOpen]);

  if (!isOpen) return null;

  const handleToggleItem = (item: VaultItem) => {
    setSelectedItems((prev) => {
      const exists = prev.some((it) => it.id === item.id);
      if (exists) {
        return prev.filter((it) => it.id !== item.id);
      }
      return [...prev, item];
    });
  };

  const handleConfirmSend = () => {
    if (selectedItems.length === 0) return;
    onSelect(selectedItems, caption.trim() || undefined);
    onClose();
  };

  const formatDuration = (secs?: number) => {
    if (!secs) return '';
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#161618] border-t sm:border border-white/10 p-4 sm:p-5 shadow-2xl relative max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Film size={16} className="text-gold" />
            <h3 className="font-serif font-semibold text-base text-paper">Media Library</h3>
            {selectedItems.length > 0 && (
              <span className="text-xs text-gold font-medium">
                ({selectedItems.length} selected)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-paper p-1 rounded-full cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {items.length === 0 ? (
          <div className="py-14 text-center text-muted text-xs space-y-2">
            <p className="text-paper font-medium text-sm">Your Media Library is empty</p>
            <p className="max-w-xs mx-auto">Upload videos and photos in your Profile Media Library to select and share here.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {/* Gallery Grid (No names, no price tags) */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {items.map((item) => {
                const selectedIndex = selectedItems.findIndex((it) => it.id === item.id);
                const isSelected = selectedIndex !== -1;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggleItem(item)}
                    className={`aspect-square rounded-xl overflow-hidden relative cursor-pointer border transition-all bg-black select-none ${
                      isSelected
                        ? 'border-gold ring-2 ring-gold/50 scale-[0.98]'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {item.mediaType === 'video' ? (
                      <div className="w-full h-full relative">
                        <video
                          src={item.mediaUrl}
                          className="w-full h-full object-cover pointer-events-none"
                          muted
                          preload="metadata"
                        />
                        {/* Video duration pill */}
                        {item.durationSecs !== undefined && (
                          <div className="absolute bottom-1 right-1 bg-black/75 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1 text-[9px] text-white/90 font-medium">
                            <Play size={7} fill="currentColor" />
                            <span>{formatDuration(item.durationSecs)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <img
                        src={item.mediaUrl}
                        alt="Media item"
                        className="w-full h-full object-cover pointer-events-none"
                        loading="lazy"
                      />
                    )}

                    {/* Numbered selection badge */}
                    <div className="absolute top-1.5 right-1.5 z-10">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-gold text-ink text-[11px] font-bold flex items-center justify-center shadow-lg">
                          {selectedIndex + 1}
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-black/40 border border-white/60 backdrop-blur-sm" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer / Caption Input and Send */}
        {selectedItems.length > 0 && (
          <div className="pt-3 border-t border-white/10 shrink-0 space-y-2.5">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a message (optional)..."
              className="w-full bg-[#101012] border border-white/10 focus:border-gold/50 rounded-xl px-3 py-2 text-xs text-paper placeholder:text-muted/40 outline-none"
            />

            <button
              onClick={handleConfirmSend}
              className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.99] cursor-pointer"
            >
              <Send size={13} className="fill-ink" />
              <span>
                Send {selectedItems.length} {selectedItems.length === 1 ? 'Media' : 'Items'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
