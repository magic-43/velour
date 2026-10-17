import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import {
  ArrowLeft, Plus, Video, Play, Send, Trash2, Copy, Check, X, Loader2, Film, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  getVaultItems,
  uploadMultipleVaultMedia,
  deleteVaultItem,
  deleteVaultItems,
  encodeVaultMediaMessage,
  type VaultItem
} from '../../lib/creatorVault';
import { useBackHandler } from '../../lib/backButtonRegistry';
import MediaLightbox from '../chat/MediaLightbox';

interface CreatorVaultViewProps {
  onBack: () => void;
}

type FilterType = 'all' | 'video' | 'image';

export default function CreatorVaultView({ onBack }: CreatorVaultViewProps) {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<VaultItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  // Multi-select mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Lightbox preview for single-item view
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Direct upload progress
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Send to Fan modal states
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [itemsToSend, setItemsToSend] = useState<VaultItem[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [sendingToConvId, setSendingToConvId] = useState<string | null>(null);
  const [sendCaption, setSendCaption] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  // Copied link toast
  const [copied, setCopied] = useState(false);

  // Hardware back button hierarchy
  useBackHandler(() => {
    setSendModalOpen(false);
    return true;
  }, sendModalOpen, 120);

  useBackHandler(() => {
    setLightboxOpen(false);
    return true;
  }, lightboxOpen, 115);

  useBackHandler(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    return true;
  }, isSelectMode, 110);

  useBackHandler(() => {
    onBack();
    return true;
  }, true, 80);

  useEffect(() => {
    if (!profile) return;
    setItems(getVaultItems(profile.id));
  }, [profile]);

  // Handle direct file upload (multiple files supported)
  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !profile) return;
    const files = Array.from(fileList);
    e.target.value = '';

    try {
      setUploading(true);
      setUploadError(null);
      setUploadProgress({ completed: 0, total: files.length });

      const newItems = await uploadMultipleVaultMedia(files, profile.id, (completed, total) => {
        setUploadProgress({ completed, total });
      });

      setItems((prev) => [...newItems, ...prev]);
    } catch (err: any) {
      console.error('Media upload failed:', err);
      setUploadError(err?.message || 'Failed to upload media. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteSingle = (itemId: string) => {
    if (!profile) return;
    deleteVaultItem(profile.id, itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (!profile || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    deleteVaultItems(profile.id, ids);
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // Open conversation picker to send media
  const handleOpenSendModal = async (items: VaultItem[]) => {
    if (!items.length) return;
    setItemsToSend(items);
    setSendCaption('');
    setSendModalOpen(true);
    setSendSuccess(false);

    try {
      setLoadingConvs(true);
      // Fetch creator personas
      const { data: personas } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('owner_id', profile!.id);

      const targetIds = Array.from(
        new Set([profile!.id, ...(personas || []).map((p) => p.id)])
      );

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          last_message_at,
          fan:profiles!fan_id(id, username, display_name, avatar_url)
        `)
        .in('creator_profile_id', targetIds)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (!error && data) {
        setConversations(data.filter((c: any) => Boolean(c.fan)));
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  };

  const handleSendToConversation = async (convId: string) => {
    if (!profile || itemsToSend.length === 0) return;

    try {
      setSendingToConvId(convId);

      let messageContent: string;
      if (itemsToSend.length === 1) {
        const item = itemsToSend[0];
        messageContent = encodeVaultMediaMessage(sendCaption, {
          mediaUrl: item.mediaUrl,
          mediaType: item.mediaType,
          thumbnailUrl: item.thumbnailUrl,
          durationSecs: item.durationSecs,
        });
      } else {
        const batchId = `vault_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const first = itemsToSend[0];
        messageContent = encodeVaultMediaMessage(sendCaption, {
          mediaUrl: first.mediaUrl,
          mediaType: first.mediaType,
          thumbnailUrl: first.thumbnailUrl,
          durationSecs: first.durationSecs,
          batchId,
          items: itemsToSend.map((it) => ({
            id: it.id,
            mediaUrl: it.mediaUrl,
            mediaType: it.mediaType,
            thumbnailUrl: it.thumbnailUrl,
            durationSecs: it.durationSecs,
          })),
        });
      }

      const { error } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: profile.id,
        sender_type: 'creator',
        content: messageContent,
        message_type: 'text',
      });

      if (error) throw error;

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convId);

      setSendSuccess(true);
      setTimeout(() => {
        setSendModalOpen(false);
        setSendSuccess(false);
        setSendingToConvId(null);
        setIsSelectMode(false);
        setSelectedIds(new Set());
      }, 1000);
    } catch (err) {
      console.error('Failed to send media:', err);
      alert('Failed to send media. Please try again.');
      setSendingToConvId(null);
    }
  };

  const formatDuration = (secs?: number) => {
    if (!secs) return '';
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const filtered = items.filter((item) => {
    if (filter === 'video') return item.mediaType === 'video';
    if (filter === 'image') return item.mediaType === 'image';
    return true;
  });

  const selectedItemsList = items.filter((i) => selectedIds.has(i.id));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-ink">
      {/* Hidden file input with multiple selection */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="video/*,image/*"
        multiple
        className="hidden"
      />

      {/* Pinned Header */}
      <div className="sticky top-0 z-30 shrink-0 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-muted hover:text-paper transition-colors cursor-pointer"
            aria-label="Back to profile"
          >
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">
            Media Library
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (isSelectMode) {
                  setIsSelectMode(false);
                  setSelectedIds(new Set());
                } else {
                  setIsSelectMode(true);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-colors cursor-pointer ${
                isSelectMode
                  ? 'bg-white/20 text-paper'
                  : 'text-muted hover:text-paper hover:bg-white/10'
              }`}
            >
              {isSelectMode ? 'Done' : 'Select'}
            </button>
          )}

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-xs sm:text-sm font-semibold tracking-wide transition-colors shadow-sm cursor-pointer"
          >
            {uploading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Plus size={16} strokeWidth={2.5} />
            )}
            <span>{uploading ? 'Uploading...' : 'Upload'}</span>
          </button>
        </div>
      </div>

      {/* Uploading Progress Banner */}
      {uploadProgress && (
        <div className="bg-gold/10 border-b border-gold/20 px-4 py-2 flex items-center justify-between text-xs text-gold">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin shrink-0" />
            <span>
              Uploading {uploadProgress.total} file{uploadProgress.total > 1 ? 's' : ''}... ({uploadProgress.completed}/{uploadProgress.total})
            </span>
          </div>
          <div className="w-24 h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold transition-all duration-300"
              style={{
                width: `${Math.round((uploadProgress.completed / Math.max(uploadProgress.total, 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between text-xs text-red-400">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="p-1 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scrollable Gallery Body */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-4 pt-3 pb-28 max-w-[900px] w-full mx-auto">
        {/* Filter Segmented Toggle List */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="inline-flex p-0.5 bg-[#121214] border border-white/5 rounded-xl">
            {(['all', 'video', 'image'] as FilterType[]).map((tab) => {
              const count = items.filter((i) =>
                tab === 'all' ? true : i.mediaType === tab
              ).length;
              const label = tab === 'all' ? 'All' : tab === 'video' ? 'Videos' : 'Photos';
              const isActive = filter === tab;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-[#222225] text-paper font-semibold shadow-sm border border-white/5'
                      : 'text-muted hover:text-paper'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-[11px] ${isActive ? 'text-gold' : 'text-muted/60'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {items.length > 0 && (
            <span className="text-[11px] text-muted tracking-tight hidden sm:inline pr-1">
              {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {/* Media Grid: Pure Gallery Tiles (No titles, no price badges) */}
        {items.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-4">
              <Film size={26} strokeWidth={1.5} />
            </div>
            <h4 className="font-serif font-medium text-base text-paper mb-1.5">
              Media Library is empty
            </h4>
            <p className="text-muted text-xs max-w-xs mb-6 leading-relaxed">
              Upload photos and videos here to store them and quickly send them to fans anytime.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Upload Media</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted text-xs">
            No {filter === 'video' ? 'videos' : 'photos'} found in your library.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 sm:gap-2">
            {filtered.map((item, index) => {
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isSelectMode) {
                      handleToggleSelect(item.id);
                    } else {
                      setLightboxIndex(index);
                      setLightboxOpen(true);
                    }
                  }}
                  className={`group aspect-square rounded-lg sm:rounded-xl overflow-hidden relative bg-[#121214] transition-all cursor-pointer select-none ${
                    isSelectMode && isSelected
                      ? 'ring-2 ring-gold scale-[0.98]'
                      : 'hover:opacity-95'
                  }`}
                >
                  {/* Media preview */}
                  {item.mediaType === 'video' ? (
                    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
                      <video
                        src={item.mediaUrl}
                        className="w-full h-full object-cover pointer-events-none"
                        preload="metadata"
                        muted
                      />
                      {/* Video duration badge in bottom-right corner */}
                      {item.durationSecs !== undefined && (
                        <div className="absolute bottom-1.5 right-1.5 bg-black/75 backdrop-blur-sm px-1.5 py-0.5 rounded-md flex items-center gap-1 text-[10px] text-white/95 font-medium shadow">
                          <Play size={8} fill="currentColor" />
                          <span>{formatDuration(item.durationSecs)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <img
                      src={item.mediaUrl}
                      alt="Gallery item"
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}

                  {/* Multi-select checkmark circle */}
                  {isSelectMode && (
                    <div className="absolute top-2 right-2 z-10">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-gold text-ink flex items-center justify-center shadow-lg">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-black/50 border border-white/60 backdrop-blur-sm shadow" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Selection Toolbar */}
      {isSelectMode && (
        <div className="fixed bottom-6 inset-x-4 max-w-md mx-auto z-40 bg-[#1c1c1f]/95 backdrop-blur-md border border-white/15 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-150">
          <div className="flex items-center gap-2 pl-2">
            <span className="font-semibold text-xs sm:text-sm text-paper">
              {selectedIds.size} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleDeleteSelected}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-muted hover:text-red-400 disabled:opacity-40 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Delete selected"
            >
              <Trash2 size={15} />
              <span className="hidden sm:inline">Delete</span>
            </button>

            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => handleOpenSendModal(selectedItemsList)}
              className="px-3.5 py-2 rounded-xl bg-gold hover:bg-gold-light disabled:opacity-40 text-ink text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <Send size={13} className="fill-ink" />
              <span>Send to Fan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSelectMode(false);
                setSelectedIds(new Set());
              }}
              className="p-2 rounded-xl text-muted hover:text-paper hover:bg-white/10 text-xs transition-colors cursor-pointer"
              title="Cancel selection"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox for single-item preview */}
      {lightboxOpen && filtered.length > 0 && (
        <MediaLightbox
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          items={filtered.map((item) => ({
            mediaUrl: item.mediaUrl,
            mediaType: item.mediaType,
            thumbnailUrl: item.thumbnailUrl,
            timestamp: new Date(item.createdAt).toLocaleDateString(),
          }))}
          initialIndex={lightboxIndex}
          onDelete={(_item, idx) => {
            const target = filtered[idx];
            if (target) handleDeleteSingle(target.id);
            if (filtered.length <= 1) setLightboxOpen(false);
          }}
          onReply={(_item, idx) => {
            const target = filtered[idx];
            if (target) {
              setLightboxOpen(false);
              handleOpenSendModal([target]);
            }
          }}
        />
      )}

      {/* ── Send to Fan Picker Modal ──────────────────────────────────── */}
      {sendModalOpen && itemsToSend.length > 0 && (
        <div
          className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !sendingToConvId && setSendModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#161618] border border-white/15 p-5 shadow-2xl relative max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-semibold text-base text-paper">Send to Fan</h3>
                <p className="text-xs text-muted">
                  {itemsToSend.length === 1
                    ? '1 item selected'
                    : `${itemsToSend.length} items bundle`}
                </p>
              </div>
              <button
                onClick={() => setSendModalOpen(false)}
                className="text-muted hover:text-paper p-1 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            {/* Media thumbnail preview row */}
            <div className="flex items-center gap-2 overflow-x-auto py-3 border-b border-white/5">
              {itemsToSend.map((it) => (
                <div
                  key={it.id}
                  className="w-14 h-14 rounded-lg bg-black border border-white/10 overflow-hidden shrink-0 relative"
                >
                  {it.mediaType === 'video' ? (
                    <video
                      src={it.mediaUrl}
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <img
                      src={it.mediaUrl}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Message Caption Input */}
            <div className="my-3">
              <label className="block text-[11px] font-medium text-muted uppercase mb-1">
                Optional Message
              </label>
              <input
                type="text"
                value={sendCaption}
                onChange={(e) => setSendCaption(e.target.value)}
                placeholder="Add a message..."
                className="w-full bg-[#0e0e10] border border-white/10 focus:border-gold/50 rounded-xl px-3 py-2 text-xs text-paper placeholder:text-muted/40 outline-none"
              />
            </div>

            {sendSuccess && (
              <div className="mb-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl p-2.5 flex items-center gap-2">
                <CheckCircle2 size={14} />
                <span>Media sent successfully!</span>
              </div>
            )}

            {/* Conversations List */}
            <div className="overflow-y-auto flex-1 divide-y divide-white/5 py-1">
              {loadingConvs ? (
                <div className="py-12 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-8 text-center text-muted text-xs">
                  No active conversations found.
                </div>
              ) : (
                conversations.map((conv) => {
                  const isSendingThis = sendingToConvId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => !isSendingThis && !sendSuccess && handleSendToConversation(conv.id)}
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-ink-light border border-white/10 flex items-center justify-center shrink-0">
                          {conv.fan?.avatar_url ? (
                            <img
                              src={conv.fan.avatar_url}
                              alt={conv.fan.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="font-serif text-sm text-gold">
                              {(conv.fan?.display_name || conv.fan?.username || '?')
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-paper truncate">
                            {conv.fan?.display_name || conv.fan?.username}
                          </p>
                          <p className="text-[11px] text-muted truncate">
                            @{conv.fan?.username}
                          </p>
                        </div>
                      </div>

                      <button
                        disabled={Boolean(sendingToConvId)}
                        className="px-3 py-1 rounded-full bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-semibold shrink-0 flex items-center gap-1 transition-all"
                      >
                        {isSendingThis ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <>
                            <Send size={11} />
                            <span>Send</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
