/**
 * r2.ts — Cloudflare R2 client utilities
 *
 * Files are compressed (images) and sent as base64 to the Supabase Edge
 * Function, which uploads server-to-server to R2. This avoids CORS entirely
 * since the S3 API endpoint never receives a browser request.
 */

import { supabase } from './supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string;

// ── Image compression ─────────────────────────────────────────────────────────

/**
 * Compress an image file using the Canvas API.
 * For avatars maxWidth is ~400px, but for high quality photos/stories
 * maxWidth can be 2560px or bypassed entirely.
 */
function compressImage(file: File, maxWidth = 400, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    // Only compress image types
    if (!file.type.startsWith('image/')) return resolve(file);

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (maxWidth && width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, width, height);

      // Attempt WebP compression first for 60-75% bandwidth savings; fallback to JPEG
      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob && webpBlob.type === 'image/webp') {
            return resolve(new File([webpBlob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
          }
          canvas.toBlob(
            (jpgBlob) => {
              if (!jpgBlob) return resolve(file);
              resolve(new File([jpgBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
            },
            'image/jpeg',
            quality,
          );
        },
        'image/webp',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fallback to original
    };

    img.src = objectUrl;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a File/Blob to a base64 string */
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  // Chunk to avoid call-stack overflow on very large arrays
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Call the r2-storage Edge Function with the user's JWT */
async function callR2Function(body: object): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${FUNCTIONS_URL}/r2-storage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `R2 function error (${res.status})`);
  }

  return res;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface UploadPublicFileOptions {
  maxWidth?: number;
  quality?: number;
  skipCompression?: boolean;
}

/**
 * Upload a file to the PUBLIC R2 bucket via the Edge Function.
 * Avatars are compressed by default. Stories or pre-baked media can skip
 * or customize compression to preserve high resolution.
 *
 * @param file    The File to upload
 * @param key     Storage key e.g. "avatars/userId/avatar.jpg" or "stories/..."
 * @param options Compression and resolution options
 * @returns       The public CDN URL
 */
export async function uploadPublicFile(
  file: File,
  key: string,
  options?: UploadPublicFileOptions
): Promise<string> {
  let processedFile = file;

  if (!options?.skipCompression && file.type.startsWith('image/')) {
    const isAvatar = key.startsWith('avatars/');
    const maxWidth = options?.maxWidth ?? (isAvatar ? 400 : 2560);
    const quality = options?.quality ?? (isAvatar ? 0.82 : 0.90);
    processedFile = await compressImage(file, maxWidth, quality);
  }

  // Update key extension to match processed format (.webp or .jpg)
  let finalKey = key;
  if (file.type.startsWith('image/')) {
    if (processedFile.type === 'image/webp') {
      finalKey = key.replace(/\.[^.]+$/, '.webp');
    } else if (processedFile.type === 'image/jpeg') {
      finalKey = key.replace(/\.[^.]+$/, '.jpg');
    }
  }

  const fileBase64 = await fileToBase64(processedFile);

  const res = await callR2Function({
    action: 'upload',
    bucket: 'velour-public',
    key: finalKey,
    contentType: processedFile.type,
    fileBase64,
  });

  const { publicUrl } = await res.json() as { publicUrl: string };
  return publicUrl;
}

/**
 * Upload a file to the PRIVATE R2 bucket via the Edge Function.
 * Used for locked attachments in chat.
 *
 * @param file            The File to upload
 * @param conversationId  UUID of the conversation
 * @param messageId       UUID of the message
 * @returns               The private storage key (store in DB)
 */
export async function uploadPrivateAttachment(
  file: File,
  conversationId: string,
  messageId: string,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const key = `attachments/${conversationId}/${messageId}.${ext}`;
  const fileBase64 = await fileToBase64(file);

  await callR2Function({
    action: 'upload',
    bucket: 'velour-private',
    key,
    contentType: file.type || 'application/octet-stream',
    fileBase64,
  });

  return key;
}

/**
 * Get a short-lived signed download URL for a private attachment.
 *
 * @param key            Storage key from uploadPrivateAttachment
 * @param conversationId UUID of the conversation (for access check)
 * @returns              A signed URL valid for 1 hour
 */
export async function getPrivateAttachmentUrl(
  key: string,
  conversationId: string,
): Promise<string> {
  const res = await callR2Function({
    action: 'download-url',
    key,
    conversationId,
  });

  const { signedUrl } = await res.json() as { signedUrl: string };
  return signedUrl;
}
