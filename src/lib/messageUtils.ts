import { parseStoryReply } from './storyReplies';
import { parseVaultMediaMessage } from './creatorVault';
import { parseUnlockRequestMessage, parseUnlockConfirmedMessage } from './unlockRequests';

export interface DocumentAttachment {
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
}

export interface GiftAttachment {
  type: string;
  giftId?: string;
  name: string;
  emoji: string;
  amount: number;
  note?: string | null;
  method?: string;
  ref?: string;
  imageUrl?: string | null;
  sentAt?: string;
}

export function parseGiftMessage(content: string | null | undefined): {
  isGift: boolean;
  gift: GiftAttachment | null;
  text: string | null;
} {
  if (!content) return { isGift: false, gift: null, text: null };
  const match = content.match(/<!--gift:([\s\S]*?)-->/);
  if (!match) {
    if (content.includes('<!--gift:')) {
      const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
      const amountMatch = content.match(/"amount"\s*:\s*([\d.]+)/);
      const emojiMatch = content.match(/"emoji"\s*:\s*"([^"]+)"/);
      const noteMatch = content.match(/"note"\s*:\s*"([^"]*)"/);
      const methodMatch = content.match(/"method"\s*:\s*"([^"]+)"/);
      const imageMatch = content.match(/"imageUrl"\s*:\s*"([^"]+)"/);

      const gift: GiftAttachment = {
        type: 'gift',
        name: nameMatch ? nameMatch[1] : 'Gift',
        amount: amountMatch ? parseFloat(amountMatch[1]) : 15,
        emoji: emojiMatch ? emojiMatch[1] : '🎁',
        note: noteMatch ? noteMatch[1] : null,
        method: methodMatch ? methodMatch[1] : undefined,
        imageUrl: imageMatch ? imageMatch[1] : null,
      };
      const text = content.replace(/<!--gift:[\s\S]*$/, '').trim();
      return { isGift: true, gift, text: text || null };
    }
    if (content.startsWith('🎁 Sent')) {
      const amountMatch = content.match(/\$(\d+(\.\d+)?)/);
      const gift: GiftAttachment = {
        type: 'gift',
        name: 'Gift',
        amount: amountMatch ? parseFloat(amountMatch[1]) : 15,
        emoji: '🎁',
      };
      return { isGift: true, gift, text: content };
    }
    return { isGift: false, gift: null, text: content };
  }

  try {
    const gift = JSON.parse(match[1]) as GiftAttachment;
    const text = content.replace(/<!--gift:[\s\S]*?-->/, '').trim();
    return { isGift: true, gift, text: text || null };
  } catch {
    const nameMatch = match[1].match(/"name"\s*:\s*"([^"]+)"/);
    const amountMatch = match[1].match(/"amount"\s*:\s*([\d.]+)/);
    const emojiMatch = match[1].match(/"emoji"\s*:\s*"([^"]+)"/);
    const noteMatch = match[1].match(/"note"\s*:\s*"([^"]*)"/);
    const methodMatch = match[1].match(/"method"\s*:\s*"([^"]+)"/);
    const imageMatch = match[1].match(/"imageUrl"\s*:\s*"([^"]+)"/);

    const gift: GiftAttachment = {
      type: 'gift',
      name: nameMatch ? nameMatch[1] : 'Gift',
      amount: amountMatch ? parseFloat(amountMatch[1]) : 15,
      emoji: emojiMatch ? emojiMatch[1] : '🎁',
      note: noteMatch ? noteMatch[1] : null,
      method: methodMatch ? methodMatch[1] : undefined,
      imageUrl: imageMatch ? imageMatch[1] : null,
    };
    const text = content.replace(/<!--gift:[\s\S]*?-->/, '').trim();
    return { isGift: true, gift, text: text || null };
  }
}

export function parseDocumentMessage(content: string | null | undefined): {
  isDocument: boolean;
  document: DocumentAttachment | null;
  text: string | null;
} {
  if (!content) return { isDocument: false, document: null, text: null };
  const match = content.match(/<!--document-attachment:([\s\S]*?)-->/);
  if (!match) return { isDocument: false, document: null, text: content };

  try {
    const document = JSON.parse(match[1]) as DocumentAttachment;
    const text = content.replace(/<!--document-attachment:[\s\S]*?-->/, '').trim();
    return { isDocument: true, document, text: text || null };
  } catch (err) {
    return { isDocument: false, document: null, text: content };
  }
}

export interface CleanMessagePreview {
  text: string;
  isStoryReply?: boolean;
  isVaultMedia?: boolean;
  isVoiceNote?: boolean;
  isAttachment?: boolean;
  isDocument?: boolean;
  document?: DocumentAttachment | null;
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

  // 3. Check if it's an unlock request receipt
  const unlockReq = parseUnlockRequestMessage(content);
  if (unlockReq.isUnlockRequest && unlockReq.request) {
    const req = unlockReq.request;
    const statusText = req.status === 'verified' ? '✅ Unlocked' : req.status === 'rejected' ? '❌ Declined' : '🎟️ Unlock Request';
    return {
      text: `${statusText} ($${req.amountUsd})`,
      thumbnailUrl: req.thumbnailUrl || req.cardImageUrl || null,
      mediaType: 'image',
    };
  }

