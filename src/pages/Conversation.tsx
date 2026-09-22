import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ConversationList from '../components/chat/ConversationList';
import ChatWindow from '../components/chat/ChatWindow';
import { useConversations } from '../lib/hooks/useConversations';
import { supabase } from '../lib/supabase';
import type { ConversationWithParticipants } from '../types';

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
      setDirectLoading(true);
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select(`
            *,
            fan:profiles!fan_id(id, username, display_name, avatar_url, last_seen_at),
            creator_profile:creator_profiles!creator_profile_id(
              id, owner_id, display_name, avatar_url,
              owner:profiles!owner_id(avatar_url, username, display_name)
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
          setDirectConv(data as ConversationWithParticipants);
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

  if (!conversationId) return null;

  const activeConv = conv || directConv;
  const other = activeConv ? getOtherParticipant(activeConv) : null;

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Left panel — conversation list (desktop only) */}
      <div className="hidden md:block">
        <ConversationList />
      </div>

      {/* Right panel — chat window */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {other ? (
          <ChatWindow
            conversationId={conversationId}
            other={other}
            onBack={() => navigate('/messages')}
          />
        ) : notFound ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-ink">
            <h3 className="font-serif text-2xl text-paper mb-2">Conversation not found</h3>
            <p className="text-muted text-sm max-w-sm mb-6 leading-relaxed">
              This conversation may have been removed or you do not have permission to view it.
            </p>
            <button
              type="button"
              onClick={() => navigate('/messages')}
              className="px-5 py-2.5 bg-gold text-ink text-xs font-semibold uppercase tracking-wider rounded-full hover:bg-gold-light transition-colors"
            >
              Back to Messages
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

