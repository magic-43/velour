import { useState, useRef, useEffect, useCallback } from 'react';
import {
  RotateCw,
  Pencil,
  Smile,
  Download,
  Square,
  Sticker as StickerIcon,
  Trash2,
  X,
  Volume2,
  VolumeX,
  Check,
  ChevronUp,
  Undo2,
  Clock,
  MapPin,
  Music,
  Camera,
  HelpCircle,
  Minus,
  Plus,
  Maximize2,
  Lock,
} from 'lucide-react';
import StickerModal, { MiniAnalogClock } from './StickerModal';

export type TextBackgroundStyle = 'solid' | 'semi' | 'none';
export type TextFontFamily = 'sans' | 'serif' | 'mono' | 'handwriting';
export type ShapeType = 'rect' | 'circle' | 'arrow' | 'callout';

export interface CanvasOverlayItem {
  id: string;
  type: 'text' | 'emoji' | 'shape' | 'sticker';
  content?: string;
  color?: string;
  bgStyle?: TextBackgroundStyle;
  fontFamily?: TextFontFamily;
  shapeType?: ShapeType;
  width?: number; // percentage
  height?: number; // percentage
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  appleEmojiUrl?: string;
  customImageUrl?: string;
  iconType?: 'clock' | 'analog_clock' | 'location' | 'music' | 'question' | 'reaction' | 'add_yours' | 'badge' | 'doodle' | 'bubble';
  scale?: number; // scale multiplier e.g. 1.0 (0.4 to 3.5)
  rotation?: number; // rotation in degrees (0 to 360)
}

export interface StoryMediaItem {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  rotation: number; // 0, 90, 180, 270
  overlays: CanvasOverlayItem[];
  drawingDataUrl?: string;
  isHD?: boolean;
  thumbnailFile?: File;
  thumbnailUrl?: string;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

interface StoryCanvasEditorProps {
  item: StoryMediaItem;
  onChange: (updated: Partial<StoryMediaItem>) => void;
  onDownload: () => void;
  onClose: () => void;
  onCropModeChange?: (isCrop: boolean) => void;
  onOverlayEditingChange?: (isEditing: boolean) => void;
  isLockable?: boolean;
  isLocked?: boolean;
  lockPrice?: number;
  onToggleLock?: () => void;
}

const COLOR_PALETTE = [
  '#c9a96e', // Velour Gold
  '#e0c08a', // Gold Light
  '#ffffff', // White
  '#ef4444', // Red
  '#eab308', // Yellow
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#090909', // Velour Ink
];

const TEXT_COLOR_PALETTE = [
  '#c9a96e', // Velour Gold
  '#ffffff', // White
  '#888888', // Muted
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#f97316', // Orange
  '#ef4444', // Red
  '#090909', // Velour Ink
];

const FONT_NAMES: Record<TextFontFamily, string> = {
  sans: 'Sans Serif',
  serif: 'Serif',
  mono: 'Monospace',
  handwriting: 'Script',
};

const FONT_CSS: Record<TextFontFamily, string> = {
  sans: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
  serif: '"Cormorant Garamond", ui-serif, Georgia, serif',
  mono: '"JetBrains Mono", Menlo, Consolas, monospace',
  handwriting: '"Caveat", "Brush Script MT", cursive, sans-serif',
};

const EMOJI_PRESETS = [
  '✨', '🔥', '👑', '🥂', '🍾', '🖤', '🤍', '💎', '💋', '🌹', '⚡', '🍸', '🌙', '🎉', '👏', '😍'
];

const STICKER_PRESETS = [
  { label: 'VELOUR', color: '#c9a96e', bg: '#090909' },
  { label: 'VIP', color: '#c9a96e', bg: '#1c1810' },
  { label: 'EXCLUSIVE', color: '#e0c08a', bg: '#231d13' },
  { label: 'NEW', color: '#ffffff', bg: '#c9a96e' },
  { label: 'VERIFIED ✓', color: '#c9a96e', bg: '#0d0c0a' },
  { label: '100', color: '#ef4444', bg: '#2b0a0a' },
  { label: '🔥 HOT', color: '#f97316', bg: '#2e1205' },
  { label: 'LIVE', color: '#ffffff', bg: '#dc2626' },
];

const ASPECT_PRESETS: Array<{ label: string; ratio: 'original' | '1:1' | '9:16' | '4:5' | '16:9' }> = [
  { label: 'Original', ratio: 'original' },
  { label: '1:1 Square', ratio: '1:1' },
  { label: '4:5 Portrait', ratio: '4:5' },
  { label: '9:16 Story', ratio: '9:16' },
  { label: '16:9 Wide', ratio: '16:9' },
];

/* WhatsApp-style Custom Crop & Rotate Icon (Top Toolbar) */
function CropRotateIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
      <path d="M21 3l-3-3m0 0l-3 3m3-3v5" strokeWidth="1.8" />
    </svg>
  );
}

/* WhatsApp-style Rotate Sub-control Icon (Corner with curved arrow) */
function CropRotateSubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.6L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

/* WhatsApp-style Aspect Ratio Preset Icon */
function CropAspectIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M7 19h12a2 2 0 0 0 2-2V7" />
    </svg>
  );
}

