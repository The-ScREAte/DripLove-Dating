import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { LANGUAGE_OPTIONS } from '@/constants/languages';

interface LanguagesSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onToggleLanguage: (value: string) => void;
}

const LanguagesSection = ({ editedProfile, isEditing, onToggleLanguage }: LanguagesSectionProps) => {
  const [search, setSearch] = useState('');
  const selected: string[] = Array.isArray(editedProfile.languages) ? editedProfile.languages : [];

  if (!isEditing) {
    return selected.length === 0 ? (
      <p className="text-xs text-gray-400">No languages added yet.</p>
    ) : (
      <div className="flex flex-wrap gap-1">
        {selected.map((lang) => (
          <span
            key={lang}
            className="h-6 px-2 flex items-center rounded-full border border-cyan-500/40 bg-black/40 text-cyan-200 text-xs font-medium"
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
        <div className="flex flex-wrap gap-1">
          {selected.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => onToggleLanguage(lang)}
              className="h-6 pl-2 pr-1 flex items-center gap-1 rounded-full border border-cyan-500 bg-cyan-600 text-white text-xs font-medium"
            >
              {lang}
              <X className="w-2.5 h-2.5" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search languages..."
          className="w-full h-7 pl-7 pr-2 rounded-lg bg-black/40 border border-cyan-500/30 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400">No languages match &quot;{search}&quot;.</p>
        ) : (
          filtered.map((lang) => {
            const isActive = selected.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => onToggleLanguage(lang)}
                className={`h-6 px-2 rounded-full border text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : 'bg-black/40 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10'
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
