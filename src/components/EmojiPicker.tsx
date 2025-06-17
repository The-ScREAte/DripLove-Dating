
import React from 'react';
import { Card } from '@/components/ui/card';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

const EmojiPicker = ({ onEmojiSelect }: EmojiPickerProps) => {
  const emojis = [
    '😀', '😂', '🥰', '😍', '🤗', '😊', '😉', '😘',
    '❤️', '💕', '💖', '💯', '🔥', '✨', '🎉', '👍',
    '👋', '🤔', '😮', '😢', '😭', '😴', '🤤', '🙄',
    '🎈', '🌟', '🌺', '🌹', '🎁', '🍕', '🍔', '🎂'
  ];

  return (
    <Card className="p-4 bg-white shadow-lg border">
      <div className="grid grid-cols-8 gap-2 max-w-xs">
        {emojis.map((emoji, index) => (
          <button
            key={index}
            onClick={() => onEmojiSelect(emoji)}
            className="text-xl hover:bg-gray-100 rounded p-1 transition-colors"
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
    </Card>
  );
};

export default EmojiPicker;
