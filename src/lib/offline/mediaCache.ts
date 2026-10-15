const MEDIA_CACHE_NAME = 'velour-media-v1';

/**
 * Checks whether the browser supports the Cache API.
 */
function isCacheSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

/**
 * Caches a remote media resource (image, audio, avatar) in persistent CacheStorage.
 */
export async function cacheMediaUrl(url: string): Promise<void> {
  if (!url || !isCacheSupported()) return;
  if (!url.startsWith('http')) return;

  try {
    const cache = await caches.open(MEDIA_CACHE_NAME);
    const match = await cache.match(url);
    if (match) return; // Already cached

    const response = await fetch(url, { mode: 'cors' });
    if (response && response.ok) {
      await cache.put(url, response.clone());
    }
  } catch (_) {
    // Silent fallback for cross-origin or network constraints
  }
}

/**
 * Retrieves a cached media item as a Blob Object URL, enabling offline display.
 */
export async function getCachedMediaUrl(url: string): Promise<string | null> {
  if (!url || !isCacheSupported()) return null;

  try {
    const cache = await caches.open(MEDIA_CACHE_NAME);
    const match = await cache.match(url);
    if (match) {
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    }
  } catch (_) {}

  return null;
}
