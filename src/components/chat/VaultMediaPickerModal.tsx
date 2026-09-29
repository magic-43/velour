import { useState, useEffect } from 'react';
import { X, Film, Video, Camera, Play, Check, Send } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { getVaultItems, type VaultItem } from '../../lib/creatorVault';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface VaultMediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: VaultItem, price?: number, message?: string) => void;
}

export default function VaultMediaPickerModal({
  isOpen,
  onClose,
  onSelect,
}: VaultMediaPickerModalProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [price, setPrice] = useState<string>('');
  const [caption, setCaption] = useState<string>('');

  // Android hardware back button handlers
  useBackHandler(() => {
    setSelectedItem(null);
    return true;
  }, isOpen && selectedItem !== null, 125);

  useBackHandler(() => {
    onClose();
    return true;
  }, isOpen, 120);

  useEffect(() => {
    if (!profile || !isOpen) return;
    const list = getVaultItems(profile.id);
    setItems(list);
    setSelectedItem(null);
    setPrice('');
    setCaption('');
  }, [profile, isOpen]);

  if (!isOpen) return null;

  const handleConfirmSend = () => {
    if (!selectedItem) return;
    const finalPrice = price ? parseFloat(price) : selectedItem.defaultPrice;
    onSelect(selectedItem, finalPrice, caption.trim());
    onClose();
  };

  const handleSelectItem = (item: VaultItem) => {
    setSelectedItem(item);
    setPrice(item.defaultPrice ? String(item.defaultPrice) : '');
    setCaption(item.title || '');
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#161618] border-t sm:border border-white/10 p-5 shadow-2xl relative max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Film size={16} className="text-gold" />
            <h3 className="font-semibold text-base text-paper">Select from Media Library</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-paper p-1 rounded-full"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {items.length === 0 ? (
          <div className="py-12 text-center text-muted text-xs space-y-3">
            <p>Your Media Library is empty. Upload videos and photos in your Profile Media Library first.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {/* Media Grid */}
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`aspect-square rounded-xl overflow-hidden relative cursor-pointer border transition-all bg-black ${
                      isSelected
                        ? 'border-gold ring-2 ring-gold/40'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {item.mediaType === 'video' ? (
                      <video
                        src={item.mediaUrl}
                        className="w-full h-full object-cover pointer-events-none"
                        muted
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={item.mediaUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    )}

                    {/* Badge */}
                    <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm p-1 rounded text-gold">
                      {item.mediaType === 'video' ? <Video size={10} /> : <Camera size={10} />}
                    </div>

                    {/* Selected Checkmark */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-gold/20 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-gold text-ink flex items-center justify-center shadow">
                          <Check size={14} strokeWidth={2.5} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom Configuration for Selected Item */}
            {selectedItem && (
              <div className="p-3.5 rounded-2xl bg-[#121214] border border-white/10 space-y-3 animate-in fade-in duration-150">
                <div>
                  <label className="block text-[11px] font-medium text-muted uppercase mb-1">
                    Caption
                  </label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a message..."
                    className="w-full bg-[#161618] border border-white/10 focus:border-gold/50 rounded-xl px-3 py-1.5 text-xs text-paper placeholder:text-muted/40 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted uppercase mb-1">
                    Unlock Price ($ USD, optional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0 for free"
                      className="w-full bg-[#161618] border border-white/10 focus:border-gold/50 rounded-xl pl-6 pr-3 py-1.5 text-xs text-paper placeholder:text-muted/40 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {selectedItem && (
          <div className="pt-2 border-t border-white/10 shrink-0">
            <button
              onClick={handleConfirmSend}
              className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.99]"
            >
              <Send size={13} className="fill-ink" />
              <span>Send Selected Media</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
