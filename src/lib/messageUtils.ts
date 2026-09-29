import { parseStoryReply } from './storyReplies';
import { parseVaultMediaMessage } from './creatorVault';

export interface CleanMessagePreview {
  text: string;
  isStoryReply?: boolean;
  isVaultMedia?: boolean;
  isVoiceNote?: boolean;
  isAttachment?: boolean;
  thumbnailUrl?: string | null;
  mediaType?: 'image' | 'video';
}

/**
 * Extracts human-readable display text and optional media thumbnail
 * from any message content, stripping all internal JSON comments or metadata tags.
 */
export function getCleanMessagePreview(
  content: string | null | undefined,
  messageType?: string,
  isDeleted?: boolean
): CleanMessagePreview {
  if (isDeleted) {
    return { text: 'Message deleted' };
  }

  if (messageType === 'voice_note') {
    return { text: '🎤 Voice note', isVoiceNote: true };
  }

  if (messageType === 'attachment') {
    return { text: '📎 Attachment', isAttachment: true };
  }

  if (!content) {
    return { text: '' };
  }

  // 1. Check if it's a rich story reply
  const storyReply = parseStoryReply(content);
  if (storyReply.isStoryReply) {
    const text = storyReply.meta?.reactionEmoji
      ? `Reacted ${storyReply.meta.reactionEmoji} to story`
      : (storyReply.replyText || storyReply.meta?.caption || 'Story reply');

    return {
      text: stripHiddenComments(text),
      isStoryReply: true,
      thumbnailUrl: storyReply.meta?.mediaUrl || null,
      mediaType: storyReply.meta?.mediaType || 'image',
    };
  }

  // 2. Check if it's a shared vault media item
  const vault = parseVaultMediaMessage(content);
  if (vault.isVaultMedia) {
    const text = vault.text || vault.media?.title || 'Shared media';
    return {
      text: stripHiddenComments(text),
      isVaultMedia: true,
      thumbnailUrl: vault.media?.thumbnailUrl || vault.media?.mediaUrl || null,
      mediaType: vault.media?.mediaType || 'image',
    };
  }

  // 3. Normal text: strip any comments (e.g. <!--story-reply... or <!--vault-media...)
  const clean = stripHiddenComments(content);
  return {
    text: clean || content,
  };
}

export interface ConversationPreviewResult {
  type: 'reaction' | 'story' | 'locked' | 'media' | 'voice_note' | 'attachment' | 'text';
  text: string;
  badge?: string;
  detail?: string;
  isLocked?: boolean;
  price?: number;
  mediaType?: 'image' | 'video';
  itemCount?: number;
}

/**
 * Parses any conversation last_message_preview string into a structured preview
 * for the conversation list row, handling reactions, locked content, media, and stories.
 */
export function parseConversationPreview(preview: string | null | undefined): ConversationPreviewResult {
  if (!preview) {
    return { type: 'text', text: 'Start a conversation' };
  }

  // 1. Reactions (e.g. "❤️ Reacted to: Hello")
  const reactionMatch = preview.match(
    /^([\p{Emoji_Presentation}\p{Extended_Pictographic}❤️🔥👍👎🥰👏😄🎉😮😢💯🤔🙏👀✨⚡🤩]+)\s+Reacted to:(.*)$/u
  );
  if (reactionMatch) {
    return {
      type: 'reaction',
      badge: reactionMatch[1],
      detail: reactionMatch[2].trim(),
      text: 'Reacted',
    };
  }

  // 2. Vault media / Locked content (complete or truncated)
  if (preview.includes('<!--vault-media:')) {
    const vault = parseVaultMediaMessage(preview);
    const isLocked = vault.media?.isLocked ?? /"isLocked"\s*:\s*true/.test(preview);
    const priceMatch = preview.match(/"price"\s*:\s*(\d+)/);
    const price = vault.media?.price ?? (priceMatch ? parseInt(priceMatch[1], 10) : undefined);
    const mediaType = vault.media?.mediaType ?? (preview.includes('"mediaType":"video"') ? 'video' : 'image');
    const itemsMatch = preview.match(/"items"\s*:\s*\[(.*?)\]/);
    const itemCount = vault.media?.items?.length ?? (itemsMatch ? (itemsMatch[1].match(/mediaUrl/g)?.length || 1) : 1);

    // Clean caption if any was prepended
    let caption = preview.replace(/<!--[\s\S]*$/, '').replace(/^🔒\s*/, '').replace(/•\s*\$\d+.*$/, '').trim();
    // If the stripped caption looks like a default label, ignore it as caption
    if (caption.startsWith('Locked Photo') || caption.startsWith('Locked Video') || caption.startsWith('Locked Bundle') || caption.startsWith('Photos') || caption === 'Photo' || caption === 'Video') {
      caption = '';
    }

    if (isLocked) {
      const defaultLabel = itemCount > 1
        ? `Locked Bundle (${itemCount})`
        : mediaType === 'video' ? 'Locked Video' : 'Locked Photo';

      return {
        type: 'locked',
        isLocked: true,
        price: price || 10,
        badge: `$${price || 10}`,
        text: caption || defaultLabel,
        detail: caption ? defaultLabel : undefined,
        mediaType,
        itemCount,
      };
    } else {
      const defaultLabel = itemCount > 1
        ? `Photos (${itemCount})`
        : mediaType === 'video' ? 'Video' : 'Photo';

      return {
        type: 'media',
        isLocked: false,
        text: caption || defaultLabel,
        mediaType,
        itemCount,
      };
    }
  }

  // 3. Human-readable locked indicator in preview (e.g. "🔒 Locked Photo • $25")
  if (preview.startsWith('🔒')) {
    const clean = stripHiddenComments(preview);
    const priceMatch = clean.match(/\$(\d+)/);
    const price = priceMatch ? parseInt(priceMatch[1], 10) : undefined;
    const label = clean.replace(/^🔒\s*/, '').trim();

    return {
      type: 'locked',
      isLocked: true,
      price: price || 10,
      badge: price ? `$${price}` : '$',
      text: label || 'Locked Content',
      mediaType: label.toLowerCase().includes('video') ? 'video' : 'image',
    };
  }

  // 4. Story replies
  const isStory =
    preview.startsWith('🔘 ') ||
    preview.includes('<!--story-reply:') ||
    preview.startsWith('Replied to story:') ||
    /^Reacted\s+.*\s+to story/.test(preview);

  if (isStory) {
    const clean = stripHiddenComments(preview).replace(/^🔘\s*/, '').trim();
    return {
      type: 'story',
      text: clean || 'Story reply',
    };
  }

  // 5. Standard Voice Note or Attachment indicators
  if (preview === '🎤 Voice note') return { type: 'voice_note', text: 'Voice note' };
  if (preview === '📎 Attachment') return { type: 'attachment', text: 'Attachment' };

  // 6. Regular clean text
  const clean = stripHiddenComments(preview);
  return {
    type: 'text',
    text: clean || 'Attachment',
  };
}

/**
 * Strips all HTML/JSON comment blocks (<!--...-->) and leading status icons.
 */
export function stripHiddenComments(text: string): string {
  if (!text) return '';
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!--[\s\S]*$/, '')
    .replace(/^🔘\s*/, '')
    .trim();
}
