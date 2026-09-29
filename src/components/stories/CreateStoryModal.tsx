import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Loader2, Image as ImageIcon, Smile, Trash2 } from 'lucide-react';
import StoryCanvasEditor, {
  type StoryMediaItem,
} from './StoryCanvasEditor';
import StoryAudienceModal from './StoryAudienceModal';
import { captureVideoThumbnail } from '../../lib/videoThumbnail';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { AudienceSettings, Story } from '../../types';

interface PostItemPayload {
  file: File;
  mediaType: 'image' | 'video';
  caption?: string;
  isHD?: boolean;
  thumbnailFile?: File;
}

const CAPTION_EMOJIS = ['✨', '🔥', '👑', '🥂', '🍾', '🖤', '🤍', '💎', '💋', '🌹', '⚡', '🍸', '🌙', '🎉', '👏', '😍'];

/* Status Privacy Segmented Ring Icon */
function WhatsAppStatusIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
      <circle cx="12" cy="12" r="8" strokeDasharray="14 4" strokeLinecap="round" />
    </svg>
  );
}

/* Classic Solid Send Paper Airplane */
function WhatsAppSendIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPost?: (
    file: File,
    mediaType: 'image' | 'video',
    caption?: string,
    audienceSettings?: AudienceSettings
  ) => Promise<Story>;
  onPostBatch?: (
    items: PostItemPayload[],
    audienceSettings?: AudienceSettings
  ) => Promise<Story[]>;
}

