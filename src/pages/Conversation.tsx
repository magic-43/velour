import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ConversationList from '../components/chat/ConversationList';
import ChatWindow from '../components/chat/ChatWindow';
import { useConversations } from '../lib/hooks/useConversations';
import { supabase } from '../lib/supabase';
import type { ConversationWithParticipants } from '../types';
import { getCachedConversation, saveCachedConversations } from '../lib/offline/db';
import { isOnline } from '../lib/offline/outboxSync';

/**
 * Conversation — /messages/:conversationId
 * Desktop: conversation list on left + chat window on right.
 * Mobile: chat window full-screen with back arrow → /messages.
 */
export default function Conversation() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { conversations, loading: listLoading, getOtherParticipant, refresh } = useConversations();

  const [directConv, setDirectConv] = useState<ConversationWithParticipants | null>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Fast path: load this conversation directly from IndexedDB immediately (0ms)
  useEffect(() => {
    if (!conversationId) return;
    getCachedConversation(conversationId).then((cached) => {
      if (cached) {
        setDirectConv(cached);
      }
    });
  }, [conversationId]);

  // Reset refs when conversationId changes
  const prevConvIdRef = useRef<string | undefined>(conversationId);
  const lastOtherRef = useRef<ReturnType<typeof getOtherParticipant> | null>(null);

  if (prevConvIdRef.current !== conversationId) {
    prevConvIdRef.current = conversationId;
    lastOtherRef.current = null;
    setDirectConv(null);
    setNotFound(false);
  }

  // Find the conversation to get the other participant's info
  const conv = conversations.find(c => c.id === conversationId);

  // If not found in loaded list, directly query by ID
  useEffect(() => {
    if (!conversationId) return;
    if (conv) {
      setNotFound(false);
      return;
    }

    let isMounted = true;
    const fetchDirect = async () => {
      // 1. Immediately check offline IndexedDB cache
      try {
        const cached = await getCachedConversation(conversationId);
        if (cached && isMounted) {
          setDirectConv(cached);
          setDirectLoading(false);
          setNotFound(false);
          return;
        }
      } catch (_) {}

      // 2. If offline, don't hang on network request
      if (!isOnline()) {
        if (isMounted) setDirectLoading(false);
        return;
      }

      setDirectLoading(true);
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select(`
            *,
            fan:profiles!fan_id(id, username, display_name, avatar_url, last_seen_at),
            creator_profile:creator_profiles!creator_profile_id(
              id, owner_id, display_name, avatar_url,
              owner:profiles!owner_id(id, avatar_url, username, display_name, last_seen_at)
            )
          `)
          .eq('id', conversationId)
          .maybeSingle();

        if (!isMounted) return;

        if (error || !data) {
          console.warn('Conversation not found in database:', error?.message);
          setNotFound(true);
          setDirectConv(null);
        } else {
          const convData = data as ConversationWithParticipants;
          setDirectConv(convData);
          saveCachedConversations([convData]).catch(() => {});
          setNotFound(false);
          // Refresh list so sidebar picks it up
          refresh();
        }
      } catch (err) {
        console.error('Error fetching conversation directly:', err);
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setDirectLoading(false);
      }
    };

    fetchDirect();

    return () => {
      isMounted = false;
    };
  }, [conversationId, conv, refresh]);

  const activeConv = conv || directConv;
  const other = useMemo(() => {
    return activeConv ? getOtherParticipant(activeConv) : null;
  }, [
    activeConv?.id,
    activeConv?.fan_id,
    activeConv?.creator_profile_id,
    activeConv?.fan?.avatar_url,
    activeConv?.creator_profile?.avatar_url,
    activeConv?.fan?.display_name,
    activeConv?.creator_profile?.display_name,
    activeConv?.fan?.last_seen_at,
    (activeConv?.creator_profile as any)?.owner?.last_seen_at,
    (activeConv?.creator_profile as any)?.owner_id,
    getOtherParticipant,
  ]);

  if (other) {
    lastOtherRef.current = other;
  }
  const effectiveOther = other || lastOtherRef.current;

  if (!conversationId) return null;

  return (
    <div className="flex flex-1 h-full max-h-[100dvh] overflow-hidden">
      {/* Left panel — conversation list (desktop only) */}
      <div className="hidden md:block">
        <ConversationList />
      </div>

      {/* Right panel — chat window */}
      <div className="flex-1 flex flex-col h-full max-h-[100dvh] overflow-hidden md:border-r border-border-subtle">
        {effectiveOther ? (
          <ChatWindow
            conversationId={conversationId}
            other={effectiveOther}
            onBack={() => {
              if (window.history.state && window.history.state.idx > 0) {
                navigate(-1);
              } else {
                navigate('/messages');
              }
            }}
          />
        ) : notFound ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-ink">
            <h3 className="font-serif text-2xl text-paper mb-2">Conversation not found</h3>
            <p className="text-muted text-sm max-w-sm mb-6 leading-relaxed">
              This conversation may have been removed or you do not have permission to view it.
            </p>
            <button
              type="button"
              onClick={() => {
                if (window.history.state && window.history.state.idx > 0) {
                  navigate(-1);
                } else {
                  navigate('/messages');
                }
              }}
              className="px-5 py-2.5 bg-gold text-ink text-xs font-semibold uppercase tracking-wider rounded-full hover:bg-gold-light transition-colors"
            >
              Back
            </button>
          </div>
        ) : (
          /* Loading state while conversation resolves */
          <div className="flex-1 flex items-center justify-center bg-ink">
            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

