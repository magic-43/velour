export interface UnlockRequestPayload {
  version: number;
  type: 'unlock_request';
  attachmentId: string | null;
  creatorId: string | null;
  fanId: string;
  amountUsd: number;
  method: 'giftcard' | 'crypto';
  giftCardType?: 'e_card' | 'physical_card' | null;
  brand: string;
  proof: string;
  cardImageUrl?: string | null;
  thumbnailUrl?: string | null;
  title?: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: string;
  approvedAt?: string | null;
  // batch fields (added in rewrite)
  batchId?: string | null;
  mediaUrls?: string[];
}

/**
 * Payload inserted by the creator when they approve an unlock request.
 * Stored as a message with message_type: 'unlock_confirmed'.
 * Both sides' MessageBubble returns null for this type — it is invisible.
 * The fan's useMessages Realtime handler detects it and marks media as unlocked.
 */
export interface UnlockConfirmedPayload {
  version: 1;
  type: 'unlock_confirmed';
  fanId: string;
  batchId?: string | null;
  attachmentId?: string | null;
  mediaUrls: string[];
  thumbnailUrl?: string | null;
  title?: string;
  amountUsd: number;
  confirmedAt: string;
}

/**
 * Encodes an unlock request payload into message content with a clean human prefix
 * and a hidden JSON comment tag.
 */
export function encodeUnlockRequestMessage(payload: UnlockRequestPayload): string {
  const methodLabel = payload.method === 'crypto'
    ? 'USDT'
    : (payload.giftCardType === 'physical_card' ? `${payload.brand} (Physical Card)` : `${payload.brand} E-Gift Card`);

  const prefix = `🎟️ Unlock Request: ${methodLabel} • $${payload.amountUsd}`;
  return `${prefix}\n<!--unlock-request:${JSON.stringify(payload)}-->`;
}

/**
 * Detects and parses an unlock request payload from message content.
 * Supports complete JSON tags, fallback regex parsing for truncated previews, etc.
 */
export function parseUnlockRequestMessage(content: string | null | undefined): {
  isUnlockRequest: boolean;
  request: UnlockRequestPayload | null;
  cleanText: string;
} {
  if (!content) {
    return { isUnlockRequest: false, request: null, cleanText: '' };
  }

  // 0. Direct JSON match
  try {
    const directObj = JSON.parse(content);
    if (directObj?.type === 'unlock_request') {
      return { isUnlockRequest: true, request: directObj as UnlockRequestPayload, cleanText: '' };
    }
  } catch {}

  // 1. Complete comment match
  const match = content.match(/<!--unlock-request:(.*?)-->/);
  if (match) {
    try {
      const request = JSON.parse(match[1]) as UnlockRequestPayload;
      const cleanText = content.replace(/<!--unlock-request:[\s\S]*?-->/, '').trim();
      return { isUnlockRequest: true, request, cleanText };
    } catch {
      // Fall through to regex if JSON parse fails
    }
  }

  // 2. Truncated comment match (e.g. from Postgres left(100) or preview)
  if (content.includes('<!--unlock-request:')) {
    try {
      const statusMatch = content.match(/"status"\s*:\s*"(pending|verified|rejected)"/);
      const amountMatch = content.match(/"amountUsd"\s*:\s*([\d.]+)/);
      const brandMatch = content.match(/"brand"\s*:\s*"([^"]+)"/);
      const methodMatch = content.match(/"method"\s*:\s*"([^"]+)"/);
      const proofMatch = content.match(/"proof"\s*:\s*"([^"]+)"/);
      const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
      const cardTypeMatch = content.match(/"giftCardType"\s*:\s*"([^"]+)"/);

      const status = (statusMatch ? statusMatch[1] : 'pending') as 'pending' | 'verified' | 'rejected';
      const amountUsd = amountMatch ? parseFloat(amountMatch[1]) : 10;
      const brand = brandMatch ? brandMatch[1] : 'Gift Card';
      const method = (methodMatch && methodMatch[1] === 'crypto') ? 'crypto' : 'giftcard';

      const partialReq: UnlockRequestPayload = {
        version: 1,
        type: 'unlock_request',
        attachmentId: null,
        creatorId: null,
        fanId: '',
        amountUsd,
        method,
        giftCardType: cardTypeMatch ? cardTypeMatch[1] as any : 'e_card',
        brand,
        proof: proofMatch ? proofMatch[1] : '',
        title: titleMatch ? titleMatch[1] : undefined,
        status,
        submittedAt: new Date().toISOString(),
      };

      const cleanText = content.replace(/<!--[\s\S]*$/, '').trim();
      return { isUnlockRequest: true, request: partialReq, cleanText };
    } catch {
      // ignore
    }
  }

  return { isUnlockRequest: false, request: null, cleanText: content };
}

/**
 * Updates the status of an existing unlock request inside the message content string.
 */
export function updateUnlockRequestContentStatus(
  content: string,
  newStatus: 'verified' | 'rejected'
): string {
  const parsed = parseUnlockRequestMessage(content);
  if (!parsed.isUnlockRequest || !parsed.request) {
    return content;
  }

  const updatedReq: UnlockRequestPayload = {
    ...parsed.request,
    status: newStatus,
    approvedAt: newStatus === 'verified' ? new Date().toISOString() : undefined,
  };

  const statusLabel = newStatus === 'verified' ? '✅ Unlocked' : '❌ Declined';
  const newPrefix = parsed.cleanText.replace(/🎟️ Unlock Request:/, `${statusLabel}:`);

  return `${newPrefix}\n<!--unlock-request:${JSON.stringify(updatedReq)}-->`;
}

/**
 * Encodes an unlock-confirmed payload as a JSON string.
 * This is stored as the `content` of a message with message_type: 'unlock_confirmed'.
 */
export function encodeUnlockConfirmedMessage(payload: UnlockConfirmedPayload): string {
  return JSON.stringify(payload);
}

/**
 * Parses an unlock-confirmed payload from message content.
 * Reliable: pure JSON.parse, no regex tricks.
 */
export function parseUnlockConfirmedMessage(content: string | null | undefined): {
  isUnlockConfirmed: boolean;
  payload: UnlockConfirmedPayload | null;
} {
  if (!content) return { isUnlockConfirmed: false, payload: null };
  try {
    const obj = JSON.parse(content);
    if (obj?.type === 'unlock_confirmed') {
      return { isUnlockConfirmed: true, payload: obj as UnlockConfirmedPayload };
    }
  } catch {}
  return { isUnlockConfirmed: false, payload: null };
}
