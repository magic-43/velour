import React from 'react';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Social Media Stories Button Icon (Image 2)
 * Features a circular segmented story ring with a centered plus sign.
 */
export default function StoryStatusIcon({
  size = 14,
  className = 'text-emerald-400',
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Outer segmented story ring matching Image 2 */}
      <circle
        cx="12"
        cy="12"
        r="9"
        strokeDasharray="18 4.5 5 4.5 5 4.5 5 4.5"
        strokeDashoffset="-2"
      />
      {/* Center Plus (+) sign */}
      <line x1="12" y1="8.5" x2="12" y2="15.5" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
    </svg>
  );
}
