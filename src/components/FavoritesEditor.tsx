
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Link as LinkIcon } from 'lucide-react';
import {
  FavoriteEntry,
  FAVORITES_MAX,
  PREDEFINED_FAVORITE_CATEGORIES,
  CATEGORIES_WITH_DETAIL,
  CATEGORY_SUB_OPTIONS,
  CATEGORY_SUB_QUESTION,
  favoriteEmoji,
  formatFavoriteLabel,
} from '@/constants/favorites';

interface FavoritesEditorProps {
  favorites: FavoriteEntry[];
  onFavoritesChange: (favorites: FavoriteEntry[]) => void;
  disabled?: boolean;
}

// Compact pill button style shared by every pick-list in this editor -
// small text, tight padding, so a long list of options doesn't feel bloated.
const pillClass = 'text-xs h-6 px-2 py-0 bg-transparent border-pink-500/40 text-white hover:bg-neutral-800 hover:text-white';

const FavoritesEditor = ({ favorites, onFavoritesChange, disabled = false }: FavoritesEditorProps) => {
  // Which category is mid-way through its own detail sub-form right now
  // (a sub-option pick-list, or Music's free-text artist/album + link).
  // Null means "showing the plain category picker".
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [musicDetail, setMusicDetail] = useState('');
  const [musicLink, setMusicLink] = useState('');
  const [newCustom, setNewCustom] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);

  const selectedCategories = new Set(favorites.map((f) => f.category));

  const addFavorite = (entry: FavoriteEntry) => {
    if (favorites.length >= FAVORITES_MAX) return;
    onFavoritesChange([...favorites, entry]);
  };

  const removeFavorite = (index: number) => {
    onFavoritesChange(favorites.filter((_, i) => i !== index));
  };

  const pickCategory = (category: string) => {
    if (selectedCategories.has(category) || favorites.length >= FAVORITES_MAX) return;
    if (CATEGORIES_WITH_DETAIL.has(category) || CATEGORY_SUB_OPTIONS[category]) {
      setPendingCategory(category);
      setMusicDetail('');
      setMusicLink('');
    } else {
      addFavorite({ category });
    }
  };

  const confirmSubOption = (category: string, option: string) => {
    addFavorite({ category, detail: option });
    setPendingCategory(null);
  };

  const confirmMusic = () => {
    if (!musicDetail.trim()) return;
    addFavorite({
      category: 'Music',
      detail: musicDetail.trim(),
      link: musicLink.trim() || undefined,
    });
    setPendingCategory(null);
    setMusicDetail('');
    setMusicLink('');
  };

  const addCustomFavorite = () => {
    const trimmed = newCustom.trim();
    if (trimmed && !selectedCategories.has(trimmed)) {
      addFavorite({ category: trimmed });
      setNewCustom('');
      setShowAddCustom(false);
    }
  };

  const availableCategories = PREDEFINED_FAVORITE_CATEGORIES.filter((c) => !selectedCategories.has(c));

  if (disabled) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {favorites.map((favorite, index) => (
          <Badge key={index} variant="secondary" className="flex items-center gap-1 h-6 leading-none text-xs px-2 py-0 bg-neutral-800 text-white border-pink-500/20">
            <span className="text-[11px] leading-none">{favoriteEmoji(favorite.category)}</span>
            <span className="leading-none">{formatFavoriteLabel(favorite)}</span>
            {favorite.link && <LinkIcon className="h-3 w-3 text-pink-400 shrink-0" />}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Selected Favorites */}
      <div>
        <h4 className="text-xs font-medium mb-1.5 text-white">Your Favorites ({favorites.length}/{FAVORITES_MAX}):</h4>
        <div className="flex flex-wrap gap-1.5">
          {favorites.map((favorite, index) => (
            <Badge key={index} variant="default" className="flex items-center gap-1 h-6 leading-none text-xs px-2 py-0 bg-pink-600/80 text-white border-transparent">
              <span className="text-[11px] leading-none">{favoriteEmoji(favorite.category)}</span>
              <span className="leading-none">{formatFavoriteLabel(favorite)}</span>
              {favorite.link && <LinkIcon className="h-3 w-3 shrink-0" />}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-transparent text-white shrink-0"
                onClick={() => removeFavorite(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      </div>

      {favorites.length < FAVORITES_MAX && pendingCategory && CATEGORY_SUB_OPTIONS[pendingCategory] && (
        <div>
          <h4 className="text-xs font-medium mb-1.5 text-white">
            {favoriteEmoji(pendingCategory)} {CATEGORY_SUB_QUESTION[pendingCategory] || `Which ${pendingCategory.toLowerCase()}?`}
          </h4>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {CATEGORY_SUB_OPTIONS[pendingCategory].map((option) => (
              <Button
                key={option}
                variant="outline"
                size="sm"
                onClick={() => confirmSubOption(pendingCategory, option)}
                className={pillClass}
              >
                {option}
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-white/60 hover:text-white" onClick={() => setPendingCategory(null)}>
            Cancel
          </Button>
        </div>
      )}

      {favorites.length < FAVORITES_MAX && pendingCategory === 'Music' && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium mb-1.5 text-white">🎵 Favorite artist or album</h4>
          <Input
            placeholder="e.g. Drake, or Scorpion (album)"
            value={musicDetail}
            onChange={(e) => setMusicDetail(e.target.value)}
            className="h-8 text-sm bg-neutral-900 border-pink-500/30 text-white placeholder:text-white/40"
          />
          <Input
            placeholder="Share a link (optional) - Spotify, Apple Music, YouTube..."
            value={musicLink}
            onChange={(e) => setMusicLink(e.target.value)}
            className="h-8 text-sm bg-neutral-900 border-pink-500/30 text-white placeholder:text-white/40"
          />
          <div className="flex gap-1.5">
            <Button onClick={confirmMusic} size="sm" className="h-7 text-xs" disabled={!musicDetail.trim()}>
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs bg-transparent border-pink-500/40 text-white hover:bg-neutral-800 hover:text-white"
              onClick={() => setPendingCategory(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Available categories - hidden while a detail sub-form is open */}
      {favorites.length < FAVORITES_MAX && !pendingCategory && (
        <div>
          <h4 className="text-xs font-medium mb-1.5 text-white">Pick up to {FAVORITES_MAX} favorites:</h4>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {availableCategories.map((category) => (
              <Button
                key={category}
                variant="outline"
                size="sm"
                onClick={() => pickCategory(category)}
                className={pillClass}
              >
                {favoriteEmoji(category)} {category}
              </Button>
            ))}
          </div>

          {/* Add Custom Favorite */}
          <div className="space-y-1.5">
            {!showAddCustom ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddCustom(true)}
                className="h-6 text-xs px-2 flex items-center gap-1 bg-transparent border-pink-500/40 text-white hover:bg-neutral-800 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Custom Favorite
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Input
                  placeholder="Enter a favorite..."
                  value={newCustom}
                  onChange={(e) => setNewCustom(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCustomFavorite()}
                  className="flex-1 h-8 text-sm bg-neutral-900 border-pink-500/30 text-white placeholder:text-white/40"
                />
                <Button onClick={addCustomFavorite} size="sm" className="h-7 text-xs">
                  Add
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-transparent border-pink-500/40 text-white hover:bg-neutral-800 hover:text-white"
                  onClick={() => {
                    setShowAddCustom(false);
                    setNewCustom('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FavoritesEditor;
