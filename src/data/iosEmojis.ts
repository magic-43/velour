// Apple iOS Emojis Dataset
// Uses high-resolution official Apple emoji images from emoji-datasource-apple CDN

export interface IOSEmoji {
  char: string;
  code: string; // Unified hex code
  name: string;
  category: 'smileys' | 'gestures' | 'hearts' | 'party' | 'animals' | 'food' | 'objects';
}

export function getAppleEmojiUrl(code: string): string {
  // Normalize hex code (lowercase, no leading 0x)
  const hex = code.toLowerCase().replace(/^0x/, '');
  return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${hex}.png`;
}

export const IOS_EMOJIS: IOSEmoji[] = [
  // ── Smileys & Emotions ───────────────────────────────────────────────────────
  { char: '😂', code: '1f602', name: 'Face with Tears of Joy', category: 'smileys' },
  { char: '😍', code: '1f60d', name: 'Smiling Face with Heart-Eyes', category: 'smileys' },
  { char: '🥰', code: '1f970', name: 'Smiling Face with Hearts', category: 'smileys' },
  { char: '😭', code: '1f62d', name: 'Loudly Crying Face', category: 'smileys' },
  { char: '😎', code: '1f60e', name: 'Smiling Face with Sunglasses', category: 'smileys' },
  { char: '🤩', code: '1f929', name: 'Star-Struck', category: 'smileys' },
  { char: '🤤', code: '1f924', name: 'Drooling Face', category: 'smileys' },
  { char: '😏', code: '1f60f', name: 'Smirking Face', category: 'smileys' },
  { char: '🥳', code: '1f973', name: 'Partying Face', category: 'smileys' },
  { char: '🥺', code: '1f97a', name: 'Pleading Face', category: 'smileys' },
  { char: '😮', code: '1f62e', name: 'Face with Open Mouth', category: 'smileys' },
  { char: '😜', code: '1f61c', name: 'Winking Face with Tongue', category: 'smileys' },
  { char: '🤫', code: '1f92b', name: 'Shushing Face', category: 'smileys' },
  { char: '💀', code: '1f480', name: 'Skull', category: 'smileys' },
  { char: '🤡', code: '1f921', name: 'Clown Face', category: 'smileys' },
  { char: '😈', code: '1f608', name: 'Smiling Face with Horns', category: 'smileys' },
  { char: '👀', code: '1f440', name: 'Eyes', category: 'smileys' },
  { char: '🫠', code: '1fae0', name: 'Melting Face', category: 'smileys' },
  { char: '🤭', code: '1f92d', name: 'Face with Hand Over Mouth', category: 'smileys' },
  { char: '🙄', code: '1f644', name: 'Face with Rolling Eyes', category: 'smileys' },

  // ── Gestures & Hands ────────────────────────────────────────────────────────
  { char: '🔥', code: '1f525', name: 'Fire', category: 'gestures' },
  { char: '✨', code: '2728', name: 'Sparkles', category: 'gestures' },
  { char: '💯', code: '1f4af', name: 'Hundred Points', category: 'gestures' },
  { char: '👏', code: '1f44f', name: 'Clapping Hands', category: 'gestures' },
  { char: '🙌', code: '1f64c', name: 'Raising Hands', category: 'gestures' },
  { char: '🫶', code: '1faf6', name: 'Heart Hands', category: 'gestures' },
  { char: '🙏', code: '1f64f', name: 'Folded Hands', category: 'gestures' },
  { char: '👍', code: '1f44d', name: 'Thumbs Up', category: 'gestures' },
  { char: '✌️', code: '270c-fe0f', name: 'Victory Hand', category: 'gestures' },
  { char: '💅', code: '1f485', name: 'Nail Polish', category: 'gestures' },
  { char: '🫡', code: '1fae1', name: 'Saluting Face', category: 'gestures' },
  { char: '🤝', code: '1f91d', name: 'Handshake', category: 'gestures' },

  // ── Hearts & Love ───────────────────────────────────────────────────────────
  { char: '❤️', code: '2764-fe0f', name: 'Red Heart', category: 'hearts' },
  { char: '🤍', code: '1f90d', name: 'White Heart', category: 'hearts' },
  { char: '🖤', code: '1f5a4', name: 'Black Heart', category: 'hearts' },
  { char: '🤎', code: '1f90e', name: 'Brown Heart', category: 'hearts' },
  { char: '💖', code: '1f496', name: 'Sparkling Heart', category: 'hearts' },
  { char: '❤️‍🔥', code: '2764-fe0f-200d-1f525', name: 'Heart on Fire', category: 'hearts' },
  { char: '💔', code: '1f494', name: 'Broken Heart', category: 'hearts' },
  { char: '💋', code: '1f48b', name: 'Kiss Mark', category: 'hearts' },
  { char: '🌹', code: '1f339', name: 'Rose', category: 'hearts' },

  // ── Party & Vibes ───────────────────────────────────────────────────────────
  { char: '🥂', code: '1f942', name: 'Clinking Glasses', category: 'party' },
  { char: '🍾', code: '1f37e', name: 'Bottle with Popping Cork', category: 'party' },
  { char: '🍸', code: '1f378', name: 'Cocktail Glass', category: 'party' },
  { char: '🎉', code: '1f389', name: 'Party Popper', category: 'party' },
  { char: '⚡', code: '26a1', name: 'High Voltage', category: 'party' },
  { char: '💫', code: '1f4ab', name: 'Dizzy', category: 'party' },
  { char: '🌟', code: '1f31f', name: 'Glowing Star', category: 'party' },
  { char: '👑', code: '1f451', name: 'Crown', category: 'party' },
  { char: '💎', code: '1f48e', name: 'Gem Stone', category: 'party' },
  { char: '💸', code: '1f4b8', name: 'Money with Wings', category: 'party' },
  { char: '💰', code: '1f4b0', name: 'Money Bag', category: 'party' },

  // ── Objects & Luxury ────────────────────────────────────────────────────────
  { char: '💍', code: '1f48d', name: 'Ring', category: 'objects' },
  { char: '🕶️', code: '1f576-fe0f', name: 'Sunglasses', category: 'objects' },
  { char: '🛍️', code: '1f6cd-fe0f', name: 'Shopping Bags', category: 'objects' },
  { char: '📸', code: '1f4f8', name: 'Camera with Flash', category: 'objects' },
  { char: '🚗', code: '1f697', name: 'Automobile', category: 'objects' },
  { char: '🏎️', code: '1f3ce-fe0f', name: 'Racing Car', category: 'objects' },
  { char: '✈️', code: '2708-fe0f', name: 'Airplane', category: 'objects' },
  { char: '🏝️', code: '1f3dd-fe0f', name: 'Desert Island', category: 'objects' },

  // ── Animals & Nature ────────────────────────────────────────────────────────
  { char: '🐶', code: '1f436', name: 'Dog Face', category: 'animals' },
  { char: '🐱', code: '1f431', name: 'Cat Face', category: 'animals' },
  { char: '🦁', code: '1f981', name: 'Lion', category: 'animals' },
  { char: '🦋', code: '1f98b', name: 'Butterfly', category: 'animals' },
  { char: '🌸', code: '1f338', name: 'Cherry Blossom', category: 'animals' },
  { char: '🌺', code: '1f33a', name: 'Hibiscus', category: 'animals' },
];
