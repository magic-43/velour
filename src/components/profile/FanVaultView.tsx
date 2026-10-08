import { useState, useEffect } from 'react';
import { ArrowLeft, Key, Play, Video, Camera, Compass, X, Calendar, LockOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface FanVaultViewProps {
  onBack: () => void;
  onCountChange?: (count: number) => void;
}

export interface UnlockedVaultItem {
  id: string;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  mediaType: 'image' | 'video';
  title?: string | null;
  creatorName?: string | null;
  creatorAvatar?: string | null;
  unlockedAt: string;
  amountUsd?: number | null;
}

export default function FanVaultView({ onBack, onCountChange }: FanVaultViewProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<UnlockedVaultItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [loading, setLoading] = useState(true);
  const [activePreview, setActivePreview] = useState<UnlockedVaultItem | null>(null);

  // Android hardware back button handlers
  useBackHandler(() => {
    setActivePreview(null);
    return true;
  }, activePreview !== null, 110);

  useBackHandler(() => {
    onBack();
    return true;
  }, true, 80);

  const fetchVault = async () => {
    if (!profile) return;
    try {
      setLoading(true);

      // 1. Fetch from attachment_unlocks (strictly status = 'verified')
      const { data: unlocks, error } = await supabase
        .from('attachment_unlocks')
        .select(`
          id,
          amount_usd,
          unlocked_at,
          status,
          media_url,
          attachment:message_attachments!attachment_id(
            id,
            public_url,
            thumbnail_url,
            mime_type,
            file_name,
            sender:profiles!sender_id(display_name, username, avatar_url)
          )
        `)
        .eq('fan_id', profile.id)
        .eq('status', 'verified')
        .order('unlocked_at', { ascending: false });

      const parsedDbItems: UnlockedVaultItem[] = [];
      if (!error && unlocks) {
        for (const row of unlocks) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const att = row.attachment as any;
          const directUrl = (row as any).media_url;
          const finalUrl = att?.public_url || directUrl;
          if (finalUrl) {
            const isVideo =
              att?.mime_type?.startsWith('video/') ||
              att?.file_name?.match(/\.(mp4|mov|webm)$/i) ||
              finalUrl.match(/\.(mp4|mov|webm)$/i);

            parsedDbItems.push({
              id: row.id,
              mediaUrl: finalUrl,
              thumbnailUrl: att?.thumbnail_url || (isVideo ? null : finalUrl),
              mediaType: isVideo ? 'video' : 'image',
              title: att?.file_name || 'Exclusive Media',
              creatorName: att?.sender?.display_name || att?.sender?.username || 'Creator',
              creatorAvatar: att?.sender?.avatar_url || null,
              unlockedAt: row.unlocked_at,
              amountUsd: row.amount_usd,
            });
          }
        }
      }

      // 2. Fetch from verified transactions_ledger
      try {
        const { data: verifiedTxs } = await supabase
          .from('transactions_ledger')
          .select(`
            id,
            amount_usd,
            created_at,
            media_url,
            attachment_id,
            description,
            creator:profiles!creator_id(display_name, username, avatar_url)
          `)
          .eq('user_id', profile.id)
          .eq('type', 'attachment_unlock')
          .eq('status', 'verified');

        if (verifiedTxs) {
          for (const tx of verifiedTxs) {
            if (
              tx.media_url &&
              !parsedDbItems.some((p) => p.mediaUrl === tx.media_url || p.id === tx.id)
            ) {
              const isVid = Boolean(tx.media_url.match(/\.(mp4|mov|webm)$/i));
              parsedDbItems.push({
                id: tx.id,
                mediaUrl: tx.media_url,
                thumbnailUrl: tx.media_url,
                mediaType: isVid ? 'video' : 'image',
                title: tx.description || 'Exclusive Media',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                creatorName: (tx.creator as any)?.display_name || (tx.creator as any)?.username || 'Creator',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                creatorAvatar: (tx.creator as any)?.avatar_url || null,
                unlockedAt: tx.created_at,
                amountUsd: tx.amount_usd,
              });
            }
          }
        }
      } catch {}

      // 3. Fetch locally recorded unlocked media — STRICTLY status: 'verified' only
      let localItems: any[] = [];
      try {
        const localKey = `velour_unlocked_media_${profile.id}`;
        const raw = localStorage.getItem(localKey);
        if (raw) localItems = JSON.parse(raw);
      } catch {
        localItems = [];
      }

      const combined = [...parsedDbItems];
      if (Array.isArray(localItems)) {
        // Enforce STRICT filter: item MUST have status === 'verified' and a valid mediaUrl
        const verifiedLocals = localItems.filter(
          (loc) => loc && loc.status === 'verified' && (loc.mediaUrl || loc.thumbnailUrl)
        );

        for (const loc of verifiedLocals) {
          const url = loc.mediaUrl || loc.thumbnailUrl;
          if (!combined.some((c) => c.mediaUrl === url || c.id === loc.id)) {
            combined.push({
              id: loc.id,
              mediaUrl: url,
              thumbnailUrl: loc.thumbnailUrl || url,
              mediaType: loc.mediaType === 'video' ? 'video' : 'image',
              title: loc.title || 'Exclusive Media',
              creatorName: loc.creatorName || 'Creator',
              creatorAvatar: loc.creatorAvatar || null,
              unlockedAt: loc.unlockedAt || new Date().toISOString(),
              amountUsd: loc.amountUsd || null,
            });
          }
        }
      }

      combined.sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime());
      setItems(combined);
      if (onCountChange) onCountChange(combined.length);
    } catch (err) {
      console.error('Failed to load fan vault items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    return item.mediaType === filter;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-ink">
      {/* Header matching Stories/Home page (permanently pinned) */}
      <div className="sticky top-0 z-30 shrink-0 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
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
            The Vault
          </h3>
        </div>

        {items.length > 0 && (
          <span className="text-xs text-muted font-medium tracking-tight">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-24 md:pb-8 max-w-[600px] w-full mx-auto md:mx-0">

      {/* Segmented Filter List if items exist */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 p-1 bg-[#101010] rounded-xl border border-white/[0.04] mb-4 w-fit">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filter === 'all' ? 'bg-white/10 text-paper shadow-sm' : 'text-muted hover:text-paper'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('video')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'video' ? 'bg-white/10 text-paper shadow-sm' : 'text-muted hover:text-paper'
            }`}
          >
            <Video size={12} />
            <span>Videos</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('image')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'image' ? 'bg-white/10 text-paper shadow-sm' : 'text-muted hover:text-paper'
            }`}
          >
            <Camera size={12} />
            <span>Photos</span>
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs">Loading vault items...</p>
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-3.5">
            <Key size={22} strokeWidth={1.5} />
          </div>
          <h4 className="font-medium text-sm text-paper mb-1">
            Your Vault is empty
          </h4>
          <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
            Exclusive photos, videos, and private collections unlocked in chats will be archived here.
          </p>
          <button
            type="button"
            onClick={() => navigate('/explore')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gold hover:bg-gold-light text-ink text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
          >
            <Compass size={14} />
            <span>Discover Creators</span>
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        /* No Items in Filter */
        <div className="py-16 text-center text-muted">
          <p className="text-xs">No {filter === 'video' ? 'videos' : 'photos'} found in your vault.</p>
        </div>
      ) : (
        /* Unlocked Media Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setActivePreview(item)}
              className="group relative aspect-square rounded-2xl overflow-hidden bg-ink-light border border-white/10 hover:border-gold/50 transition-all cursor-pointer shadow-sm select-none"
            >
              {/* Media Element */}
              {item.mediaType === 'video' ? (
                item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title || 'Unlocked video'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                    <Play size={24} className="text-white/60" />
                  </div>
                )
              ) : (
                <img
                  src={item.mediaUrl}
                  alt={item.title || 'Unlocked photo'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )}

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 opacity-80 group-hover:opacity-95 transition-opacity" />

              {/* Top Badges */}
              <div className="absolute top-2 left-2 flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur text-[9px] font-mono text-white/90 uppercase flex items-center gap-1">
                  {item.mediaType === 'video' ? <Video size={10} className="text-gold" /> : <Camera size={10} className="text-gold" />}
                  <span>{item.mediaType}</span>
                </span>
              </div>

              {/* Unlocked Badge */}
              <div className="absolute top-2 right-2">
                <div className="w-6 h-6 rounded-full bg-gold/20 backdrop-blur border border-gold/40 flex items-center justify-center text-gold shadow-sm">
                  <LockOpen size={11} />
                </div>
              </div>

              {/* Center Play Icon for Video */}
              {item.mediaType === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-9 h-9 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <Play size={15} fill="currentColor" className="ml-0.5 text-gold" />
                  </div>
                </div>
              )}

              {/* Bottom Creator Info & Title */}
              <div className="absolute bottom-2 inset-x-2 pointer-events-none">
                {item.creatorName && (
                  <p className="text-[10px] text-paper font-semibold truncate leading-tight drop-shadow">
                    {item.creatorName}
                  </p>
                )}
                <p className="text-[9px] text-muted truncate mt-0.5">
                  {new Date(item.unlockedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Media Lightbox / Preview Modal */}
      {activePreview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[160] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setActivePreview(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] bg-[#121214] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
                  <LockOpen size={13} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-paper truncate">
                    {activePreview.title || 'Unlocked Media'}
                  </h4>
                  <p className="text-[10px] text-muted truncate flex items-center gap-1">
                    <span>{activePreview.creatorName}</span>
                    <span>•</span>
                    <Calendar size={10} className="text-gold/80" />
                    <span>{new Date(activePreview.unlockedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActivePreview(null)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close preview"
              >
                <X size={15} />
              </button>
            </div>

            {/* Media Container */}
            <div className="flex-1 overflow-hidden bg-black flex items-center justify-center max-h-[70vh]">
              {activePreview.mediaType === 'video' ? (
                <video
                  src={activePreview.mediaUrl}
                  controls
                  autoPlay
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              ) : (
                <img
                  src={activePreview.mediaUrl}
                  alt={activePreview.title || 'Unlocked Media'}
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-black/40 border-t border-white/10 flex items-center justify-between text-xs text-muted">
              <span>Verified Unlocked Collection</span>
              <a
                href={activePreview.mediaUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="text-gold hover:text-gold-light font-medium transition-colors cursor-pointer"
              >
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