  // 3b. Check if it's an unlock confirmation
  if (
    content.includes('unlock_confirmed') ||
    content.includes('unlock-confirmed') ||
    content.includes('<!--velour:unlock_confirmed-->')
  ) {
    const conf = parseUnlockConfirmedMessage(content);
    const amount = conf.payload?.amountUsd;
    const amountStr = amount ? ` ($${amount})` : '';
    return {
      text: conf.payload?.title ? `🔓 Unlocked ${conf.payload.title}${amountStr}` : `🔓 Content unlocked${amountStr}`,
      thumbnailUrl: conf.payload?.thumbnailUrl || null,
      mediaType: 'image',
    };
  }

  // 3c. Check if it's a document attachment
  const doc = parseDocumentMessage(content);
  if (doc.isDocument && doc.document) {
    const text = doc.text ? `${doc.text} (📄 ${doc.document.name})` : `📄 ${doc.document.name}`;
    return {
      text,
      isAttachment: true,
      isDocument: true,
      document: doc.document,
    };
  }

  // 3d. Check if it's a gift
  const giftData = parseGiftMessage(content);
  if (giftData.isGift) {
    const g = giftData.gift;
    const gText = g
      ? `🎁 Sent ${g.emoji || '🎁'} ${g.name} ($${g.amount})`
      : (giftData.text || '🎁 Sent a gift');
    return {
      text: gText,
    };
  }

  // 4. Normal text: strip any comments (e.g. <!--story-reply... or <!--vault-media... or <!--unlock-request...)
  const clean = stripHiddenComments(content);
  return {
    text: clean || content,
  };
}

export interface ConversationPreviewResult {
  type: 'reaction' | 'story' | 'locked' | 'unlocked' | 'media' | 'voice_note' | 'attachment' | 'text';
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

  // 4a. Unlock Confirmation (silent protocol message or preview)
  if (
    preview.includes('unlock_confirmed') ||
    preview.includes('unlock-confirmed') ||
    preview.includes('<!--velour:unlock_confirmed-->')
  ) {
    const conf = parseUnlockConfirmedMessage(preview);
    const amount = conf.payload?.amountUsd;
    const title = conf.payload?.title;

    return {
      type: 'unlocked',
      badge: amount ? `$${amount}` : 'UNLOCKED',
      text: title ? `Unlocked ${title}` : 'Exclusive content unlocked',
      price: amount,
    };
  }

  // 4b. Unlock Request receipts
  if (preview.includes('<!--unlock-request:') || preview.includes('unlock_request')) {
    const unlockReq = parseUnlockRequestMessage(preview);
    const req = unlockReq.request;
    const amount = req?.amountUsd || 10;
    const isVerified = req?.status === 'verified';
    const isRejected = req?.status === 'rejected';

    if (isVerified) {
      return {
        type: 'unlocked',
        badge: `$${amount}`,
        text: req?.title ? `Unlocked ${req.title}` : 'Exclusive content unlocked',
        price: amount,
      };
    }

    return {
      type: 'text',
      badge: isRejected ? '❌' : '🎟️',
      text: isRejected
        ? `Declined Unlock Request ($${amount})`
        : `Unlock Request • $${amount}`,
    };
  }

  // 4c. Gift receipts
  if (preview.includes('<!--gift:') || preview.startsWith('🎁')) {
    const giftData = parseGiftMessage(preview);
    const g = giftData.gift;
    return {
      type: 'text',
      badge: g?.emoji || '🎁',
      text: g ? `Sent ${g.emoji || '🎁'} ${g.name} ($${g.amount})` : 'Sent a gift',
      price: g?.amount,
    };
  }

  // 5. Story replies
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

  // 5b. Document attachments
  if (preview.includes('<!--document-attachment:')) {
    const doc = parseDocumentMessage(preview);
    return {
      type: 'attachment',
      text: doc.document?.name ? `📄 ${doc.document.name}` : 'Document',
    };
  }

  // 6. Standard Voice Note or Attachment indicators
  if (preview === '🎤 Voice note') return { type: 'voice_note', text: 'Voice note' };
  if (preview === '📎 Attachment') return { type: 'attachment', text: 'Attachment' };

  // 7. Regular clean text
  const clean = stripHiddenComments(preview);
  return {
    type: 'text',
    text: clean || 'Attachment',
  };
}

/**
 * Strips all HTML/JSON comment blocks (<!--...-->) and leading status icons.
 */
export function stripHiddenComments(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (
    trimmed.startsWith('{"version":1,"type":"unlock_confirmed"') ||
    (trimmed.startsWith('{') && trimmed.includes('"type":"unlock_confirmed"'))
  ) {
    return 'Content unlocked';
  }
  if (
    trimmed.startsWith('{"version":1,"type":"unlock_request"') ||
    (trimmed.startsWith('{') && trimmed.includes('"type":"unlock_request"'))
  ) {
    return 'Unlock request';
  }
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!--[\s\S]*$/, '')
    .replace(/^🔘\s*/, '')
    .trim();
}
