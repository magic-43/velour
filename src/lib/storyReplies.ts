export interface StoryReplyMetadata {
  version: 1;
  type: 'story_reply';
  storyId?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video';
  caption?: string | null;
  creatorName?: string | null;
  creatorId?: string | null;
  reactionEmoji?: string | null;
  text: string;
}

export interface ParsedStoryReply {
  isStoryReply: boolean;
  replyText: string;
  meta: StoryReplyMetadata | null;
}

/**
 * Encodes a story reply into a backward-compatible string for postgres.
 */
export function encodeStoryReply(
  text: string,
  meta: Omit<StoryReplyMetadata, 'version' | 'type' | 'text'>
): string {
  const payload: StoryReplyMetadata = {
    version: 1,
    type: 'story_reply',
    text,
    ...meta,
  };
  return `${text}\n<!--story-reply:${JSON.stringify(payload)}-->`;
}

/**
 * Encodes a quick reaction emoji into a backward-compatible story reaction string.
 */
export function encodeStoryReaction(
  emoji: string,
  meta: Omit<StoryReplyMetadata, 'version' | 'type' | 'text' | 'reactionEmoji'>
): string {
  const payload: StoryReplyMetadata = {
    version: 1,
    type: 'story_reply',
    text: `Reacted ${emoji} to story`,
    reactionEmoji: emoji,
    ...meta,
  };
  return `Reacted ${emoji} to story\n<!--story-reply:${JSON.stringify(payload)}-->`;
}

/**
 * Parses message content to detect and extract rich story reply data.
 * Supports both new rich comments and legacy string patterns seamlessly.
 */
export function parseStoryReply(content: string | null | undefined): ParsedStoryReply {
  if (!content) {
    return { isStoryReply: false, replyText: '', meta: null };
  }

  // 1. Structured comment tag
  const commentMatch = content.match(/<!--story-reply:(.*?)-->/);
  if (commentMatch && commentMatch[1]) {
    try {
      const meta = JSON.parse(commentMatch[1]) as StoryReplyMetadata;
      const cleanText =
        meta.text ||
        content.replace(/<!--[\s\S]*$/, '').replace(/^🔘\s*/, '').trim();
      return {
        isStoryReply: true,
        replyText: cleanText,
        meta,
      };
    } catch {
      // JSON parse fallback
    }
  }

  // 2. Prefixed preview string or truncated comment tag
  if (content.includes('<!--story-reply:') || content.startsWith('🔘 ')) {
    const cleanText = content
      .replace(/<!--[\s\S]*$/, '')
      .replace(/^🔘\s*/, '')
      .trim()
      .split('\n')[0]
      .trim();
    return {
      isStoryReply: true,
      replyText: cleanText,
      meta: {
        version: 1,
        type: 'story_reply',
        text: cleanText,
      },
    };
  }

  // 3. Legacy "Replied to story: ..."
  const legacyReplyMatch = content.match(/^Replied to story:\s*"?(.*?)"?$/s);
  if (legacyReplyMatch) {
    const quotedText = legacyReplyMatch[1] || '';
    return {
      isStoryReply: true,
      replyText: quotedText,
      meta: {
        version: 1,
        type: 'story_reply',
        text: quotedText,
      },
    };
  }

  // 4. Legacy "Reacted ... to story"
  const legacyReactionMatch = content.match(/^Reacted\s+(.*?)\s+to story$/);
  if (legacyReactionMatch) {
    const emoji = legacyReactionMatch[1] || '❤️';
    return {
      isStoryReply: true,
      replyText: `Reacted ${emoji} to story`,
      meta: {
        version: 1,
        type: 'story_reply',
        text: `Reacted ${emoji} to story`,
        reactionEmoji: emoji,
      },
    };
  }

  return {
    isStoryReply: false,
    replyText: content,
    meta: null,
  };
}

/**
 * Helper for conversation list row preview text.
 * Completely strips any <!-- comments (even truncated fragments) so raw metadata never leaks.
 */
export function formatStoryPreviewText(preview: string | null | undefined): {
  isStory: boolean;
  text: string;
} {
  if (!preview) {
    return { isStory: false, text: 'Start a conversation' };
  }

  const isStory =
    preview.startsWith('🔘 ') ||
    preview.includes('<!--story-reply:') ||
    preview.startsWith('Replied to story:') ||
    /^Reacted\s+.*\s+to story/.test(preview);

  // 1. If full JSON comment is present, extract meta.text
  if (preview.includes('<!--story-reply:')) {
    const jsonMatch = preview.match(/<!--story-reply:(.*?)-->/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const meta = JSON.parse(jsonMatch[1]);
        if (meta.text) {
          return { isStory: true, text: meta.text };
        }
      } catch {
        // fallback to strip
      }
    }
  }

  // 2. Strip any HTML comments (including truncated ones from Postgres left(100))
  let cleanText = preview
    .replace(/<!--[\s\S]*$/, '')
    .replace(/^🔘\s*/, '')
    .trim();

  // Strip any newlines
  cleanText = cleanText.split('\n')[0].trim();

  // Legacy format checks on clean text
  const legacyReplyMatch = cleanText.match(/^Replied to story:\s*"?(.*?)"?$/s);
  if (legacyReplyMatch) {
    return { isStory: true, text: legacyReplyMatch[1] || '' };
  }

  const legacyReactionMatch = cleanText.match(/^Reacted\s+(.*?)\s+to story$/);
  if (legacyReactionMatch) {
    return { isStory: true, text: `Reacted ${legacyReactionMatch[1]}` };
  }

  return { isStory, text: cleanText || (isStory ? 'Story reply' : preview) };
}
