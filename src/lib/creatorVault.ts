import { uploadPublicFile } from './r2';

export interface VaultItem {
  id: string;
  creatorId: string;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  mediaType: 'video' | 'image';
  title: string;
  fileName: string;
  fileSize?: number;
  durationSecs?: number;
  defaultPrice?: number;
  createdAt: string;
}

export interface VaultMediaItemPayload {
  id?: string;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  title?: string;
  thumbnailUrl?: string | null;
  blurredThumbnailUrl?: string | null;
  durationSecs?: number;
  fileName?: string;
  fileSize?: number;
}

export interface VaultMediaPayload {
  version: 1;
  type: 'vault_media';
  mediaUrl: string;
  mediaType: 'video' | 'image';
  title?: string;
  thumbnailUrl?: string | null;
  blurredThumbnailUrl?: string | null;
  price?: number;
  isLocked?: boolean;
  durationSecs?: number;
  batchId?: string;
  items?: VaultMediaItemPayload[];
}

const STORAGE_PREFIX = 'velour:vault:';

/**
 * Retrieve all stored media items in the creator's vault.
 */
export function getVaultItems(creatorId: string): VaultItem[] {
  if (!creatorId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${creatorId}`);
    if (!raw) return [];
    const items = JSON.parse(raw) as VaultItem[];
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.error('Error reading vault items:', err);
    return [];
  }
}

/**
 * Save a new item into the creator's vault storage.
 */
export function addVaultItem(
  creatorId: string,
  data: Omit<VaultItem, 'id' | 'createdAt' | 'creatorId'>
): VaultItem {
  const current = getVaultItems(creatorId);
  const newItem: VaultItem = {
    id: `vault_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    creatorId,
    createdAt: new Date().toISOString(),
    ...data,
  };

  const updated = [newItem, ...current];
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${creatorId}`, JSON.stringify(updated));
  } catch (err) {
    console.error('Error persisting vault item:', err);
  }

  return newItem;
}

/**
 * Remove an item from the creator's vault.
 */
export function deleteVaultItem(creatorId: string, itemId: string): void {
  const current = getVaultItems(creatorId);
  const filtered = current.filter((item) => item.id !== itemId);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${creatorId}`, JSON.stringify(filtered));
  } catch (err) {
    console.error('Error deleting vault item:', err);
  }
}

/**
 * Upload a media file (video or image) to Cloudflare R2 and store it in the creator's Vault.
 */
export async function uploadVaultMedia(
  file: File,
  creatorId: string,
  title?: string,
  price?: number
): Promise<VaultItem> {
  const isVideo = file.type.startsWith('video/');
  const mediaType: 'video' | 'image' = isVideo ? 'video' : 'image';
  const cleanName = file.name.replace(/\s+/g, '_');
  const storageKey = `vault/${creatorId}/${Date.now()}_${cleanName}`;

  // Upload to public R2 CDN
  const publicUrl = await uploadPublicFile(file, storageKey, {
    skipCompression: isVideo, // Do not compress raw video files
  });

  let durationSecs: number | undefined;

  // Extract video duration if it's a video file
  if (isVideo) {
    try {
      durationSecs = await new Promise<number>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(video.src);
          resolve(Math.round(video.duration));
        };
        video.onerror = () => resolve(0);
      });
    } catch {
      durationSecs = undefined;
    }
  }

  return addVaultItem(creatorId, {
    mediaUrl: publicUrl,
    thumbnailUrl: isVideo ? null : publicUrl,
    mediaType,
    title: title?.trim() || file.name.replace(/\.[^/.]+$/, ''),
    fileName: file.name,
    fileSize: file.size,
    durationSecs,
    defaultPrice: price && price > 0 ? Math.round(price) : undefined,
  });
}

/**
 * Encodes a shared vault media item into backward-compatible chat message text.
 */
