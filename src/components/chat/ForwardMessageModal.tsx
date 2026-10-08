import React, { useState, useMemo } from 'react';
import { X, Search, Check, Send, Forward, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useConversations } from '../../lib/hooks/useConversations';
import { supabase } from '../../lib/supabase';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import { getCleanMessagePreview } from '../../lib/messageUtils';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageToForward?: MessageWithSender | null;
  bulkMessages?: MessageWithSender[];
  onForwardSuccess?: (count: number) => void;
}

export default function ForwardMessageModal({
  isOpen,
  onClose,
  messageToForward,
  bulkMessages = [],
  onForwardSuccess,
}: ForwardMessageModalProps) {
  const { user } = useAuth();
  const { conversations, loading } = useConversations();
  const [search, setSearch] = useState('');
  const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBackHandler(() => {
    onClose();
    return true;
  }, isOpen, 150);

  // Compute messages to send
  const messagesToSend = useMemo(() => {
    if (bulkMessages && bulkMessages.length > 0) return bulkMessages;
    if (messageToForward) return [messageToForward];
    return [];
  }, [bulkMessages, messageToForward]);

  // Compute participants list with display details
  const conversationList = useMemo(() => {
    if (!user) return [];
    return conversations.map((conv) => {
      const isFan = conv.fan_id === user.id;
      const otherPerson = isFan ? conv.creator_profile : conv.fan;
      const name = otherPerson?.display_name || (otherPerson as any)?.username || 'User';
      const username = (otherPerson as any)?.username || (otherPerson as any)?.owner?.username || '';
      const avatarUrl = otherPerson?.avatar_url || (otherPerson as any)?.owner?.avatar_url || null;

      return {
        id: conv.id,
        name,
        username,
        avatarUrl,
      };
    });
  }, [conversations, user]);

  // Filter conversations by search input
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversationList;
    return conversationList.filter(
      (c) => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
    );
  }, [conversationList, search]);

  const toggleSelect = (id: string) => {
    setSelectedConvIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (!user || selectedConvIds.size === 0 || messagesToSend.length === 0) return;
    setIsSending(true);
    setError(null);

    try {
      for (const convId of selectedConvIds) {
        for (const msg of messagesToSend) {
          const preview = getCleanMessagePreview(msg.content, msg.message_type, msg.is_deleted);
          const content = msg.content || preview.text || '';

          await supabase.from('messages').insert({
            conversation_id: convId,
            sender_id: user.id,
            content,
            message_type: msg.message_type || 'text',
            status: 'sent',
          });

          await supabase
            .from('conversations')
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: preview.text || 'Forwarded message',
            })
            .eq('id', convId);
        }
      }

      const totalForwarded = selectedConvIds.size;
      setSelectedConvIds(new Set());
      setSearch('');
      onForwardSuccess?.(totalForwarded);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to forward messages:', err);
      setError(err instanceof Error ? err.message : 'Could not forward message');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl flex flex-col max-h-[85vh] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Forward size={18} className="text-gold" />
            <h3 className="font-serif font-semibold text-paper text-base">Forward Message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message preview snippet */}
        <div className="px-5 py-3 bg-[#181818] border-b border-white/5">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
            {messagesToSend.length > 1
              ? `${messagesToSend.length} messages selected`
              : 'Forwarding'}
          </p>
          <p className="text-xs text-paper/80 line-clamp-2 italic">
            "{messagesToSend.map((m) => getCleanMessagePreview(m.content, m.message_type, m.is_deleted).text).filter(Boolean).join(' • ')}"
          </p>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
            <input
              type="text"
              placeholder="Search chat or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-paper text-xs placeholder:text-muted focus:outline-none focus:border-gold/50"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04] min-h-[220px]">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-muted gap-2 text-xs">
              <Loader2 size={16} className="animate-spin text-gold" />
              <span>Loading chats...</span>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted text-xs p-4 text-center">
              <p>No conversations found</p>
            </div>
          ) : (
            filteredList.map((conv) => {
              const isSelected = selectedConvIds.has(conv.id);
              return (
                <div
                  key={conv.id}
                  onClick={() => toggleSelect(conv.id)}
                  className={`flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.04] cursor-pointer transition-colors ${
                    isSelected ? 'bg-gold/10' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-ink-light border border-white/10 flex items-center justify-center shrink-0">
                    {conv.avatarUrl ? (
                      <img src={conv.avatarUrl} alt={conv.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-serif text-sm text-gold">
                        {conv.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-paper truncate">{conv.name}</p>
                    {conv.username && (
                      <p className="text-[11px] text-muted truncate">@{conv.username}</p>
                    )}
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-gold border-gold text-ink'
                        : 'border-white/20 bg-transparent text-transparent'
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 mx-4 my-2 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between gap-3 bg-[#101010]">
          <span className="text-xs text-muted">
            {selectedConvIds.size} recipient{selectedConvIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 rounded-xl text-xs text-muted hover:text-paper hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || selectedConvIds.size === 0}
              className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Forwarding...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
