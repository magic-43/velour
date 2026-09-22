import React from 'react';
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';

interface Props {
  onEmojiSelect: (emojiData: EmojiClickData) => void;
  onBackspace?: () => void;
  height?: number;
}

export default function EmojiKeyboardDrawer({ onEmojiSelect, height = 320 }: Props) {
  return (
    <div
      data-emoji-drawer="true"
      data-no-swipe="true"
      className="relative w-full bg-[#18181b] overflow-hidden animate-in slide-in-from-bottom-2 duration-200 select-none"
    >
      {/* Apple iOS Emoji Picker with Full-Width Dark Theme */}
      <div className="w-full flex justify-center">
        <EmojiPicker
          emojiStyle={EmojiStyle.APPLE}
          theme={Theme.DARK}
          lazyLoadEmojis={true}
          searchPlaceHolder="Search Apple emojis..."
          previewConfig={{ showPreview: false }}
          width="100%"
          height={height}
          onEmojiClick={onEmojiSelect}
        />
      </div>
    </div>
  );
}
