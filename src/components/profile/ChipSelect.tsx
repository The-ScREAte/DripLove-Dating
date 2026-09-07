import React from 'react';

export interface ChipOption {
  value: string;
  label: string;
}

export type ChipAccent = 'pink' | 'blue' | 'amber' | 'emerald' | 'purple' | 'cyan' | 'rose';

// Fully-static class strings (never built dynamically) so Tailwind's JIT scanner
// always picks them up regardless of which accent is chosen at runtime.
const ACCENTS: Record<ChipAccent, { idle: string; active: string }> = {
  pink: { idle: 'border-pink-500/40 text-pink-200 hover:bg-pink-500/10', active: 'bg-pink-600 border-pink-500 text-white' },
  blue: { idle: 'border-blue-500/40 text-blue-200 hover:bg-blue-500/10', active: 'bg-blue-600 border-blue-500 text-white' },
  amber: { idle: 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10', active: 'bg-amber-600 border-amber-500 text-white' },
  emerald: { idle: 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10', active: 'bg-emerald-600 border-emerald-500 text-white' },
  purple: { idle: 'border-purple-500/40 text-purple-200 hover:bg-purple-500/10', active: 'bg-purple-600 border-purple-500 text-white' },
  cyan: { idle: 'border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10', active: 'bg-cyan-600 border-cyan-500 text-white' },
  rose: { idle: 'border-rose-500/40 text-rose-200 hover:bg-rose-500/10', active: 'bg-rose-600 border-rose-500 text-white' },
};

interface ChipSelectProps {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** true while the profile is NOT being edited - shows only the selections, read-only. */
  disabled?: boolean;
  accent?: ChipAccent;
  emptyText?: string;
}

const ChipSelect = ({ options, selected, onToggle, disabled, accent = 'pink', emptyText = 'Not set' }: ChipSelectProps) => {
  const colors = ACCENTS[accent];

  // View mode: only show what's already selected, read-only.
  if (disabled) {
    const chosen = options.filter((opt) => selected.includes(opt.value));
    if (chosen.length === 0) {
      return <p className="text-xs text-gray-400">{emptyText}</p>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {chosen.map((opt) => (
          <span
            key={opt.value}
            className={`h-6 px-2 flex items-center rounded-full border bg-black/40 text-xs font-medium whitespace-nowrap ${colors.idle}`}
          >
            {opt.label}
          </span>
        ))}
      </div>
    );
  }

  // Edit mode: show every option, tap to select/deselect.
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const isActive = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`h-6 px-2 flex items-center rounded-full border text-xs font-medium leading-none transition-colors whitespace-nowrap ${
              isActive ? colors.active : `bg-black/40 ${colors.idle}`
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default ChipSelect;
