/**
 * videoThumbnail.ts — Client-side video frame capture utility
 *
 * Extracts a high-quality frame from a video file to use as a poster / thumbnail.
 */

export interface VideoThumbnailOptions {
  seekSeconds?: number;
  maxDim?: number;
  quality?: number;
}

/**
 * Capture a representative video frame as a JPEG File.
 *
 * @param file The video File to capture from
 * @param options Configuration for frame capture time, size, and quality
 * @returns A Promise resolving to a JPEG File suitable for upload
 */
export function captureVideoThumbnail(
  file: File,
  options: VideoThumbnailOptions = {}
): Promise<File> {
  const {
    seekSeconds = 0.5,
    maxDim = 1280,
    quality = 0.90,
  } = options;

  return new Promise((resolve, reject) => {
    // Check for video type
    if (!file.type.startsWith('video/')) {
      return reject(new Error('File is not a video'));
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const objectUrl = URL.createObjectURL(file);

    let hasCleanedUp = false;
    const cleanup = () => {
      if (hasCleanedUp) return;
      hasCleanedUp = true;
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
      video.remove();
    };

    // Timeout safety fallback (e.g. unsupported codec)
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Video thumbnail capture timed out'));
    }, 10000);

    video.onloadedmetadata = () => {
      // Seek to either seekSeconds or 25% of duration (whichever is reasonable)
      let targetTime = seekSeconds;
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        targetTime = Math.min(seekSeconds, Math.max(0, video.duration * 0.2));
      }
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      window.clearTimeout(timeoutId);

      try {
        const rawWidth = video.videoWidth || 1080;
        const rawHeight = video.videoHeight || 1920;

        let targetWidth = rawWidth;
        let targetHeight = rawHeight;

        if (rawWidth > maxDim || rawHeight > maxDim) {
          if (rawWidth >= rawHeight) {
            targetWidth = maxDim;
            targetHeight = Math.round((rawHeight / rawWidth) * maxDim);
          } else {
            targetHeight = maxDim;
            targetWidth = Math.round((rawWidth / rawHeight) * maxDim);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          cleanup();
          return reject(new Error('Canvas 2D context unavailable'));
        }

        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        cleanup();

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Failed to encode video thumbnail blob'));
            }

            const cleanName = file.name.replace(/\.[^.]+$/, '');
            const thumbFile = new File([blob], `${cleanName}_thumb.jpg`, {
              type: 'image/jpeg',
            });
            resolve(thumbFile);
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Failed to load video element'));
    };

    video.src = objectUrl;
  });
}
