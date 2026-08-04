import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Image as ImageIcon, RemoveFormatting } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

const TOOLBAR_ACTIONS: Array<{
  command: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt?: 'link' | 'image';
}> = [
  { command: 'bold', icon: Bold, label: 'Bold' },
  { command: 'italic', icon: Italic, label: 'Italic' },
  { command: 'underline', icon: Underline, label: 'Underline' },
  { command: 'insertUnorderedList', icon: List, label: 'Bulleted list' },
  { command: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
  { command: 'createLink', icon: Link2, label: 'Insert link', prompt: 'link' },
  { command: 'insertImage', icon: ImageIcon, label: 'Insert image', prompt: 'image' },
  { command: 'removeFormat', icon: RemoveFormatting, label: 'Clear formatting' },
];

export default function RichTextEditor({ value, onChange, placeholder, minHeightClassName = 'min-h-[200px]' }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!editorRef.current) return;
    // Only sync external value changes when the editor isn't actively being typed in,
    // otherwise the caret jumps to the start on every keystroke.
    if (!isFocusedRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, promptType?: 'link' | 'image') => {
    editorRef.current?.focus();

    if (promptType === 'link') {
      const url = window.prompt('Enter the URL to link to:', 'https://');
      if (!url) return;
      document.execCommand('createLink', false, url);
    } else if (promptType === 'image') {
      const url = window.prompt('Enter the image URL:', 'https://');
      if (!url) return;
      document.execCommand('insertImage', false, url);
    } else {
      document.execCommand(command, false);
    }

    onChange(editorRef.current?.innerHTML || '');
  };

  return (
    <div className="rounded-md border border-input overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        {TOOLBAR_ACTIONS.map(({ command, icon: Icon, label, prompt }) => (
          <Button
            key={command}
            type="button"
            variant="ghost"
            size="sm"
            title={label}
            className="h-7 w-7 p-0"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(command, prompt)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        className={`${minHeightClassName} max-h-[420px] overflow-y-auto px-3 py-2 text-xs leading-relaxed focus:outline-none [&_a]:text-purple-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:rounded [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-400`}
        onFocus={() => { isFocusedRef.current = true; }}
        onBlur={() => { isFocusedRef.current = false; }}
        onInput={() => onChange(editorRef.current?.innerHTML || '')}
        onPaste={(e) => {
          // Paste as plain text to avoid dragging in external styles/markup.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
      />
    </div>
  );
}
