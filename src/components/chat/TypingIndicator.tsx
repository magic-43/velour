interface Props {
  name: string;        // other person's first name
  avatarUrl?: string | null;
}

/**
 * Shows a WhatsApp-style typing indicator with three bouncing dots.
 * Rendered inside the message list when the other participant is typing.
 */
export default function TypingIndicator({ name, avatarUrl }: Props) {
  return (
    <div className="flex items-end gap-2 px-4 mb-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
      {/* Bubble with three dots */}
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-ink-light border border-border-subtle flex items-center gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full bg-muted"
          style={{ animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: '0ms' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-muted"
          style={{ animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: '200ms' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-muted"
          style={{ animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: '400ms' }}
        />
      </div>
    </div>
  );
}