export default function StoryCanvasEditor({
  item,
  onChange,
  onDownload,
  onClose,
  onCropModeChange,
  onOverlayEditingChange,
  isLockable,
  isLocked,
  lockPrice,
  onToggleLock,
}: StoryCanvasEditorProps) {
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Tool Modes
  const [activeTool, setActiveTool] = useState<
    'none' | 'crop' | 'pen' | 'text' | 'shape' | 'emoji' | 'sticker'
  >('none');

  // Interactive WhatsApp-style Crop State
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 100, height: 100 });
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const activeCropDrag = useRef<CropHandle | null>(null);
  const cropDragStart = useRef<{ mouseX: number; mouseY: number; initialCrop: CropRect } | null>(null);

  // Undo stack for image edits (rotation, crop)
  const [imageHistory, setImageHistory] = useState<Array<{ file: File; previewUrl: string }>>([]);

  // Active text overlay editing
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [showFontMenu, setShowFontMenu] = useState(false);

  // Sticker modal state
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);

  // Drawing state (Velour Gold)
  const [penColor, setPenColor] = useState('#c9a96e');
  const [penWidth, setPenWidth] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingHistory, setDrawingHistory] = useState<string[]>([]);

  // Video playback
  const [isMuted, setIsMuted] = useState(false);

  // Active dragging item for text/overlays
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number } | null>(null);

  // Selected overlay item (for deletion, moving, and tap highlight)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  // Notify parent component about crop mode
  useEffect(() => {
    onCropModeChange?.(activeTool === 'crop');
  }, [activeTool, onCropModeChange]);

  // Notify parent component about overlay editing, sticker modal, pen/drawing, or text tool
  useEffect(() => {
    onOverlayEditingChange?.(
      Boolean(
        editingOverlayId ||
        isStickerModalOpen ||
        activeTool === 'pen' ||
        activeTool === 'text'
      )
    );
  }, [editingOverlayId, isStickerModalOpen, activeTool, onOverlayEditingChange]);

  // Synchronize drawing canvas resolution with container
  const syncCanvasResolution = useCallback(() => {
    const canvas = canvasRef.current;
    const mediaContainer = mediaContainerRef.current;
    if (!canvas || !mediaContainer) return;

    const rect = mediaContainer.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;

      if (item.drawingDataUrl) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = item.drawingDataUrl;
        }
      }
    }
  }, [item.drawingDataUrl]);

  useEffect(() => {
    syncCanvasResolution();
  }, [item.id, item.rotation, item.previewUrl, syncCanvasResolution]);

  // 90° Canvas Rotation inside Crop Mode
  const handleRotate90 = () => {
    if (item.mediaType !== 'image') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setImageHistory((prev) => [...prev, { file: item.file, previewUrl: item.previewUrl }]);
          const rotatedFile = new File([blob], item.file.name, { type: 'image/jpeg' });
          const newUrl = URL.createObjectURL(rotatedFile);
          onChange({
            file: rotatedFile,
            previewUrl: newUrl,
            rotation: 0,
          });
          setCropRect({ x: 0, y: 0, width: 100, height: 100 });
        },
        'image/jpeg',
        0.96
      );
    };
    img.src = item.previewUrl;
  };

  // Crop Interaction Handlers
  const handleCropDragStart = (e: React.MouseEvent | React.TouchEvent, handle: CropHandle) => {
    e.stopPropagation();
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    activeCropDrag.current = handle;
    cropDragStart.current = {
      mouseX: clientX,
      mouseY: clientY,
      initialCrop: { ...cropRect },
    };
  };

  const handleCropMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!activeCropDrag.current || !cropDragStart.current || !mediaContainerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const rect = mediaContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = ((clientX - cropDragStart.current.mouseX) / rect.width) * 100;
    const deltaY = ((clientY - cropDragStart.current.mouseY) / rect.height) * 100;
    const init = cropDragStart.current.initialCrop;
    const handle = activeCropDrag.current;

    const MIN_DIM = 8; // min 8%

    if (handle === 'move') {
      const nextX = Math.max(0, Math.min(100 - init.width, init.x + deltaX));
      const nextY = Math.max(0, Math.min(100 - init.height, init.y + deltaY));
      setCropRect({ ...init, x: nextX, y: nextY });
    } else if (handle === 'se') {
      const nextW = Math.max(MIN_DIM, Math.min(100 - init.x, init.width + deltaX));
      const nextH = Math.max(MIN_DIM, Math.min(100 - init.y, init.height + deltaY));
      setCropRect({ ...init, width: nextW, height: nextH });
    } else if (handle === 'e') {
      const nextW = Math.max(MIN_DIM, Math.min(100 - init.x, init.width + deltaX));
      setCropRect({ ...init, width: nextW });
    } else if (handle === 's') {
      const nextH = Math.max(MIN_DIM, Math.min(100 - init.y, init.height + deltaY));
      setCropRect({ ...init, height: nextH });
    } else if (handle === 'nw') {
      const targetX = Math.max(0, Math.min(init.x + init.width - MIN_DIM, init.x + deltaX));
      const targetY = Math.max(0, Math.min(init.y + init.height - MIN_DIM, init.y + deltaY));
      const nextW = init.width - (targetX - init.x);
      const nextH = init.height - (targetY - init.y);
      setCropRect({ x: targetX, y: targetY, width: nextW, height: nextH });
    } else if (handle === 'ne') {
      const targetY = Math.max(0, Math.min(init.y + init.height - MIN_DIM, init.y + deltaY));
      const nextW = Math.max(MIN_DIM, Math.min(100 - init.x, init.width + deltaX));
      const nextH = init.height - (targetY - init.y);
      setCropRect({ ...init, y: targetY, width: nextW, height: nextH });
    } else if (handle === 'sw') {
      const targetX = Math.max(0, Math.min(init.x + init.width - MIN_DIM, init.x + deltaX));
      const nextW = init.width - (targetX - init.x);
      const nextH = Math.max(MIN_DIM, Math.min(100 - init.y, init.height + deltaY));
      setCropRect({ ...init, x: targetX, width: nextW, height: nextH });
    } else if (handle === 'n') {
      const targetY = Math.max(0, Math.min(init.y + init.height - MIN_DIM, init.y + deltaY));
      const nextH = init.height - (targetY - init.y);
      setCropRect({ ...init, y: targetY, height: nextH });
    } else if (handle === 'w') {
      const targetX = Math.max(0, Math.min(init.x + init.width - MIN_DIM, init.x + deltaX));
      const nextW = init.width - (targetX - init.x);
      setCropRect({ ...init, x: targetX, width: nextW });
    }
  }, []);

  const handleCropMouseUp = useCallback(() => {
    activeCropDrag.current = null;
    cropDragStart.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleCropMouseMove);
    window.addEventListener('mouseup', handleCropMouseUp);
    window.addEventListener('touchmove', handleCropMouseMove);
    window.addEventListener('touchend', handleCropMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleCropMouseMove);
      window.removeEventListener('mouseup', handleCropMouseUp);
      window.removeEventListener('touchmove', handleCropMouseMove);
      window.removeEventListener('touchend', handleCropMouseUp);
    };
  }, [handleCropMouseMove, handleCropMouseUp]);

  // Apply and commit crop rect
  const applyCropRect = (rect: CropRect) => {
    if (item.mediaType !== 'image') {
      setActiveTool('none');
      return;
    }

    if (rect.width >= 99.5 && rect.height >= 99.5 && rect.x <= 0.5 && rect.y <= 0.5) {
      setActiveTool('none');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const sx = Math.max(0, Math.round((rect.x / 100) * img.naturalWidth));
      const sy = Math.max(0, Math.round((rect.y / 100) * img.naturalHeight));
      const sw = Math.min(img.naturalWidth - sx, Math.round((rect.width / 100) * img.naturalWidth));
      const sh = Math.min(img.naturalHeight - sy, Math.round((rect.height / 100) * img.naturalHeight));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, sw);
      canvas.height = Math.max(1, sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setImageHistory((prev) => [...prev, { file: item.file, previewUrl: item.previewUrl }]);
          const croppedFile = new File([blob], item.file.name, { type: 'image/jpeg' });
          const newUrl = URL.createObjectURL(croppedFile);
          onChange({
            file: croppedFile,
            previewUrl: newUrl,
            rotation: 0,
          });
          setCropRect({ x: 0, y: 0, width: 100, height: 100 });
          setActiveTool('none');
        },
        'image/jpeg',
        0.96
      );
    };
    img.src = item.previewUrl;
  };

  // Set Crop Aspect Ratio Preset
  const setCropAspect = (ratio: 'original' | '1:1' | '9:16' | '4:5' | '16:9') => {
    if (ratio === 'original') {
      setCropRect({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      const imgAspect = img.naturalWidth / img.naturalHeight;
      let targetAspect = 1;
      if (ratio === '1:1') targetAspect = 1;
      else if (ratio === '4:5') targetAspect = 4 / 5;
      else if (ratio === '9:16') targetAspect = 9 / 16;
      else if (ratio === '16:9') targetAspect = 16 / 9;

      const ratioMultiplier = targetAspect / imgAspect;
      let newWidth = 100;
      let newHeight = 100;

      if (ratioMultiplier <= 1) {
        newHeight = 100;
        newWidth = Math.max(10, Math.min(100, 100 * ratioMultiplier));
      } else {
        newWidth = 100;
        newHeight = Math.max(10, Math.min(100, 100 / ratioMultiplier));
      }

      const newX = (100 - newWidth) / 2;
      const newY = (100 - newHeight) / 2;
      setCropRect({ x: newX, y: newY, width: newWidth, height: newHeight });
    };
    img.src = item.previewUrl;
  };

  // Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'pen') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setDrawingHistory((prev) => [...prev, canvas.toDataURL()]);

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTool !== 'pen') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange({ drawingDataUrl: canvas.toDataURL() });
    }
  };

  const handleUndoDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (drawingHistory.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onChange({ drawingDataUrl: undefined });
      return;
    }

    const prevHistory = [...drawingHistory];
    const lastState = prevHistory.pop();
    setDrawingHistory(prevHistory);

    if (lastState) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        onChange({ drawingDataUrl: canvas.toDataURL() });
      };
      img.src = lastState;
    }
  };

  const handleClearDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setDrawingHistory([]);
    onChange({ drawingDataUrl: undefined });
  };

  // Unified Undo for strokes, rotation, crop, and overlays
  const handleUndo = () => {
    if (activeTool === 'pen' && drawingHistory.length > 0) {
      handleUndoDrawing();
      return;
    }
    if (imageHistory.length > 0) {
      const prev = imageHistory[imageHistory.length - 1];
      setImageHistory((h) => h.slice(0, -1));
      onChange({
        file: prev.file,
        previewUrl: prev.previewUrl,
        rotation: 0,
      });
      setCropRect({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }
    if (item.overlays.length > 0) {
      onChange({
        overlays: item.overlays.slice(0, -1),
      });
    }
  };

  // Tool Switching with auto-apply for active crop
  const selectTool = (tool: 'none' | 'crop' | 'pen' | 'text' | 'shape' | 'emoji' | 'sticker') => {
    if (activeTool === 'crop' && tool !== 'crop') {
      applyCropRect(cropRect);
    }
    setActiveTool(tool);
  };

  // In-Place Text Tool
  const handleOpenTextTool = () => {
    if (editingOverlayId) {
      return;
    }

    const existingText = item.overlays.find((o) => o.type === 'text');
    if (existingText) {
      setEditingOverlayId(existingText.id);
      setActiveTool('text');
      return;
    }

    const newId = `text-${Date.now()}`;
    const newOverlay: CanvasOverlayItem = {
      id: newId,
      type: 'text',
      content: '',
      color: '#ffffff',
      bgStyle: 'solid',
      fontFamily: 'sans',
      x: 50,
      y: 48,
    };

    onChange({ overlays: [...item.overlays, newOverlay] });
    setEditingOverlayId(newId);
    setActiveTool('text');

    setTimeout(() => {
      textInputRef.current?.focus();
    }, 50);
  };

  const updateOverlay = (id: string, updated: Partial<CanvasOverlayItem>) => {
    onChange({
      overlays: item.overlays.map((o) => (o.id === id ? { ...o, ...updated } : o)),
    });
  };

  const handleDeleteOverlay = (id: string) => {
    onChange({ overlays: item.overlays.filter((o) => o.id !== id) });
    if (editingOverlayId === id) {
      setEditingOverlayId(null);
      setActiveTool('none');
      setShowFontMenu(false);
    }
    if (selectedOverlayId === id) {
      setSelectedOverlayId(null);
    }
  };

  // Keyboard Delete listener for selected stickers/overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedOverlayId) {
        const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (targetTag !== 'input' && targetTag !== 'textarea') {
          e.preventDefault();
          handleDeleteOverlay(selectedOverlayId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOverlayId, item.overlays]);

  const handleToggleBgStyle = () => {
    if (!editingOverlayId) return;
    const current = item.overlays.find((o) => o.id === editingOverlayId);
    if (!current) return;

    const nextStyle: TextBackgroundStyle =
      current.bgStyle === 'solid' ? 'semi' : current.bgStyle === 'semi' ? 'none' : 'solid';
    updateOverlay(editingOverlayId, { bgStyle: nextStyle });
  };

  // Add Emoji
  const addEmojiOverlay = (emoji: string) => {
    const newOverlay: CanvasOverlayItem = {
      id: `emoji-${Date.now()}`,
      type: 'emoji',
      content: emoji,
      x: 50,
      y: 50,
    };

    onChange({ overlays: [...item.overlays, newOverlay] });
    setActiveTool('none');
  };

  // Add Sticker
  const addStickerOverlay = (sticker: { label: string; color: string; bg: string }) => {
    const newOverlay: CanvasOverlayItem = {
      id: `sticker-${Date.now()}`,
      type: 'sticker',
      content: sticker.label,
      color: sticker.color,
      bgStyle: 'solid',
      x: 50,
      y: 50,
    };

    onChange({ overlays: [...item.overlays, newOverlay] });
    setActiveTool('none');
  };

  // Add Shape (Rect, Circle, Arrow, Callout)
  const addShapeOverlay = (shapeType: ShapeType) => {
    const newOverlay: CanvasOverlayItem = {
      id: `shape-${Date.now()}`,
      type: 'shape',
      shapeType,
      color: '#c9a96e',
      width: 28,
      height: 18,
      x: 50,
      y: 50,
    };

    onChange({ overlays: [...item.overlays, newOverlay] });
    setActiveTool('none');
  };

  // Dragging Overlays
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, overlay: CanvasOverlayItem) => {
    if (editingOverlayId === overlay.id) return;
    e.stopPropagation();
    setSelectedOverlayId(overlay.id);
    setDraggingOverlayId(overlay.id);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragStartPos.current = {
      mouseX: clientX,
      mouseY: clientY,
      initialX: overlay.x,
      initialY: overlay.y,
    };
  };

  const handleContainerMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!draggingOverlayId || !dragStartPos.current || !mediaContainerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const rect = mediaContainerRef.current.getBoundingClientRect();
    const deltaXPercent = ((clientX - dragStartPos.current.mouseX) / rect.width) * 100;
    const deltaYPercent = ((clientY - dragStartPos.current.mouseY) / rect.height) * 100;

    const newX = Math.max(5, Math.min(95, dragStartPos.current.initialX + deltaXPercent));
    const newY = Math.max(5, Math.min(95, dragStartPos.current.initialY + deltaYPercent));

    onChange({
      overlays: item.overlays.map((o) =>
        o.id === draggingOverlayId ? { ...o, x: newX, y: newY } : o
      ),
    });
  }, [draggingOverlayId, item.overlays, onChange]);

  const handleContainerMouseUp = useCallback(() => {
    if (draggingOverlayId) {
      const draggedItem = item.overlays.find((o) => o.id === draggingOverlayId);
      if (draggedItem && draggedItem.y > 85) {
        handleDeleteOverlay(draggingOverlayId);
      }
    }
    setDraggingOverlayId(null);
    dragStartPos.current = null;
  }, [draggingOverlayId, item.overlays]);

  useEffect(() => {
    if (draggingOverlayId) {
      window.addEventListener('mousemove', handleContainerMouseMove);
      window.addEventListener('mouseup', handleContainerMouseUp);
      window.addEventListener('touchmove', handleContainerMouseMove);
      window.addEventListener('touchend', handleContainerMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleContainerMouseMove);
        window.removeEventListener('mouseup', handleContainerMouseUp);
        window.removeEventListener('touchmove', handleContainerMouseMove);
        window.removeEventListener('touchend', handleContainerMouseUp);
      };
    }
  }, [draggingOverlayId, handleContainerMouseMove, handleContainerMouseUp]);

  // Active scaling overlay item
  const [scalingOverlayId, setScalingOverlayId] = useState<string | null>(null);
  const scaleStartPos = useRef<{ mouseX: number; mouseY: number; initialScale: number } | null>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pinchInitialScale = useRef<number>(1);

  const handleAdjustScale = (id: string, delta: number) => {
    const current = item.overlays.find((o) => o.id === id);
    if (!current) return;
    const nextScale = Math.max(0.4, Math.min(3.5, Number(((current.scale ?? 1) + delta).toFixed(2))));
    updateOverlay(id, { scale: nextScale });
  };

  const handleScaleDragStart = (e: React.MouseEvent | React.TouchEvent, overlay: CanvasOverlayItem) => {
    e.stopPropagation();
    setScalingOverlayId(overlay.id);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    scaleStartPos.current = {
      mouseX: clientX,
      mouseY: clientY,
      initialScale: overlay.scale ?? 1,
    };
  };

  const handleContainerScaleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!scalingOverlayId || !scaleStartPos.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const deltaX = clientX - scaleStartPos.current.mouseX;
    const deltaY = clientY - scaleStartPos.current.mouseY;
    const delta = (deltaX + deltaY) * 0.007;
    const newScale = Math.max(0.4, Math.min(3.5, Number((scaleStartPos.current.initialScale + delta).toFixed(2))));

    onChange({
      overlays: item.overlays.map((o) =>
        o.id === scalingOverlayId ? { ...o, scale: newScale } : o
      ),
    });
  }, [scalingOverlayId, item.overlays, onChange]);

  const handleContainerScaleMouseUp = useCallback(() => {
    setScalingOverlayId(null);
    scaleStartPos.current = null;
  }, []);

  useEffect(() => {
    if (scalingOverlayId) {
      window.addEventListener('mousemove', handleContainerScaleMouseMove);
      window.addEventListener('mouseup', handleContainerScaleMouseUp);
      window.addEventListener('touchmove', handleContainerScaleMouseMove);
      window.addEventListener('touchend', handleContainerScaleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleContainerScaleMouseMove);
        window.removeEventListener('mouseup', handleContainerScaleMouseUp);
        window.removeEventListener('touchmove', handleContainerScaleMouseMove);
        window.removeEventListener('touchend', handleContainerScaleMouseUp);
      };
    }
  }, [scalingOverlayId, handleContainerScaleMouseMove, handleContainerScaleMouseUp]);

  // Touch Pinch-to-Zoom scaling handler
  const handleTouchStartPinch = (e: React.TouchEvent, overlay: CanvasOverlayItem) => {
    if (e.touches.length === 2) {
      e.stopPropagation();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartDist.current = dist;
      pinchInitialScale.current = overlay.scale ?? 1;
    } else {
      handleDragStart(e, overlay);
    }
  };

  const handleTouchMovePinch = (e: React.TouchEvent, overlay: CanvasOverlayItem) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      e.preventDefault();
      e.stopPropagation();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = currentDist / pinchStartDist.current;
      const newScale = Math.max(0.4, Math.min(3.5, Number((pinchInitialScale.current * factor).toFixed(2))));
      updateOverlay(overlay.id, { scale: newScale });
    }
  };

  // Active rotating overlay item
  const [rotatingOverlayId, setRotatingOverlayId] = useState<string | null>(null);
  const rotateCenterRef = useRef<{ x: number; y: number } | null>(null);

  const handleRotateDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    overlay: CanvasOverlayItem,
    containerEl: HTMLElement | null
  ) => {
    e.stopPropagation();
    setRotatingOverlayId(overlay.id);
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      rotateCenterRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    } else {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      rotateCenterRef.current = { x: clientX, y: clientY + 60 };
    }
  };

  const handleRotateMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!rotatingOverlayId || !rotateCenterRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const dx = clientX - rotateCenterRef.current.x;
    const dy = clientY - rotateCenterRef.current.y;
    // Top handle is at -90deg from center, so angle = atan2(dy, dx) + 90deg
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;

    // Angle snapping to 0, 90, 180, 270 if within 5 degrees
    if (Math.abs(angle - 0) < 5 || Math.abs(angle - 360) < 5) angle = 0;
    else if (Math.abs(angle - 90) < 5) angle = 90;
    else if (Math.abs(angle - 180) < 5) angle = 180;
    else if (Math.abs(angle - 270) < 5) angle = 270;

    onChange({
      overlays: item.overlays.map((o) =>
        o.id === rotatingOverlayId ? { ...o, rotation: Math.round(angle) } : o
      ),
    });
  }, [rotatingOverlayId, item.overlays, onChange]);

  const handleRotateMouseUp = useCallback(() => {
    setRotatingOverlayId(null);
    rotateCenterRef.current = null;
  }, []);

  useEffect(() => {
    if (rotatingOverlayId) {
      window.addEventListener('mousemove', handleRotateMouseMove);
      window.addEventListener('mouseup', handleRotateMouseUp);
      window.addEventListener('touchmove', handleRotateMouseMove);
      window.addEventListener('touchend', handleRotateMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleRotateMouseMove);
        window.removeEventListener('mouseup', handleRotateMouseUp);
        window.removeEventListener('touchmove', handleRotateMouseMove);
        window.removeEventListener('touchend', handleRotateMouseUp);
      };
    }
  }, [rotatingOverlayId, handleRotateMouseMove, handleRotateMouseUp]);

  // Active shape resizing handle
  const [resizingShape, setResizingShape] = useState<{
    id: string;
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'w' | 'e';
  } | null>(null);
  const shapeResizeStart = useRef<{
    mouseX: number;
    mouseY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  const handleShapeResizeStart = (
    e: React.MouseEvent | React.TouchEvent,
    overlay: CanvasOverlayItem,
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'w' | 'e'
  ) => {
    e.stopPropagation();
    setResizingShape({ id: overlay.id, handle });
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    shapeResizeStart.current = {
      mouseX: clientX,
      mouseY: clientY,
      initialW: overlay.width || 28,
      initialH: overlay.height || 18,
    };
  };

  const handleShapeResizeMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!resizingShape || !shapeResizeStart.current || !mediaContainerRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const rect = mediaContainerRef.current.getBoundingClientRect();
      const deltaX = ((clientX - shapeResizeStart.current.mouseX) / rect.width) * 100;
      const deltaY = ((clientY - shapeResizeStart.current.mouseY) / rect.height) * 100;

      const { handle, id } = resizingShape;
      let newW = shapeResizeStart.current.initialW;
      let newH = shapeResizeStart.current.initialH;

      if (handle === 'e' || handle === 'se' || handle === 'ne') {
        newW = Math.max(8, Math.min(90, shapeResizeStart.current.initialW + deltaX * 2));
      } else if (handle === 'w' || handle === 'sw' || handle === 'nw') {
        newW = Math.max(8, Math.min(90, shapeResizeStart.current.initialW - deltaX * 2));
      }

      if (handle === 's' || handle === 'se' || handle === 'sw') {
        newH = Math.max(6, Math.min(90, shapeResizeStart.current.initialH + deltaY * 2));
      } else if (handle === 'n' || handle === 'ne' || handle === 'nw') {
        newH = Math.max(6, Math.min(90, shapeResizeStart.current.initialH - deltaY * 2));
      }

      onChange({
        overlays: item.overlays.map((o) =>
          o.id === id ? { ...o, width: Number(newW.toFixed(1)), height: Number(newH.toFixed(1)) } : o
        ),
      });
    },
    [resizingShape, item.overlays, onChange]
  );

  const handleShapeResizeMouseUp = useCallback(() => {
    setResizingShape(null);
    shapeResizeStart.current = null;
  }, []);

  useEffect(() => {
    if (resizingShape) {
      window.addEventListener('mousemove', handleShapeResizeMouseMove);
      window.addEventListener('mouseup', handleShapeResizeMouseUp);
      window.addEventListener('touchmove', handleShapeResizeMouseMove);
      window.addEventListener('touchend', handleShapeResizeMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleShapeResizeMouseMove);
        window.removeEventListener('mouseup', handleShapeResizeMouseUp);
        window.removeEventListener('touchmove', handleShapeResizeMouseMove);
        window.removeEventListener('touchend', handleShapeResizeMouseUp);
      };
    }
  }, [resizingShape, handleShapeResizeMouseMove, handleShapeResizeMouseUp]);

  const activeEditingOverlay = item.overlays.find((o) => o.id === editingOverlayId);

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-between select-none overflow-hidden bg-ink"
      onClick={() => {
        if (editingOverlayId) {
          const active = item.overlays.find((o) => o.id === editingOverlayId);
          if (active && !active.content?.trim()) {
            handleDeleteOverlay(editingOverlayId);
          } else {
            setEditingOverlayId(null);
            setActiveTool('none');
            setShowFontMenu(false);
          }
        }
      }}
    >
      {/* Top Toolbar matching WhatsApp (Left X + Undo, Center Tools, Right Download) */}
      <div
        className="w-full absolute top-0 inset-x-0 z-30 flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3.5 shrink-0 bg-gradient-to-b from-ink/85 via-ink/40 to-transparent"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
      >
        {/* Left: Close Icon and Undo Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/90 hover:text-white hover:bg-black/70 transition-all shadow-md active:scale-95"
            title="Close"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={handleUndo}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/90 hover:text-white hover:bg-black/70 transition-all shadow-md active:scale-95"
            title="Undo"
          >
            <Undo2 size={18} />
          </button>
        </div>

        {/* Right: Circular Floating Glass Tools matching Reference Screenshot */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Audio / Mute (if video) */}
          {item.mediaType === 'video' && (
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }
              }}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all shadow-md ${
                isMuted
                  ? 'bg-red-500/30 text-red-400 border border-red-500/40'
                  : 'bg-black/50 text-white/90 hover:bg-black/70'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}

          {/* 1. Crop & Rotate Tool */}
          <button
            type="button"
            onClick={() => {
              if (activeTool === 'crop') {
                applyCropRect(cropRect);
              } else {
                setActiveTool('crop');
              }
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all shadow-md ${
              activeTool === 'crop'
                ? 'bg-gold text-ink font-bold shadow-lg scale-105'
                : 'bg-black/50 text-white/90 hover:bg-black/70'
            }`}
            title={activeTool === 'crop' ? 'Apply Crop' : 'Crop & Rotate'}
          >
            <CropRotateIcon size={19} />
          </button>

          {/* 2. Stickers Tool (Hidden per user preference, functionality preserved) */}
          <button
            type="button"
            onClick={() => {
              if (activeTool === 'crop') applyCropRect(cropRect);
              setIsStickerModalOpen(true);
            }}
            className="hidden w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-md items-center justify-center transition-all shadow-md bg-black/50 text-white/90 hover:bg-black/70 hover:scale-105 active:scale-95"
            title="Stickers, iOS Emojis & Shapes"
          >
            <StickerIcon size={19} />
          </button>

          {/* 3. Text Overlay ("Aa") */}
          <button
            type="button"
            onClick={() => {
              if (activeTool === 'crop') {
                applyCropRect(cropRect);
              }
              handleOpenTextTool();
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-md flex items-center justify-center font-sans font-semibold text-sm leading-none transition-all shadow-md ${
              activeTool === 'text' || editingOverlayId
                ? 'bg-gold text-ink font-bold shadow-lg scale-105'
                : 'bg-black/50 text-white/90 hover:bg-black/70'
            }`}
            title="Add text"
          >
            Aa
          </button>

          {/* 4. Pencil / Draw Tool */}
          <button
            type="button"
            onClick={() => selectTool(activeTool === 'pen' ? 'none' : 'pen')}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all shadow-md ${
              activeTool === 'pen'
                ? 'bg-gold text-ink font-bold shadow-lg scale-105'
                : 'bg-black/50 text-white/90 hover:bg-black/70'
            }`}
            title="Draw"
          >
            <Pencil size={18} />
          </button>

          {/* 5. Lock (Paywall) Option for Chat Attachments */}
          {isLockable && (
            <button
              type="button"
              onClick={onToggleLock}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all shadow-md ${
                isLocked
                  ? 'bg-gold text-ink font-bold shadow-lg scale-105 ring-2 ring-gold/50'
                  : 'bg-black/50 text-white/90 hover:bg-black/70 hover:scale-105 active:scale-95'
              }`}
              title={isLocked ? `Locked ($${lockPrice || 0})` : 'Lock content (Paywall)'}
            >
              <Lock size={18} strokeWidth={2.4} />
            </button>
          )}

          {/* 6. Download Copy (Desktop only) */}
          <button
            type="button"
            onClick={onDownload}
            className="hidden sm:flex w-10 h-10 rounded-full bg-black/50 backdrop-blur-md items-center justify-center text-white/90 hover:text-white hover:bg-black/70 transition-all shadow-md"
            title="Download copy"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Pencil Sub-bar (Vertical to the Right, Clean High-Contrast Dark Frosted Glass) */}
      {activeTool === 'pen' && (
        <div
          className="absolute top-16 sm:top-20 right-2.5 sm:right-3.5 z-40 flex flex-col items-center gap-2 py-2.5 px-1.5 bg-black/60 backdrop-blur-md rounded-full animate-fade-in max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-none select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Undo Stroke (Above) */}
          <button
            type="button"
            onClick={handleUndoDrawing}
            className="w-7 h-7 rounded-full flex items-center justify-center text-paper/80 hover:text-paper hover:bg-white/20 transition-colors drop-shadow-md"
            title="Undo stroke"
          >
            <Undo2 size={16} />
          </button>

          {/* Clear Drawing */}
          <button
            type="button"
            onClick={handleClearDrawing}
            className="w-7 h-7 rounded-full flex items-center justify-center text-paper/70 hover:text-red-400 hover:bg-white/20 transition-colors drop-shadow-md"
            title="Clear drawing"
          >
            <Trash2 size={15} />
          </button>

          <div className="w-3.5 h-[1px] bg-white/20 my-0.5" />

          {/* Stroke Widths */}
          <div className="flex flex-col items-center gap-1.5">
            {[2, 4, 8].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPenWidth(size)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all drop-shadow-md ${
                  penWidth === size
                    ? 'bg-gold/40 text-gold font-bold scale-110 ring-1 ring-gold'
                    : 'hover:bg-white/20 text-paper'
                }`}
                title={`Brush size ${size}px`}
              >
                <div
                  className="rounded-full bg-current"
                  style={{ width: size * 1.2, height: size * 1.2 }}
                />
              </button>
            ))}
          </div>

          <div className="w-3.5 h-[1px] bg-white/20 my-0.5" />

          {/* Color Palette (Below) */}
          <div className="flex flex-col items-center gap-1.5">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setPenColor(color)}
                style={{ backgroundColor: color }}
                className={`w-5 h-5 rounded-full transition-transform shrink-0 drop-shadow-md ${
                  color === '#090909' ? 'border border-neutral-500' : 'border border-white/40'
                } ${
                  penColor === color ? 'scale-125 ring-2 ring-gold shadow-lg' : 'hover:scale-110'
                }`}
                title={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Text Options Sub-bar (Matching Vertical Right-hand Clean Dark Frosted Glass) */}
      {activeEditingOverlay && activeTool !== 'crop' && (
        <div
          className="absolute top-16 sm:top-20 right-2.5 sm:right-3.5 z-40 flex flex-col items-center gap-2 py-2.5 px-1.5 bg-black/60 backdrop-blur-md rounded-full animate-fade-in select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Font Face Popover Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFontMenu(!showFontMenu)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-paper hover:text-gold hover:bg-white/20 transition-colors drop-shadow"
              title="Change font"
            >
              A
            </button>
            {showFontMenu && (
              <div
                className="absolute top-0 right-10 z-50 flex flex-col gap-1 p-1.5 min-w-[140px] bg-[#18181b]/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                {(Object.keys(FONT_NAMES) as TextFontFamily[]).map((fontKey) => (
                  <button
                    key={fontKey}
                    type="button"
                    onClick={() => {
                      updateOverlay(activeEditingOverlay.id, { fontFamily: fontKey });
                      setShowFontMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all ${
                      (activeEditingOverlay.fontFamily || 'sans') === fontKey
                        ? 'bg-gold text-ink font-semibold'
                        : 'text-paper hover:text-gold hover:bg-white/10'
                    }`}
                  >
                    <span style={{ fontFamily: FONT_CSS[fontKey] }}>{FONT_NAMES[fontKey]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Background Toggle Button */}
          <button
            type="button"
            onClick={handleToggleBgStyle}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors drop-shadow ${
              activeEditingOverlay.bgStyle !== 'none'
                ? 'bg-gold/30 text-gold'
                : 'text-paper/70 hover:text-paper hover:bg-white/20'
            }`}
            title="Toggle background"
          >
            <div
              className={`w-3.5 h-3.5 rounded border ${
                activeEditingOverlay.bgStyle !== 'none' ? 'border-gold bg-gold' : 'border-white/50'
              }`}
            />
          </button>

          {/* Trash / Delete Text Overlay */}
          <button
            type="button"
            onClick={() => handleDeleteOverlay(activeEditingOverlay.id)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-paper/70 hover:text-red-400 hover:bg-white/20 transition-colors drop-shadow"
            title="Delete text"
          >
            <Trash2 size={15} />
          </button>

          <div className="w-3.5 h-[1px] bg-white/20 my-0.5" />

          {/* Color Palette (Below) */}
          <div className="flex flex-col items-center gap-1.5">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => updateOverlay(activeEditingOverlay.id, { color })}
                style={{ backgroundColor: color }}
                className={`w-5 h-5 rounded-full transition-transform shrink-0 drop-shadow-md ${
                  color === '#090909' ? 'border border-neutral-500' : 'border border-white/40'
                } ${
                  activeEditingOverlay.color === color
                    ? 'scale-125 ring-2 ring-gold shadow-lg'
                    : 'hover:scale-110'
                }`}
                title={`Text color ${color}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Shapes Selector Sub-bar */}
      {activeTool === 'shape' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-ink-light rounded-xl border border-border-subtle shadow-2xl animate-fade-in">
          <span className="text-xs text-muted font-medium mr-1">Shapes:</span>
          <button
            type="button"
            onClick={() => addShapeOverlay('rect')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-gold hover:text-ink text-paper transition-colors"
          >
            Rectangle
          </button>
          <button
            type="button"
            onClick={() => addShapeOverlay('circle')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-gold hover:text-ink text-paper transition-colors"
          >
            Circle
          </button>
          <button
            type="button"
            onClick={() => addShapeOverlay('arrow')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-gold hover:text-ink text-paper transition-colors"
          >
            Arrow
          </button>
          <button
            type="button"
            onClick={() => addShapeOverlay('callout')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-gold hover:text-ink text-paper transition-colors"
          >
            Callout
          </button>
        </div>
      )}

      {/* Emoji Tray */}
      {activeTool === 'emoji' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 p-3 bg-ink-light rounded-xl border border-border-subtle shadow-2xl max-w-[90vw] overflow-x-auto animate-fade-in">
          {EMOJI_PRESETS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmojiOverlay(emoji)}
              className="text-2xl hover:scale-125 transition-transform p-1.5"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Sticker Tray */}
      {activeTool === 'sticker' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 p-3 bg-ink-light rounded-xl border border-border-subtle shadow-2xl max-w-[90vw] overflow-x-auto animate-fade-in">
          {STICKER_PRESETS.map((stk) => (
            <button
              key={stk.label}
              type="button"
              onClick={() => addStickerOverlay(stk)}
              style={{ color: stk.color, backgroundColor: stk.bg }}
              className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-gold/30 hover:scale-110 transition-transform shadow-md shrink-0"
            >
              {stk.label}
            </button>
          ))}
        </div>
      )}

      {/* Text Tool Color Palette Strip Above the Image on Mobile */}
      {/* Centered Media Frame (Spans Full Width on Mobile to Match Story Viewer) */}
      <div className="w-full h-full flex flex-col items-center justify-center p-0 sm:p-4 relative overflow-hidden">
        <div
          ref={mediaContainerRef}
          onClick={() => {
            if (selectedOverlayId) setSelectedOverlayId(null);
          }}
          className="relative inline-block w-full sm:w-auto max-w-full sm:max-w-[420px] border-y sm:border border-neutral-800/80 bg-neutral-900 shadow-2xl overflow-hidden select-none"
          style={{ lineHeight: 0 }}
        >
          {/* Media Image / Video */}
          {item.mediaType === 'image' ? (
            <img
              ref={imageRef}
              src={item.previewUrl}
              alt="Preview"
              onLoad={syncCanvasResolution}
              style={{
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              }}
              className="w-full sm:w-auto h-auto max-h-[100dvh] sm:max-h-[75vh] max-w-full sm:max-w-[420px] object-contain block mx-auto transition-transform duration-200 pointer-events-none"
            />
          ) : (
            <video
              ref={videoRef}
              src={item.previewUrl}
              autoPlay
              loop
              playsInline
              muted={isMuted}
              onLoadedData={syncCanvasResolution}
              style={{
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              }}
              className="w-full sm:w-auto h-auto max-h-[100dvh] sm:max-h-[75vh] max-w-full sm:max-w-[420px] object-contain block mx-auto transition-transform duration-200"
            />
          )}

          {/* Interactive Crop Frame with 8 Handles (matching WhatsApp screenshot media_1789828463028.png) */}
          {activeTool === 'crop' && (
            <div
              style={{
                left: `${cropRect.x}%`,
                top: `${cropRect.y}%`,
                width: `${cropRect.width}%`,
                height: `${cropRect.height}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
              }}
              className="absolute z-30 border border-white cursor-move select-none touch-none"
              onMouseDown={(e) => handleCropDragStart(e, 'move')}
              onTouchStart={(e) => handleCropDragStart(e, 'move')}
            >
              {/* 3x3 Rule-of-Thirds Grid */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-30">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* 4 Corner Handles (White circles with dark border matching reference image) */}
              <div
                onMouseDown={(e) => handleCropDragStart(e, 'nw')}
                onTouchStart={(e) => handleCropDragStart(e, 'nw')}
                className="absolute -top-[7px] -left-[7px] w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                title="Resize Top-Left"
              />
              <div
                onMouseDown={(e) => handleCropDragStart(e, 'ne')}
                onTouchStart={(e) => handleCropDragStart(e, 'ne')}
                className="absolute -top-[7px] -right-[7px] w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                title="Resize Top-Right"
              />
              <div
                onMouseDown={(e) => handleCropDragStart(e, 'se')}
                onTouchStart={(e) => handleCropDragStart(e, 'se')}
                className="absolute -bottom-[7px] -right-[7px] w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                title="Resize Bottom-Right"
              />
              <div
                onMouseDown={(e) => handleCropDragStart(e, 'sw')}
                onTouchStart={(e) => handleCropDragStart(e, 'sw')}
                className="absolute -bottom-[7px] -left-[7px] w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                title="Resize Bottom-Left"
              />

              {/* 4 Edge Center Handles (White circles with dark border) */}
              <div
                onMouseDown={(e) => handleCropDragStart(e, 'n')}
                onTouchStart={(e) => handleCropDragStart(e, 'n')}
                className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-ns-resize z-40 hover:scale-125 transition-transform"
                title="Resize Top"
              />
              <div
                onMouseDown={(e) => handleCropDragStart(e, 'e')}
                onTouchStart={(e) => handleCropDragStart(e, 'e')}
                className="absolute top-1/2 -translate-y-1/2 -right-[7px] w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-ew-resize z-40 hover:scale-125 transition-transform"
                title="Resize Right"
              />
              <div
                onMouseDown={(e) => handleCropDragStart(e, 's')}
                onTouchStart={(e) => handleCropDragStart(e, 's')}
                className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-ns-resize z-40 hover:scale-125 transition-transform"
                title="Resize Bottom"
              />
              <div
                onMouseDown={(e) => handleCropDragStart(e, 'w')}
                onTouchStart={(e) => handleCropDragStart(e, 'w')}
                className="absolute top-1/2 -translate-y-1/2 -left-[7px] w-3.5 h-3.5 rounded-full bg-white border-2 border-black/80 shadow-md cursor-ew-resize z-40 hover:scale-125 transition-transform"
                title="Resize Left"
              />
            </div>
          )}

          {/* Freehand Drawing Canvas Overlay */}
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className={`absolute inset-0 z-10 ${
              activeTool === 'pen' ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'
            }`}
          />

          {/* Dynamic Overlays: Text, Shapes, Stickers, Emojis */}
          {activeTool !== 'crop' &&
            item.overlays.map((overlay) => {
              const isEditing = editingOverlayId === overlay.id;

              // Text Overlay
              if (overlay.type === 'text') {
                const bgStyle = overlay.bgStyle || 'solid';
                const fontFam = overlay.fontFamily || 'sans';
                const isLightColor =
                  overlay.color === '#ffffff' ||
                  overlay.color === '#c9a96e' ||
                  overlay.color === '#e0c08a' ||
                  overlay.color === '#eab308';

                const isSelected = selectedOverlayId === overlay.id;

                return (
                  <div
                    key={overlay.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOverlayId(overlay.id);
                      setEditingOverlayId(overlay.id);
                      setActiveTool('text');
                    }}
                    onMouseDown={(e) => handleDragStart(e, overlay)}
                    onTouchStart={(e) => handleTouchStartPinch(e, overlay)}
                    onTouchMove={(e) => handleTouchMovePinch(e, overlay)}
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg) scale(${overlay.scale ?? 1})`,
                    }}
                    className={`absolute z-20 select-none transition-transform ${
                      isSelected && !isEditing ? 'border-2 border-gold rounded-xl' : ''
                    } ${
                      isEditing ? 'cursor-default' : 'cursor-move group'
                    }`}
                  >
                    {isEditing ? (
                      <div
                        className="relative flex flex-col items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className={`relative px-4 py-1.5 rounded-lg ring-2 ring-gold flex items-center transition-all min-w-[90px] ${
                            bgStyle !== 'none' ? 'shadow-2xl' : ''
                          }`}
                          style={{
                            backgroundColor:
                              bgStyle === 'solid'
                                ? overlay.color || '#c9a96e'
                                : bgStyle === 'semi'
                                ? 'rgba(9, 9, 9, 0.8)'
                                : 'transparent',
                            color:
                              bgStyle === 'solid'
                                ? isLightColor
                                  ? '#090909'
                                  : '#ffffff'
                                : overlay.color || '#c9a96e',
                            fontFamily: FONT_CSS[fontFam],
                          }}
                        >
                          <input
                            ref={textInputRef}
                            type="text"
                            value={overlay.content || ''}
                            onChange={(e) =>
                              updateOverlay(overlay.id, { content: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (!overlay.content?.trim()) {
                                  handleDeleteOverlay(overlay.id);
                                } else {
                                  setEditingOverlayId(null);
                                  setActiveTool('none');
                                  setShowFontMenu(false);
                                }
                              }
                            }}
                            placeholder="Type text..."
                            className="bg-transparent text-center text-lg sm:text-xl font-medium focus:outline-none w-full"
                            style={{
                              color: 'inherit',
                              fontFamily: 'inherit',
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOverlay(overlay.id);
                          }}
                          className={`absolute -top-3.5 -right-3.5 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-xl z-30 cursor-pointer active:scale-90 ${
                            isSelected ? 'opacity-100 scale-100' : 'opacity-0 sm:group-hover:opacity-100'
                          }`}
                          title="Remove text"
                        >
                          <X size={15} strokeWidth={2.5} />
                        </button>

                        {/* Top Rotation Handle with vertical stem */}
                        {isSelected && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-30">
                            <div
                              onMouseDown={(e) =>
                                handleRotateDragStart(
                                  e,
                                  overlay,
                                  e.currentTarget.parentElement?.parentElement as HTMLElement
                                )
                              }
                              onTouchStart={(e) =>
                                handleRotateDragStart(
                                  e,
                                  overlay,
                                  e.currentTarget.parentElement?.parentElement as HTMLElement
                                )
                              }
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-grab active:cursor-grabbing active:scale-125 transition-transform touch-none"
                              title="Rotate"
                            />
                            <div className="w-[1.5px] h-3 bg-gold" />
                          </div>
                        )}

                        {/* Bottom-Right Corner Scale Handle */}
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleScaleDragStart(e, overlay)}
                            onTouchStart={(e) => handleScaleDragStart(e, overlay)}
                            className="absolute -bottom-2 -right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-nwse-resize z-30 touch-none active:scale-125 transition-transform"
                            title="Resize"
                          />
                        )}

                        <div
                          className={`px-4 py-1.5 rounded-lg transition-all ${
                            bgStyle !== 'none' ? 'shadow-lg' : ''
                          }`}
                          style={{
                            backgroundColor:
                              bgStyle === 'solid'
                                ? overlay.color || '#c9a96e'
                                : bgStyle === 'semi'
                                ? 'rgba(9, 9, 9, 0.8)'
                                : 'transparent',
                            color:
                              bgStyle === 'solid'
                                ? isLightColor
                                  ? '#090909'
                                  : '#ffffff'
                                : overlay.color || '#c9a96e',
                            fontFamily: FONT_CSS[fontFam],
                          }}
                        >
                          <span className="text-lg sm:text-xl font-medium tracking-wide">
                            {overlay.content || 'Tap to edit'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Shape Overlay
              if (overlay.type === 'shape') {
                const isSelected = selectedOverlayId === overlay.id;
                return (
                  <div
                    key={overlay.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOverlayId(overlay.id);
                    }}
                    onMouseDown={(e) => handleDragStart(e, overlay)}
                    onTouchStart={(e) => handleTouchStartPinch(e, overlay)}
                    onTouchMove={(e) => handleTouchMovePinch(e, overlay)}
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg) scale(${overlay.scale ?? 1})`,
                      width: `${overlay.width || 28}%`,
                      height: `${overlay.height || 18}%`,
                    }}
                    className={`absolute z-20 cursor-move group select-none transition-transform ${
                      isSelected ? 'border-2 border-gold' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteOverlay(overlay.id);
                      }}
                      className={`absolute -top-3.5 -right-3.5 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-xl z-30 cursor-pointer active:scale-90 ${
                        isSelected ? 'opacity-100 scale-100' : 'opacity-0 sm:group-hover:opacity-100'
                      }`}
                      title="Remove shape"
                    >
                      <X size={15} strokeWidth={2.5} />
                    </button>

                    {/* Top Rotation Handle with vertical stem */}
                    {isSelected && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-30">
                        <div
                          onMouseDown={(e) =>
                            handleRotateDragStart(
                              e,
                              overlay,
                              e.currentTarget.parentElement?.parentElement as HTMLElement
                            )
                          }
                          onTouchStart={(e) =>
                            handleRotateDragStart(
                              e,
                              overlay,
                              e.currentTarget.parentElement?.parentElement as HTMLElement
                            )
                          }
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-grab active:cursor-grabbing active:scale-125 transition-transform touch-none"
                          title="Rotate"
                        />
                        <div className="w-[1.5px] h-3 bg-gold" />
                      </div>
                    )}

                    {/* 8 Bounding Box Handles for Shapes (Image 1) */}
                    {isSelected && (
                      <>
                        {/* 4 Corners */}
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 'nw')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 'nw')}
                          className="absolute -top-2 -left-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-nwse-resize z-30 touch-none active:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 'ne')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 'ne')}
                          className="absolute -top-2 -right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-nesw-resize z-30 touch-none active:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 'se')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 'se')}
                          className="absolute -bottom-2 -right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-nwse-resize z-30 touch-none active:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 'sw')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 'sw')}
                          className="absolute -bottom-2 -left-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-nesw-resize z-30 touch-none active:scale-125 transition-transform"
                        />

                        {/* 4 Edge Centers */}
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 'n')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 'n')}
                          className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-ns-resize z-30 touch-none active:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 's')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 's')}
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-ns-resize z-30 touch-none active:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 'w')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 'w')}
                          className="absolute top-1/2 -left-2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-ew-resize z-30 touch-none active:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleShapeResizeStart(e, overlay, 'e')}
                          onTouchStart={(e) => handleShapeResizeStart(e, overlay, 'e')}
                          className="absolute top-1/2 -right-2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-ew-resize z-30 touch-none active:scale-125 transition-transform"
                        />
                      </>
                    )}

                    {overlay.shapeType === 'circle' ? (
                      <div className="w-full h-full rounded-full border-3 border-gold bg-gold/15 shadow-lg" />
                    ) : overlay.shapeType === 'arrow' ? (
                      <div className="w-full h-full flex items-center justify-center text-gold filter drop-shadow-lg">
                        <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
                          <path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.7 12l-8.85-7.85-1.42 1.42L16.86 11H5v2z" />
                        </svg>
                      </div>
                    ) : overlay.shapeType === 'callout' ? (
                      <div className="w-full h-full rounded-2xl border-3 border-gold bg-gold/15 shadow-lg relative flex items-center justify-center">
                        <div className="absolute -bottom-2 left-6 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-gold" />
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-lg border-3 border-gold bg-gold/15 shadow-lg" />
                    )}
                  </div>
                );
              }

              // Sticker Overlay
              if (overlay.type === 'sticker') {
                const isSelected = selectedOverlayId === overlay.id;
                return (
                  <div
                    key={overlay.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOverlayId(overlay.id);
                    }}
                    onMouseDown={(e) => handleDragStart(e, overlay)}
                    onTouchStart={(e) => handleTouchStartPinch(e, overlay)}
                    onTouchMove={(e) => handleTouchMovePinch(e, overlay)}
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg) scale(${overlay.scale ?? 1})`,
                    }}
                    className={`absolute z-20 cursor-move group select-none transition-transform ${
                      isSelected ? 'border-2 border-gold rounded-2xl' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteOverlay(overlay.id);
                      }}
                      className={`absolute -top-3.5 -right-3.5 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-xl z-30 cursor-pointer active:scale-90 ${
                        isSelected ? 'opacity-100 scale-100' : 'opacity-0 sm:group-hover:opacity-100'
                      }`}
                      title="Remove sticker"
                    >
                      <X size={15} strokeWidth={2.5} />
                    </button>

                    {/* Top Rotation Handle with vertical stem */}
                    {isSelected && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-30">
                        <div
                          onMouseDown={(e) =>
                            handleRotateDragStart(
                              e,
                              overlay,
                              e.currentTarget.parentElement?.parentElement as HTMLElement
                            )
                          }
                          onTouchStart={(e) =>
                            handleRotateDragStart(
                              e,
                              overlay,
                              e.currentTarget.parentElement?.parentElement as HTMLElement
                            )
                          }
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-grab active:cursor-grabbing active:scale-125 transition-transform touch-none"
                          title="Rotate"
                        />
                        <div className="w-[1.5px] h-3 bg-gold" />
                      </div>
                    )}

                    {/* Bottom-Right Corner Scale Handle (Image 2) */}
                    {isSelected && (
                      <div
                        onMouseDown={(e) => handleScaleDragStart(e, overlay)}
                        onTouchStart={(e) => handleScaleDragStart(e, overlay)}
                        className="absolute -bottom-2 -right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-nwse-resize z-30 touch-none active:scale-125 transition-transform"
                        title="Resize"
                      />
                    )}

                    {overlay.customImageUrl ? (
                      <img
                        src={overlay.customImageUrl}
                        alt="Photo sticker"
                        className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-2xl border-2 border-white/70 shadow-2xl pointer-events-none"
                      />
                    ) : overlay.iconType === 'analog_clock' ? (
                      <div className="p-3 rounded-2xl bg-black/70 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-center">
                        <MiniAnalogClock size={48} />
                      </div>
                    ) : overlay.iconType === 'clock' ? (
                      <div className="px-4 py-2 rounded-2xl bg-white text-ink font-mono font-black text-xl sm:text-2xl shadow-2xl border border-black/10 tracking-tight flex items-center gap-2">
                        <Clock size={18} className="text-ink" />
                        <span>{overlay.content}</span>
                      </div>
                    ) : overlay.iconType === 'add_yours' ? (
                      <div className="px-4 py-2.5 rounded-2xl bg-white text-ink font-bold text-sm shadow-2xl border border-black/10 flex items-center gap-2">
                        <Camera size={18} className="text-pink-500" />
                        <span>{overlay.content || 'Add yours'}</span>
                      </div>
                    ) : overlay.iconType === 'question' ? (
                      <div className="px-4 py-2.5 rounded-2xl bg-white text-ink font-bold text-sm shadow-2xl border border-black/10 flex items-center gap-2">
                        <HelpCircle size={18} className="text-blue-500" />
                        <span>{overlay.content || 'Ask me a question'}</span>
                      </div>
                    ) : overlay.iconType === 'reaction' ? (
                      <div className="px-4 py-2 rounded-full bg-white text-ink font-black text-base shadow-2xl border border-black/10 flex items-center gap-1.5">
                        <span className="text-xl">❤️</span>
                        <span>{overlay.content || 'Love'}</span>
                      </div>
                    ) : overlay.iconType === 'location' ? (
                      <div className="px-4 py-2 rounded-full bg-white text-ink font-bold text-xs sm:text-sm shadow-2xl border border-black/10 flex items-center gap-1.5">
                        <MapPin size={15} className="text-emerald-600" />
                        <span>{overlay.content?.replace(/^📍\s*/, '') || 'Location'}</span>
                      </div>
                    ) : overlay.iconType === 'music' ? (
                      <div className="px-4 py-2 rounded-full bg-white text-ink font-bold text-xs sm:text-sm shadow-2xl border border-black/10 flex items-center gap-1.5">
                        <Music size={15} className="text-purple-600" />
                        <span>{overlay.content?.replace(/^🎵\s*/, '') || 'Music'}</span>
                      </div>
                    ) : overlay.iconType === 'bubble' ? (
                      <div className="px-4 py-2 rounded-2xl bg-white text-ink font-bold text-sm shadow-2xl border border-black/10 relative">
                        <span>{overlay.content}</span>
                        <div className="absolute -bottom-2 left-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white" />
                      </div>
                    ) : overlay.iconType === 'doodle' ? (
                      <div className="p-2 text-2xl filter drop-shadow-lg font-black" style={{ color: overlay.color || '#f97316' }}>
                        {overlay.content}
                      </div>
                    ) : (
                      <span
                        className="px-4 py-1.5 rounded-full text-sm sm:text-base font-black uppercase tracking-wider shadow-2xl border border-gold/40 filter drop-shadow-xl"
                        style={{
                          color: overlay.color || '#c9a96e',
                          backgroundColor: '#090909',
                        }}
                      >
                        {overlay.content}
                      </span>
                    )}
                  </div>
                );
              }

              // Emoji Overlay
              const isSelected = selectedOverlayId === overlay.id;
              return (
                <div
                  key={overlay.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOverlayId(overlay.id);
                  }}
                  onMouseDown={(e) => handleDragStart(e, overlay)}
                  onTouchStart={(e) => handleTouchStartPinch(e, overlay)}
                  onTouchMove={(e) => handleTouchMovePinch(e, overlay)}
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg) scale(${overlay.scale ?? 1})`,
                  }}
                  className={`absolute z-20 cursor-move group select-none transition-transform ${
                    isSelected ? 'border-2 border-gold rounded-2xl' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteOverlay(overlay.id);
                    }}
                    className={`absolute -top-3.5 -right-3.5 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-xl z-30 cursor-pointer active:scale-90 ${
                      isSelected ? 'opacity-100 scale-100' : 'opacity-0 sm:group-hover:opacity-100'
                    }`}
                    title="Remove emoji"
                  >
                    <X size={15} strokeWidth={2.5} />
                  </button>

                  {/* Top Rotation Handle with vertical stem */}
                  {isSelected && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-30">
                      <div
                        onMouseDown={(e) =>
                          handleRotateDragStart(
                            e,
                            overlay,
                            e.currentTarget.parentElement?.parentElement as HTMLElement
                          )
                        }
                        onTouchStart={(e) =>
                          handleRotateDragStart(
                            e,
                            overlay,
                            e.currentTarget.parentElement?.parentElement as HTMLElement
                          )
                        }
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-grab active:cursor-grabbing active:scale-125 transition-transform touch-none"
                        title="Rotate"
                      />
                      <div className="w-[1.5px] h-3 bg-gold" />
                    </div>
                  )}

                  {/* Bottom-Right Corner Scale Handle (Image 2) */}
                  {isSelected && (
                    <div
                      onMouseDown={(e) => handleScaleDragStart(e, overlay)}
                      onTouchStart={(e) => handleScaleDragStart(e, overlay)}
                      className="absolute -bottom-2 -right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-black/90 shadow-md cursor-nwse-resize z-30 touch-none active:scale-125 transition-transform"
                      title="Resize"
                    />
                  )}

                  {overlay.appleEmojiUrl ? (
                    <img
                      src={overlay.appleEmojiUrl}
                      alt={overlay.content || ''}
                      className="w-12 h-12 sm:w-14 sm:h-14 object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)] pointer-events-none"
                    />
                  ) : (
                    <span className="text-4xl filter drop-shadow-lg leading-none">
                      {overlay.content}
                    </span>
                  )}
                </div>
              );
            })}

          {/* Bottom Trash Drop Target when dragging overlays */}
          {draggingOverlayId && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600/90 text-white text-xs font-semibold shadow-2xl backdrop-blur-md pointer-events-none animate-bounce">
              <Trash2 size={16} />
              <span>Drag down to remove</span>
            </div>
          )}
        </div>

        {/* WhatsApp-style Crop Sub-Controls (Rotate, Aspect Ratio, Reset, and Done) */}
        {activeTool === 'crop' && (
          <div className="flex items-center justify-center gap-7 pt-3 pb-1 z-30 animate-fade-in">
            {/* Rotate Button */}
            <button
              type="button"
              onClick={handleRotate90}
              className="text-muted hover:text-paper p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Rotate 90°"
            >
              <CropRotateSubIcon size={21} />
            </button>

            {/* Aspect Preset Popover Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAspectMenu(!showAspectMenu)}
                className={`p-2 rounded-full transition-colors ${
                  showAspectMenu ? 'bg-white/15 text-white' : 'text-muted hover:text-paper hover:bg-white/10'
                }`}
                title="Aspect ratio presets"
              >
                <CropAspectIcon size={21} />
              </button>

              {showAspectMenu && (
                <div className="absolute bottom-11 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 p-2 bg-[#18181b] border border-border-subtle rounded-xl shadow-2xl animate-fade-in whitespace-nowrap">
                  {ASPECT_PRESETS.map((p) => (
                    <button
                      key={p.ratio}
                      type="button"
                      onClick={() => {
                        setCropAspect(p.ratio);
                        setShowAspectMenu(false);
                      }}
                      className="px-2.5 py-1 text-xs rounded-lg text-paper hover:bg-gold hover:text-ink transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reset Button */}
            <button
              type="button"
              onClick={() => setCropRect({ x: 0, y: 0, width: 100, height: 100 })}
              className="text-xs sm:text-sm font-medium text-muted hover:text-paper transition-colors px-2 py-1"
              title="Reset crop to original"
            >
              Reset
            </button>

            {/* Done Action */}
            <button
              type="button"
              onClick={() => applyCropRect(cropRect)}
              className="px-4 py-1 rounded-full bg-gold text-ink text-xs font-semibold hover:bg-gold-light transition-all shadow-md active:scale-95"
              title="Apply crop"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* WhatsApp / Instagram Style Sticker Bottom-Sheet Modal */}
      <StickerModal
        isOpen={isStickerModalOpen}
        onClose={() => setIsStickerModalOpen(false)}
        onSelectEmoji={(emoji) => {
          const newOverlay: CanvasOverlayItem = {
            id: `emoji-${Date.now()}`,
            type: 'emoji',
            content: emoji.char,
            appleEmojiUrl: emoji.url,
            x: 50,
            y: 50,
          };
          onChange({ overlays: [...item.overlays, newOverlay] });
        }}
        onSelectSticker={(sticker) => {
          const newOverlay: CanvasOverlayItem = {
            id: `sticker-${Date.now()}`,
            type: 'sticker',
            content: sticker.label,
            bgStyle: 'solid',
            color: sticker.color || '#ffffff',
            iconType: sticker.iconType,
            customImageUrl: sticker.customImageUrl,
            shapeType: sticker.shapeType,
            x: 50,
            y: 50,
          };
          onChange({ overlays: [...item.overlays, newOverlay] });
        }}
        onSelectShape={(shapeType) => {
          addShapeOverlay(shapeType);
        }}
        onSelectPhotoSticker={(_file, previewUrl) => {
          const newOverlay: CanvasOverlayItem = {
            id: `photo-sticker-${Date.now()}`,
            type: 'sticker',
            customImageUrl: previewUrl,
            x: 50,
            y: 50,
          };
          onChange({ overlays: [...item.overlays, newOverlay] });
        }}
      />
    </div>
  );
}
