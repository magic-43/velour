import React, { useState } from 'react';

interface AppleEmojiProps {
  emoji: string;
  size?: number; // Size in pixels (default: 48)
  className?: string;
  alt?: string;
}

/**
 * Renders authentic high-resolution Apple iOS emojis across all platforms
 * (Windows, Android, iOS, macOS) using official Apple emoji assets with instant fallback.
 */
export default function AppleEmoji({ emoji, size = 48, className = '', alt }: AppleEmojiProps) {
  const [hasError, setHasError] = useState(false);

  // CDN providing official Apple iOS rendered emojis
  const emojiUrl = `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=apple`;

  if (hasError) {
    return (
      <span
        style={{ fontSize: `${size * 0.85}px`, lineHeight: 1 }}
        className={`inline-flex items-center justify-center select-none ${className}`}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={emojiUrl}
      alt={alt || emoji}
      width={size}
      height={size}
      onError={() => setHasError(true)}
      className={`inline-block object-contain pointer-events-none select-none ${className}`}
      loading="lazy"
      draggable={false}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}
