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

export interface VaultMediaPayload {
  version: 1;
  type: 'vault_media';
  mediaUrl: string;
  mediaType: 'video' | 'image';
  title?: string;
  thumbnailUrl?: string | null;
  price?: number;
  isLocked?: boolean;
  durationSecs?: number;
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
  const prefix = text?.trim() ? `${text.trim()}\n` : '';
  return `${prefix}<!--vault-media:${JSON.stringify(data)}-->`;
}

/**
 * Decodes message content to detect if it contains a shared vault media attachment.
 */
export function parseVaultMediaMessage(content: string | null | undefined): {
  isVaultMedia: boolean;
  text: string;
  media: VaultMediaPayload | null;
} {
  if (!content) return { isVaultMedia: false, text: '', media: null };
  const match = content.match(/<!--vault-media:(.*?)-->/);
  if (!match) return { isVaultMedia: false, text: content, media: null };

  try {
    const media = JSON.parse(match[1]) as VaultMediaPayload;
    const text = content.replace(/<!--vault-media:.*?-->/, '').trim();
    return { isVaultMedia: true, text, media };
  } catch {
    return { isVaultMedia: false, text: content, media: null };
  }
}
