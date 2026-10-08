import { MessageSquare } from 'lucide-react';
import ConversationList from '../components/chat/ConversationList';

/**
 * Messages — /messages
 * Desktop: conversation list on left + empty state on right.
 * Mobile: only the conversation list (full screen).
 */
export default function Messages() {
  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Left panel — conversation list */}
      <ConversationList />

      {/* Right panel — empty state (desktop only) */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-ink md:border-r border-border-subtle">
        <div className="w-24 h-24 rounded-full border border-border-subtle bg-ink-light flex items-center justify-center mb-6">
          <MessageSquare size={34} className="text-paper/70" strokeWidth={1.4} />
        </div>
        <h2 className="font-semibold text-2xl text-paper mb-2">Your messages</h2>
        <p className="text-muted text-sm max-w-sm leading-relaxed">
          Select a conversation to start chatting.
        </p>
      </div>
    </div>
  );
}
