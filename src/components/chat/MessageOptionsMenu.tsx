import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Trash2 } from 'lucide-react';

interface MessageOptionsMenuProps {
  isOwnMessage: boolean;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

const MessageOptionsMenu: React.FC<MessageOptionsMenuProps> = ({
  isOwnMessage,
  onDeleteForMe,
  onDeleteForEveryone,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showBelow, setShowBelow] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Check position when menu opens
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        
        // Account for safe areas on iOS
        const safeAreaTop = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--safe-area-inset-top') || '0');
        const safeAreaBottom = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--safe-area-inset-bottom') || '0');
        
        const spaceAbove = rect.top - safeAreaTop;
        const spaceBelow = window.innerHeight - rect.bottom - safeAreaBottom;
        
        // Menu needs ~120px space to display properly
        // If less than 180px space above (accounting for header), show below
        setShowBelow(spaceAbove < 180);
      }
      
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as any);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as any);
    };
  }, [isOpen]);

  const handleDeleteForMe = () => {
    onDeleteForMe();
    setIsOpen(false);
  };

  const handleDeleteForEveryone = () => {
    onDeleteForEveryone();
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-0 focus:outline-none text-current opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Message options"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          className={`absolute ${showBelow ? 'top-full mt-1' : 'bottom-full mb-1'} ${
            isOwnMessage ? 'right-0' : 'left-0'
          } bg-white rounded-lg shadow-lg border border-gray-200 py-0.5 z-50 w-32 text-sm`}
        >
          <button
            onClick={handleDeleteForMe}
            className="w-full px-2.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors text-xs"
          >
            <Trash2 className="w-3 h-3" />
            Delete for me
          </button>
          
          {isOwnMessage && (
            <button
              onClick={handleDeleteForEveryone}
              className="w-full px-2.5 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors text-xs"
            >
              <Trash2 className="w-3 h-3" />
              Delete for everyone
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageOptionsMenu;