export default function CreateStoryModal({
  isOpen,
  onClose,
  onPost,
  onPostBatch,
}: CreateStoryModalProps) {
  const [mediaQueue, setMediaQueue] = useState<StoryMediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCaptionEmojiPicker, setShowCaptionEmojiPicker] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isOverlayEditing, setIsOverlayEditing] = useState(false);

  // Audience Settings (Status Privacy)
  const [audienceModalOpen, setAudienceModalOpen] = useState(false);
  const [audienceSettings, setAudienceSettings] = useState<AudienceSettings>({
    type: 'all',
    userIds: [],
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appendInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-open file picker if modal is opened without items
  useEffect(() => {
    if (isOpen && mediaQueue.length === 0) {
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mediaQueue.length]);

  // Clean up Object URLs when closing
  const cleanupUrls = useCallback(() => {
    mediaQueue.forEach((item) => {
      URL.revokeObjectURL(item.previewUrl);
      if (item.thumbnailUrl) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });
    setMediaQueue([]);
    setActiveIndex(0);
    setError(null);
    setUploadProgress(null);
    setShowCaptionEmojiPicker(false);
  }, [mediaQueue]);

  const handleClose = () => {
    if (uploading) return;
    cleanupUrls();
    onClose();
  };

  // Android hardware back button handlers for CreateStoryModal layers
  useBackHandler(() => {
    setAudienceModalOpen(false);
    return true;
  }, audienceModalOpen && isOpen, 130);

  useBackHandler(() => {
    setShowCaptionEmojiPicker(false);
    return true;
  }, showCaptionEmojiPicker && isOpen, 125);

  useBackHandler(() => {
    setIsCropping(false);
    setIsOverlayEditing(false);
    return true;
  }, (isCropping || isOverlayEditing) && isOpen, 120);

  useBackHandler(() => {
    handleClose();
    return true;
  }, isOpen, 100);

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>, append = false) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    const validItems: StoryMediaItem[] = [];

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isImage && !isVideo) continue;
      if (file.size > 50 * 1024 * 1024) {
        setError('Files must be under 50MB.');
        continue;
      }

      let thumbnailFile: File | undefined;
      let thumbnailUrl: string | undefined;

      if (isVideo) {
        try {
          thumbnailFile = await captureVideoThumbnail(file);
          thumbnailUrl = URL.createObjectURL(thumbnailFile);
        } catch (thumbErr) {
          console.warn('Could not extract initial video thumbnail:', thumbErr);
        }
      }

      validItems.push({
        id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        mediaType: isVideo ? 'video' : 'image',
        caption: '',
        rotation: 0,
        overlays: [],
        isHD: true,
        thumbnailFile,
        thumbnailUrl,
      });
    }

    if (validItems.length === 0) {
      if (!append && mediaQueue.length === 0) {
        setError('Please select valid photos or videos.');
      }
      return;
    }

    if (append) {
      setMediaQueue((prev) => [...prev, ...validItems]);
      setActiveIndex(mediaQueue.length);
    } else {
      setMediaQueue(validItems);
      setActiveIndex(0);
    }

    e.target.value = '';
  };

  const removeMediaFromQueue = (index: number) => {
    const target = mediaQueue[index];
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
      if (target.thumbnailUrl) {
        URL.revokeObjectURL(target.thumbnailUrl);
      }
    }

    if (mediaQueue.length <= 1) {
      cleanupUrls();
      return;
    }

    const nextQueue = mediaQueue.filter((_, i) => i !== index);
    setMediaQueue(nextQueue);
    if (activeIndex >= nextQueue.length) {
      setActiveIndex(Math.max(0, nextQueue.length - 1));
    } else if (index < activeIndex) {
      setActiveIndex((prev) => prev - 1);
    }
  };

  const updateActiveItem = (updated: Partial<StoryMediaItem>) => {
    setMediaQueue((prev) =>
      prev.map((item, i) => (i === activeIndex ? { ...item, ...updated } : item))
    );
  };

  // Bake drawings, text, overlays, and rotation into a final high-resolution JPEG Blob
  const bakeImageToBlob = async (item: StoryMediaItem): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const isRotated90or270 = item.rotation % 180 !== 0;
        const origWidth = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
        const origHeight = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

        let targetWidth = origWidth;
        let targetHeight = origHeight;

        // All story photos are uploaded in crisp High Definition (max 2560px QuadHD / 2K)
        const maxDim = 2560;
        if (origWidth > maxDim || origHeight > maxDim) {
          if (origWidth >= origHeight) {
            targetWidth = maxDim;
            targetHeight = Math.round((origHeight / origWidth) * maxDim);
          } else {
            targetHeight = maxDim;
            targetWidth = Math.round((origWidth / origHeight) * maxDim);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context failed'));
          return;
        }

        // Apply scale factor if downscaled
        const scale = targetWidth / origWidth;
        ctx.scale(scale, scale);

        // Apply Rotation
        ctx.translate(origWidth / 2, origHeight / 2);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        ctx.resetTransform();

        // Draw Drawings if present
        if (item.drawingDataUrl) {
          const drawImg = new Image();
          drawImg.onload = () => {
            ctx.drawImage(drawImg, 0, 0, targetWidth, targetHeight);
            renderOverlaysAndExport();
          };
          drawImg.src = item.drawingDataUrl;
        } else {
          renderOverlaysAndExport();
        }

        const loadImg = (src: string): Promise<HTMLImageElement | null> => {
          return new Promise((res) => {
            const imgEl = new Image();
            imgEl.crossOrigin = 'anonymous';
            imgEl.onload = () => res(imgEl);
            imgEl.onerror = () => res(null);
            imgEl.src = src;
          });
        };

        async function renderOverlaysAndExport() {
          if (!ctx) return;

          // Render overlays (Shapes, Text, Emoji, Stickers)
          for (const overlay of item.overlays) {
            const posX = (overlay.x / 100) * targetWidth;
            const posY = (overlay.y / 100) * targetHeight;
            const overlayScale = overlay.scale ?? 1;
            const overlayRotation = overlay.rotation ?? 0;

            ctx.save();
            ctx.translate(posX, posY);
            if (overlayRotation) {
              ctx.rotate((overlayRotation * Math.PI) / 180);
            }
            ctx.scale(overlayScale, overlayScale);
            ctx.translate(-posX, -posY);

            // Shapes
            if (overlay.type === 'shape') {
              const shapeW = ((overlay.width || 28) / 100) * targetWidth;
              const shapeH = ((overlay.height || 18) / 100) * targetHeight;
              const startX = posX - shapeW / 2;
              const startY = posY - shapeH / 2;

              ctx.strokeStyle = overlay.color || '#c9a96e';
              ctx.lineWidth = Math.max(4, Math.round(targetWidth * 0.008));
              ctx.fillStyle = 'rgba(201, 169, 110, 0.2)';

              if (overlay.shapeType === 'circle') {
                ctx.beginPath();
                ctx.ellipse(posX, posY, shapeW / 2, shapeH / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              } else if (overlay.shapeType === 'arrow') {
                ctx.fillStyle = overlay.color || '#c9a96e';
                ctx.beginPath();
                const tipX = startX + shapeW;
                const midY = startY + shapeH / 2;
                const shaftThick = shapeH * 0.25;
                ctx.rect(startX, midY - shaftThick / 2, shapeW * 0.65, shaftThick);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(tipX, midY);
                ctx.lineTo(startX + shapeW * 0.55, startY);
                ctx.lineTo(startX + shapeW * 0.55, startY + shapeH);
                ctx.closePath();
                ctx.fill();
              } else if (overlay.shapeType === 'callout') {
                ctx.beginPath();
                ctx.roundRect(startX, startY, shapeW, shapeH * 0.82, 16);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(startX + shapeW * 0.2, startY + shapeH * 0.82);
                ctx.lineTo(startX + shapeW * 0.28, startY + shapeH);
                ctx.lineTo(startX + shapeW * 0.36, startY + shapeH * 0.82);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
              } else {
                ctx.beginPath();
                ctx.roundRect(startX, startY, shapeW, shapeH, 12);
                ctx.fill();
                ctx.stroke();
              }
            }

            // Text Overlay
            else if (overlay.type === 'text' && overlay.content) {
              let fontName = '"DM Sans", system-ui, sans-serif';
              if (overlay.fontFamily === 'serif') fontName = '"Cormorant Garamond", Georgia, serif';
              else if (overlay.fontFamily === 'mono') fontName = '"JetBrains Mono", monospace';
              else if (overlay.fontFamily === 'handwriting') fontName = '"Caveat", cursive, sans-serif';

              const fontSize = Math.max(24, Math.round(targetWidth * 0.045));
              ctx.font = `600 ${fontSize}px ${fontName}`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const metrics = ctx.measureText(overlay.content);
              const paddingX = fontSize * 0.6;
              const paddingY = fontSize * 0.35;
              const boxWidth = metrics.width + paddingX * 2;
              const boxHeight = fontSize * 1.4;

              const bgStyle = overlay.bgStyle || 'solid';
              const isLightColor =
                overlay.color === '#ffffff' ||
                overlay.color === '#c9a96e' ||
                overlay.color === '#e0c08a' ||
                overlay.color === '#eab308';

              if (bgStyle === 'solid') {
                ctx.fillStyle = overlay.color || '#c9a96e';
                ctx.beginPath();
                ctx.roundRect(
                  posX - boxWidth / 2,
                  posY - boxHeight / 2,
                  boxWidth,
                  boxHeight,
                  10
                );
                ctx.fill();
                ctx.fillStyle = isLightColor ? '#090909' : '#ffffff';
              } else if (bgStyle === 'semi') {
                ctx.fillStyle = 'rgba(9, 9, 9, 0.8)';
                ctx.beginPath();
                ctx.roundRect(
                  posX - boxWidth / 2,
                  posY - boxHeight / 2,
                  boxWidth,
                  boxHeight,
                  10
                );
                ctx.fill();
                ctx.fillStyle = overlay.color || '#c9a96e';
              } else {
                ctx.fillStyle = overlay.color || '#c9a96e';
              }

              ctx.fillText(overlay.content, posX, posY);
            }

            // Emoji Overlay
            else if (overlay.type === 'emoji') {
              if (overlay.appleEmojiUrl) {
                const emojiImg = await loadImg(overlay.appleEmojiUrl);
                if (emojiImg) {
                  const size = Math.max(54, Math.round(targetWidth * 0.09));
                  ctx.drawImage(emojiImg, posX - size / 2, posY - size / 2, size, size);
                }
              } else if (overlay.content) {
                const fontSize = Math.max(36, Math.round(targetWidth * 0.07));
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(overlay.content, posX, posY);
              }
            }

            // Sticker Overlay (Custom photo sticker, widgets: clock/location/music, or badges)
            else if (overlay.type === 'sticker') {
              if (overlay.customImageUrl) {
                const customImg = await loadImg(overlay.customImageUrl);
                if (customImg) {
                  const size = Math.max(110, Math.round(targetWidth * 0.18));
                  ctx.save();
                  ctx.beginPath();
                  ctx.roundRect(posX - size / 2, posY - size / 2, size, size, 20);
                  ctx.clip();
                  ctx.drawImage(customImg, posX - size / 2, posY - size / 2, size, size);
                  ctx.restore();
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = Math.max(3, Math.round(targetWidth * 0.005));
                  ctx.beginPath();
                  ctx.roundRect(posX - size / 2, posY - size / 2, size, size, 20);
                  ctx.stroke();
                }
              } else if (overlay.iconType === 'clock') {
                const fontSize = Math.max(26, Math.round(targetWidth * 0.045));
                ctx.font = `900 ${fontSize}px "JetBrains Mono", monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const text = overlay.content || '12:00';
                const metrics = ctx.measureText(text);
                const boxWidth = metrics.width + fontSize * 1.5;
                const boxHeight = fontSize * 1.8;

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.roundRect(posX - boxWidth / 2, posY - boxHeight / 2, boxWidth, boxHeight, 16);
                ctx.fill();

                ctx.fillStyle = '#090909';
                ctx.fillText(text, posX, posY);
              } else if (overlay.iconType === 'location' || overlay.iconType === 'music') {
                const fontSize = Math.max(20, Math.round(targetWidth * 0.035));
                ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const text = overlay.content || (overlay.iconType === 'location' ? 'Location' : 'Music');
                const metrics = ctx.measureText(text);
                const boxWidth = metrics.width + fontSize * 2;
                const boxHeight = fontSize * 1.8;

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.roundRect(posX - boxWidth / 2, posY - boxHeight / 2, boxWidth, boxHeight, boxHeight / 2);
                ctx.fill();

                ctx.fillStyle = '#090909';
                ctx.fillText(text, posX, posY);
              } else if (overlay.iconType === 'add_yours' || overlay.iconType === 'question') {
                const fontSize = Math.max(18, Math.round(targetWidth * 0.032));
                ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const text = overlay.content || (overlay.iconType === 'add_yours' ? 'Add yours' : 'Ask me a question');
                const metrics = ctx.measureText(text);
                const boxWidth = metrics.width + fontSize * 2.5;
                const boxHeight = fontSize * 2;

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.roundRect(posX - boxWidth / 2, posY - boxHeight / 2, boxWidth, boxHeight, 16);
                ctx.fill();

                ctx.fillStyle = '#090909';
                ctx.fillText(text, posX, posY);
              } else if (overlay.iconType === 'reaction' || overlay.iconType === 'bubble') {
                const fontSize = Math.max(18, Math.round(targetWidth * 0.032));
                ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const text = overlay.content || 'Love';
                const metrics = ctx.measureText(text);
                const boxWidth = metrics.width + fontSize * 2;
                const boxHeight = fontSize * 1.8;

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.roundRect(posX - boxWidth / 2, posY - boxHeight / 2, boxWidth, boxHeight, boxHeight / 2);
                ctx.fill();

                ctx.fillStyle = '#090909';
                ctx.fillText(text, posX, posY);
              } else if (overlay.iconType === 'analog_clock') {
                const clockRadius = Math.max(24, Math.round(targetWidth * 0.04));
                ctx.save();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.beginPath();
                ctx.arc(posX, posY, clockRadius + 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 2;
                ctx.stroke();

                const now = new Date();
                const hours = now.getHours() % 12;
                const minutes = now.getMinutes();
                const hourAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
                const minuteAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;

                ctx.strokeStyle = '#c9a96e';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(posX, posY);
                ctx.lineTo(posX + Math.cos(hourAngle) * (clockRadius * 0.5), posY + Math.sin(hourAngle) * (clockRadius * 0.5));
                ctx.stroke();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(posX, posY);
                ctx.lineTo(posX + Math.cos(minuteAngle) * (clockRadius * 0.75), posY + Math.sin(minuteAngle) * (clockRadius * 0.75));
                ctx.stroke();
                ctx.restore();
              } else if (overlay.content) {
                const fontSize = Math.max(20, Math.round(targetWidth * 0.035));
                ctx.font = `900 ${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const metrics = ctx.measureText(overlay.content);
                const paddingX = fontSize * 0.8;
                const paddingY = fontSize * 0.4;
                const boxWidth = metrics.width + paddingX * 2;
                const boxHeight = fontSize * 1.6;

                ctx.fillStyle = '#090909';
                ctx.strokeStyle = '#c9a96e';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(posX - boxWidth / 2, posY - boxHeight / 2, boxWidth, boxHeight, boxHeight / 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = overlay.color || '#c9a96e';
                ctx.fillText(overlay.content, posX, posY);
              }
            }

            ctx.restore();
          }

          // Export in modern WebP format (0.86 quality) for 60-75% payload reduction, fallback to JPEG
          canvas.toBlob(
            (webpBlob) => {
              if (webpBlob && webpBlob.type === 'image/webp') {
                resolve(webpBlob);
              } else {
                canvas.toBlob(
                  (jpegBlob) => {
                    if (jpegBlob) resolve(jpegBlob);
                    else reject(new Error('Export failed'));
                  },
                  'image/jpeg',
                  0.90
                );
              }
            },
            'image/webp',
            0.86
          );
        }
      };
      img.onerror = () => reject(new Error('Image failed to load for baking'));
      img.src = item.previewUrl;
    });
  };

  // Generate lightweight ~3-5KB WebP thumbnail for blur-up LQIP placeholder
  const generatePhotoThumbnail = async (sourceBlob: Blob): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(sourceBlob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxThumbDim = 240;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (width > maxThumbDim || height > maxThumbDim) {
          if (width >= height) {
            height = Math.round((height * maxThumbDim) / width);
            width = maxThumbDim;
          } else {
            width = Math.round((width * maxThumbDim) / height);
            height = maxThumbDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(new File([sourceBlob], 'thumb.webp', { type: sourceBlob.type }));
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], 'thumb.webp', { type: 'image/webp' }));
            } else {
              resolve(new File([sourceBlob], 'thumb.webp', { type: sourceBlob.type }));
            }
          },
          'image/webp',
          0.70
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(new File([sourceBlob], 'thumb.webp', { type: sourceBlob.type }));
      };
      img.src = url;
    });
  };

  // Download local copy
  const handleDownload = async () => {
    const current = mediaQueue[activeIndex];
    if (!current) return;

    try {
      if (current.mediaType === 'image') {
        const blob = await bakeImageToBlob(current);
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `story-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const a = document.createElement('a');
        a.href = current.previewUrl;
        a.download = current.file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Publish Batch to Feed
  const handlePublish = async () => {
    if (mediaQueue.length === 0 || uploading) return;

    setUploading(true);
    setError(null);

    try {
      const itemsToUpload: PostItemPayload[] = [];

      for (let i = 0; i < mediaQueue.length; i++) {
        setUploadProgress(`Preparing ${i + 1} of ${mediaQueue.length}...`);
        const item = mediaQueue[i];

        if (item.mediaType === 'image') {
          // Bake all images in crisp, lightweight WebP (60-75% payload savings)
          const blob = await bakeImageToBlob(item);
          const isWebp = blob.type === 'image/webp';
          const ext = isWebp ? 'webp' : 'jpg';
          const hdTag = item.isHD ? '_hd' : '';
          const bakedFile = new File([blob], `story_${Date.now()}_${i}${hdTag}.${ext}`, {
            type: blob.type,
          });

          // Generate lightweight ~3-5KB thumbnail for instant blur-up placeholder
          let photoThumbFile: File | undefined;
          try {
            photoThumbFile = await generatePhotoThumbnail(blob);
          } catch (tErr) {
            console.warn('Photo thumbnail generation failed:', tErr);
          }

          itemsToUpload.push({
            file: bakedFile,
            mediaType: 'image',
            caption: item.caption,
            isHD: item.isHD,
            thumbnailFile: photoThumbFile,
          });
        } else {
          // If video does not have a thumbnail yet, attempt to capture one now
          let thumbFile = item.thumbnailFile;
          if (!thumbFile) {
            try {
              thumbFile = await captureVideoThumbnail(item.file);
            } catch (err) {
              console.warn('Video thumbnail capture failed during publish:', err);
            }
          }

          itemsToUpload.push({
            file: item.file,
            mediaType: item.mediaType,
            caption: item.caption,
            isHD: true,
            thumbnailFile: thumbFile,
          });
        }
      }

      setUploadProgress(`Publishing ${itemsToUpload.length} ${itemsToUpload.length === 1 ? 'story' : 'stories'}...`);

      if (onPostBatch) {
        await onPostBatch(itemsToUpload, audienceSettings);
      } else if (onPost) {
        for (const item of itemsToUpload) {
          await onPost(item.file, item.mediaType, item.caption, audienceSettings);
        }
      }

      handleClose();
    } catch (err: unknown) {
      console.error('Story publish failed:', err);
      setError((err as Error).message || 'Failed to publish story');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  if (!isOpen) return null;

  const currentItem = mediaQueue[activeIndex];

  // Dynamic Status Privacy Label
  const statusPrivacyLabel =
    audienceSettings.type === 'all'
      ? 'Status (contacts)'
      : audienceSettings.type === 'exclude'
      ? `Status (${audienceSettings.userIds.length} excluded)`
      : `Status (${audienceSettings.userIds.length} included)`;

  return (
    <div className="fixed inset-0 z-[100] h-[100dvh] bg-ink text-paper flex flex-col overflow-hidden animate-fade-in font-sans">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={(e) => handleFileSelection(e, false)}
        className="hidden"
      />
      <input
        ref={appendInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={(e) => handleFileSelection(e, true)}
        className="hidden"
      />

      {/* Top Header: Close Button when no media is selected */}
      {mediaQueue.length === 0 && (
        <div
          className="absolute top-0 left-0 z-40 p-4 sm:p-5"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top, 1.25rem))' }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="text-muted hover:text-paper transition-colors p-1"
            title="Exit"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Main Studio Area */}
      {mediaQueue.length > 0 && currentItem ? (
        <div className="flex-1 w-full min-h-0 relative flex flex-col overflow-hidden bg-ink">
          {/* Top Bar + Media Canvas */}
          <div className="flex-1 w-full min-h-0 relative flex flex-col overflow-hidden">
            <StoryCanvasEditor
              item={currentItem}
              onChange={updateActiveItem}
              onDownload={handleDownload}
              onClose={handleClose}
              onCropModeChange={setIsCropping}
              onOverlayEditingChange={setIsOverlayEditing}
            />
          </div>

          {/* Bottom Controls Area (Floating Carousel + Caption + 2-Item Bottom Bar) */}
          {!isCropping && !isOverlayEditing && (
            <div className="absolute bottom-0 inset-x-0 z-30 flex flex-col animate-fade-in bg-gradient-to-t from-ink via-ink/85 to-transparent pt-8 pointer-events-none">
              {/* 1. Floating Multi-Media Carousel (Above Caption Bar) */}
              {mediaQueue.length > 1 && (
                <div className="w-full flex items-center justify-center px-4 pb-2.5 pointer-events-auto">
                  <div className="flex items-center gap-2.5 overflow-x-auto max-w-[92vw] py-1 scrollbar-none">
                    {/* Thumbnails in Queue */}
                    {mediaQueue.map((queueItem, index) => (
                      <div
                        key={queueItem.id}
                        onClick={() => {
                          setActiveIndex(index);
                          setIsCropping(false);
                        }}
                        className={`group relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 cursor-pointer transition-all ${
                          index === activeIndex
                            ? 'border-2 border-white shadow-lg scale-105'
                            : 'opacity-60 hover:opacity-100 border border-white/20'
                        }`}
                      >
                        {queueItem.mediaType === 'image' || queueItem.thumbnailUrl ? (
                          <img
                            src={queueItem.thumbnailUrl || queueItem.previewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={queueItem.previewUrl}
                            className="w-full h-full object-cover"
                          />
                        )}

                        {/* Video indicator badge */}
                        {queueItem.mediaType === 'video' && (
                          <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white pointer-events-none z-[4] shadow-sm">
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </span>
                        )}

                        {/* Trash Delete Box: only appears on the active image (hover on desktop, visible on mobile) */}
                        {index === activeIndex && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMediaFromQueue(index);
                            }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-[1px] text-white hover:text-red-400 hover:bg-black/75 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
                            title="Delete active item"
                            aria-label="Delete active item"
                          >
                            <Trash2 size={19} strokeWidth={2.2} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Floating Pill Caption Input (Matching Reference Screenshot) */}
              <div className="w-full flex justify-center px-4 pb-2.5 pointer-events-auto">
                <div className="relative flex items-center bg-[#18181b]/95 backdrop-blur-md border border-white/10 rounded-full px-3 sm:px-4 py-2 sm:py-2.5 w-full max-w-md sm:max-w-xl shadow-2xl transition-all focus-within:border-gold/60 focus-within:ring-1 focus-within:ring-gold/50">
                  {/* Left: Square [+] Icon to append media directly from caption bar */}
                  <button
                    type="button"
                    onClick={() => appendInputRef.current?.click()}
                    disabled={uploading}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-paper/80 hover:text-gold transition-colors shrink-0 mr-1"
                    title="Add more photos or videos"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="4" />
                      <path d="M8 12h8" />
                      <path d="M12 8v8" />
                    </svg>
                  </button>

                  <input
                    type="text"
                    value={currentItem.caption}
                    onChange={(e) => updateActiveItem({ caption: e.target.value })}
                    placeholder="Add a caption..."
                    maxLength={180}
                    disabled={uploading}
                    className="w-full bg-transparent text-[15px] text-paper placeholder-muted/80 focus:outline-none pr-3"
                  />

                  {/* Right: Emoji Popover Trigger */}
                  <button
                    type="button"
                    onClick={() => setShowCaptionEmojiPicker(!showCaptionEmojiPicker)}
                    className="text-paper/80 hover:text-gold transition-colors shrink-0 p-1"
                    title="Insert emoji"
                  >
                    <Smile size={22} />
                  </button>

                  {/* Quick Emoji Popover */}
                  {showCaptionEmojiPicker && (
                    <div className="absolute bottom-14 right-2 z-40 flex items-center gap-1.5 p-2 bg-[#18181b] rounded-xl border border-border-subtle shadow-2xl max-w-[85vw] overflow-x-auto animate-fade-in">
                      {CAPTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            updateActiveItem({ caption: (currentItem.caption || '') + emoji });
                            setShowCaptionEmojiPicker(false);
                          }}
                          className="text-xl hover:scale-125 transition-transform p-1"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Clean 2-Item Bottom Bar (Privacy Pill on Left, Gold Send Button on Right) */}
              <div
                className="w-full shrink-0 px-4 sm:px-6 py-2 sm:py-3 flex items-center justify-between z-30 pointer-events-auto"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
              >
                {/* Left: Status Privacy Pill */}
                <button
                  type="button"
                  onClick={() => setAudienceModalOpen(true)}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-gold/60 hover:border-gold text-gold hover:bg-gold/10 transition-colors shrink-0 bg-[#18181b]/80 shadow-md"
                  title="Story Privacy Settings"
                >
                  <WhatsAppStatusIcon className="w-4 h-4 shrink-0 text-gold" />
                  <span className="font-medium text-xs sm:text-sm tracking-tight truncate max-w-[180px] sm:max-w-none">
                    {statusPrivacyLabel}
                  </span>
                </button>

                {/* Right: Circular Gold Send CTA Button */}
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={uploading || mediaQueue.length === 0}
                  className="w-12 h-12 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 shrink-0"
                  title="Send Story"
                >
                  {uploading ? (
                    <Loader2 size={22} className="animate-spin text-ink" />
                  ) : (
                    <WhatsAppSendIcon size={20} className="translate-x-[1.5px] -translate-y-[0.5px]" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty State with App Colors */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold mb-4 shadow-xl">
            <ImageIcon size={36} />
          </div>
          <h3 className="font-serif text-2xl text-paper font-medium mb-2">
            Create a New Story
          </h3>
          <p className="text-sm text-muted max-w-sm mb-6 leading-relaxed">
            Select one or more photos or videos to edit and share with your status audience.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 rounded-full bg-gold hover:bg-gold-light text-ink text-xs font-semibold uppercase tracking-wider transition-all shadow-md active:scale-95"
          >
            Select Photos or Videos
          </button>
        </div>
      )}

      {/* Error & Upload Banners */}
      {error && (
        <div className="absolute top-16 inset-x-4 z-40 max-w-md mx-auto px-4 py-2.5 rounded-xl bg-red-500/90 text-white text-xs text-center shadow-2xl backdrop-blur-md">
          {error}
        </div>
      )}
      {uploadProgress && (
        <div className="absolute top-16 inset-x-4 z-40 max-w-xs mx-auto px-4 py-2 rounded-full bg-ink-light/95 text-gold text-xs text-center shadow-2xl backdrop-blur-md border border-gold/40 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          <span>{uploadProgress}</span>
        </div>
      )}

      {/* Status Privacy Settings Modal */}
      {audienceModalOpen && (
        <StoryAudienceModal
          isOpen={audienceModalOpen}
          onClose={() => setAudienceModalOpen(false)}
          currentSettings={audienceSettings}
          onSave={(newSettings) => setAudienceSettings(newSettings)}
        />
      )}
    </div>
  );
}
