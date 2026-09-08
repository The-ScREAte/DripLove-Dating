import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { LANGUAGE_OPTIONS } from '@/constants/languages';

interface LanguagesSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onToggleLanguage: (value: string) => void;
}

// Matches the basics chip row exactly - inline height/padding, not Tailwind's
// h-* /px-*, since those have proven unreliable elsewhere in this app.
const chipStyle = { height: 22, minHeight: 22, padding: '0 8px' } as const;

const LanguagesSection = ({ editedProfile, isEditing, onToggleLanguage }: LanguagesSectionProps) => {
  const [search, setSearch] = useState('');
  const selected: string[] = Array.isArray(editedProfile.languages) ? editedProfile.languages : [];

  if (!isEditing) {
    return selected.length === 0 ? (
      <p className="text-xs text-white/60">No languages added yet.</p>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {selected.map((lang) => (
          <span
            key={lang}
            style={chipStyle}
            className="flex items-center rounded-full bg-neutral-900 border border-cyan-500/40 text-cyan-200 text-[11px] leading-none whitespace-nowrap shrink-0"
          >
            {lang}
          </span>
        ))}
      </div>
    );
  }

  const filtered = LANGUAGE_OPTIONS.filter((lang) =>
    lang.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => onToggleLanguage(lang)}
              style={{ ...chipStyle, paddingRight: 6 }}
              className="flex items-center gap-1 rounded-full bg-cyan-600 border border-cyan-500 text-white text-[11px] leading-none whitespace-nowrap shrink-0"
            >
              {lang}
              <X className="w-2.5 h-2.5" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-white/60 absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search languages..."
          className="w-full h-7 pl-7 pr-2 rounded-lg bg-black/40 border border-cyan-500/30 text-white text-xs placeholder:text-white/40 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-white/60">No languages match &quot;{search}&quot;.</p>
        ) : (
          filtered.map((lang) => {
            const isActive = selected.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => onToggleLanguage(lang)}
                style={chipStyle}
                className={`flex items-center rounded-full border text-[11px] leading-none whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : 'bg-neutral-900 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10'
                }`}
              >
                {lang}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LanguagesSection;