export function encodeVaultMediaMessage(
  text: string,
  payload: Omit<VaultMediaPayload, 'version' | 'type'>
): string {
  const data: VaultMediaPayload = {
    version: 1,
    type: 'vault_media',
    ...payload,
  };

  const isLocked = Boolean(payload.isLocked);
  const price = payload.price || 10;
  const itemCount = payload.items && payload.items.length > 1 ? payload.items.length : 1;
  const isVideo = payload.mediaType === 'video';

  const cleanText = text?.trim() || '';
  return cleanText
    ? `${cleanText}\n<!--vault-media:${JSON.stringify(data)}-->`
    : `<!--vault-media:${JSON.stringify(data)}-->`;
}

function isSystemGeneratedMediaLabel(str: string): boolean {
  const s = str.trim();
  if (!s) return true;
  if (s === '📷 Photo' || s === '🎥 Video' || s === 'Photo' || s === 'Video') return true;
  if (/^📷\s*Photos\s*\(\d+\)$/.test(s)) return true;
  if (/^🔒\s*Locked\s*(Photo|Video|Bundle).*$/i.test(s)) return true;
  return false;
}

/**
 * Decodes message content to detect if it contains a shared vault media attachment.
 * Supports complete JSON comments, prepended text, and truncated previews from Postgres left(100).
 */
export function parseVaultMediaMessage(content: string | null | undefined): {
  isVaultMedia: boolean;
  text: string;
  media: VaultMediaPayload | null;
} {
  if (!content) return { isVaultMedia: false, text: '', media: null };

  // 1. Complete comment match
  const match = content.match(/<!--vault-media:(.*?)-->/);
  if (match) {
    try {
      const media = JSON.parse(match[1]) as VaultMediaPayload;
      const rawText = content.replace(/<!--vault-media:[\s\S]*?-->/, '').trim();
      const text = isSystemGeneratedMediaLabel(rawText) ? '' : rawText;
      return { isVaultMedia: true, text, media };
    } catch {
      // Fall through to regex-based extraction
    }
  }

  // 2. Truncated comment match (e.g. from Postgres left(100))
  if (content.includes('<!--vault-media:')) {
    const isLockedMatch = content.match(/"isLocked"\s*:\s*(true|false)/);
    const priceMatch = content.match(/"price"\s*:\s*(\d+)/);
    const typeMatch = content.match(/"mediaType"\s*:\s*"([^"]+)"/);
    const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
    const mediaUrlMatch = content.match(/"mediaUrl"\s*:\s*"([^"]+)"/);

    const isLocked = isLockedMatch ? isLockedMatch[1] === 'true' : false;
    const price = priceMatch ? parseInt(priceMatch[1], 10) : undefined;
    const mediaType = (typeMatch && typeMatch[1] === 'video') ? 'video' : 'image';
    const rawText = content.replace(/<!--[\s\S]*$/, '').trim();
    const text = isSystemGeneratedMediaLabel(rawText) ? '' : rawText;

    return {
      isVaultMedia: true,
      text,
      media: {
        version: 1,
        type: 'vault_media',
        mediaUrl: mediaUrlMatch ? mediaUrlMatch[1] : '',
        mediaType,
        title: titleMatch ? titleMatch[1] : undefined,
        isLocked,
        price,
      },
    };
  }

  return { isVaultMedia: false, text: content, media: null };
}

/**
 * Generates a blurred thumbnail data URL from an image file or video frame.
 */
export async function generateBlurredThumbnail(
  fileOrUrl: File | Blob | string,
  blurRadius = 24
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve('');

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);

    img.onload = () => {
      if (typeof fileOrUrl !== 'string') {
        URL.revokeObjectURL(url);
      }
      ctx.filter = `blur(${blurRadius}px)`;
      ctx.drawImage(img, -10, -10, 180, 180);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };

    img.onerror = () => {
      if (typeof fileOrUrl !== 'string') {
        URL.revokeObjectURL(url);
      }
      resolve('');
    };

    img.src = url;
  });
}
