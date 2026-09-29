import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowLeft, Plus, Video, Camera, Play,
  Send, Trash2, Copy, Check, X, Loader2, DollarSign, Film
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  getVaultItems,
  uploadVaultMedia,
  deleteVaultItem,
  encodeVaultMediaMessage,
  type VaultItem
} from '../../lib/creatorVault';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface CreatorVaultViewProps {
  onBack: () => void;
}

type FilterType = 'all' | 'video' | 'image';

export default function CreatorVaultView({ onBack }: CreatorVaultViewProps) {
  const { profile, isCreator } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<VaultItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);

  // Upload modal states
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadPrice, setUploadPrice] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Send to Chat modal states
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [sendingToConvId, setSendingToConvId] = useState<string | null>(null);
  const [sendCaption, setSendCaption] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  // Copied link toast
  const [copied, setCopied] = useState(false);

  // Android hardware back button handlers
  useBackHandler(() => {
    setUploadModalOpen(false);
    return true;
  }, uploadModalOpen, 110);

  useBackHandler(() => {
    setSendModalOpen(false);
    return true;
  }, sendModalOpen, 110);

  useBackHandler(() => {
    setSelectedItem(null);
    return true;
  }, selectedItem !== null, 105);

  useBackHandler(() => {
    onBack();
    return true;
  }, true, 80);

  useEffect(() => {
    if (!profile) return;
    setItems(getVaultItems(profile.id));
  }, [profile]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
    setUploadError(null);

    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    setUploadModalOpen(true);
    e.target.value = '';
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !profile) return;

    try {
      setUploading(true);
      setUploadError(null);

      const priceNum = uploadPrice ? parseFloat(uploadPrice) : undefined;
      const newItem = await uploadVaultMedia(
        selectedFile,
        profile.id,
        uploadTitle,
        priceNum
      );

      setItems((prev) => [newItem, ...prev]);
      setUploadModalOpen(false);
      setSelectedFile(null);
      setFilePreviewUrl(null);
      setUploadTitle('');
      setUploadPrice('');
    } catch (err: any) {
      console.error('Vault upload failed:', err);
      setUploadError(err?.message || 'Failed to upload media. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (itemId: string) => {
    if (!profile) return;
    deleteVaultItem(profile.id, itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    if (selectedItem?.id === itemId) setSelectedItem(null);
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
  const handleOpenSendModal = async (item: VaultItem) => {
    setSelectedItem(item);
    setSendCaption(item.title || '');
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
    if (!profile || !selectedItem) return;

    try {
      setSendingToConvId(convId);

      const messageContent = encodeVaultMediaMessage(sendCaption, {
        mediaUrl: selectedItem.mediaUrl,
        mediaType: selectedItem.mediaType,
        title: selectedItem.title,
        price: selectedItem.defaultPrice,
        isLocked: Boolean(selectedItem.defaultPrice && selectedItem.defaultPrice > 0),
        durationSecs: selectedItem.durationSecs,
      });

      const { error } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: profile.id,
        sender_type: 'creator',
        content: messageContent,
        message_type: 'text',
      });

      if (error) throw error;

      // Update last_message_at on conversation
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convId);

      setSendSuccess(true);
      setTimeout(() => {
        setSendModalOpen(false);
        setSendSuccess(false);
        setSendingToConvId(null);
      }, 1200);
    } catch (err) {
      console.error('Failed to send vault item:', err);
      alert('Failed to send media. Please try again.');
      setSendingToConvId(null);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  return (
    <div className="px-4 sm:px-5 pt-0 pb-24 md:pb-8 max-w-[700px] w-full mx-auto md:mx-0">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="video/*,image/*"
        className="hidden"
      />

      {/* Header matching Stories/Home page */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 mb-4 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-muted hover:text-paper transition-colors cursor-pointer"
            aria-label="Back to profile"
          >
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">Media Library</h3>
        </div>

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-semibold tracking-wide transition-colors shadow-sm cursor-pointer"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>{uploading ? 'Uploading...' : 'Upload'}</span>
        </button>
      </div>

      {/* Filter Segmented Toggle List */}
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex p-0.5 sm:p-1 bg-[#121214] border border-white/5 rounded-xl">
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
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
          <span className="text-[11px] text-muted tracking-tight hidden sm:inline">
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {/* Media Grid */}
      {items.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-3.5">
            <Film size={22} strokeWidth={1.5} />
          </div>
          <h4 className="font-medium text-sm text-paper mb-1">Media Library is empty</h4>
          <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
            Upload videos and photos here to easily share in chats without repeated uploads.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gold hover:bg-gold-light text-ink text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Upload Media</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted text-xs">
          No {filter === 'video' ? 'videos' : 'photos'} found in your library.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="group aspect-square rounded-2xl overflow-hidden relative bg-[#121214] border border-white/10 hover:border-gold/50 transition-all cursor-pointer shadow-md select-none flex flex-col justify-end"
            >
              {/* Media preview */}
              {item.mediaType === 'video' ? (
                <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
                  <video
                    src={item.mediaUrl}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    preload="metadata"
                    muted
                  />
                  {/* Play badge */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-gold flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play size={16} className="translate-x-0.5 fill-gold" />
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={item.mediaUrl}
                  alt={item.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )}

              {/* Top Badges */}
              <div className="absolute inset-x-0 top-0 p-2.5 bg-gradient-to-b from-black/80 via-black/20 to-transparent flex items-center justify-between text-[11px] text-paper">
                <span className="w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-gold border border-white/10">
                  {item.mediaType === 'video' ? <Video size={10} /> : <Camera size={10} />}
                </span>

                {item.defaultPrice && item.defaultPrice > 0 ? (
                  <span className="font-semibold text-gold bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-full border border-gold/30 text-[10px]">
                    ${item.defaultPrice}
                  </span>
                ) : (
                  item.durationSecs && (
                    <span className="font-medium bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-md text-[10px] text-white/90">
                      {formatDuration(item.durationSecs)}
                    </span>
                  )
                )}
              </div>

              {/* Bottom Title Bar */}
              <div className="relative p-2.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
                <p className="text-xs text-paper font-semibold truncate leading-tight drop-shadow-sm">
                  {item.title}
                </p>
                <div className="flex items-center justify-between mt-1 text-[10px] text-muted">
                  <span>{formatFileSize(item.fileSize)}</span>
                  <span className="text-gold group-hover:underline">View</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Upload Modal ──────────────────────────────────────────────── */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !uploading && setUploadModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#161618] border border-white/15 p-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base text-paper">Save to Media Library</h3>
              {!uploading && (
                <button
                  onClick={() => setUploadModalOpen(false)}
                  className="text-muted hover:text-paper p-1 rounded-full"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {uploadError && (
              <div className="mb-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-2.5">
                {uploadError}
              </div>
            )}

            {/* Media Preview Box */}
            <div className="w-full aspect-video rounded-xl bg-black overflow-hidden mb-4 relative flex items-center justify-center border border-white/10">
              {selectedFile?.type.startsWith('video/') ? (
                <video
                  src={filePreviewUrl || ''}
                  className="w-full h-full object-contain"
                  controls
                />
              ) : (
                <img
                  src={filePreviewUrl || ''}
                  alt="Upload preview"
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-muted uppercase mb-1">
                  Title or Label
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. VIP Teaser, Summer Dance"
                  disabled={uploading}
                  className="w-full bg-[#0e0e10] border border-white/10 focus:border-gold/50 rounded-xl px-3 py-2 text-sm text-paper placeholder:text-muted/40 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted uppercase mb-1">
                  Default Unlock Price ($ USD, optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={uploadPrice}
                    onChange={(e) => setUploadPrice(e.target.value)}
                    placeholder="0 for free"
                    disabled={uploading}
                    className="w-full bg-[#0e0e10] border border-white/10 focus:border-gold/50 rounded-xl pl-7 pr-3 py-2 text-sm text-paper placeholder:text-muted/40 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  disabled={uploading}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-muted hover:text-paper font-medium text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Media</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Media Detail & Actions Modal ──────────────────────────────── */}
      {selectedItem && !sendModalOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#161618] border border-white/15 overflow-hidden shadow-2xl relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close Header */}
            <div className="flex items-center justify-between p-3.5 border-b border-white/10">
              <span className="text-xs text-muted font-medium truncate pr-2">
                {selectedItem.title}
              </span>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-muted hover:text-paper p-1 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            {/* Media Player */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {selectedItem.mediaType === 'video' ? (
                <video
                  src={selectedItem.mediaUrl}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                />
              ) : (
                <img
                  src={selectedItem.mediaUrl}
                  alt={selectedItem.title}
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            {/* Details & Actions */}
            <div className="p-4 bg-[#141416] border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{formatFileSize(selectedItem.fileSize)}</span>
                {selectedItem.durationSecs && (
                  <span>{formatDuration(selectedItem.durationSecs)}</span>
                )}
                {selectedItem.defaultPrice ? (
                  <span className="text-gold font-semibold">${selectedItem.defaultPrice} PPV</span>
                ) : (
                  <span className="text-emerald-400">Free</span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* Share to fan */}
                <button
                  onClick={() => handleOpenSendModal(selectedItem)}
                  className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99]"
                >
                  <Send size={14} className="fill-ink" />
                  <span>Send to Fan in Chat</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyLink(selectedItem.mediaUrl)}
                    className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-paper text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                  </button>

                  <button
                    onClick={() => handleDelete(selectedItem.id)}
                    className="py-2 px-3 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-muted hover:text-red-400 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                    title="Delete from Library"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Send to Fan Picker Modal ──────────────────────────────────── */}
      {sendModalOpen && selectedItem && (
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
                <p className="text-xs text-muted">Choose a conversation to deliver this media</p>
              </div>
              <button
                onClick={() => setSendModalOpen(false)}
                className="text-muted hover:text-paper p-1 rounded-full"
              >
                <X size={18} />
              </button>
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
                placeholder="Add a message for this media..."
                className="w-full bg-[#0e0e10] border border-white/10 focus:border-gold/50 rounded-xl px-3 py-2 text-xs text-paper placeholder:text-muted/40 outline-none"
              />
            </div>

            {sendSuccess && (
              <div className="mb-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl p-2.5 flex items-center gap-2">
                <Check size={14} />
                <span>Media sent successfully without re-uploading!</span>
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
